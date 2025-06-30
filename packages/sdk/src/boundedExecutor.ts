/**
 * BoundedExecutor - Resource-limited request processor for AgentKit SDK
 * Implements queue management, concurrency limits, timeouts, and payload validation
 */

import type { ResourceLimits } from '@agentkit/types'
import { 
  QueueFullError,
  PayloadTooLargeError,
  RequestTimeoutError,
  ResourceExhaustedError,
  AgentShutdownError,
  InvalidConfigurationError
} from '@agentkit/errors'
import { debugLog } from './log'

interface QueuedRequest<T> {
  id: string
  execute: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
  payload?: unknown
  startTime: number
}

/**
 * Observability hooks for BoundedExecutor monitoring
 */
export interface BoundedExecutorObservabilityHooks {
  /** Called when a request is queued */
  onRequestQueued?(requestId: string, queueSize: number): void
  /** Called when a request execution starts */
  onRequestStarted?(requestId: string, activeRequests: number): void
  /** Called when a request completes successfully */
  onRequestCompleted?(requestId: string, duration: number): void
  /** Called when a request times out */
  onRequestTimeout?(requestId: string, timeoutMs: number): void
  /** Called when a request fails */
  onRequestFailed?(requestId: string, error: Error): void
  /** Called when the queue is full */
  onQueueFull?(requestId: string, queueSize: number, maxSize: number): void
  /** Called when executor is shutdown */
  onShutdown?(activeRequests: number, queuedRequests: number): void
}

export class BoundedExecutor {
  private readonly limits: Required<ResourceLimits>
  private activeRequests = 0
  private requestQueue: QueuedRequest<unknown>[] = []
  private isProcessing = false
  private isShutdown = false
  
  // Memory leak prevention - track active timeouts
  private activeTimeouts = new Set<NodeJS.Timeout>()
  
  // Observability
  private observabilityHooks?: BoundedExecutorObservabilityHooks
  private debug: boolean

  constructor(
    limits: ResourceLimits = {}, 
    observabilityHooks?: BoundedExecutorObservabilityHooks,
    debug: boolean = false
  ) {
    // Apply default limits
    this.limits = {
      maxConcurrentRequests: limits.maxConcurrentRequests ?? 10,
      maxQueueSize: limits.maxQueueSize ?? 50,
      requestTimeoutMs: limits.requestTimeoutMs ?? 30000,
      maxPayloadSize: limits.maxPayloadSize ?? 1024 * 1024 // 1MB default
    }
    
    this.observabilityHooks = observabilityHooks
    this.debug = debug

    this.validateLimits()
    
    debugLog.lifecycle('constructor', 'BoundedExecutor', {
      limits: this.limits,
      observabilityEnabled: !!this.observabilityHooks
    }, this.debug)
  }

  private validateLimits(): void {
    if (this.limits.maxConcurrentRequests < 1) {
      throw new InvalidConfigurationError('maxConcurrentRequests must be >= 1', {
        context: { configKey: 'maxConcurrentRequests', value: this.limits.maxConcurrentRequests }
      })
    }
    if (this.limits.maxQueueSize < 0) {
      throw new InvalidConfigurationError('maxQueueSize must be >= 0', {
        context: { configKey: 'maxQueueSize', value: this.limits.maxQueueSize }
      })
    }
    if (this.limits.requestTimeoutMs < 1) {
      throw new InvalidConfigurationError('requestTimeoutMs must be >= 1', {
        context: { configKey: 'requestTimeoutMs', value: this.limits.requestTimeoutMs }
      })
    }
    if (this.limits.maxPayloadSize < 1) {
      throw new InvalidConfigurationError('maxPayloadSize must be >= 1', {
        context: { configKey: 'maxPayloadSize', value: this.limits.maxPayloadSize }
      })
    }
  }

  /**
   * Calculate payload size in bytes (approximate)
   */
  private calculatePayloadSize(payload: unknown): number {
    if (payload === null || payload === undefined) {
      return 0
    }
    
    try {
      return JSON.stringify(payload).length
    } catch {
      // If serialization fails, estimate based on type
      if (typeof payload === 'string') {
        return payload.length
      }
      if (typeof payload === 'number' || typeof payload === 'boolean') {
        return 8 // Rough estimate
      }
      return 100 // Default fallback
    }
  }

  /**
   * Validate payload size against limits
   */
  private validatePayloadSize(payload: unknown): void {
    const size = this.calculatePayloadSize(payload)
    if (size > this.limits.maxPayloadSize) {
      throw new PayloadTooLargeError(size, this.limits.maxPayloadSize, {
        context: {
          actualSize: size,
          maxAllowed: this.limits.maxPayloadSize,
          payloadType: typeof payload
        }
      })
    }
  }

  /**
   * Check if we can accept a new request
   */
  private canAcceptRequest(): boolean {
    const totalLoad = this.activeRequests + this.requestQueue.length
    return this.activeRequests < this.limits.maxConcurrentRequests || 
           this.requestQueue.length < this.limits.maxQueueSize
  }

