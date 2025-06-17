import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentManager } from '../src/AgentManager'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'
import { AgentShutdownError } from '../src/errors'

describe('AgentManager Concurrency Safety', () => {
  let agent: DummyAgent
  let transport: DummyTransport
  let manager: AgentManager

  beforeEach(async () => {
    agent = new DummyAgent()
    transport = new DummyTransport({ debug: false })
    manager = new AgentManager(agent, transport, { debug: true }, [], 'test-agent')
    await manager.initialize()
  })

  describe('Race Condition Prevention', () => {
    it('should prevent send after shutdown', async () => {
      // Start shutdown in background (don't await)
      const shutdownPromise = manager.shutdown()
      
      // Try to send immediately after shutdown starts
      await expect(
        manager.send({ test: 'message' })
      ).rejects.toThrow(AgentShutdownError)
      
      // Wait for shutdown to complete
      await shutdownPromise
    })

    it('should handle concurrent shutdown calls gracefully', async () => {
      console.time('agent-manager-concurrent-shutdown')
      // Start multiple shutdown operations concurrently
      const shutdown1 = manager.shutdown()
      const shutdown2 = manager.shutdown()
      const shutdown3 = manager.shutdown()
      
      // All should complete without throwing
      await Promise.all([shutdown1, shutdown2, shutdown3])
      
      // Manager should be properly shutdown
      expect(manager.getState().shutdown).toBe(true)
      console.timeEnd('agent-manager-concurrent-shutdown')
    }, { timeout: 10000 })

    it('should handle send operations during shutdown', async () => {
      console.time('agent-manager-send-during-shutdown')
      // Start multiple send operations
      const send1 = manager.send({ msg: 1 })
      const send2 = manager.send({ msg: 2 })
      const send3 = manager.send({ msg: 3 })
      
      // Start shutdown while sends are in progress
      const shutdownPromise = manager.shutdown()
      
      // Some sends might complete, others might be rejected
      const results = await Promise.allSettled([send1, send2, send3, shutdownPromise])
      
      // At least the shutdown should complete
      const shutdownResult = results[3]
      expect(shutdownResult.status).toBe('fulfilled')
      
      // Manager should be shutdown
      expect(manager.getState().shutdown).toBe(true)
      console.timeEnd('agent-manager-send-during-shutdown')
    }, { timeout: 12000 })

    it('should prevent initialization after shutdown', async () => {
      await manager.shutdown()
      
      // Try to reinitialize
      await expect(
        manager.initialize()
      ).rejects.toThrow('AgentManager has been shutdown and cannot be reinitialized')
    })

    it('should handle high concurrency send operations', async () => {
      // Create many concurrent send operations
      const sendPromises = Array.from({ length: 50 }, (_, i) => 
        manager.send({ id: i, data: `message-${i}` })
      )
      
      // All should complete successfully
      await Promise.all(sendPromises)
      
      // Manager should still be functional
      expect(manager.getState().initialized).toBe(true)
      expect(manager.getState().shutdown).toBe(false)
    })

    it('should maintain state consistency under concurrent stress', async () => {
      const operations: Promise<any>[] = []
      const results: { operation: string; success: boolean; error?: string }[] = []
      
      // Mix of send operations
      for (let i = 0; i < 20; i++) {
        operations.push(
          manager.send({ test: `msg-${i}` })
            .then(() => {
              results.push({ operation: `send-${i}`, success: true })
            })
            .catch(error => {
              results.push({ operation: `send-${i}`, success: false, error: error.message })
            })
        )
      }
      
      // Add a shutdown operation after some sends
      setTimeout(() => {
        operations.push(
          manager.shutdown()
            .then(() => {
              results.push({ operation: 'shutdown', success: true })
            })
            .catch(error => {
              results.push({ operation: 'shutdown', success: false, error: error.message })
            })
        )
      }, 10)
      
      // Wait for all operations to complete or fail
      await Promise.allSettled(operations)
      
      // Shutdown should have completed successfully
      const shutdownResult = results.find(r => r.operation === 'shutdown')
      expect(shutdownResult?.success).toBe(true)
      
      // Manager should be in shutdown state
      expect(manager.getState().shutdown).toBe(true)
    })
  })

  describe('BoundedExecutor Integration', () => {
    it('should respect queue limits under concurrent load', async () => {
      // Create manager with small queue limits
      const limitedManager = new AgentManager(
        agent, 
        transport, 
        { 
          debug: true,
          resourceLimits: {
            maxConcurrentRequests: 2,
            maxQueueSize: 3,
            requestTimeoutMs: 1000,
            maxPayloadSize: 1024
          }
        }, 
        [], 
        'limited-agent'
      )
      
      await limitedManager.initialize()
      
      // Create more requests than the queue can handle
      const promises = Array.from({ length: 10 }, (_, i) => 
        limitedManager.send({ id: i }).catch(error => error)
      )
      
      const results = await Promise.all(promises)
      
      // Some requests should be rejected due to queue limits
      const rejectedRequests = results.filter(r => r instanceof Error)
      expect(rejectedRequests.length).toBeGreaterThan(0)
      
      await limitedManager.shutdown()
    })

    it('should handle timeout scenarios gracefully', async () => {
      // Create an agent that takes longer to process
      const slowAgent = {
        id: 'slow-agent',
        name: 'Slow Agent',
        version: '1.0.0',
        init: async () => {
          await new Promise(resolve => setTimeout(resolve, 50))
        },
        handle: async (input: any) => {
          // Simulate slow processing
          await new Promise(resolve => setTimeout(resolve, 200))
          return { processed: input }
        },
        shutdown: async () => {}
      }
      
      const slowManager = new AgentManager(
        slowAgent,
        transport,
        {
          debug: true,
          resourceLimits: {
            maxConcurrentRequests: 1,
            maxQueueSize: 2,
            requestTimeoutMs: 100, // Short timeout
            maxPayloadSize: 1024
          }
        },
        [],
        'slow-agent'
      )
      
      await slowManager.initialize()
      
      // Send requests that will timeout
      const results = await Promise.allSettled([
        slowManager.send({ msg: 1 }),
        slowManager.send({ msg: 2 }),
        slowManager.send({ msg: 3 })
      ])
      
      // Some should timeout
      const timedOut = results.filter(r => 
        r.status === 'rejected' && 
        r.reason.message.includes('timeout')
      )
      
      expect(timedOut.length).toBeGreaterThan(0)
      
      await slowManager.shutdown()
    })
  })

  describe('Plugin System Integration', () => {
    it('should handle plugin failures during concurrent operations', async () => {
      const errorPlugin = {
        name: 'error-plugin',
        version: '1.0.0',
        hooks: {
          onSend: async () => {
            if (Math.random() > 0.5) {
              throw new Error('Random plugin failure')
            }
          }
        }
      }
      
      const pluginManager = new AgentManager(
        agent,
        transport,
        {
          debug: true,
          plugins: [errorPlugin]
        },
        [],
        'plugin-test-agent'
      )
      
      await pluginManager.initialize()
      
      // Send multiple messages with failing plugin
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, i) => 
          pluginManager.send({ id: i })
        )
      )
      
      // Some operations might fail due to plugin errors, but manager should remain stable
      expect(pluginManager.getState().initialized).toBe(true)
      expect(pluginManager.getState().shutdown).toBe(false)
      
      await pluginManager.shutdown()
    })
  })

  describe('Error Recovery', () => {
    it('should recover from transport errors', async () => {
      // Create a transport that fails intermittently
      const flakyTransport = {
        id: 'flaky',
        name: 'Flaky Transport',
        config: {},
        init: async () => {},
        send: async (message: any) => {
          if (Math.random() > 0.7) {
            throw new Error('Transport temporarily unavailable')
          }
        },
        receive: async () => null
      }
      
      const flakyManager = new AgentManager(
        agent,
        flakyTransport,
        { debug: true },
        [],
        'flaky-agent'
      )
      
      await flakyManager.initialize()
      
      // Send multiple messages - some will fail, but manager should remain stable
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) => 
          flakyManager.send({ id: i })
        )
      )
      
      // Manager should still be functional
      expect(flakyManager.getState().initialized).toBe(true)
      
      await flakyManager.shutdown()
    })
  })
})