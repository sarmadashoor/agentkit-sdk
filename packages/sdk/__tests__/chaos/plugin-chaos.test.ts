/**
 * @testmeta type:chaos
 * @testmeta category:reliability
 * @testmeta priority:critical
 * 
 * Plugin Chaos Tests
 * Tests plugin resilience, crash recovery, and system stability
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgentManager } from '../src/../AgentManager'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'
import type { AgentKitPlugin } from '@agentkit/types'

describe('Plugin Chaos Tests', () => {
  let agent: DummyAgent
  let transport: DummyTransport
  let manager: AgentManager

  beforeEach(async () => {
    agent = new DummyAgent()
    transport = new DummyTransport({ debug: false })
  })

  afterEach(async () => {
    if (manager && !manager.getState().shutdown) {
      await manager.shutdown()
    }
  })

  describe('Plugin Crashes During Operations', () => {
    /**
     * @testmeta technique:crash-recovery
     */
    it('should survive plugin crashes during onSend', async () => {
      const crashPlugin: AgentKitPlugin = {
        name: 'crash-plugin',
        version: '1.0.0',
        hooks: {
          onSend: async () => {
            throw new Error('Plugin crashed during send!')
          }
        }
      }

      const workingPlugin: AgentKitPlugin = {
        name: 'working-plugin',
        version: '1.0.0',
        hooks: {
          onSend: async () => {
            // This should still execute
          }
        }
      }

      manager = new AgentManager(
        agent,
        transport,
        {
          debug: true,
          plugins: [crashPlugin, workingPlugin]
        },
        [],
        'chaos-agent'
      )

      await manager.initialize()

      // Should not throw despite plugin crash
      await expect(manager.send({ test: 'message' })).resolves.not.toThrow()

      // Manager should remain functional
      expect(manager.getState().initialized).toBe(true)
      expect(manager.getState().shutdown).toBe(false)
    })

    /**
     * @testmeta technique:init-crash-recovery
     */
    it('should survive plugin crashes during onInit', async () => {
      const crashPlugin: AgentKitPlugin = {
        name: 'init-crash-plugin',
        version: '1.0.0',
        hooks: {
          onInit: async () => {
            throw new Error('Plugin crashed during init!')
          }
        }
      }

      manager = new AgentManager(
        agent,
        transport,
        {
          debug: true,
          plugins: [crashPlugin]
        },
        [],
        'init-chaos-agent'
      )

      // Should not throw despite plugin crash
      await expect(manager.initialize()).resolves.not.toThrow()

      // Manager should be functional
      expect(manager.getState().initialized).toBe(true)
      await manager.send({ test: 'message' })
    })

    /**
     * @testmeta technique:shutdown-crash-recovery
     */
    it('should survive plugin crashes during onShutdown', async () => {
      const crashPlugin: AgentKitPlugin = {
        name: 'shutdown-crash-plugin',
        version: '1.0.0',
        hooks: {
          onShutdown: async () => {
            throw new Error('Plugin crashed during shutdown!')
          }
        }
      }

      manager = new AgentManager(
        agent,
        transport,
        {
          debug: true,
          plugins: [crashPlugin]
        },
        [],
        'shutdown-chaos-agent'
      )

      await manager.initialize()
      
      // Should not throw despite plugin crash
      await expect(manager.shutdown()).resolves.not.toThrow()
      
      // Manager should be properly shutdown
      expect(manager.getState().shutdown).toBe(true)
    })
  })

  describe('Plugin Timeouts', () => {
    /**
     * @testmeta technique:timeout-handling
     */
    it('should timeout infinite loop plugins', async () => {
      const infiniteLoopPlugin: AgentKitPlugin = {
        name: 'infinite-loop-plugin',
        version: '1.0.0',
        hooks: {
          onSend: async () => {
            // Infinite loop
            while (true) {
              await new Promise(resolve => setTimeout(resolve, 1))
            }
          }
        }
      }

      const fastPlugin: AgentKitPlugin = {
        name: 'fast-plugin',
        version: '1.0.0',
        hooks: {
          onSend: async () => {
            // Should complete normally
          }
        }
      }

      manager = new AgentManager(
        agent,
        transport,
        {
          debug: true,
          plugins: [infiniteLoopPlugin, fastPlugin]
        },
        [],
        'timeout-chaos-agent'
      )

      await manager.initialize()

      // Should complete (infinite loop plugin will timeout)
      const startTime = Date.now()
      await manager.send({ test: 'message' })
      const duration = Date.now() - startTime

      // Should not take too long (plugin timeout + overhead)
      expect(duration).toBeLessThan(10000) // 10 seconds max

      // Manager should remain functional
      expect(manager.getState().initialized).toBe(true)
    })

    /**
     * @testmeta technique:sync-timeout-handling
     */
    it('should handle synchronous infinite loops', async () => {
      const syncInfinitePlugin: AgentKitPlugin = {
        name: 'sync-infinite-plugin',
        version: '1.0.0',
        hooks: {
          onSend: () => {
            // Synchronous infinite loop
            while (true) {
              // This will block the event loop
            }
          }
        }
      }

      manager = new AgentManager(
        agent,
        transport,
        {
          debug: true,
          plugins: [syncInfinitePlugin]
        },
        [],
        'sync-timeout-chaos-agent'
      )

      await manager.initialize()

      // This will timeout due to sync infinite loop
      const startTime = Date.now()
      await manager.send({ test: 'message' })
      const duration = Date.now() - startTime

      // Should timeout within reasonable time
      expect(duration).toBeLessThan(10000)
    }, 15000) // Give test itself longer timeout
  })

  describe('Plugin Memory Issues', () => {
    /**
     * @testmeta technique:memory-leak-isolation
     */
    it('should survive plugins that leak memory', async () => {
      const memoryLeakPlugin: AgentKitPlugin = {
        name: 'memory-leak-plugin',
        version: '1.0.0',
        hooks: {
          onSend: async () => {
            // Create memory leak
            const leak: any[] = []
            for (let i = 0; i < 100000; i++) {
              leak.push({ data: new Array(1000).fill('leak') })
            }
            // Intentionally don't clean up
          }
        }
      }

      manager = new AgentManager(
        agent,
        transport,
        {
          debug: true,
          plugins: [memoryLeakPlugin]
        },
        [],
        'memory-chaos-agent'
      )

      await manager.initialize()

      // Send multiple messages with memory leak plugin
      for (let i = 0; i < 5; i++) {
        await manager.send({ iteration: i })
      }

      // Manager should still be functional
      expect(manager.getState().initialized).toBe(true)
    })

    /**
     * @testmeta technique:payload-limit-enforcement
     */
    it('should handle plugins that exceed payload limits', async () => {
      const largePayloadPlugin: AgentKitPlugin = {
        name: 'large-payload-plugin',
        version: '1.0.0',
        hooks: {
          onSend: async (payload) => {
            // Try to create oversized payload
            (payload as any).largeData = new Array(1000000).fill('x').join('')
          }
        }
      }

      manager = new AgentManager(
        agent,
        transport,
        {
          debug: true,
          plugins: [largePayloadPlugin],
          resourceLimits: {
            maxConcurrentRequests: 1,
            maxQueueSize: 1,
            requestTimeoutMs: 5000,
            maxPayloadSize: 1024 // 1KB limit
          }
        },
        [],
        'payload-chaos-agent'
      )

      await manager.initialize()

      // Should handle oversized payload gracefully
      const smallPayload = { test: 'small' }
      await expect(manager.send(smallPayload)).resolves.not.toThrow()
      
      // Original payload should remain small (plugin mutation blocked)
      expect(JSON.stringify(smallPayload).length).toBeLessThan(100)
    })
  })

  describe('Plugin Exception Types', () => {
    /**
     * @testmeta technique:non-error-exception-handling
     */
    it('should handle plugins throwing non-Error objects', async () => {
      const weirdThrowPlugin: AgentKitPlugin = {
        name: 'weird-throw-plugin',
        version: '1.0.0',
        hooks: {
          onSend: async () => {
            throw 'This is a string error'
          }
        }
      }

      manager = new AgentManager(
        agent,
        transport,
        {
          debug: true,
          plugins: [weirdThrowPlugin]
        },
        [],
        'weird-throw-agent'
      )

      await manager.initialize()
      
      // Should handle non-Error throws gracefully
      await expect(manager.send({ test: 'message' })).resolves.not.toThrow()
    })

    /**
     * @testmeta technique:null-exception-handling
     */
    it('should handle plugins throwing null/undefined', async () => {
      const nullThrowPlugin: AgentKitPlugin = {
        name: 'null-throw-plugin',
        version: '1.0.0',
        hooks: {
          onSend: async () => {
            throw null
          }
        }
      }

      const undefinedThrowPlugin: AgentKitPlugin = {
        name: 'undefined-throw-plugin',
        version: '1.0.0',
        hooks: {
          onSend: async () => {
            throw undefined
          }
        }
      }

      manager = new AgentManager(
        agent,
        transport,
        {
          debug: true,
          plugins: [nullThrowPlugin, undefinedThrowPlugin]
        },
        [],
        'null-throw-agent'
      )

      await manager.initialize()
      
      // Should handle null/undefined throws gracefully
      await expect(manager.send({ test: 'message' })).resolves.not.toThrow()
    })
  })

  describe('Recursive Plugin Calls', () => {
    /**
     * @testmeta technique:recursion-prevention
     */
    it('should prevent infinite recursion in plugin hooks', async () => {
      let recursionCount = 0
      const maxRecursion = 10

      const recursivePlugin: AgentKitPlugin = {
        name: 'recursive-plugin',
        version: '1.0.0',
        hooks: {
          onSend: async (payload, context) => {
            recursionCount++
            if (recursionCount < maxRecursion) {
              // This should not cause infinite recursion
              // as plugins should not be able to trigger SDK operations
              console.log(`Recursive call ${recursionCount}`)
            }
          }
        }
      }

      manager = new AgentManager(
        agent,
        transport,
        {
          debug: true,
          plugins: [recursivePlugin]
        },
        [],
        'recursive-agent'
      )

      await manager.initialize()

      await manager.send({ test: 'message' })

      // Should have executed only once (no recursion)
      expect(recursionCount).toBe(1)
    })
  })

  describe('Plugin State Corruption Attempts', () => {
    /**
     * @testmeta technique:state-corruption-prevention
     */
    it('should prevent plugins from corrupting manager state', async () => {
      const corruptionPlugin: AgentKitPlugin = {
        name: 'corruption-plugin',
        version: '1.0.0',
        hooks: {
          onSend: async (payload, context) => {
            // Attempt to corrupt context
            try {
              (context as any).agentId = 'hacked-agent-id'
              context.requestId = 'hacked-request-id'
              ;(context as any).isShutdown = true
              ;(context as any).__proto__.maliciousMethod = () => console.log('hacked')
            } catch (e) {
              // Plugin might fail when trying to corrupt immutable data
            }
          }
        }
      }

      manager = new AgentManager(
        agent,
        transport,
        {
          debug: true,
          plugins: [corruptionPlugin]
        },
        [],
        'corruption-test-agent'
      )

      await manager.initialize()

      const originalState = manager.getState()
      await manager.send({ test: 'message' })
      const afterState = manager.getState()

      // Manager state should be unchanged
      expect(afterState.agentId).toBe(originalState.agentId)
      expect(afterState.initialized).toBe(originalState.initialized)
      expect(afterState.shutdown).toBe(originalState.shutdown)

      // Should still be functional
      await manager.send({ test: 'another message' })
    })
  })

  describe('Multi-Plugin Chaos Scenarios', () => {
    /**
     * @testmeta technique:multi-plugin-failure-handling
     */
    it('should handle multiple failing plugins in sequence', async () => {
      const plugins: AgentKitPlugin[] = Array.from({ length: 10 }, (_, i) => ({
        name: `chaos-plugin-${i}`,
        version: '1.0.0',
        hooks: {
          onSend: async () => {
            if (Math.random() > 0.5) {
              throw new Error(`Random failure from plugin ${i}`)
            }
            if (Math.random() > 0.8) {
              await new Promise(resolve => setTimeout(resolve, 100))
            }
          }
        }
      }))

      manager = new AgentManager(
        agent,
        transport,
        {
          debug: true,
          plugins
        },
        [],
        'multi-chaos-agent'
      )

      await manager.initialize()

      // Send multiple messages through chaos plugins
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, i) => 
          manager.send({ messageId: i })
        )
      )

      // All should resolve (even if plugins fail internally)
      const fulfilledCount = results.filter(r => r.status === 'fulfilled').length
      expect(fulfilledCount).toBe(20)

      // Manager should remain stable
      expect(manager.getState().initialized).toBe(true)
      expect(manager.getState().shutdown).toBe(false)
    })

    /**
     * @testmeta technique:shutdown-under-load
     */
    it('should handle plugin failures during shutdown under load', async () => {
      const chaosPlugins: AgentKitPlugin[] = Array.from({ length: 5 }, (_, i) => ({
        name: `shutdown-chaos-${i}`,
        version: '1.0.0',
        hooks: {
          onShutdown: async () => {
            if (i % 2 === 0) {
              throw new Error(`Shutdown chaos from plugin ${i}`)
            }
            await new Promise(resolve => setTimeout(resolve, 50))
          }
        }
      }))

      manager = new AgentManager(
        agent,
        transport,
        {
          debug: true,
          plugins: chaosPlugins
        },
        [],
        'shutdown-chaos-agent'
      )

      await manager.initialize()

      // Start some operations
      const operations = Array.from({ length: 10 }, (_, i) => 
        manager.send({ id: i }).catch(() => {}) // Ignore send failures
      )

      // Shutdown while operations are running
      setTimeout(() => manager.shutdown(), 10)

      // Wait for everything to settle
      await Promise.allSettled(operations)

      // Should eventually reach shutdown state
      expect(manager.getState().shutdown).toBe(true)
    })
  })

  describe('Resource Exhaustion', () => {
    /**
     * @testmeta technique:resource-exhaustion-handling
     */
    it('should handle plugin resource exhaustion gracefully', async () => {
      const resourceExhaustionPlugin: AgentKitPlugin = {
        name: 'resource-exhaustion-plugin',
        version: '1.0.0',
        hooks: {
          onSend: async () => {
            // Try to exhaust various resources
            const resources = []
            
            // Create many promises
            for (let i = 0; i < 1000; i++) {
              resources.push(new Promise(resolve => setTimeout(resolve, 1000)))
            }
            
            // Create large objects
            for (let i = 0; i < 100; i++) {
              resources.push(new Array(10000).fill('data'))
            }
            
            // Don't await everything (partial resource exhaustion)
            await Promise.race(resources.slice(0, 10))
          }
        }
      }

      manager = new AgentManager(
        agent,
        transport,
        {
          debug: true,
          plugins: [resourceExhaustionPlugin]
        },
        [],
        'resource-exhaustion-agent'
      )

      await manager.initialize()

      // Should complete despite resource exhaustion
      await expect(manager.send({ test: 'message' })).resolves.not.toThrow()
      
      // Manager should remain functional
      expect(manager.getState().initialized).toBe(true)
    })
  })
})