import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Transport, TransportMessage } from '../src/index'

// Mock TransportBackpressureError for testing
class TransportBackpressureError extends Error {
  readonly code = 'TRANSPORT_BACKPRESSURE' as const
  readonly category = 'resource' as const
  
  constructor(
    public transportId: string,
    message?: string,
    public currentLoad?: number,
    public maxCapacity?: number
  ) {
    super(message || `Transport ${transportId} is under backpressure and cannot accept more messages`)
    this.name = 'TransportBackpressureError'
  }
  
  isRetryable(): boolean {
    return true
  }
}

describe('Transport Backpressure', () => {
  let mockTransport: Transport

  beforeEach(() => {
    mockTransport = {
      id: 'test-transport',
      name: 'Test Transport',
      init: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
      receive: vi.fn().mockResolvedValue({ data: 'test' }),
      canAcceptMore: vi.fn().mockReturnValue(true),
      config: { maxQueueSize: 10, endpoint: 'test' }
    }
  })

  describe('canAcceptMore() functionality', () => {
    it('should return true when transport can accept messages', () => {
      expect(mockTransport.canAcceptMore()).toBe(true)
    })

    it('should return false when transport is under backpressure', () => {
      mockTransport.canAcceptMore = vi.fn().mockReturnValue(false)
      expect(mockTransport.canAcceptMore()).toBe(false)
    })

    it('should be called before attempting to send messages', async () => {
      const canAcceptMoreSpy = vi.spyOn(mockTransport, 'canAcceptMore')
      
      // Simulate checking backpressure before send
      const canSend = mockTransport.canAcceptMore()
      if (canSend) {
        await mockTransport.send({ data: 'test message' })
      }
      
      expect(canAcceptMoreSpy).toHaveBeenCalled()
      expect(mockTransport.send).toHaveBeenCalledWith({ data: 'test message' })
    })
  })

  describe('Backpressure handling scenarios', () => {
    it('should handle queue-based backpressure', () => {
      // Simulate a transport with a bounded queue
      let queueSize = 0
      const maxQueueSize = 5

      const queueBasedTransport: Transport = {
        ...mockTransport,
        canAcceptMore: () => queueSize < maxQueueSize,
        send: async (message: TransportMessage) => {
          if (queueSize >= maxQueueSize) {
            throw new TransportBackpressureError(
              'queue-transport',
              'Queue is full',
              queueSize,
              maxQueueSize
            )
          }
          queueSize++
          // Simulate processing
          setTimeout(() => queueSize--, 100)
        }
      }

      // Should accept messages when queue has space
      expect(queueBasedTransport.canAcceptMore()).toBe(true)

      // Fill up the queue
      queueSize = maxQueueSize
      expect(queueBasedTransport.canAcceptMore()).toBe(false)
    })

    it('should handle rate-limit based backpressure', () => {
      const maxRatePerSecond = 10
      let requestCount = 0
      let lastReset = Date.now()

      const rateLimitedTransport: Transport = {
        ...mockTransport,
        canAcceptMore: () => {
          const now = Date.now()
          if (now - lastReset > 1000) {
            requestCount = 0
            lastReset = now
          }
          return requestCount < maxRatePerSecond
        },
        send: async (message: TransportMessage) => {
          if (!rateLimitedTransport.canAcceptMore()) {
            throw new TransportBackpressureError(
              'rate-limited-transport',
              'Rate limit exceeded',
              requestCount,
              maxRatePerSecond
            )
          }
          requestCount++
        }
      }

      // Should accept messages when under rate limit
      expect(rateLimitedTransport.canAcceptMore()).toBe(true)

      // Simulate hitting rate limit
      requestCount = maxRatePerSecond
      expect(rateLimitedTransport.canAcceptMore()).toBe(false)
    })

    it('should handle resource-based backpressure (memory/connections)', () => {
      const maxMemoryMB = 100
      let currentMemoryMB = 0

      const resourceLimitedTransport: Transport = {
        ...mockTransport,
        canAcceptMore: () => currentMemoryMB < maxMemoryMB,
        send: async (message: TransportMessage) => {
          const messageSize = JSON.stringify(message).length / (1024 * 1024) // Convert to MB
          
          if (currentMemoryMB + messageSize > maxMemoryMB) {
            throw new TransportBackpressureError(
              'resource-limited-transport',
              'Memory limit exceeded',
              currentMemoryMB,
              maxMemoryMB
            )
          }
          
          currentMemoryMB += messageSize
        }
      }

      // Should accept when memory is available
      expect(resourceLimitedTransport.canAcceptMore()).toBe(true)

      // Simulate memory exhaustion
      currentMemoryMB = maxMemoryMB
      expect(resourceLimitedTransport.canAcceptMore()).toBe(false)
    })
  })

  describe('BackpressureError properties', () => {
    it('should provide detailed error information', () => {
      const error = new TransportBackpressureError(
        'test-transport',
        'Custom backpressure message',
        15,
        10
      )

      expect(error.code).toBe('TRANSPORT_BACKPRESSURE')
      expect(error.category).toBe('resource')
      expect(error.message).toBe('Custom backpressure message')
      expect(error.currentLoad).toBe(15)
      expect(error.maxCapacity).toBe(10)
    })

    it('should use default message when none provided', () => {
      const error = new TransportBackpressureError('test-transport')

      expect(error.message).toBe('Transport test-transport is under backpressure and cannot accept more messages')
      expect(error.currentLoad).toBeUndefined()
      expect(error.maxCapacity).toBeUndefined()
    })

    it('should be retryable by default', () => {
      const error = new TransportBackpressureError('test-transport')
      expect(error.isRetryable()).toBe(true)
    })
  })

  describe('BoundedExecutor simulation', () => {
    class MockBoundedExecutor {
      private queue: Array<() => Promise<void>> = []
      private running = 0
      private maxConcurrent: number

      constructor(maxConcurrent: number = 3) {
        this.maxConcurrent = maxConcurrent
      }

      canAcceptMore(): boolean {
        return this.queue.length + this.running < this.maxConcurrent * 2 // Allow some buffering
      }

      async execute(task: () => Promise<void>): Promise<void> {
        if (!this.canAcceptMore()) {
          throw new TransportBackpressureError(
            'bounded-executor',
            'Executor queue is full',
            this.queue.length + this.running,
            this.maxConcurrent * 2
          )
        }

        return new Promise((resolve, reject) => {
          this.queue.push(async () => {
            try {
              await task()
              resolve()
            } catch (error) {
              reject(error)
            }
          })
          this.processQueue()
        })
      }

      private async processQueue(): Promise<void> {
        if (this.running >= this.maxConcurrent || this.queue.length === 0) {
          return
        }

        const task = this.queue.shift()!
        this.running++

        try {
          await task()
        } finally {
          this.running--
          this.processQueue() // Process next task
        }
      }

      getStatus() {
        return {
          queueSize: this.queue.length,
          running: this.running,
          canAcceptMore: this.canAcceptMore()
        }
      }
    }

    it('should properly defer operations when backpressure is active', async () => {
      const executor = new MockBoundedExecutor(2)
      const results: number[] = []

      // Should accept initial tasks
      expect(executor.canAcceptMore()).toBe(true)

      // Create tasks that take some time
      const createTask = (id: number) => async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
        results.push(id)
      }

      // Fill the executor
      const promises = []
      for (let i = 0; i < 4; i++) {
        if (executor.canAcceptMore()) {
          promises.push(executor.execute(createTask(i)))
        }
      }

      // Should eventually reject when capacity is exceeded
      let rejectedCount = 0
      for (let i = 4; i < 8; i++) {
        try {
          await executor.execute(createTask(i))
        } catch (error) {
          expect(error).toBeInstanceOf(TransportBackpressureError)
          rejectedCount++
        }
      }

      expect(rejectedCount).toBeGreaterThan(0)

      // Wait for initial tasks to complete
      await Promise.all(promises)
      expect(results.length).toBeGreaterThan(0)
    })

    it('should provide accurate capacity information', () => {
      const executor = new MockBoundedExecutor(3)
      
      expect(executor.canAcceptMore()).toBe(true)
      
      const status = executor.getStatus()
      expect(status.queueSize).toBe(0)
      expect(status.running).toBe(0)
      expect(status.canAcceptMore).toBe(true)
    })
  })

  describe('Transport interface compliance', () => {
    it('should require canAcceptMore method in Transport interface', () => {
      // TypeScript should enforce this at compile time
      const transport: Transport = {
        id: 'compliant-transport',
        name: 'Compliant Transport',
        init: async () => {},
        send: async () => {},
        receive: async () => ({ data: 'test' }),
        canAcceptMore: () => true, // This is required
        config: {}
      }

      expect(typeof transport.canAcceptMore).toBe('function')
      expect(transport.canAcceptMore()).toBe(true)
    })

    it('should handle dynamic backpressure conditions', () => {
      let load = 0
      const maxLoad = 100

      const dynamicTransport: Transport = {
        id: 'dynamic-transport',
        name: 'Dynamic Transport',
        init: async () => {},
        send: async (message) => {
          load += 10 // Simulate load increase
          // Simulate async work
          setTimeout(() => {
            load = Math.max(0, load - 5) // Gradual load decrease
          }, 100)
        },
        receive: async () => ({ data: 'test' }),
        canAcceptMore: () => load < maxLoad,
        config: { maxLoad }
      }

      // Initially should accept more
      expect(dynamicTransport.canAcceptMore()).toBe(true)

      // Simulate load increase
      load = maxLoad
      expect(dynamicTransport.canAcceptMore()).toBe(false)

      // Simulate load decrease
      load = maxLoad / 2
      expect(dynamicTransport.canAcceptMore()).toBe(true)
    })
  })
})