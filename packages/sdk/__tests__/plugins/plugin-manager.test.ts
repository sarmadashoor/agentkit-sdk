import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { PluginManager } from '../../src/plugins/PluginManager'
import { AgentKitPlugin, AgentContext, SendPayload } from '../../src/plugins/types'
import { AgentKitError } from '../../src/errors'
import { z } from 'zod'

describe('PluginManager', () => {
  let pluginManager: PluginManager
  let mockContext: AgentContext
  
  beforeEach(() => {
    pluginManager = new PluginManager()
    mockContext = {
      agentId: 'test-agent',
      transportId: 'test-transport',
      requestId: 'req-123',
      timestamp: Date.now()
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Plugin Registration and Validation', () => {
    it('should register valid plugins', () => {
      const plugin: AgentKitPlugin = {
        name: 'test-plugin',
        version: '1.0.0'
      }

      pluginManager.register(plugin)
      expect(pluginManager.getPlugins()).toContain(plugin)
    })

    it('should validate plugin schema at registration', () => {
      const invalidPlugin = {
        name: 123, // Invalid type
        version: '1.0.0'
      }

      expect(() => pluginManager.register(invalidPlugin as any)).toThrow()
    })

    it('should maintain plugin order', () => {
      const plugin1: AgentKitPlugin = { name: 'plugin-1', version: '1.0.0' }
      const plugin2: AgentKitPlugin = { name: 'plugin-2', version: '1.0.0' }
      const plugin3: AgentKitPlugin = { name: 'plugin-3', version: '1.0.0' }

      pluginManager.register(plugin1)
      pluginManager.register(plugin2)
      pluginManager.register(plugin3)

      const plugins = pluginManager.getPlugins()
      expect(plugins).toEqual([plugin1, plugin2, plugin3])
    })

    it('should reject plugins with invalid hook signatures', () => {
      const invalidPlugin: any = {
        name: 'invalid-plugin',
        version: '1.0.0',
        onInit: 'not-a-function' // Invalid hook type
      }

      expect(() => pluginManager.register(invalidPlugin)).toThrow()
    })
  })

  describe('Hook Execution', () => {
    describe('onInit', () => {
      it('should execute onInit hooks in order', async () => {
        const calls: string[] = []
        
        const plugin1: AgentKitPlugin = {
          name: 'plugin-1',
          version: '1.0.0',
          onInit: vi.fn((context) => { calls.push('plugin-1') })
        }
        
        const plugin2: AgentKitPlugin = {
          name: 'plugin-2',
          version: '1.0.0',
          onInit: vi.fn((context) => { calls.push('plugin-2') })
        }

        pluginManager.register(plugin1)
        pluginManager.register(plugin2)
        
        await pluginManager.executeHook('onInit', mockContext)
        
        expect(calls).toEqual(['plugin-1', 'plugin-2'])
        expect(plugin1.onInit).toHaveBeenCalledWith(mockContext)
        expect(plugin2.onInit).toHaveBeenCalledWith(mockContext)
      })

      it('should continue execution if a plugin throws', async () => {
        const plugin1: AgentKitPlugin = {
          name: 'failing-plugin',
          version: '1.0.0',
          onInit: vi.fn(() => { throw new Error('Plugin failed') })
        }
        
        const plugin2: AgentKitPlugin = {
          name: 'working-plugin',
          version: '1.0.0',
          onInit: vi.fn()
        }

        pluginManager.register(plugin1)
        pluginManager.register(plugin2)
        
        await expect(pluginManager.executeHook('onInit', mockContext)).resolves.not.toThrow()
        expect(plugin2.onInit).toHaveBeenCalled()
      })
    })

    describe('onSend', () => {
      it('should execute onSend hooks with payload', async () => {
        const payload: SendPayload = {
          input: { test: 'data' },
          metadata: { source: 'test' }
        }

        const plugin: AgentKitPlugin = {
          name: 'send-plugin',
          version: '1.0.0',
          onSend: vi.fn()
        }

        pluginManager.register(plugin)
        await pluginManager.executeHook('onSend', payload, mockContext)
        
        expect(plugin.onSend).toHaveBeenCalledWith(payload, mockContext)
      })

      it('should prevent mutation of payload', async () => {
        const payload: SendPayload = {
          input: { test: 'data' },
          metadata: { source: 'test' }
        }

        const maliciousPlugin: AgentKitPlugin = {
          name: 'malicious-plugin',
          version: '1.0.0',
          onSend: (payload, context) => {
            // Attempt to mutate
            (payload as any).input.test = 'mutated'
            ;(context as any).agentId = 'hacked'
          }
        }

        pluginManager.register(maliciousPlugin)
        await pluginManager.executeHook('onSend', payload, mockContext)
        
        // Original data should be unchanged
        expect(payload.input).toEqual({ test: 'data' })
        expect(mockContext.agentId).toBe('test-agent')
      })
    })

    describe('onError', () => {
      it('should execute onError hooks with error details', async () => {
        const error = new AgentKitError('Test error', {
          context: { detail: 'test' }
        })

        const plugin: AgentKitPlugin = {
          name: 'error-plugin',
          version: '1.0.0',
          onError: vi.fn()
        }

        pluginManager.register(plugin)
        await pluginManager.executeHook('onError', error, mockContext)
        
        expect(plugin.onError).toHaveBeenCalledWith(error, mockContext)
      })

      it('should not throw if error hook fails', async () => {
        const error = new AgentKitError('Original error')
        
        const plugin: AgentKitPlugin = {
          name: 'failing-error-plugin',
          version: '1.0.0',
          onError: vi.fn(() => { throw new Error('Error in error handler') })
        }

        pluginManager.register(plugin)
        await expect(pluginManager.executeHook('onError', error, mockContext)).resolves.not.toThrow()
      })
    })

    describe('onShutdown', () => {
      it('should execute onShutdown hooks', async () => {
        const plugin: AgentKitPlugin = {
          name: 'shutdown-plugin',
          version: '1.0.0',
          onShutdown: vi.fn()
        }

        pluginManager.register(plugin)
        await pluginManager.executeHook('onShutdown', mockContext)
        
        expect(plugin.onShutdown).toHaveBeenCalledWith(mockContext)
      })

      it('should execute all shutdown hooks even if some fail', async () => {
        const plugin1: AgentKitPlugin = {
          name: 'failing-shutdown',
          version: '1.0.0',
          onShutdown: vi.fn(() => { throw new Error('Shutdown failed') })
        }
        
        const plugin2: AgentKitPlugin = {
          name: 'working-shutdown',
          version: '1.0.0',
          onShutdown: vi.fn()
        }

        pluginManager.register(plugin1)
        pluginManager.register(plugin2)
        
        await pluginManager.executeHook('onShutdown', mockContext)
        
        expect(plugin1.onShutdown).toHaveBeenCalled()
        expect(plugin2.onShutdown).toHaveBeenCalled()
      })
    })
  })

  describe('Plugin Isolation', () => {
    it('should isolate plugin errors from SDK core', async () => {
      const errorPlugin: AgentKitPlugin = {
        name: 'error-plugin',
        version: '1.0.0',
        onInit: () => { throw new Error('Plugin initialization failed') },
        onSend: () => { throw new Error('Plugin send failed') },
        onError: () => { throw new Error('Plugin error handling failed') },
        onShutdown: () => { throw new Error('Plugin shutdown failed') }
      }

      pluginManager.register(errorPlugin)

      // All hooks should complete without throwing
      await expect(pluginManager.executeHook('onInit', mockContext)).resolves.not.toThrow()
      await expect(pluginManager.executeHook('onSend', { input: {}, metadata: {} }, mockContext)).resolves.not.toThrow()
      await expect(pluginManager.executeHook('onError', new Error('test'), mockContext)).resolves.not.toThrow()
      await expect(pluginManager.executeHook('onShutdown', mockContext)).resolves.not.toThrow()
    })

    it('should provide error details to debug mode', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      const errorPlugin: AgentKitPlugin = {
        name: 'error-plugin',
        version: '1.0.0',
        onInit: () => { throw new Error('Debug me') }
      }

      pluginManager = new PluginManager({ debug: true })
      pluginManager.register(errorPlugin)
      
      await pluginManager.executeHook('onInit', mockContext)
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PluginManager] Plugin "error-plugin" failed in onInit:'),
        expect.any(Error)
      )
      
      consoleSpy.mockRestore()
    })
  })

  describe('Data Immutability', () => {
    it('should pass immutable copies to plugins', async () => {
      const payload: SendPayload = {
        input: { nested: { data: 'original' } },
        metadata: { tags: ['tag1', 'tag2'] }
      }

      let capturedPayload: SendPayload | undefined
      let capturedContext: AgentContext | undefined

      const plugin: AgentKitPlugin = {
        name: 'capture-plugin',
        version: '1.0.0',
        onSend: (p, c) => {
          capturedPayload = p
          capturedContext = c
          // Try to mutate
          ;(p as any).input.nested.data = 'mutated'
          ;(p as any).metadata.tags.push('tag3')
          ;(c as any).agentId = 'mutated-id'
        }
      }

      pluginManager.register(plugin)
      await pluginManager.executeHook('onSend', payload, mockContext)

      // Captured values should be different objects
      expect(capturedPayload).not.toBe(payload)
      expect(capturedContext).not.toBe(mockContext)
      
      // Original values should be unchanged
      expect(payload.input.nested.data).toBe('original')
      expect(payload.metadata.tags).toEqual(['tag1', 'tag2'])
      expect(mockContext.agentId).toBe('test-agent')
    })
  })

  describe('Performance and Memory', () => {
    it('should handle many plugins efficiently', async () => {
      // Register 100 plugins
      for (let i = 0; i < 100; i++) {
        const plugin: AgentKitPlugin = {
          name: `plugin-${i}`,
          version: '1.0.0',
          onInit: vi.fn(),
          onSend: vi.fn(),
          onError: vi.fn(),
          onShutdown: vi.fn()
        }
        pluginManager.register(plugin)
      }

      const startTime = Date.now()
      
      // Execute all hooks
      await pluginManager.executeHook('onInit', mockContext)
      await pluginManager.executeHook('onSend', { input: {}, metadata: {} }, mockContext)
      await pluginManager.executeHook('onError', new Error('test'), mockContext)
      await pluginManager.executeHook('onShutdown', mockContext)
      
      const executionTime = Date.now() - startTime
      
      // Should complete in reasonable time (< 100ms)
      expect(executionTime).toBeLessThan(100)
      
      // All plugins should have been called
      const plugins = pluginManager.getPlugins()
      expect(plugins).toHaveLength(100)
      plugins.forEach(plugin => {
        expect(plugin.onInit).toHaveBeenCalled()
        expect(plugin.onSend).toHaveBeenCalled()
        expect(plugin.onError).toHaveBeenCalled()
        expect(plugin.onShutdown).toHaveBeenCalled()
      })
    })
  })

  describe('Type Safety', () => {
    it('should enforce correct hook signatures at runtime', () => {
      const invalidPlugins = [
        {
          name: 'bad-init',
          version: '1.0.0',
          onInit: async () => {} // Should be sync
        },
        {
          name: 'bad-send',
          version: '1.0.0',
          onSend: (wrongParam: string) => {} // Wrong parameters - single param instead of 2
        }
      ]

      invalidPlugins.forEach((plugin, index) => {
        expect(() => pluginManager.register(plugin as any)).toThrow()
      })
    })

    it('should reject plugins with non-function hooks', () => {
      const invalidPlugin = {
        name: 'bad-hook-type',
        version: '1.0.0',
        onInit: 'not-a-function'
      }

      expect(() => pluginManager.register(invalidPlugin as any)).toThrow()
    })
  })
})