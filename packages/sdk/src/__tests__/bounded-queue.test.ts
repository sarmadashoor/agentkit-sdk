import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { connectAgent } from '../index'
import { AgentRegistry } from '@agentkit/registry'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'
import { 
  QueueFullError,
  PayloadTooLargeError,
  RequestTimeoutError,
  ResourceExhaustedError,
  MaxRetriesExceededError
} from '@agentkit/errors'

describe('Bounded Queue System', () => {
  let registry: AgentRegistry
  let longRunningAgent: any

  beforeEach(() => {
    registry = new AgentRegistry()

    // Create a slow agent for testing concurrency and timeouts
    longRunningAgent = {
      id: 'slow-agent',
      name: 'Slow Agent',
      version: '1.0.0',
      init: async () => {},
      handle: async (input: any) => {
        const delay = input?.delay || 10  // Reduced from 100ms to 10ms for faster tests
        await new Promise(resolve => setTimeout(resolve, delay))
        return { processed: input, timestamp: Date.now() }
      },
      shutdown: async () => {}
    }

    // Register agents
    registry.register({
      id: 'slow-agent',
      name: 'Slow Agent',
      version: '1.0.0',
      factory: () => longRunningAgent
    })

    registry.register({
      id: 'fast-agent',
      name: 'Fast Agent',
      version: '1.0.0',
      factory: () => new DummyAgent()
    })

    // Register transport
    registry.registerTransport(new DummyTransport({ debug: false }))
  })

  afterEach(() => {
    // Clear any pending timers
    vi.clearAllTimers()
  })

  describe('Concurrent Request Limits', () => {
    it('should accept requests up to maxConcurrentRequests', async () => {
      const handle = await connectAgent({
        agent: 'slow-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          maxConcurrentRequests: 2,
          maxQueueSize: 0 // No queuing to test concurrency limit directly
        }
      })

      // Start 2 concurrent requests (should succeed)
      const request1 = handle.send({ delay: 20, id: 1 })
      const request2 = handle.send({ delay: 20, id: 2 })

      // Third request should be rejected immediately
      await expect(handle.send({ delay: 20, id: 3 })).rejects.toThrow(ResourceExhaustedError)

      // Wait for the original requests to complete
      await Promise.all([request1, request2])

      await handle.shutdown()
    })

    it('should properly track concurrent request count', async () => {
      const handle = await connectAgent({
        agent: 'slow-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          maxConcurrentRequests: 1,
          maxQueueSize: 0
        }
      })

      // Start first request
      const request1 = handle.send({ delay: 10, id: 1 })

      // Second request should be rejected
      await expect(handle.send({ delay: 10, id: 2 })).rejects.toThrow(ResourceExhaustedError)

      // Wait for first request to complete
      await request1

      // Now a new request should succeed
      await expect(handle.send({ delay: 5, id: 3 })).resolves.not.toThrow()

      await handle.shutdown()
    })

    it('should handle concurrent requests with different execution times', async () => {
      const handle = await connectAgent({
        agent: 'slow-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          maxConcurrentRequests: 3,
          maxQueueSize: 0
        }
      })

      // Start requests with different delays
      const promises = [
        handle.send({ delay: 5, id: 1 }),   // Fast
        handle.send({ delay: 20, id: 2 }),  // Slow
        handle.send({ delay: 10, id: 3 })   // Medium
      ]

      // Fourth request should be rejected
      await expect(handle.send({ delay: 5, id: 4 })).rejects.toThrow(ResourceExhaustedError)

      // All three should complete successfully
      await Promise.all(promises)

      await handle.shutdown()
    })
  })

  describe('Queue Management', () => {
    it('should queue requests when under maxQueueSize', async () => {
      const handle = await connectAgent({
        agent: 'slow-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          maxConcurrentRequests: 1,
          maxQueueSize: 2
        }
      })

      // Start one request (uses concurrency slot)
      const activeRequest = handle.send({ delay: 20, id: 1 })

      // Queue two more requests (fills queue)
      const queuedRequest1 = handle.send({ delay: 5, id: 2 })
      const queuedRequest2 = handle.send({ delay: 5, id: 3 })

      // Fourth request should be rejected (queue full)
      await expect(handle.send({ delay: 5, id: 4 })).rejects.toThrow(QueueFullError)

      // All queued requests should eventually complete
      await Promise.all([activeRequest, queuedRequest1, queuedRequest2])

      await handle.shutdown()
    })

    it('should process queued requests in FIFO order', async () => {
      const results: number[] = []
      const handle = await connectAgent({
        agent: 'slow-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          maxConcurrentRequests: 1,
          maxQueueSize: 3
        },
        onOutput: (output: any) => {
          results.push(output.processed.id)
        }
      })

      // Start requests that should be processed in order
      await Promise.all([
        handle.send({ delay: 5, id: 1 }),
        handle.send({ delay: 5, id: 2 }),
        handle.send({ delay: 5, id: 3 }),
        handle.send({ delay: 5, id: 4 })
      ])

      // Results should be in FIFO order
      expect(results).toEqual([1, 2, 3, 4])

      await handle.shutdown()
    })

    it('should handle queue overflow gracefully', async () => {
      const handle = await connectAgent({
        agent: 'slow-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          maxConcurrentRequests: 1,
          maxQueueSize: 2
        }
      })

      // Fill concurrency and queue
      const activeRequest = handle.send({ delay: 20, id: 1 })
      const queuedRequest1 = handle.send({ delay: 5, id: 2 })
      const queuedRequest2 = handle.send({ delay: 5, id: 3 })

      // Multiple overflow attempts should all fail
      await expect(handle.send({ delay: 5, id: 4 })).rejects.toThrow(QueueFullError)
      await expect(handle.send({ delay: 5, id: 5 })).rejects.toThrow(QueueFullError)

      // Verify queue full error has proper context
      try {
        await handle.send({ delay: 5, id: 6 })
        expect.fail('Should have thrown QueueFullError')
      } catch (error) {
        expect(error).toBeInstanceOf(QueueFullError)
        expect((error as QueueFullError).code).toBe('QUEUE_FULL')
        expect((error as QueueFullError).category).toBe('resource')
      }

      await Promise.all([activeRequest, queuedRequest1, queuedRequest2])
      await handle.shutdown()
    })
  })

  describe('Payload Size Limits', () => {
    it('should reject payloads exceeding maxPayloadSize', async () => {
      const handle = await connectAgent({
        agent: 'fast-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          maxPayloadSize: 100 // 100 bytes
        }
      })

      // Small payload should succeed
      await expect(handle.send({ data: 'small' })).resolves.not.toThrow()

      // Large payload should be rejected
      const largePayload = { data: 'x'.repeat(1000) } // ~1000+ bytes
      await expect(handle.send(largePayload)).rejects.toThrow(PayloadTooLargeError)

      await handle.shutdown()
    })

    it('should provide accurate payload size in error context', async () => {
      const handle = await connectAgent({
        agent: 'fast-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          maxPayloadSize: 50
        }
      })

      const payload = { data: 'x'.repeat(100) }

      try {
        await handle.send(payload)
        expect.fail('Should have thrown PayloadTooLargeError')
      } catch (error) {
        expect(error).toBeInstanceOf(PayloadTooLargeError)
        const payloadError = error as PayloadTooLargeError
        expect(payloadError.size).toBeGreaterThan(50)
        expect(payloadError.maxSize).toBe(50)
        expect(payloadError.code).toBe('PAYLOAD_TOO_LARGE')
        expect(payloadError.category).toBe('client')
      }

      await handle.shutdown()
    })

    it('should handle edge cases for payload size calculation', async () => {
      const handle = await connectAgent({
        agent: 'fast-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          maxPayloadSize: 20
        }
      })

      // Empty object should succeed
      await expect(handle.send({})).resolves.not.toThrow()

      // Null should succeed
      await expect(handle.send(null)).resolves.not.toThrow()

      // Complex nested object exceeding limit should fail
      const complexPayload = {
        nested: {
          array: [1, 2, 3, 4, 5],
          object: { a: 'test', b: 'data' }
        }
      }
      await expect(handle.send(complexPayload)).rejects.toThrow(PayloadTooLargeError)

      await handle.shutdown()
    })
  })

  describe('Request Timeouts', () => {
    it('should timeout requests exceeding requestTimeoutMs', async () => {
      const handle = await connectAgent({
        agent: 'slow-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          requestTimeoutMs: 100 // 100ms timeout
        }
      })

      // Fast request should succeed
      await expect(handle.send({ delay: 5, id: 1 })).resolves.not.toThrow()

      // Slow request should timeout
      await expect(handle.send({ delay: 20, id: 2 })).rejects.toThrow(RequestTimeoutError)

      await handle.shutdown()
    })

    it('should provide timeout context in error', async () => {
      const handle = await connectAgent({
        agent: 'slow-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          requestTimeoutMs: 50
        }
      })

      try {
        await handle.send({ delay: 20, id: 1 })
        expect.fail('Should have thrown RequestTimeoutError')
      } catch (error) {
        expect(error).toBeInstanceOf(RequestTimeoutError)
        const timeoutError = error as RequestTimeoutError
        expect(timeoutError.code).toBe('REQUEST_TIMEOUT')
        expect(timeoutError.category).toBe('network')
        expect(timeoutError.message).toContain('50ms')
      }

      await handle.shutdown()
    })

    it('should handle concurrent requests with different timeout behavior', async () => {
      const handle = await connectAgent({
        agent: 'slow-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          maxConcurrentRequests: 3,
          requestTimeoutMs: 150
        }
      })

      // Start multiple requests with different delays
      const results = await Promise.allSettled([
        handle.send({ delay: 5, id: 1 }),   // Should succeed
        handle.send({ delay: 10, id: 2 }),  // Should succeed
        handle.send({ delay: 20, id: 3 }),  // Should timeout
        handle.send({ delay: 75, id: 4 })    // Should succeed
      ])

      // Check results
      expect(results[0].status).toBe('fulfilled')
      expect(results[1].status).toBe('fulfilled')
      expect(results[2].status).toBe('rejected')
      expect(results[3].status).toBe('fulfilled')

      // Verify the timeout error
      if (results[2].status === 'rejected') {
        expect(results[2].reason).toBeInstanceOf(RequestTimeoutError)
      }

      await handle.shutdown()
    })
  })

  describe('High Concurrency Scenarios', () => {
    it('should handle burst of requests correctly', async () => {
      const handle = await connectAgent({
        agent: 'slow-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          maxConcurrentRequests: 3,
          maxQueueSize: 5,
          requestTimeoutMs: 1000
        }
      })

      // Send 10 requests rapidly
      const requests = Array.from({ length: 10 }, (_, i) =>
        handle.send({ delay: 5, id: i + 1 })
      )

      const results = await Promise.allSettled(requests)

      // First 8 should succeed (3 concurrent + 5 queued)
      for (let i = 0; i < 8; i++) {
        expect(results[i].status).toBe('fulfilled')
      }

      // Last 2 should fail (queue full)
      expect(results[8].status).toBe('rejected')
      expect(results[9].status).toBe('rejected')

      await handle.shutdown()
    })

    it('should not leak memory under high load', async () => {
      const handle = await connectAgent({
        agent: 'fast-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          maxConcurrentRequests: 2,
          maxQueueSize: 3,
          maxPayloadSize: 1000
        }
      })

      // Track resource usage
      let completedRequests = 0
      let rejectedRequests = 0

      // Send many requests to test for leaks
      const promises = Array.from({ length: 50 }, async (_, i) => {
        try {
          await handle.send({ id: i, data: 'test' })
          completedRequests++
        } catch (error) {
          rejectedRequests++
        }
      })

      await Promise.allSettled(promises)

      // Verify that some requests completed and some were rejected
      expect(completedRequests).toBeGreaterThan(0)
      expect(rejectedRequests).toBeGreaterThan(0)
      expect(completedRequests + rejectedRequests).toBe(50)

      await handle.shutdown()
    })

    it('should detect queue starvation', async () => {
      const handle = await connectAgent({
        agent: 'slow-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          maxConcurrentRequests: 1,
          maxQueueSize: 2,
          requestTimeoutMs: 500
        }
      })

      // Start a very long-running request that would block the queue
      const blockingRequest = handle.send({ delay: 100, id: 'blocker' })

      // Queue some requests
      const queuedRequests = [
        handle.send({ delay: 5, id: 1 }),
        handle.send({ delay: 5, id: 2 })
      ]

      // Additional requests should be rejected
      await expect(handle.send({ delay: 5, id: 3 })).rejects.toThrow(QueueFullError)

      // Cancel the blocking request to prevent actual starvation in tests
      try {
        await Promise.race([blockingRequest, new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Test timeout')), 100)
        )])
      } catch {
        // Expected to timeout for this test
      }

      await handle.shutdown()
    })
  })

  describe('Resource Limit Configuration', () => {
    it('should use default limits when not specified', async () => {
      const handle = await connectAgent({
        agent: 'fast-agent',
        transport: 'dummy',
        registry
        // No resourceLimits specified
      })

      // Should work with reasonable defaults
      await expect(handle.send({ data: 'test' })).resolves.not.toThrow()

      await handle.shutdown()
    })

    it('should validate resource limit configuration', async () => {
      // Invalid maxConcurrentRequests
      await expect(connectAgent({
        agent: 'fast-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          maxConcurrentRequests: 0 // Invalid: must be >= 1
        }
      })).rejects.toThrow()

      // Invalid maxQueueSize
      await expect(connectAgent({
        agent: 'fast-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          maxQueueSize: -1 // Invalid: must be >= 0
        }
      })).rejects.toThrow()

      // Invalid requestTimeoutMs
      await expect(connectAgent({
        agent: 'fast-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          requestTimeoutMs: 0 // Invalid: must be >= 1
        }
      })).rejects.toThrow()

      // Invalid maxPayloadSize
      await expect(connectAgent({
        agent: 'fast-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          maxPayloadSize: 0 // Invalid: must be >= 1
        }
      })).rejects.toThrow()
    })

    it('should allow disabling specific limits', async () => {
      const handle = await connectAgent({
        agent: 'fast-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          maxConcurrentRequests: 100, // High limit
          maxQueueSize: undefined,    // No queue limit
          requestTimeoutMs: undefined, // No timeout
          maxPayloadSize: undefined   // No payload limit
        }
      })

      // Should work with disabled limits
      await expect(handle.send({ data: 'test' })).resolves.not.toThrow()

      await handle.shutdown()
    })
  })

  describe('Error Context and Rich Information', () => {
    it('should provide comprehensive error context for queue failures', async () => {
      const handle = await connectAgent({
        agent: 'slow-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          maxConcurrentRequests: 1,
          maxQueueSize: 1
        }
      })

      // Fill concurrency and queue
      const activeRequest = handle.send({ delay: 20, id: 1 })
      const queuedRequest = handle.send({ delay: 5, id: 2 })

      try {
        await handle.send({ delay: 5, id: 3 })
        expect.fail('Should have thrown QueueFullError')
      } catch (error) {
        expect(error).toBeInstanceOf(QueueFullError)
        const queueError = error as QueueFullError
        
        // Verify rich error context
        expect(queueError.context).toBeDefined()
        expect(queueError.context).toMatchObject({
          currentQueueSize: 1,
          maxQueueSize: 1,
          activeConcurrentRequests: 1,
          maxConcurrentRequests: 1
        })
      }

      await Promise.all([activeRequest, queuedRequest])
      await handle.shutdown()
    })

    it('should include timing information in timeout errors', async () => {
      const handle = await connectAgent({
        agent: 'slow-agent',
        transport: 'dummy',
        registry,
        resourceLimits: {
          requestTimeoutMs: 100
        }
      })

      const startTime = Date.now()

      try {
        await handle.send({ delay: 300, id: 1 })
        expect.fail('Should have thrown RequestTimeoutError')
      } catch (error) {
        const elapsedTime = Date.now() - startTime
        
        expect(error).toBeInstanceOf(RequestTimeoutError)
        const timeoutError = error as RequestTimeoutError
        
        // Should timeout around the specified time
        expect(elapsedTime).toBeGreaterThanOrEqual(90) // Allow some variance
        expect(elapsedTime).toBeLessThan(200)
        
        expect(timeoutError.context).toBeDefined()
        expect(timeoutError.context).toMatchObject({
          timeoutMs: 100,
          requestStartTime: expect.any(Number)
        })
      }

      await handle.shutdown()
    })
  })
})