  /**
   * Process queued requests when slots become available
   */
  private processQueue(): void {
    if (this.isProcessing) return
    this.isProcessing = true

    // Process as many queued requests as we have capacity for
    while (this.requestQueue.length > 0 && this.activeRequests < this.limits.maxConcurrentRequests) {
      const queuedRequest = this.requestQueue.shift()!
      this.executeRequest(queuedRequest)
    }

    this.isProcessing = false
  }

  /**
   * Execute a request with timeout and error handling
   */
  private async executeRequest<T>(request: QueuedRequest<T>): Promise<void> {
    this.activeRequests++
    const startTime = Date.now()
    
    debugLog.operation('BoundedExecutor request started', {
      requestId: request.id,
      activeRequests: this.activeRequests,
      queueWaitTime: startTime - request.startTime
    }, this.debug)
    
    this.observabilityHooks?.onRequestStarted?.(request.id, this.activeRequests)

    let timeoutId: NodeJS.Timeout | undefined

    try {
      // Set up timeout with proper cleanup tracking
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = this.createTrackedTimeout(() => {
          const timeoutError = new RequestTimeoutError(this.limits.requestTimeoutMs, {
            context: {
              requestId: request.id,
              timeoutMs: this.limits.requestTimeoutMs,
              requestStartTime: request.startTime
            }
          })
          this.observabilityHooks?.onRequestTimeout?.(request.id, this.limits.requestTimeoutMs)
          debugLog.warn('BoundedExecutor request timeout', {
            requestId: request.id,
            timeoutMs: this.limits.requestTimeoutMs,
            duration: Date.now() - startTime
          }, this.debug)
          reject(timeoutError)
        }, this.limits.requestTimeoutMs)
      })

      // Race between request execution and timeout
      const result = await Promise.race([
        request.execute(),
        timeoutPromise
      ])

      const duration = Date.now() - startTime
      debugLog.operation('BoundedExecutor request completed', {
        requestId: request.id,
        duration,
        activeRequests: this.activeRequests - 1
      }, this.debug)
      
