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

interface QueuedRequest<T> {
  id: string
  execute: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
  payload?: unknown
  startTime: number
}

export class BoundedExecutor {
  private readonly limits: Required<ResourceLimits>
  private activeRequests = 0
  private requestQueue: QueuedRequest<any>[] = []
  private isProcessing = false

  constructor(limits: ResourceLimits = {}) {
    // Apply default limits
    this.limits = {
      maxConcurrentRequests: limits.maxConcurrentRequests ?? 10,
      maxQueueSize: limits.maxQueueSize ?? 50,
      requestTimeoutMs: limits.requestTimeoutMs ?? 30000,
      maxPayloadSize: limits.maxPayloadSize ?? 1024 * 1024 // 1MB default
    }

    this.validateLimits()
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

    try {
      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new RequestTimeoutError(this.limits.requestTimeoutMs, {
            context: {
              requestId: request.id,
              timeoutMs: this.limits.requestTimeoutMs,
              requestStartTime: request.startTime
            }
          }))
        }, this.limits.requestTimeoutMs)
      })

      // Race between request execution and timeout
      const result = await Promise.race([
        request.execute(),
        timeoutPromise
      ])

      request.resolve(result)
    } catch (error) {
      request.reject(error as Error)
    } finally {
      this.activeRequests--
      // Process more requests from queue if available
      this.processQueue()
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
      return new Promise<T>((resolve, reject) => {
        const queuedRequest: QueuedRequest<T> = {
          id: requestId,
          execute: requestFn,
          resolve,
          reject,
          payload,
          startTime: Date.now()
        }

        this.requestQueue.push(queuedRequest)
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

    try {
      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
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
      this.activeRequests--
      // Process more requests from queue if available
      this.processQueue()
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
   */
  async shutdown(): Promise<void> {
    // Reject all queued requests
    const queuedRequests = [...this.requestQueue]
    this.requestQueue.length = 0
    
    for (const request of queuedRequests) {
      request.reject(new AgentShutdownError('BoundedExecutor shutdown', {
        context: { requestId: request.id }
      }))
    }

    // Wait for active requests to complete (with timeout)
    const maxWaitTime = 5000 // 5 seconds max wait
    const startTime = Date.now()
    
    while (this.activeRequests > 0 && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
}