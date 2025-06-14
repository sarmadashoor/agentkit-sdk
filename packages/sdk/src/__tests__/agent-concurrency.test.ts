import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { connectAgent, AgentRegistry } from '../index'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'

describe('AgentManager Concurrency and Cleanup', () => {
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
        debug: true
      })

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
      
      await handle.shutdown()
    })

    it('should process concurrent messages in correct order with queuing', async () => {
      let processingOrder: number[] = []
      
      // Create agent that tracks processing order
      class OrderTrackingAgent extends DummyAgent {
        async handle(input: any): Promise<unknown> {
          processingOrder.push(input.id)
          // Add small delay to simulate processing time
          await new Promise(resolve => setTimeout(resolve, 10))
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
        debug: true
      })

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
      
      await handle.shutdown()
    })

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

      // Start shutdown
      const shutdownPromise = handle.shutdown()
      
      // Try to send during shutdown - should be rejected
      await expect(handle.send({ test: 'during-shutdown' }))
        .rejects.toThrow(/shutdown/)

      await shutdownPromise
    })

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

      // Send 50 concurrent messages
      const messages = Array.from({ length: 50 }, (_, i) => ({ id: i, data: `message-${i}` }))
      const sendPromises = messages.map(msg => handle.send(msg))
      
      const startTime = Date.now()
      await Promise.all(sendPromises)
      const endTime = Date.now()
      
      // Should complete in reasonable time (less than 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000)
      
      await handle.shutdown()
    })

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

      // Mix of send operations and metadata access
      const operations = [
        handle.send({ type: 'message', id: 1 }),
        Promise.resolve(handle.metadata.agentId),
        handle.send({ type: 'message', id: 2 }),
        Promise.resolve(handle.metadata.transportId),
        handle.send({ type: 'message', id: 3 })
      ]

      await expect(Promise.all(operations)).resolves.toHaveLength(5)
      
      await handle.shutdown()
    })
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

      await handle.shutdown()

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

      // Shutdown should fail but cleanup should still be called
      await expect(handle.shutdown()).rejects.toThrow('Shutdown failed')
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

      // Shutdown should succeed despite cleanup hook error
      await expect(handle.shutdown()).resolves.not.toThrow()
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

      await handle.shutdown()
      
      // Try to shutdown again - should not call cleanup again
      await handle.shutdown()
      
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

      await handle.shutdown()

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
      
      await handle.shutdown()
    })

    it('should log cleanup execution in debug mode', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
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

      await handle.shutdown()

      // Should log cleanup hook execution
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[AgentKit:DEBUG] Cleanup hook fired for agent: debug-cleanup-agent'
      )
      
      consoleLogSpy.mockRestore()
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
      
      await handle.shutdown()
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
      
      // Additional sends should be rejected
      await expect(handle.send({ id: 4 })).rejects.toThrow(/shutdown/)
    })
  })
})