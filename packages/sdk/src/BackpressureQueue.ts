/**
 * BackpressureQueue - Fallback queue for handling transport backpressure
 * Implements exponential backoff, local queueing, and overflow protection
 */

import { debugLog } from './log'
import { TransportBackpressureError, ResourceExhaustedError } from './errors'
import type { Transport } from '@agentkit/types'

export interface BackpressureQueueOptions {
  /** Maximum number of items to queue locally (default: 100) */
  maxQueueSize?: number
  /** Initial retry delay in milliseconds (default: 100) */
  initialRetryDelay?: number
  /** Maximum retry delay in milliseconds (default: 5000) */
  maxRetryDelay?: number
  /** Maximum number of retry attempts (default: 5) */
  maxRetries?: number
  /** Backoff multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number
  /** Enable debug logging (default: false) */
  debug?: boolean
  /** Timeout for individual retry attempts in ms (default: 30000) */
  retryTimeout?: number
}

export interface QueuedItem<T = any> {
  id: string
  payload: T
  attempts: number
  nextRetryAt: number
  enqueuedAt: number
  lastAttemptAt?: number
  resolve: (value: void) => void
  reject: (error: Error) => void
}

export interface BackpressureQueueStats {
  queueSize: number
  maxQueueSize: number
  totalEnqueued: number
  totalProcessed: number
  totalFailed: number
  totalRetries: number
  averageProcessingTime: number
  oldestItemAge?: number
}

/**
 * Event-based observability for backpressure queue operations
 */
export interface BackpressureQueueEvents {
  onItemEnqueued?: (item: QueuedItem) => void
  onItemProcessed?: (item: QueuedItem, processingTime: number) => void
  onItemFailed?: (item: QueuedItem, error: Error, willRetry: boolean) => void
  onItemDropped?: (item: QueuedItem, reason: 'queue_full' | 'max_retries') => void
  onQueueDrained?: () => void
  onBackpressureResolved?: (queueSize: number) => void
}

export class BackpressureQueue<T = any> {
  private readonly options: Required<BackpressureQueueOptions>
  private readonly queue: QueuedItem<T>[] = []
  private readonly transport: Transport
  private readonly events?: BackpressureQueueEvents
  
  // Stats tracking
  private totalEnqueued = 0
  private totalProcessed = 0
  private totalFailed = 0
  private totalRetries = 0
  private processingTimes: number[] = []
  
  // State management
  private isProcessing = false
  private processingTimer?: NodeJS.Timeout
  private isShutdown = false

  constructor(
    transport: Transport, 
    options: BackpressureQueueOptions = {},
    events?: BackpressureQueueEvents
  ) {
    this.transport = transport
    this.events = events
    this.options = {
      maxQueueSize: options.maxQueueSize ?? 100,
      initialRetryDelay: options.initialRetryDelay ?? 100,
      maxRetryDelay: options.maxRetryDelay ?? 5000,
      maxRetries: options.maxRetries ?? 5,
      backoffMultiplier: options.backoffMultiplier ?? 2,
      debug: options.debug ?? false,
      retryTimeout: options.retryTimeout ?? 30000
    }
  }

