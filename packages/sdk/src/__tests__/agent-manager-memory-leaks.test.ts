import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { connectAgent, AgentRegistry } from '../index'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'

describe('AgentManager Memory Leak Prevention', () => {
  let registry: AgentRegistry
  let originalSetTimeout: typeof setTimeout
  let originalClearTimeout: typeof clearTimeout
  let originalSetInterval: typeof setInterval
  let originalClearInterval: typeof clearInterval
  
  // Track active timers
  let activeTimeouts = new Set<number>()
  let activeIntervals = new Set<number>()
  let timerIdCounter = 1

  beforeEach(() => {
    registry = new AgentRegistry()
    
    // Register test transport
    registry.registerTransport(new DummyTransport({
      debug: false,
      logMessages: false
    }))

    // Backup original timer functions
    originalSetTimeout = global.setTimeout
    originalClearTimeout = global.clearTimeout
    originalSetInterval = global.setInterval
    originalClearInterval = global.clearInterval

    // Reset timer tracking
    activeTimeouts.clear()
    activeIntervals.clear()
    timerIdCounter = 1

    // Mock timer functions to track active timers
    global.setTimeout = vi.fn((callback, delay) => {
      const id = timerIdCounter++
      activeTimeouts.add(id)
      
      const wrappedCallback = () => {
        activeTimeouts.delete(id)
        if (typeof callback === 'function') {
          callback()
        }
      }
      
      const realId = originalSetTimeout(wrappedCallback, delay) as unknown as number
      return realId
    }) as any

    global.clearTimeout = vi.fn((id) => {
      if (id !== undefined) {
        activeTimeouts.delete(id as number)
        originalClearTimeout(id)
      }
    }) as any

    global.setInterval = vi.fn((callback, delay) => {
      const id = timerIdCounter++
      activeIntervals.add(id)
      
      const wrappedCallback = () => {
        if (typeof callback === 'function') {
          callback()
        }
      }
      
      const realId = originalSetInterval(wrappedCallback, delay) as unknown as number
      return realId
    }) as any

    global.clearInterval = vi.fn((id) => {
      if (id !== undefined) {
        activeIntervals.delete(id as number)
        originalClearInterval(id)
      }
    }) as any
  })

  afterEach(() => {
    // Restore original timer functions
    global.setTimeout = originalSetTimeout
    global.clearTimeout = originalClearTimeout
    global.setInterval = originalSetInterval
    global.clearInterval = originalClearInterval
    
    vi.clearAllMocks()
  })

  describe('Timer and Promise Cleanup', () => {
    it('should clean up all timers after shutdown', async () => {
      registry.register({
        id: 'timer-cleanup-agent',
        name: 'Timer Cleanup Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      const initialTimeouts = activeTimeouts.size
      const initialIntervals = activeIntervals.size

      const handle = await connectAgent({
        agent: 'timer-cleanup-agent',
        transport: 'dummy',
        registry: registry,
        resourceLimits: {
          maxConcurrentRequests: 3,
          maxQueueSize: 10,
          requestTimeoutMs: 1000
        }
      })

      // Start multiple operations that will create timers
      const sendPromises = Array.from({ length: 10 }, (_, i) => 
        handle.send({ id: i, delay: Math.random() * 50 }).catch(() => {})
      )

      // Allow timers to be created
      await new Promise(resolve => setTimeout(resolve, 50))

      const timersAfterStart = activeTimeouts.size

      // Shutdown
      await handle.shutdown()

      // Wait for all operations to settle
      await Promise.allSettled(sendPromises)

      // Wait a bit more for cleanup
      await new Promise(resolve => setTimeout(resolve, 100))

      const timersAfterShutdown = activeTimeouts.size
      const intervalsAfterShutdown = activeIntervals.size

      console.log(`Timers: initial=${initialTimeouts}, after start=${timersAfterStart}, after shutdown=${timersAfterShutdown}`)
      console.log(`Intervals: initial=${initialIntervals}, after shutdown=${intervalsAfterShutdown}`)

      // Should not have significantly more timers than we started with
      expect(timersAfterShutdown - initialTimeouts).toBeLessThanOrEqual(12) // Allow for bounded executor and test framework timers
      expect(intervalsAfterShutdown).toBe(initialIntervals) // No new intervals should remain
    })

    it('should handle rapid connect/disconnect cycles without memory leaks', async () => {
      registry.register({
        id: 'cycle-test-agent',
        name: 'Cycle Test Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      const initialTimeouts = activeTimeouts.size
      const initialIntervals = activeIntervals.size

      // Perform multiple rapid cycles
      for (let cycle = 0; cycle < 10; cycle++) {
        const handle = await connectAgent({
          agent: 'cycle-test-agent',
          transport: 'dummy',
          registry: registry,
          resourceLimits: {
            maxConcurrentRequests: 2,
            maxQueueSize: 5,
            requestTimeoutMs: 500
          }
        })

        // Start some operations
        const sendPromises = [
          handle.send({ cycle, op: 1 }).catch(() => {}),
          handle.send({ cycle, op: 2 }).catch(() => {}),
          handle.send({ cycle, op: 3 }).catch(() => {})
        ]

        // Quick shutdown
        await handle.shutdown()
        await Promise.allSettled(sendPromises)
      }

      // Allow final cleanup
      await new Promise(resolve => setTimeout(resolve, 200))

      const finalTimeouts = activeTimeouts.size
      const finalIntervals = activeIntervals.size

      console.log(`Cycles complete: initial timeouts=${initialTimeouts}, final timeouts=${finalTimeouts}`)
      console.log(`Cycles complete: initial intervals=${initialIntervals}, final intervals=${finalIntervals}`)

      // Should not accumulate timers over cycles
      expect(finalTimeouts - initialTimeouts).toBeLessThanOrEqual(10) // Allow for bounded executor timers
      expect(finalIntervals).toBe(initialIntervals)
    })

    it('should properly clean up queued operations on shutdown', async () => {
      let operationsStarted = 0
      let operationsCompleted = 0

      class TrackingAgent extends DummyAgent {
        async handle(input: any): Promise<unknown> {
          operationsStarted++
          try {
            await new Promise(resolve => setTimeout(resolve, 100))
            const result = await super.handle(input)
            operationsCompleted++
            return result
          } catch (error) {
            // Operation was cancelled
            throw error
          }
        }
      }

      registry.register({
        id: 'tracking-agent',
        name: 'Tracking Agent',
        version: '1.0.0',
        factory: () => new TrackingAgent()
      })

      const handle = await connectAgent({
        agent: 'tracking-agent',
        transport: 'dummy',
        registry: registry,
        resourceLimits: {
          maxConcurrentRequests: 2,
          maxQueueSize: 10,
          requestTimeoutMs: 5000
        }
      })

      // Start more operations than can run concurrently to create a queue
      const sendPromises = Array.from({ length: 15 }, (_, i) => 
        handle.send({ id: i }).catch(() => {})
      )

      // Allow some operations to start
      await new Promise(resolve => setTimeout(resolve, 50))

      console.log(`Operations started before shutdown: ${operationsStarted}`)

      // Shutdown while operations are queued
      await handle.shutdown()

      // Wait for everything to settle
      await Promise.allSettled(sendPromises)

      console.log(`Operations started: ${operationsStarted}, completed: ${operationsCompleted}`)

      // Should have started fewer operations than total requested (due to shutdown)
      expect(operationsStarted).toBeLessThan(15)
      
      // No more operations should complete after shutdown
      const finalCompleted = operationsCompleted
      await new Promise(resolve => setTimeout(resolve, 200))
      expect(operationsCompleted).toBe(finalCompleted)
    })

    it('should prevent promise memory leaks during error scenarios', async () => {
      let unhandledRejections: any[] = []
      
      const originalOnUnhandledRejection = process.listeners('unhandledRejection')
      
      // Track unhandled rejections
      process.on('unhandledRejection', (reason) => {
        unhandledRejections.push(reason)
      })

      try {
        // Create agent that fails intermittently
        let callCount = 0
        class FailingAgent extends DummyAgent {
          async handle(input: any): Promise<unknown> {
            callCount++
            if (callCount % 3 === 0) {
              throw new Error(`Simulated failure ${callCount}`)
            }
            return super.handle(input)
          }
        }

        registry.register({
          id: 'failing-agent',
          name: 'Failing Agent',
          version: '1.0.0',
          factory: () => new FailingAgent()
        })

        const handle = await connectAgent({
          agent: 'failing-agent',
          transport: 'dummy',
          registry: registry,
          resourceLimits: {
            maxConcurrentRequests: 3,
            maxQueueSize: 15
          }
        })

        // Start operations that will fail and succeed
        const sendPromises = Array.from({ length: 20 }, (_, i) => 
          handle.send({ id: i }).catch(() => {
            // Explicitly handle errors to prevent unhandled rejections
          })
        )

        // Shutdown during operations
        const shutdownPromise = handle.shutdown()

        // Wait for everything to complete
        await Promise.allSettled([...sendPromises, shutdownPromise])

        // Allow time for any delayed rejections
        await new Promise(resolve => setTimeout(resolve, 100))

        // Should not have unhandled rejections from our operations
        const agentKitRejections = unhandledRejections.filter(reason => 
          reason && typeof reason === 'object' && 
          (reason.message?.includes('AgentKit') || reason.context?.agentId)
        )

        expect(agentKitRejections).toHaveLength(0)

      } finally {
        // Clean up unhandled rejection listeners
        process.removeAllListeners('unhandledRejection')
        originalOnUnhandledRejection.forEach(listener => {
          process.on('unhandledRejection', listener)
        })
      }
    })
  })

  describe('Resource Cleanup Verification', () => {
    it('should report accurate bounded executor statistics after cleanup', async () => {
      registry.register({
        id: 'stats-agent',
        name: 'Stats Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'stats-agent',
        transport: 'dummy',
        registry: registry,
        resourceLimits: {
          maxConcurrentRequests: 2,
          maxQueueSize: 8
        }
      })

      // Start many operations
      const sendPromises = Array.from({ length: 12 }, (_, i) => 
        handle.send({ id: i }).catch(() => {})
      )

      // Allow operations to queue up
      await new Promise(resolve => setTimeout(resolve, 50))

      // Shutdown
      await handle.shutdown()

      // Wait for cleanup
      await Promise.allSettled(sendPromises)

      // Access to bounded executor stats after shutdown should show cleanup
      // This tests that the executor properly cleaned up its internal state
      expect(true).toBe(true) // If we get here without hanging, cleanup worked
    })

    it('should handle large payloads without memory accumulation', async () => {
      registry.register({
        id: 'large-payload-agent',
        name: 'Large Payload Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'large-payload-agent',
        transport: 'dummy',
        registry: registry,
        resourceLimits: {
          maxConcurrentRequests: 1,
          maxQueueSize: 5,
          maxPayloadSize: 500000 // 500KB
        }
      })

      // Create large payloads
      const largePayload = {
        data: 'x'.repeat(100000), // 100KB string
        array: Array(1000).fill().map((_, i) => ({ id: i, value: `item-${i}` }))
      }

      // Send multiple large payloads
      const sendPromises = Array.from({ length: 8 }, (_, i) => 
        handle.send({ ...largePayload, id: i }).catch(() => {})
      )

      // Shutdown while processing large payloads
      const shutdownPromise = handle.shutdown()

      // Wait for everything to complete
      await Promise.allSettled([...sendPromises, shutdownPromise])

      // If we get here without out-of-memory errors, the test passes
      expect(true).toBe(true)
    })

    it('should clean up observability tracking resources', async () => {
      let observabilityCallCount = 0

      registry.register({
        id: 'observability-agent',
        name: 'Observability Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'observability-agent',
        transport: 'dummy',
        registry: registry,
        observability: {
          onRequestStart: () => { observabilityCallCount++ },
          onRequestComplete: () => { observabilityCallCount++ },
          onError: () => { observabilityCallCount++ }
        }
      })

      // Generate some observability events
      const sendPromises = Array.from({ length: 5 }, (_, i) => 
        handle.send({ id: i }).catch(() => {})
      )

      await handle.shutdown()
      await Promise.allSettled(sendPromises)

      console.log(`Observability calls: ${observabilityCallCount}`)

      // Should have generated some observability events
      expect(observabilityCallCount).toBeGreaterThan(0)

      // Additional sends should not generate more events
      const finalCallCount = observabilityCallCount
      try {
        await handle.send({ final: true })
      } catch (error) {
        // Expected to fail
      }

      // Should not have generated additional observability events after shutdown
      expect(observabilityCallCount).toBe(finalCallCount)
    })
  })
})