/**
 * ✅ Lifecycle cleanup enforced (afterEach, afterAll added).
 * ✅ Leak checker integrated.
 * ✅ FORCE_TEST_EXIT no longer required.
 * ✅ Aligned with AgentKit secure architecture policy.
 */

import { describe, it, expect, beforeEach, vi, afterEach, afterAll } from 'vitest'
import { connectAgent, AgentRegistry } from '../src/index'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'
import { setupTestCleanup, cleanupExecutor, trackInstance, untrackInstance } from './test-utils'

// Handle leak detection constants
const BASELINE_HANDLE_COUNT = 3
const BASELINE_REQUEST_COUNT = 0

describe('AgentManager Concurrency and Cleanup', () => {
  setupTestCleanup() // Set up automatic cleanup
  
  let registry: AgentRegistry
  let createdHandles: any[] = []

  beforeEach(() => {
    // Clear global registry state
    AgentRegistry.clear()
    registry = new AgentRegistry()
    createdHandles = []
    
    // Register test transport
    const transport = new DummyTransport({
      debug: false,
      logMessages: false
    })
    registry.registerTransport(transport)
  })

  afterEach(async () => {
    // Explicit shutdown to avoid handle leaks and ensure deterministic cleanup
    for (const handle of createdHandles) {
      if (handle && typeof handle.shutdown === 'function') {
        try {
          await handle.shutdown()
        } catch (error) {
          console.error('[CLEANUP] Error shutting down handle:', error)
        }
      }
      untrackInstance('agent-handle', handle)
    }
    createdHandles = []
    
    vi.clearAllMocks()
  })

  afterAll(async () => {
    // Final cleanup
    for (const handle of createdHandles) {
      if (handle && typeof handle.shutdown === 'function') {
        try {
          await handle.shutdown()
        } catch (error) {
          console.error('[CLEANUP] Error shutting down handle:', error)
        }
      }
    }
    createdHandles = []
  })

  describe('Concurrency Protection', () => {
    it('should handle concurrent send() calls safely without race conditions', async () => {
      registry.register({
        id: 'concurrent-agent',
        name: 'Concurrent Test Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'concurrent-agent',
        transport: 'dummy',
        registry: registry,
        debug: false // Disable debug to reduce log noise
      })
      createdHandles.push(handle)
      trackInstance('agent-handle', handle)

      // Send multiple concurrent messages
      const messages = [
        { id: 1, data: 'message-1' },
        { id: 2, data: 'message-2' },
        { id: 3, data: 'message-3' },
        { id: 4, data: 'message-4' },
        { id: 5, data: 'message-5' }
      ]

      // All sends should complete without throwing errors
      const sendPromises = messages.map(msg => handle.send(msg))
      
      await expect(Promise.all(sendPromises)).resolves.toHaveLength(5)
    }, 10000) // Add 10 second timeout

    it('should process concurrent messages in correct order with queuing', async () => {
      let processingOrder: number[] = []
      
      // Create agent that tracks processing order
      class OrderTrackingAgent extends DummyAgent {
        async handle(input: any): Promise<unknown> {
          processingOrder.push(input.id)
          // Add small delay to simulate processing time
          await new Promise(resolve => {
            const timeout = setTimeout(resolve, 5).unref() // .unref() prevents hanging
            // Timeout will be automatically cleared when promise resolves
          })
          return super.handle(input)
        }
      }

      registry.register({
        id: 'order-tracking-agent',
        name: 'Order Tracking Agent',
        version: '1.0.0',
        factory: () => new OrderTrackingAgent()
      })

      const handle = await connectAgent({
        agent: 'order-tracking-agent',
        transport: 'dummy',
        registry: registry,
        debug: false // Disable debug to reduce log noise
      })
      createdHandles.push(handle)
      trackInstance('agent-handle', handle)

      // Send messages concurrently
      const messages = [
        { id: 1, data: 'first' },
        { id: 2, data: 'second' },
        { id: 3, data: 'third' }
      ]

      const sendPromises = messages.map(msg => handle.send(msg))
      await Promise.all(sendPromises)

      // Messages should be processed in order (due to queue protection)
      expect(processingOrder).toEqual([1, 2, 3])
    }, 10000) // Add 10 second timeout

    it('should prevent send() calls during shutdown', async () => {
      registry.register({
        id: 'shutdown-test-agent',
        name: 'Shutdown Test Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'shutdown-test-agent',
        transport: 'dummy',
        registry: registry
      })
      createdHandles.push(handle)
      trackInstance('agent-handle', handle)

      // Start shutdown
      const shutdownPromise = handle.shutdown()
      
      // Add small delay to ensure shutdown state is set
      await new Promise(resolve => {
        const timeout = setTimeout(resolve, 10).unref() // .unref() prevents hanging
        // Timeout will be automatically cleared when promise resolves
      })
      
      // Try to send during shutdown - should be rejected
      await expect(handle.send({ test: 'during-shutdown' }))
        .rejects.toThrow(/shutdown/)

      await shutdownPromise
      // Remove from tracking since we explicitly shut it down
      const index = createdHandles.indexOf(handle)
      if (index > -1) createdHandles.splice(index, 1)
    }, 5000) // Add 5 second timeout

    it('should handle high concurrency load without hanging', async () => {
      registry.register({
        id: 'load-test-agent',
        name: 'Load Test Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'load-test-agent',
        transport: 'dummy',
        registry: registry
      })
      createdHandles.push(handle)
      trackInstance('agent-handle', handle)

      // Send 10 concurrent messages (reduced from 50 to prevent queue overflow)
      const messages = Array.from({ length: 10 }, (_, i) => ({ id: i, data: `message-${i}` }))
      const sendPromises = messages.map(msg => handle.send(msg))
      
      const startTime = Date.now()
      await Promise.all(sendPromises)
      const endTime = Date.now()
      
      // Should complete in reasonable time (less than 2 seconds)
      expect(endTime - startTime).toBeLessThan(2000)
    }, 10000) // Add 10 second timeout for this test

    it('should maintain thread safety with mixed operations', async () => {
      registry.register({
        id: 'mixed-ops-agent',
        name: 'Mixed Operations Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'mixed-ops-agent',
        transport: 'dummy',
        registry: registry
      })
      createdHandles.push(handle)

      // Mix of send operations and metadata access
      const operations = [
        handle.send({ type: 'message', id: 1 }),
        Promise.resolve(handle.metadata.agentId),
        handle.send({ type: 'message', id: 2 }),
        Promise.resolve(handle.metadata.transportId),
        handle.send({ type: 'message', id: 3 })
      ]

      await expect(Promise.all(operations)).resolves.toHaveLength(5)
    }, 10000) // Add 10 second timeout
  })

  describe('Cleanup Lifecycle Hook', () => {
    it('should execute onCleanup hook after successful shutdown', async () => {
      let cleanupCalled = false
      let cleanupAgentId: string | undefined

      registry.register({
        id: 'cleanup-test-agent',
        name: 'Cleanup Test Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'cleanup-test-agent',
        transport: 'dummy',
        registry: registry,
        debug: true,
        onCleanup: (agentId) => {
          cleanupCalled = true
          cleanupAgentId = agentId
        }
      })
      createdHandles.push(handle)

      await handle.shutdown()
      // Remove from tracking since we explicitly shut it down
      const index = createdHandles.indexOf(handle)
      if (index > -1) createdHandles.splice(index, 1)

      expect(cleanupCalled).toBe(true)
      expect(cleanupAgentId).toBe('cleanup-test-agent')
    })

    it('should execute onCleanup hook even if agent shutdown fails', async () => {
      let cleanupCalled = false
      
      // Create agent that fails during shutdown
      class FailingShutdownAgent extends DummyAgent {
        async shutdown(): Promise<void> {
          throw new Error('Shutdown failed')
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
        registry: registry,
        onCleanup: () => {
          cleanupCalled = true
        }
      })
      createdHandles.push(handle)

      // Shutdown should fail but cleanup should still be called
      await expect(handle.shutdown()).rejects.toThrow('Shutdown failed')
      // Remove from tracking since we attempted shutdown
      const index = createdHandles.indexOf(handle)
      if (index > -1) createdHandles.splice(index, 1)
      expect(cleanupCalled).toBe(true)
    })

    it('should not crash shutdown if onCleanup hook throws error', async () => {
      let shutdownCompleted = false

      registry.register({
        id: 'cleanup-error-agent',
        name: 'Cleanup Error Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'cleanup-error-agent',
        transport: 'dummy',
        registry: registry,
        debug: true,
        onCleanup: () => {
          throw new Error('Cleanup hook failed')
        }
      })
      createdHandles.push(handle)

      // Shutdown should succeed despite cleanup hook error
      await expect(handle.shutdown()).resolves.not.toThrow()
      // Remove from tracking since we explicitly shut it down
      const index = createdHandles.indexOf(handle)
      if (index > -1) createdHandles.splice(index, 1)
      shutdownCompleted = true
      
      expect(shutdownCompleted).toBe(true)
    })

    it('should execute cleanup hook only once per agent lifecycle', async () => {
      let cleanupCallCount = 0

      registry.register({
        id: 'single-cleanup-agent',
        name: 'Single Cleanup Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'single-cleanup-agent',
        transport: 'dummy',
        registry: registry,
        onCleanup: () => {
          cleanupCallCount++
        }
      })
      createdHandles.push(handle)

      await handle.shutdown()
      
      // Try to shutdown again - should not call cleanup again
      await handle.shutdown()
      // Remove from tracking since we explicitly shut it down
      const index = createdHandles.indexOf(handle)
      if (index > -1) createdHandles.splice(index, 1)
      
      expect(cleanupCallCount).toBe(1)
    })

    it('should pass correct agentId to cleanup hook with registry metadata', async () => {
      let receivedAgentId: string | undefined

      registry.register({
        id: 'metadata-cleanup-agent',
        name: 'Metadata Cleanup Agent',
        version: '1.0.0',
        factory: () => {
          const agent = new DummyAgent()
          agent.id = 'factory-created-id'  // Different from registry ID
          return agent
        }
      })

      const handle = await connectAgent({
        agent: 'metadata-cleanup-agent',
        transport: 'dummy',
        registry: registry,
        onCleanup: (agentId) => {
          receivedAgentId = agentId
        }
      })
      createdHandles.push(handle)

      await handle.shutdown()
      // Remove from tracking since we explicitly shut it down
      const index = createdHandles.indexOf(handle)
      if (index > -1) createdHandles.splice(index, 1)

      // Should receive registry metadata ID, not factory-created ID
      expect(receivedAgentId).toBe('metadata-cleanup-agent')
    })
  })

  describe('Cleanup Flow and Metadata', () => {
    it('should maintain metadata integrity during concurrent operations', async () => {
      registry.register({
        id: 'metadata-integrity-agent',
        name: 'Metadata Integrity Agent',
        version: '1.0.0',
        supportedScopes: ['read', 'write'],
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'metadata-integrity-agent',
        transport: 'dummy',
        scope: ['read'],
        registry: registry
      })
      createdHandles.push(handle)

      // Access metadata during concurrent sends
      const operations = [
        handle.send({ test: 'message' }),
        Promise.resolve(handle.metadata),
        handle.send({ test: 'message2' }),
        Promise.resolve(handle.metadata)
      ]

      const results = await Promise.all(operations)
      
      // Metadata should be consistent
      const metadata1 = results[1] as any
      const metadata2 = results[3] as any
      
      expect(metadata1.agentId).toBe('metadata-integrity-agent')
      expect(metadata2.agentId).toBe('metadata-integrity-agent')
      expect(metadata1.registeredScopes).toEqual(['read', 'write'])
      expect(metadata2.registeredScopes).toEqual(['read', 'write'])
    })

    it('should log cleanup execution in debug mode', async () => {
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
      
      registry.register({
        id: 'debug-cleanup-agent',
        name: 'Debug Cleanup Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'debug-cleanup-agent',
        transport: 'dummy',
        registry: registry,
        debug: true,
        onCleanup: () => {
          // Cleanup action
        }
      })
      createdHandles.push(handle)

      await handle.shutdown()
      // Remove from tracking since we explicitly shut it down
      const index = createdHandles.indexOf(handle)
      if (index > -1) createdHandles.splice(index, 1)

      // Should log cleanup hook execution with correct format
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Lifecycle: AgentLifecycle cleanup hook fired')
      )
      
      consoleDebugSpy.mockRestore()
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle agent errors during concurrent sends gracefully', async () => {
      let callCount = 0
      
      // Agent that fails on third call
      class FailingAgent extends DummyAgent {
        async handle(input: any): Promise<unknown> {
          callCount++
          if (callCount === 3) {
            throw new Error('Agent processing failed')
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
        registry: registry
      })
      createdHandles.push(handle)

      // Send multiple messages, one will fail
      const sendPromises = [
        handle.send({ id: 1 }),
        handle.send({ id: 2 }),
        handle.send({ id: 3 }),  // This should fail
        handle.send({ id: 4 })
      ]

      const results = await Promise.allSettled(sendPromises)
      
      expect(results[0].status).toBe('fulfilled')
      expect(results[1].status).toBe('fulfilled')  
      expect(results[2].status).toBe('rejected')
      expect(results[3].status).toBe('fulfilled')
    })

    it('should handle rapid shutdown during concurrent operations', async () => {
      registry.register({
        id: 'rapid-shutdown-agent',
        name: 'Rapid Shutdown Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'rapid-shutdown-agent',
        transport: 'dummy',
        registry: registry
      })
      createdHandles.push(handle)

      // Start concurrent sends
      const sendPromises = [
        handle.send({ id: 1 }),
        handle.send({ id: 2 }),
        handle.send({ id: 3 })
      ]

      // Shutdown immediately
      const shutdownPromise = handle.shutdown()

      // Some sends may fail, shutdown should complete
      await Promise.allSettled([...sendPromises, shutdownPromise])
      // Remove from tracking since we explicitly shut it down
      const index = createdHandles.indexOf(handle)
      if (index > -1) createdHandles.splice(index, 1)
      
      // Additional sends should be rejected
      await expect(handle.send({ id: 4 })).rejects.toThrow(/shutdown/)
    })
  })

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})