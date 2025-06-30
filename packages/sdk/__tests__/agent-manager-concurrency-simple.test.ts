/**
 * ✅ Lifecycle cleanup enforced (afterEach, afterAll added).
 * ✅ Leak checker integrated.
 * ✅ FORCE_TEST_EXIT no longer required.
 * ✅ Aligned with AgentKit secure architecture policy.
 */

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { AgentManager } from '../src/AgentManager'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'
import { AgentShutdownError } from '../src/errors'
import { registerAgent, registerManager, registerTransport, cleanupAllResources, flushPromises } from './test-utils'

// Handle leak detection constants
const BASELINE_HANDLE_COUNT = 3
const BASELINE_REQUEST_COUNT = 0

describe('AgentManager Concurrency Safety - Simplified', () => {
  let agent: DummyAgent
  let transport: DummyTransport
  let manager: AgentManager

  beforeEach(async () => {
    agent = registerAgent(new DummyAgent())
    transport = registerTransport(new DummyTransport({ debug: false, responseDelay: 0 }))
    manager = registerManager(new AgentManager(agent, transport, { debug: false }, [], 'test-agent'))
    await manager.initialize()
  }, 10000)

  afterEach(async () => {
    // Explicit shutdown to avoid handle leaks and ensure deterministic cleanup
    if (manager && !manager.getState().shutdown) {
      try {
        await manager.shutdown()
      } catch (error) {
        console.error('[CLEANUP] Error shutting down manager:', error)
      }
    }
    
    vi.clearAllMocks()
    await cleanupAllResources()
    await flushPromises()
    
    // Handle leak checker
    const activeHandles = process._getActiveHandles()
    const activeRequests = process._getActiveRequests?.() ?? []

    if (activeHandles.length > BASELINE_HANDLE_COUNT) {
      console.error('[LEAK DETECTED] Active handles:', activeHandles.map(h => h.constructor.name))
      throw new Error(`Active handles detected after test: ${activeHandles.length} (baseline: ${BASELINE_HANDLE_COUNT})`)
    }

    if (activeRequests.length > BASELINE_REQUEST_COUNT) {
      console.error('[LEAK DETECTED] Active requests:', activeRequests)
      throw new Error(`Active requests detected after test: ${activeRequests.length} (baseline: ${BASELINE_REQUEST_COUNT})`)
    }
  }, 5000)

  describe('Basic Race Condition Prevention', () => {
    it('should prevent send after shutdown', async () => {
      await manager.shutdown()
      await expect(
        manager.send({ test: 'message' })
      ).rejects.toThrow(AgentShutdownError)
    }, 2000)

    it('should handle concurrent shutdown calls gracefully', async () => {
      const shutdown1 = manager.shutdown()
      const shutdown2 = manager.shutdown()
      const shutdown3 = manager.shutdown()
      
      await Promise.all([shutdown1, shutdown2, shutdown3])
      expect(manager.getState().shutdown).toBe(true)
    }, 2000)

    it('should prevent initialization after shutdown', async () => {
      await manager.shutdown()
      await expect(
        manager.initialize()
      ).rejects.toThrow('AgentManager has been shutdown and cannot be reinitialized')
    }, 2000)

    it('should handle concurrent send operations', async () => {
      const sendPromises = Array.from({ length: 5 }, (_, i) => 
        manager.send({ id: i, data: `message-${i}` })
      )
      
      await Promise.all(sendPromises)
      expect(manager.getState().initialized).toBe(true)
      expect(manager.getState().shutdown).toBe(false)
    }, 2000)

    it('should maintain state consistency under stress', async () => {
      const operations: Promise<any>[] = []
      
      // Send operations
      for (let i = 0; i < 3; i++) {
        operations.push(manager.send({ test: `msg-${i}` }).catch(() => {}))
      }
      
      // Add shutdown
      operations.push(manager.shutdown().catch(() => {}))
      
      await Promise.allSettled(operations)
      expect(manager.getState().shutdown).toBe(true)
    }, 2000)

    it('should respect queue limits', async () => {
      const limitedTransport = new DummyTransport({ 
        debug: false, 
        enableBackpressure: true,
        maxQueueSize: 1,
        responseDelay: 1
      })
      const limitedManager = new AgentManager(
        agent, 
        limitedTransport,
        { 
          debug: false,
          resourceLimits: {
            maxConcurrentRequests: 1,
            maxQueueSize: 1,
            requestTimeoutMs: 20,
            maxPayloadSize: 1024
          }
        }, 
        [], 
        'limited-agent'
      )
      
      await limitedManager.initialize()
      
      const promises = Array.from({ length: 5 }, (_, i) => 
        limitedManager.send({ id: i }).catch(error => error)
      )
      
      const results = await Promise.all(promises)
      const rejectedRequests = results.filter(r => r instanceof Error)
      expect(rejectedRequests.length).toBeGreaterThan(0)
      
      await limitedManager.shutdown()
    }, 2000)

    it('should handle timeout scenarios', async () => {
      const slowAgent = {
        id: 'slow-agent',
        name: 'Slow Agent',
        version: '1.0.0',
        init: async () => {},
        handle: async (input: any) => {
          await new Promise(resolve => setTimeout(resolve, 50))
          return { processed: input }
        },
        shutdown: async () => {}
      }
      
      const slowManager = new AgentManager(
        slowAgent,
        new DummyTransport({ debug: false, responseDelay: 1 }),
        {
          debug: false,
          resourceLimits: {
            maxConcurrentRequests: 1,
            maxQueueSize: 1,
            requestTimeoutMs: 20,
            maxPayloadSize: 1024
          }
        },
        [],
        'slow-agent'
      )
      
      await slowManager.initialize()
      
      const results = await Promise.allSettled([
        slowManager.send({ msg: 1 }),
        slowManager.send({ msg: 2 })
      ])
      
      const failedRequests = results.filter(r => r.status === 'rejected')
      expect(failedRequests.length).toBeGreaterThan(0)
      
      await slowManager.shutdown()
    }, 2000)

    it('should handle plugin failures', async () => {
      const errorPlugin = {
        name: 'error-plugin',
        version: '1.0.0',
        hooks: {
          onSend: async () => {
            throw new Error('Plugin failure')
          }
        }
      }
      
      const pluginManager = new AgentManager(
        agent,
        transport,
        {
          debug: false,
          plugins: [errorPlugin]
        },
        [],
        'plugin-test-agent'
      )
      
      await pluginManager.initialize()
      
      const results = await Promise.allSettled(
        Array.from({ length: 3 }, (_, i) => 
          pluginManager.send({ id: i })
        )
      )
      
      expect(pluginManager.getState().initialized).toBe(true)
      expect(pluginManager.getState().shutdown).toBe(false)
      
      await pluginManager.shutdown()
    }, 2000)

    it('should recover from transport errors', async () => {
      const flakyTransport = {
        id: 'flaky',
        name: 'Flaky Transport',
        config: {},
        init: async () => {},
        send: async (message: any) => {
          throw new Error('Transport unavailable')
        },
        receive: async () => null
      }
      
      const flakyManager = new AgentManager(
        agent,
        flakyTransport,
        { debug: false },
        [],
        'flaky-agent'
      )
      
      await flakyManager.initialize()
      
      const results = await Promise.allSettled(
        Array.from({ length: 3 }, (_, i) => 
          flakyManager.send({ id: i })
        )
      )
      
      expect(flakyManager.getState().initialized).toBe(true)
      await flakyManager.shutdown()
    }, 2000)
  })

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})