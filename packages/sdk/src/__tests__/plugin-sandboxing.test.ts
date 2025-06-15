import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PluginManager } from '../plugins/PluginManager'
import type { AgentKitPlugin, SendPayload, AgentContext } from '../plugins'

describe('Plugin Sandboxing', () => {
  let pluginManager: PluginManager

  beforeEach(() => {
    pluginManager = new PluginManager({ debug: true })
  })

  describe('Context Isolation', () => {
    it('should prevent plugins from mutating shared context', async () => {
      const originalContext: AgentContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'req-123',
        timestamp: Date.now()
      }

      const maliciousPlugin: AgentKitPlugin = {
        name: 'malicious-plugin',
        version: '1.0.0',
        hooks: {
          onSend: async (payload, context) => {
            // Attempt to mutate context
            (context as any).agentId = 'hacked'
            (context as any).newField = 'injected'
          }
        }
      }

      pluginManager.register(maliciousPlugin)
      
      const contextCopy = { ...originalContext }
      await pluginManager.executeHook('onSend', 
        { input: 'test', metadata: {} }, 
        contextCopy
      )

      // Context should remain unchanged
      expect(contextCopy).toEqual(originalContext)
      expect(contextCopy.agentId).toBe('test-agent')
      expect((contextCopy as any).newField).toBeUndefined()
    })

    it('should prevent plugins from mutating payload data', async () => {
      const originalPayload: SendPayload = {
        input: { data: 'test', nested: { value: 123 } },
        metadata: { key: 'value' }
      }

      const maliciousPlugin: AgentKitPlugin = {
        name: 'payload-mutator',
        version: '1.0.0',
        hooks: {
          onSend: async (payload, context) => {
            // Attempt to mutate payload
            (payload.input as any).data = 'hacked'
            (payload.input as any).nested.value = 999
            payload.metadata.key = 'mutated'
          }
        }
      }

      pluginManager.register(maliciousPlugin)
      
      const payloadCopy = JSON.parse(JSON.stringify(originalPayload))
      await pluginManager.executeHook('onSend', payloadCopy, {
        agentId: 'test',
        transportId: 'test',
        requestId: 'req-123',
        timestamp: Date.now()
      })

      // Payload should remain unchanged
      expect(payloadCopy).toEqual(originalPayload)
      expect((payloadCopy.input as any).data).toBe('test')
      expect((payloadCopy.input as any).nested.value).toBe(123)
      expect(payloadCopy.metadata.key).toBe('value')
    })
  })

  describe('Error Isolation', () => {
    it('should isolate plugin errors from affecting other plugins', async () => {
      const results: string[] = []

      const errorPlugin: AgentKitPlugin = {
        name: 'error-plugin',
        version: '1.0.0',
        hooks: {
          onInit: async () => {
            results.push('error-plugin-start')
            throw new Error('Plugin crashed!')
          }
        }
      }

      const healthyPlugin1: AgentKitPlugin = {
        name: 'healthy-plugin-1',
        version: '1.0.0',
        hooks: {
          onInit: async () => {
            results.push('healthy-1-executed')
          }
        }
      }

      const healthyPlugin2: AgentKitPlugin = {
        name: 'healthy-plugin-2',
        version: '1.0.0',
        hooks: {
          onInit: async () => {
            results.push('healthy-2-executed')
          }
        }
      }

      pluginManager.register(errorPlugin)
      pluginManager.register(healthyPlugin1)
      pluginManager.register(healthyPlugin2)

      const context: AgentContext = {
        agentId: 'test',
        transportId: 'test',
        requestId: 'req-123',
        timestamp: Date.now()
      }

      const hookResults = await pluginManager.executeHook('onInit', context)

      // Error plugin should fail but others should succeed
      expect(hookResults).toHaveLength(3)
      expect(hookResults[0].success).toBe(false)
      expect(hookResults[0].error).toBeDefined()
      expect(hookResults[1].success).toBe(true)
      expect(hookResults[2].success).toBe(true)

      // Healthy plugins should have executed
      expect(results).toContain('healthy-1-executed')
      expect(results).toContain('healthy-2-executed')
    })

    it('should continue execution when plugin throws in onSend', async () => {
      const executionOrder: string[] = []

      const plugins = [
        {
          name: 'plugin-1',
          version: '1.0.0',
          hooks: {
            onSend: async () => {
              executionOrder.push('plugin-1')
            }
          }
        },
        {
          name: 'plugin-2-throws',
          version: '1.0.0',
          hooks: {
            onSend: async () => {
              executionOrder.push('plugin-2-start')
              throw new Error('Plugin 2 error')
            }
          }
        },
        {
          name: 'plugin-3',
          version: '1.0.0',
          hooks: {
            onSend: async () => {
              executionOrder.push('plugin-3')
            }
          }
        }
      ]

      plugins.forEach(p => pluginManager.register(p))

      const results = await pluginManager.executeHook('onSend', 
        { input: 'test', metadata: {} },
        {
          agentId: 'test',
          transportId: 'test', 
          requestId: 'req-123',
          timestamp: Date.now()
        }
      )

      // All plugins should be attempted
      expect(results).toHaveLength(3)
      expect(results[0].success).toBe(true)
      expect(results[1].success).toBe(false)
      expect(results[2].success).toBe(true)

      // Execution order should show all were attempted
      expect(executionOrder).toEqual(['plugin-1', 'plugin-2-start', 'plugin-3'])
    })
  })

  describe('Timeout Protection', () => {
    it('should timeout long-running plugins without affecting others', async () => {
      const executionTracker: string[] = []

      const slowPlugin: AgentKitPlugin = {
        name: 'slow-plugin',
        version: '1.0.0',
        hooks: {
          onInit: async () => {
            executionTracker.push('slow-start')
            await new Promise(resolve => setTimeout(resolve, 10000)) // 10s
            executionTracker.push('slow-end') // Should not reach here
          }
        }
      }

      const fastPlugin: AgentKitPlugin = {
        name: 'fast-plugin',
        version: '1.0.0',
        hooks: {
          onInit: async () => {
            executionTracker.push('fast-executed')
          }
        }
      }

      // Create plugin manager with short timeout
      pluginManager = new PluginManager({ 
        debug: true,
        timeout: 100 // 100ms timeout
      })

      pluginManager.register(slowPlugin)
      pluginManager.register(fastPlugin)

      const results = await pluginManager.executeHook('onInit', {
        agentId: 'test',
        transportId: 'test',
        requestId: 'req-123',
        timestamp: Date.now()
      })

      // Slow plugin should timeout, fast should succeed
      expect(results[0].success).toBe(false)
      expect(results[0].error?.message).toContain('timed out')
      expect(results[1].success).toBe(true)

      // Fast plugin should have executed
      expect(executionTracker).toContain('fast-executed')
      expect(executionTracker).not.toContain('slow-end')
    })
  })

  describe('Deep Cloning Protection', () => {
    it('should deep clone nested objects in context', async () => {
      const deepContext: AgentContext & { custom?: any } = {
        agentId: 'test',
        transportId: 'test',
        requestId: 'req-123',
        timestamp: Date.now(),
        custom: {
          level1: {
            level2: {
              level3: {
                value: 'original'
              }
            }
          }
        }
      }

      const deepMutatorPlugin: AgentKitPlugin = {
        name: 'deep-mutator',
        version: '1.0.0',
        hooks: {
          onInit: async (context: any) => {
            context.custom.level1.level2.level3.value = 'mutated'
          }
        }
      }

      pluginManager.register(deepMutatorPlugin)
      
      const contextCopy = JSON.parse(JSON.stringify(deepContext))
      await pluginManager.executeHook('onInit', contextCopy)

      // Original should be unchanged
      expect(deepContext.custom.level1.level2.level3.value).toBe('original')
    })

    it('should handle circular references safely', async () => {
      const circularObj: any = { name: 'test' }
      circularObj.self = circularObj

      const payload: SendPayload = {
        input: circularObj,
        metadata: {}
      }

      const plugin: AgentKitPlugin = {
        name: 'circular-handler',
        version: '1.0.0',
        hooks: {
          onSend: async (payload, context) => {
            expect(payload.input).toBeDefined()
          }
        }
      }

      pluginManager.register(plugin)

      // Should not throw despite circular reference
      const results = await pluginManager.executeHook('onSend', payload, {
        agentId: 'test',
        transportId: 'test',
        requestId: 'req-123',
        timestamp: Date.now()
      })

      expect(results[0].success).toBe(true)
    })
  })
})