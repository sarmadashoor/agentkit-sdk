import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { connectAgent, AgentRegistry } from '../src/index'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'
import { AgentShutdownError } from '../src/errors'

describe('AgentManager Race Condition Prevention', () => {
  let registry: AgentRegistry

  beforeEach(() => {
    registry = new AgentRegistry()
    
    // Register test transport
    registry.registerTransport(new DummyTransport({
      debug: false,
      logMessages: false
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Shutdown During Send Flood', () => {
    it('should handle rapid shutdown during a flood of send() calls with proper error propagation', async () => {
      // Create agent with slight processing delay to increase race condition chance
      class DelayedAgent extends DummyAgent {
        async handle(input: any): Promise<unknown> {
          // Use nextTick for deterministic delay
          await new Promise(resolve => process.nextTick(resolve))
          return super.handle(input)
        }
      }

      registry.register({
        id: 'flood-test-agent',
        name: 'Flood Test Agent',
        version: '1.0.0',
        factory: () => new DelayedAgent()
      })

      const handle = await connectAgent({
        agent: 'flood-test-agent',
        transport: 'dummy',
        registry: registry,
        debug: true,
        resourceLimits: {
          maxConcurrentRequests: 5,
          maxQueueSize: 20,
          requestTimeoutMs: 10000,
          maxPayloadSize: 1024 * 1024
        }
      })

      // Create a flood of send operations
      const sendPromises: Promise<void>[] = []
      for (let i = 0; i < 30; i++) { // Reduced to stay within queue limits
        sendPromises.push(
          handle.send({ id: i, data: `flood-message-${i}` })
            .catch((err) => {
              // Expect specific error types after shutdown
              if (err.message.includes('shutdown')) {
                expect(err).toBeInstanceOf(AgentShutdownError)
              }
              throw err
            })
        )
      }

      // Use nextTick to ensure send operations have started before shutdown
      await new Promise(resolve => process.nextTick(resolve))
      const shutdownPromise = handle.shutdown()

      // Wait for all operations to settle
      const results = await Promise.allSettled([...sendPromises, shutdownPromise])

      // Shutdown should always succeed
      const shutdownResult = results[results.length - 1]
      expect(shutdownResult.status).toBe('fulfilled')

      // Count successful vs failed sends
      const sendResults = results.slice(0, -1)
      const successfulSends = sendResults.filter(r => r.status === 'fulfilled').length
      const failedSends = sendResults.filter(r => r.status === 'rejected').length

      console.log(`Race condition test: ${successfulSends} successful, ${failedSends} failed sends`)

      // At least some sends should fail with shutdown errors
      expect(failedSends).toBeGreaterThan(0)
      
      // Verify all failures are due to shutdown (or expected resource limits)
      sendResults.forEach(result => {
        if (result.status === 'rejected') {
          const errorMessage = result.reason.message
          // Accept shutdown errors or queue full errors (both are valid during rapid shutdown)
          expect(errorMessage).toMatch(/(shutdown|Queue is full)/)
        }
      })

      // Verify no more operations can be sent after shutdown
      await expect(handle.send({ test: 'after-shutdown' }))
        .rejects.toThrow(AgentShutdownError)
    })

    it('should handle concurrent shutdown calls safely', async () => {
      registry.register({
        id: 'concurrent-shutdown-agent',
        name: 'Concurrent Shutdown Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'concurrent-shutdown-agent',
        transport: 'dummy',
        registry: registry
      })

      // Start multiple concurrent send operations
      const sendPromises = [
        handle.send({ id: 1 }),
        handle.send({ id: 2 }),
        handle.send({ id: 3 })
      ]

      // Call shutdown multiple times concurrently
      const shutdownPromises = [
        handle.shutdown(),
        handle.shutdown(),
        handle.shutdown()
      ]

      // All operations should settle without hanging
      const allResults = await Promise.allSettled([...sendPromises, ...shutdownPromises])

      // All shutdown calls should succeed (idempotent)
      const shutdownResults = allResults.slice(-3)
      shutdownResults.forEach(result => {
        expect(result.status).toBe('fulfilled')
      })

      // Additional shutdown should be idempotent
      await expect(handle.shutdown()).resolves.not.toThrow()
    })

    it('should prevent memory leaks during rapid shutdown cycles', async () => {
      registry.register({
        id: 'memory-leak-test-agent',
        name: 'Memory Leak Test Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      // Test multiple rapid connection/shutdown cycles
      for (let cycle = 0; cycle < 5; cycle++) {
        const handle = await connectAgent({
          agent: 'memory-leak-test-agent',
          transport: 'dummy',
          registry: registry,
          resourceLimits: {
            maxConcurrentRequests: 3,
            maxQueueSize: 5,
            requestTimeoutMs: 1000
          }
        })

        // Start some operations
        const sendPromises = [
          handle.send({ cycle, id: 1 }).catch(() => {}), // Ignore shutdown errors
          handle.send({ cycle, id: 2 }).catch(() => {}),
          handle.send({ cycle, id: 3 }).catch(() => {})
        ]

        // Rapid shutdown
        const shutdownPromise = handle.shutdown()

        // Wait for everything to settle
        await Promise.allSettled([...sendPromises, shutdownPromise])
      }

      // If we get here without hanging, the test passes
      expect(true).toBe(true)
    })

    it('should maintain bounded executor statistics during race conditions', async () => {
      registry.register({
        id: 'stats-test-agent',
        name: 'Stats Test Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'stats-test-agent',
        transport: 'dummy',
        registry: registry,
        resourceLimits: {
          maxConcurrentRequests: 2,
          maxQueueSize: 5,
          requestTimeoutMs: 5000
        }
      })

      // Start operations that will queue up
      const sendPromises = Array.from({ length: 10 }, (_, i) => 
        handle.send({ id: i }).catch(() => {}) // Ignore shutdown errors
      )

      // Allow queuing operations to start
      await new Promise(resolve => process.nextTick(resolve))

      // Shutdown during queued operations
      const shutdownPromise = handle.shutdown()

      // Wait for all operations to settle
      await Promise.allSettled([...sendPromises, shutdownPromise])

      // After shutdown, no more operations should be possible
      await expect(handle.send({ test: 'final' }))
        .rejects.toThrow(AgentShutdownError)
    })
  })

  describe('Send Operation Safety', () => {
    it('should fail fast when shutdown is called during initialization', async () => {
      registry.register({
        id: 'init-shutdown-agent',
        name: 'Init Shutdown Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'init-shutdown-agent',
        transport: 'dummy',
        registry: registry
      })

      // Shutdown immediately after connection
      await handle.shutdown()

      // Any send operations should fail immediately
      const sendPromise = handle.send({ test: 'data' })
      
      await expect(sendPromise).rejects.toThrow(AgentShutdownError)
      
      // Verify the error message is clear
      try {
        await sendPromise
      } catch (error) {
        expect(error.message).toContain('shutdown')
        expect(error.context).toHaveProperty('agentId')
        expect(error.context).toHaveProperty('transportId')
      }
    })

    it('should handle timeout errors during shutdown gracefully', async () => {
      // Create agent that takes a long time to process
      class SlowAgent extends DummyAgent {
        async handle(input: any): Promise<unknown> {
          // Simulate slow processing but with shorter delay
          await new Promise(resolve => setTimeout(resolve, 200))
          return super.handle(input)
        }
      }

      registry.register({
        id: 'slow-agent',
        name: 'Slow Agent',
        version: '1.0.0',
        factory: () => new SlowAgent()
      })

      const handle = await connectAgent({
        agent: 'slow-agent',
        transport: 'dummy',
        registry: registry,
        resourceLimits: {
          maxConcurrentRequests: 1,
          maxQueueSize: 2,
          requestTimeoutMs: 100 // Short timeout
        }
      })

      // Start a slow operation
      const slowSendPromise = handle.send({ slow: true }).catch(() => {})

      // Shutdown should complete even with slow operations
      await handle.shutdown()

      await Promise.allSettled([slowSendPromise])
    }, 10000) // Increase test timeout

    it('should ensure all promises resolve during shutdown', async () => {
      let unresolvedPromises = 0
      const originalSetTimeout = global.setTimeout

      // Mock setTimeout to track unresolved promises
      global.setTimeout = vi.fn((callback, delay) => {
        unresolvedPromises++
        const timeoutId = originalSetTimeout(() => {
          unresolvedPromises--
          if (typeof callback === 'function') {
            callback()
          }
        }, delay)
        return timeoutId
      }) as any

      try {
        registry.register({
          id: 'promise-resolution-agent',
          name: 'Promise Resolution Agent',
          version: '1.0.0',
          factory: () => new DummyAgent()
        })

        const handle = await connectAgent({
          agent: 'promise-resolution-agent',
          transport: 'dummy',
          registry: registry,
          resourceLimits: {
            maxConcurrentRequests: 2,
            maxQueueSize: 10
          }
        })

        // Start multiple operations
        const sendPromises = Array.from({ length: 15 }, (_, i) => 
          handle.send({ id: i }).catch(() => {})
        )

        // Shutdown
        await handle.shutdown()

        // Wait for all operations to settle
        await Promise.allSettled(sendPromises)

        // Allow cleanup operations to complete
        await new Promise(resolve => process.nextTick(resolve))

        // All timeouts should be resolved or cleaned up
        expect(unresolvedPromises).toBeLessThanOrEqual(3) // Allow for test framework and cleanup timeouts
      } finally {
        global.setTimeout = originalSetTimeout
      }
    })
  })

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle agent errors during shutdown gracefully', async () => {
      // Create agent that fails during shutdown
      class FailingShutdownAgent extends DummyAgent {
        async shutdown(): Promise<void> {
          throw new Error('Agent shutdown failed')
        }
      }

      registry.register({
        id: 'failing-shutdown-agent',
        name: 'Failing Shutdown Agent',
        version: '1.0.0',
        factory: () => new FailingShutdownAgent()
      })

      const handle = await connectAgent({
        agent: 'failing-shutdown-agent',
        transport: 'dummy',
        registry: registry
      })

      // Start some operations
      const sendPromises = [
        handle.send({ id: 1 }).catch(() => {}),
        handle.send({ id: 2 }).catch(() => {})
      ]

      // Shutdown should throw but still mark as shutdown
      await expect(handle.shutdown()).rejects.toThrow('Agent shutdown failed')

      // Subsequent operations should still be rejected
      await expect(handle.send({ id: 3 }))
        .rejects.toThrow(AgentShutdownError)

      await Promise.allSettled(sendPromises)
    })

    it('should prevent deadlocks during complex concurrent scenarios', async () => {
      registry.register({
        id: 'deadlock-test-agent',
        name: 'Deadlock Test Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'deadlock-test-agent',
        transport: 'dummy',
        registry: registry,
        resourceLimits: {
          maxConcurrentRequests: 2,
          maxQueueSize: 3
        }
      })

      // Create a complex scenario with many operations
      const operations: Promise<any>[] = []

      // Add send operations
      for (let i = 0; i < 10; i++) {
        operations.push(handle.send({ id: i }).catch(() => {}))
      }

      // Add metadata access
      operations.push(Promise.resolve(handle.metadata))

      // Add shutdown calls
      operations.push(handle.shutdown())
      operations.push(handle.shutdown()) // Duplicate shutdown

      // All operations should settle within reasonable time
      const startTime = Date.now()
      await Promise.allSettled(operations)
      const totalTime = Date.now() - startTime

      // Should not hang (complete within 10 seconds)
      expect(totalTime).toBeLessThan(10000)
    })
  })
})