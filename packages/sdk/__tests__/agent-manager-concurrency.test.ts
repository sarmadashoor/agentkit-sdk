/**
 * AgentManager Concurrency Safety Tests
 * 
 * This file tests concurrent operations and race condition prevention in AgentManager.
 * IMPORTANT: This file has been updated with proper resource cleanup to prevent test isolation issues.
 * 
 * Key cleanup features:
 * - Automatic registration and tracking of all managers, agents, and transports
 * - Comprehensive afterEach, afterAll cleanup that shuts down all resources
 * - Handle leak detection to catch resource management issues
 * - Removal of manual shutdown calls from individual tests (handled by afterEach, afterAll)
 */

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { AgentManager } from '../src/AgentManager'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'
import { AgentShutdownError } from '../src/errors'
import { registerAgent, registerManager, registerTransport, cleanupAllResources, flushPromises } from './test-utils'

// Leak detection constants
const BASELINE_HANDLE_COUNT = 3
const BASELINE_REQUEST_COUNT = 0

describe('AgentManager Concurrency Safety', () => {
  let agent: DummyAgent
  let transport: DummyTransport
  let manager: AgentManager

  beforeEach(async () => {
    agent = registerAgent(new DummyAgent())
    transport = registerTransport(new DummyTransport({ debug: false, responseDelay: 0 }))
    manager = registerManager(new AgentManager(agent, transport, { debug: false }, [], 'test-agent'))
    await manager.initialize()
  }, 2000)

  afterEach(async () => {
    // Explicit shutdown of active managers
    if (manager && !manager.getState().shutdown) {
      try {
        await manager.shutdown()
      } catch (error) {
        console.error('Error during manager shutdown:', error)
      }
    }

    // Clean up all registered resources
    await cleanupAllResources()
    await flushPromises()

    // Handle leak detection
    const currentHandles = process._getActiveHandles().length
    const currentRequests = process._getActiveRequests().length
    
    if (currentHandles > BASELINE_HANDLE_COUNT) {
      console.error(`Handle leak detected: ${currentHandles} handles (expected <= ${BASELINE_HANDLE_COUNT})`)
      console.error('Active handles:', process._getActiveHandles().map(h => h.constructor.name))
      throw new Error(`Handle leak: ${currentHandles} active handles`)
    }
    
    if (currentRequests > BASELINE_REQUEST_COUNT) {
      console.error(`Request leak detected: ${currentRequests} requests (expected <= ${BASELINE_REQUEST_COUNT})`)
      throw new Error(`Request leak: ${currentRequests} active requests`)
    }
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
      
      // Note: Cleanup handled by afterEach, afterAll
    }, 1500)

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
      
      // Note: Cleanup handled by afterEach, afterAll
    }, 2000)

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
      
      // Note: Cleanup handled by afterEach, afterAll
    }, 3000)

    it('should prevent initialization after shutdown', async () => {
      await manager.shutdown()
      
      // Try to reinitialize
      await expect(
        manager.initialize()
      ).rejects.toThrow('AgentManager has been shutdown and cannot be reinitialized')
      
      // Note: Cleanup handled by afterEach, afterAll
    }, 1500)

    it('should handle high concurrency send operations', async () => {
      // Create many concurrent send operations
      const sendPromises = Array.from({ length: 20 }, (_, i) => 
        manager.send({ id: i, data: `message-${i}` })
      )
      
      // All should complete successfully with timeout protection
      await Promise.race([
        Promise.all(sendPromises),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), 3000).unref())
      ])
      
      // Manager should still be functional
      expect(manager.getState().initialized).toBe(true)
      expect(manager.getState().shutdown).toBe(false)
    }, 5000)

    it('should maintain state consistency under concurrent stress', async () => {
      const operations: Promise<any>[] = []
      const results: { operation: string; success: boolean; error?: string }[] = []
      
      // Mix of send operations
      for (let i = 0; i < 10; i++) {
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
      
      // Add a shutdown operation immediately after initial sends
      const shutdownPromise = Promise.resolve().then(() => {
        return manager.shutdown()
          .then(() => {
            results.push({ operation: 'shutdown', success: true })
          })
          .catch(error => {
            results.push({ operation: 'shutdown', success: false, error: error.message })
          })
      })
      
      operations.push(shutdownPromise)
      
      // Wait for all operations to complete or fail with timeout protection
      await Promise.race([
        Promise.allSettled(operations),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), 5000).unref())
      ])
      
      // Shutdown should have completed successfully
      const shutdownResult = results.find(r => r.operation === 'shutdown')
      expect(shutdownResult?.success).toBe(true)
      
      // Manager should be in shutdown state
      expect(manager.getState().shutdown).toBe(true)
      
      // Note: Cleanup handled by afterEach, afterAll
    }, { timeout: 8000 })
  })

  describe('BoundedExecutor Integration', () => {
    it('should respect queue limits under concurrent load', async () => {
      // Create manager with small queue limits
      const limitedTransport = registerTransport(new DummyTransport({ 
        debug: false, 
        enableBackpressure: true,
        maxQueueSize: 1,
        responseDelay: 5 // Minimal delay
      }))
      const limitedManager = registerManager(new AgentManager(
        agent, 
        limitedTransport,
        { 
          debug: true,
          resourceLimits: {
            maxConcurrentRequests: 1,
            maxQueueSize: 1,
            requestTimeoutMs: 50,
            maxPayloadSize: 1024
          }
        }, 
        [], 
        'limited-agent'
      ))
      
      await limitedManager.initialize()
      
      // Create more requests than the queue can handle - send all at once
      const promises = Array.from({ length: 5 }, (_, i) => 
        limitedManager.send({ id: i }).catch(error => error)
      )
      
      const results = await Promise.race([
        Promise.all(promises),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), 500).unref())
      ])
      
      // Some requests should be rejected due to queue limits
      const rejectedRequests = results.filter(r => r instanceof Error)
      expect(rejectedRequests.length).toBeGreaterThan(0)
      
      // Note: Cleanup handled by afterEach, afterAll
    }, { timeout: 1000 })

    it('should handle timeout scenarios gracefully', async () => {
      // Create an agent that takes longer to process
      const timeoutTransport = registerTransport(new DummyTransport({ 
        debug: false, 
        enableBackpressure: true,
        responseDelay: 20
      }))
      const slowAgent = registerAgent({
        id: 'slow-agent',
        name: 'Slow Agent',
        version: '1.0.0',
        init: async () => {
          await new Promise(resolve => setTimeout(resolve, 20).unref())
        },
        handle: async (input: any) => {
          // Simulate slow processing
          await new Promise(resolve => setTimeout(resolve, 150).unref())
          return { processed: input }
        },
        shutdown: async () => {}
      })
      
      const slowManager = registerManager(new AgentManager(
        slowAgent,
        timeoutTransport,
        {
          debug: true,
          resourceLimits: {
            maxConcurrentRequests: 1,
            maxQueueSize: 1,
            requestTimeoutMs: 80, // Short timeout
            maxPayloadSize: 1024
          }
        },
        [],
        'slow-agent'
      ))
      
      await slowManager.initialize()
      
      // Send requests that will timeout - all at once for immediate queue filling
      const results = await Promise.race([
        Promise.allSettled([
          slowManager.send({ msg: 1 }),
          slowManager.send({ msg: 2 }),
          slowManager.send({ msg: 3 })
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), 2000).unref())
      ])
      
      // Some should timeout or be rejected
      const failedRequests = results.filter(r => r.status === 'rejected')
      expect(failedRequests.length).toBeGreaterThan(0)
      
      // Note: Cleanup handled by afterEach, afterAll
    }, { timeout: 4000 })
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
      
      const pluginManager = registerManager(new AgentManager(
        agent,
        transport,
        {
          debug: true,
          plugins: [errorPlugin]
        },
        [],
        'plugin-test-agent'
      ))
      
      await pluginManager.initialize()
      
      // Send multiple messages with failing plugin
      const results = await Promise.race([
        Promise.allSettled(
          Array.from({ length: 10 }, (_, i) => 
            pluginManager.send({ id: i })
          )
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), 2000).unref())
      ])
      
      // Some operations might fail due to plugin errors, but manager should remain stable
      expect(pluginManager.getState().initialized).toBe(true)
      expect(pluginManager.getState().shutdown).toBe(false)
      
      // Note: Cleanup handled by afterEach, afterAll
    }, { timeout: 4000 })
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
          if (Math.random() > 0.6) {
            throw new Error('Transport temporarily unavailable')
          }
        },
        receive: async () => null
      }
      
      const flakyManager = registerManager(new AgentManager(
        agent,
        flakyTransport,
        { debug: true },
        [],
        'flaky-agent'
      ))
      
      await flakyManager.initialize()
      
      // Send multiple messages - some will fail, but manager should remain stable
      const results = await Promise.race([
        Promise.allSettled(
          Array.from({ length: 8 }, (_, i) => 
            flakyManager.send({ id: i })
          )
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), 2000).unref())
      ])
      
      // Manager should still be functional
      expect(flakyManager.getState().initialized).toBe(true)
      
      // Note: Cleanup handled by afterEach, afterAll
    }, { timeout: 4000 })
  })

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})