  /**
   * Enqueue an item with backpressure handling and fallback retry logic
   */
  async enqueue(payload: T): Promise<void> {
    if (this.isShutdown) {
      throw new Error('BackpressureQueue has been shutdown')
    }

    // Check if queue is at capacity
    if (this.queue.length >= this.options.maxQueueSize) {
      const droppedError = new ResourceExhaustedError(
        `Local backpressure queue is full (${this.queue.length}/${this.options.maxQueueSize})`,
        { context: { queueSize: this.queue.length, maxQueueSize: this.options.maxQueueSize } }
      )
      
      debugLog.warn('backpressure queue full, dropping item', {
        queueSize: this.queue.length,
        maxQueueSize: this.options.maxQueueSize
      }, this.options.debug)
      
      throw droppedError
    }

    // Create queued item
    const item: QueuedItem<T> = {
      id: `bpq-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      payload,
      attempts: 0,
      nextRetryAt: Date.now(),
      enqueuedAt: Date.now(),
      resolve: () => {},
      reject: () => {}
    }

    // Create promise for the queued operation
    const promise = new Promise<void>((resolve, reject) => {
      item.resolve = resolve
      item.reject = reject
    })

    // Add to queue
    this.queue.push(item)
    this.totalEnqueued++
    this.events?.onItemEnqueued?.(item)

    debugLog.operation('item enqueued for backpressure retry', {
      itemId: item.id,
      queueSize: this.queue.length,
      totalEnqueued: this.totalEnqueued
    }, this.options.debug)

    // Start processing if not already running
    this.startProcessing()

    return promise
  }

  /**
   * Start the retry processing loop
   */
  private startProcessing(): void {
    if (this.isProcessing || this.isShutdown) {
      return
    }

    this.isProcessing = true
    this.scheduleNextProcessing()
  }

  /**
   * Schedule the next processing cycle
   */
  private scheduleNextProcessing(): void {
    if (this.isShutdown) {
      return
    }

    // Find the next item that's ready for retry
    const now = Date.now()
    const readyItem = this.queue.find(item => item.nextRetryAt <= now)

    if (readyItem) {
      // Process immediately
      setImmediate(() => this.processQueue())
    } else if (this.queue.length > 0) {
      // Schedule based on the next retry time
      const nextRetryTime = Math.min(...this.queue.map(item => item.nextRetryAt))
      const delay = Math.max(0, nextRetryTime - now)
      
      this.processingTimer = setTimeout(() => this.processQueue(), delay)
    } else {
      // Queue is empty
      this.isProcessing = false
      this.events?.onQueueDrained?.()
    }
  }

  /**
   * Process queued items with retry logic
   */
  private async processQueue(): Promise<void> {
    if (this.isShutdown) {
      return
    }

    const now = Date.now()
    
    // Find items ready for processing
    const readyItems = this.queue.filter(item => item.nextRetryAt <= now)
    
    if (readyItems.length === 0) {
      this.scheduleNextProcessing()
      return
    }

    // Process one item at a time to avoid overwhelming the transport
    const item = readyItems[0]
    const startTime = Date.now()

    try {
      // Check if transport can accept the item
      if (!this.transport.canAcceptMore()) {
        // Still under backpressure, schedule next retry
        this.scheduleRetry(item, new TransportBackpressureError(
          this.transport.id,
          'Transport still under backpressure during retry'
        ))
        this.scheduleNextProcessing()
        return
      }

      // Try to send the item
      item.attempts++
      item.lastAttemptAt = now
      
      debugLog.operation('attempting backpressure retry', {
        itemId: item.id,
        attempt: item.attempts,
        maxRetries: this.options.maxRetries,
        queueSize: this.queue.length
      }, this.options.debug)

      await this.transport.send(item.payload as any)

      // Success - remove from queue and resolve
      const processingTime = Date.now() - startTime
      this.processingTimes.push(processingTime)
      if (this.processingTimes.length > 100) {
        this.processingTimes.shift() // Keep only last 100 times
      }

      this.removeItemFromQueue(item)
      this.totalProcessed++
      
      item.resolve()
      this.events?.onItemProcessed?.(item, processingTime)

      debugLog.operation('backpressure retry successful', {
        itemId: item.id,
        attempt: item.attempts,
        processingTime,
        remainingQueue: this.queue.length
      }, this.options.debug)

      // Check if backpressure is fully resolved
      if (this.queue.length === 0) {
        this.events?.onBackpressureResolved?.(0)
      }

    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error))
      this.scheduleRetry(item, errorObj)
    }

    // Continue processing
    this.scheduleNextProcessing()
  }

  /**
   * Schedule a retry for a failed item or fail it permanently
   */
  private scheduleRetry(item: QueuedItem<T>, error: Error): void {
    if (item.attempts >= this.options.maxRetries) {
      // Max retries exceeded - fail permanently
      this.removeItemFromQueue(item)
      this.totalFailed++
      
      const finalError = new TransportBackpressureError(
        this.transport.id,
        `Failed to send after ${item.attempts} attempts: ${error.message}`,
        undefined,
        undefined,
        { cause: error, context: { attempts: item.attempts, maxRetries: this.options.maxRetries } }
      )
      
      item.reject(finalError)
      this.events?.onItemFailed?.(item, finalError, false)
      this.events?.onItemDropped?.(item, 'max_retries')

      debugLog.warn('backpressure retry failed permanently', {
        itemId: item.id,
        attempts: item.attempts,
        maxRetries: this.options.maxRetries,
        error: error.message
      }, this.options.debug)

    } else {
      // Schedule next retry with exponential backoff
      const delay = Math.min(
        this.options.initialRetryDelay * Math.pow(this.options.backoffMultiplier, item.attempts - 1),
        this.options.maxRetryDelay
      )
      
      item.nextRetryAt = Date.now() + delay
      this.totalRetries++
      
      this.events?.onItemFailed?.(item, error, true)

      debugLog.operation('backpressure retry scheduled', {
        itemId: item.id,
        attempt: item.attempts,
        maxRetries: this.options.maxRetries,
        nextRetryIn: delay,
        error: error.message
      }, this.options.debug)
    }
  }

  /**
   * Remove an item from the queue
   */
  private removeItemFromQueue(item: QueuedItem<T>): void {
    const index = this.queue.findIndex(qItem => qItem.id === item.id)
    if (index !== -1) {
      this.queue.splice(index, 1)
    }
  }

  /**
   * Get current queue statistics
   */
  getStats(): BackpressureQueueStats {
    const now = Date.now()
    const oldestItem = this.queue.length > 0 
      ? this.queue.reduce((oldest, item) => item.enqueuedAt < oldest.enqueuedAt ? item : oldest)
      : null

    const averageProcessingTime = this.processingTimes.length > 0
      ? this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length
      : 0

    return {
      queueSize: this.queue.length,
      maxQueueSize: this.options.maxQueueSize,
      totalEnqueued: this.totalEnqueued,
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed,
      totalRetries: this.totalRetries,
      averageProcessingTime,
      oldestItemAge: oldestItem ? now - oldestItem.enqueuedAt : undefined
    }
  }

  /**
   * Check if the queue is currently experiencing backpressure
   */
  isUnderBackpressure(): boolean {
    return this.queue.length > 0
  }

  /**
   * Get the current queue size
   */
  getQueueSize(): number {
    return this.queue.length
  }

  /**
   * Manually trigger queue processing (useful for testing)
   */
  async flush(): Promise<void> {
    if (this.isShutdown) {
      return
    }

    // Wait for all current items to be processed or failed
    while (this.queue.length > 0 && !this.isShutdown) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }

  /**
   * Shutdown the queue and reject all pending items
   */
  shutdown(): void {
    if (this.isShutdown) {
      return
    }

    this.isShutdown = true
    this.isProcessing = false

    // Clear processing timer
    if (this.processingTimer) {
      clearTimeout(this.processingTimer)
      this.processingTimer = undefined
    }

    // Reject all pending items
    const shutdownError = new Error('BackpressureQueue was shutdown')
    for (const item of this.queue) {
      item.reject(shutdownError)
      this.events?.onItemDropped?.(item, 'queue_full') // Reuse dropped event for shutdown
    }

    // Clear queue
    this.queue.length = 0

    debugLog.operation('backpressure queue shutdown', {
      totalEnqueued: this.totalEnqueued,
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed
    }, this.options.debug)
  }
}