      this.observabilityHooks?.onRequestCompleted?.(request.id, duration)
      request.resolve(result)
    } catch (error) {
      const duration = Date.now() - startTime
      debugLog.error('BoundedExecutor request failed', error as Error, this.debug)
      this.observabilityHooks?.onRequestFailed?.(request.id, error as Error)
      request.reject(error as Error)
    } finally {
      // Clean up timeout if it hasn't fired yet
      if (timeoutId) {
        clearTimeout(timeoutId)
        this.activeTimeouts.delete(timeoutId)
      }
      
      this.activeRequests--
      // Process more requests from queue if available
      if (!this.isShutdown) {
        this.processQueue()
      }
    }
  }

  /**
   * Execute a request with resource limits applied
   */
  async execute<T>(
    requestId: string,
    requestFn: () => Promise<T>,
    payload?: unknown
  ): Promise<T> {
    const startTime = Date.now()
    
    debugLog.operation('BoundedExecutor execute request', {
      requestId,
      activeRequests: this.activeRequests,
      queueSize: this.requestQueue.length,
      limits: this.limits
    }, this.debug)

    // Check if executor has been shutdown
    if (this.isShutdown) {
      const error = new AgentShutdownError('BoundedExecutor has been shutdown', {
        context: { requestId }
      })
      debugLog.error('BoundedExecutor execute', error, this.debug)
      throw error
    }

    // Validate payload size first
    if (payload !== undefined) {
      this.validatePayloadSize(payload)
    }

    // Check if we have reached concurrent request limit
    if (this.activeRequests >= this.limits.maxConcurrentRequests) {
      // If no queuing is allowed (maxQueueSize = 0), throw ResourceExhaustedError
      if (this.limits.maxQueueSize === 0) {
        throw new ResourceExhaustedError('concurrent requests', {
          context: {
            currentConcurrentRequests: this.activeRequests,
            maxConcurrentRequests: this.limits.maxConcurrentRequests,
            queueSize: this.requestQueue.length,
            maxQueueSize: this.limits.maxQueueSize
          }
        })
      }

      // Check if we can queue it
      if (this.requestQueue.length >= this.limits.maxQueueSize) {
        this.observabilityHooks?.onQueueFull?.(requestId, this.requestQueue.length, this.limits.maxQueueSize)
        debugLog.warn('BoundedExecutor queue full', {
          requestId,
          currentQueueSize: this.requestQueue.length,
          maxQueueSize: this.limits.maxQueueSize
        }, this.debug)
        
        throw new QueueFullError(`request queue (max: ${this.limits.maxQueueSize})`, {
          context: {
            currentQueueSize: this.requestQueue.length,
            maxQueueSize: this.limits.maxQueueSize,
            activeConcurrentRequests: this.activeRequests,
            maxConcurrentRequests: this.limits.maxConcurrentRequests
          }
        })
      }

      // Queue the request
      debugLog.operation('BoundedExecutor request queued', {
        requestId,
        queueSize: this.requestQueue.length + 1
      }, this.debug)
      
      this.observabilityHooks?.onRequestQueued?.(requestId, this.requestQueue.length + 1)
      
      return new Promise<T>((resolve, reject) => {
        const queuedRequest: QueuedRequest<T> = {
          id: requestId,
          execute: requestFn,
          resolve,
          reject,
          payload,
          startTime: Date.now()
        }

        this.requestQueue.push(queuedRequest as QueuedRequest<unknown>)
        // Queue processing will be triggered when a slot becomes available
      })
    }

    // Execute immediately if we have capacity
    const request: QueuedRequest<T> = {
      id: requestId,
      execute: requestFn,
      resolve: (value: T) => value, // Not used for immediate execution
      reject: (error: Error) => { throw error }, // Not used for immediate execution
      payload,
      startTime: Date.now()
    }

    this.activeRequests++

    let timeoutId: NodeJS.Timeout | undefined

    try {
      // Set up timeout with proper cleanup tracking
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = this.createTrackedTimeout(() => {
          reject(new RequestTimeoutError(this.limits.requestTimeoutMs, {
            context: {
              requestId,
              timeoutMs: this.limits.requestTimeoutMs,
              requestStartTime: request.startTime
            }
          }))
        }, this.limits.requestTimeoutMs)
      })

      // Race between request execution and timeout
      const result = await Promise.race([
        requestFn(),
        timeoutPromise
      ])

      return result
    } finally {
      // Clean up timeout if it hasn't fired yet
      if (timeoutId) {
        clearTimeout(timeoutId)
        this.activeTimeouts.delete(timeoutId)
      }
      
      this.activeRequests--
      // Process more requests from queue if available
      if (!this.isShutdown) {
        this.processQueue()
      }
    }
  }

  /**
   * Get current executor statistics
   */
  getStats(): {
    activeRequests: number
    queuedRequests: number
    limits: Required<ResourceLimits>
  } {
    return {
      activeRequests: this.activeRequests,
      queuedRequests: this.requestQueue.length,
      limits: { ...this.limits }
    }
  }

  /**
   * Check if the executor is idle (no active or queued requests)
   */
  isIdle(): boolean {
    return this.activeRequests === 0 && this.requestQueue.length === 0
  }

  /**
   * Shutdown the executor gracefully, rejecting all queued requests
   * CRITICAL: Prevents memory leaks by clearing all active timeouts
   */
  async shutdown(): Promise<void> {
    if (this.isShutdown) {
      return // Already shutdown, idempotent
    }

    debugLog.lifecycle('shutdown start', 'BoundedExecutor', {
      activeRequests: this.activeRequests,
      queuedRequests: this.requestQueue.length,
      activeTimeouts: this.activeTimeouts.size
    }, this.debug)

    this.observabilityHooks?.onShutdown?.(this.activeRequests, this.requestQueue.length)

    this.isShutdown = true

    // Clear all active timeouts to prevent memory leaks
    for (const timeout of this.activeTimeouts) {
      clearTimeout(timeout)
    }
    this.activeTimeouts.clear()

    // Reject all queued requests
    const queuedRequests = [...this.requestQueue]
    this.requestQueue.length = 0
    
    for (const request of queuedRequests) {
      request.reject(new AgentShutdownError('BoundedExecutor shutdown', {
        context: { requestId: request.id }
      }))
    }

    // Wait for active requests to complete (with shorter timeout for tests)
    const maxWaitTime = 2000 // 2 seconds max wait (reduced from 5 seconds)
    const startTime = Date.now()
    
    while (this.activeRequests > 0 && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 10)
        if (timer.unref) timer.unref()
      }) // More frequent checks
    }
    
    // Force complete any remaining active requests
    if (this.activeRequests > 0) {
      debugLog.lifecycle('forcing shutdown with active requests', 'BoundedExecutor', {
        remainingActiveRequests: this.activeRequests
      }, this.debug)
    }
    
    debugLog.lifecycle('shutdown complete', 'BoundedExecutor', {
      remainingActiveRequests: this.activeRequests,
      shutdownDuration: Date.now() - startTime
    }, this.debug)
  }

  /**
   * Helper method to create tracked timeouts that will be cleaned up on shutdown
   */
  private createTrackedTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    if (this.isShutdown) {
      // Don't create new timeouts after shutdown
      throw new AgentShutdownError('Cannot create timeout after shutdown')
    }

    const timeout = setTimeout(() => {
      // Remove from tracking set when timeout fires
      this.activeTimeouts.delete(timeout)
      if (!this.isShutdown) {
        callback()
      }
    }, delay)
    
    // Track the timeout for cleanup
    this.activeTimeouts.add(timeout)
    return timeout
  }
}