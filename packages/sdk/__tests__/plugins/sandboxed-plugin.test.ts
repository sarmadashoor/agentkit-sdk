/**
 * Comprehensive test suite for secure plugin sandboxing with vm.runInContext
 * Tests malicious plugin scenarios and sandbox security features
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PluginManager } from '../../src/plugins/PluginManager'
import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'
import { PluginTimeoutError, PluginSandboxError } from '../../src/plugins/../errors'

describe('Plugin Sandboxing Security', () => {
  let manager: PluginManager

  beforeEach(() => {
    manager = new PluginManager({ 
      debug: false, 
      hookTimeout: 500,
      sandbox: true // Enable sandboxing by default
    })
  })

  afterEach(() => {
    manager.clear()
    manager.shutdown()
  })

  const mockContext: AgentContext = {
    agentId: 'test-agent',
    transportId: 'test-transport',
    requestId: 'test-request',
    timestamp: Date.now(),
    metadata: { test: 'data' }
  }

  const mockPayload: SendPayload = {
    input: { message: 'test' },
    metadata: { source: 'test' }
  }

  describe('Malicious Plugin Scenarios (should fail)', () => {
    it('should prevent access to global process', async () => {
      const maliciousPlugin: AgentKitPlugin = {
        name: 'malicious-process-access',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // This should fail in sandbox - no access to process
          ;(global as any).process.exit(1)
        }
      }

      manager.register(maliciousPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
      expect(results[0].error?.message).toContain('Cannot read properties of undefined')
    })

    it('should prevent access to require', async () => {
      const maliciousPlugin: AgentKitPlugin = {
        name: 'malicious-require-access',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // This should fail in sandbox - no access to require
          const fs = require('fs')
          fs.readFileSync('/etc/passwd')
        }
      }

      manager.register(maliciousPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
      expect(results[0].error?.message).toContain('require is not a function')
    })

    it('should prevent access to global scope pollution', async () => {
      const maliciousPlugin: AgentKitPlugin = {
        name: 'malicious-global-pollution',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // This should fail in sandbox - no access to global
          ;(global as any).HACKED = 'yes'
          ;(globalThis as any).EVIL_DATA = { malicious: true }
        }
      }

      manager.register(maliciousPlugin)
      await manager.executeHook('onInit', mockContext)
      
      // Verify globals were not polluted
      expect((global as any).HACKED).toBeUndefined()
      expect((globalThis as any).EVIL_DATA).toBeUndefined()
    })

    it('should prevent context mutation', async () => {
      const originalContext = { ...mockContext }
      
      const maliciousPlugin: AgentKitPlugin = {
        name: 'malicious-context-mutation',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Plugin should not be able to mutate the original context
          ;(context as any).agentId = 'HACKED'
          ;(context as any).malicious = true
          ;(context.metadata as any).hacked = 'yes'
        }
      }

      manager.register(maliciousPlugin)
      await manager.executeHook('onInit', mockContext)
      
      // Original context should remain unchanged
      expect(mockContext.agentId).toBe(originalContext.agentId)
      expect((mockContext as any).malicious).toBeUndefined()
      expect((mockContext.metadata as any)?.hacked).toBeUndefined()
    })

    it('should timeout long-running malicious plugin', async () => {
      const maliciousPlugin: AgentKitPlugin = {
        name: 'malicious-infinite-loop',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Infinite loop should timeout
          while (true) {
            Math.random()
          }
        }
      }

      manager.register(maliciousPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].timeout).toBe(true)
      expect(results[0].error).toBeInstanceOf(PluginTimeoutError)
      expect(results[0].duration).toBeGreaterThanOrEqual(500) // Should be around timeout duration
    })

    it('should prevent memory access outside sandbox', async () => {
      const maliciousPlugin: AgentKitPlugin = {
        name: 'malicious-memory-access',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Try to access constructor to escape sandbox
          try {
            const constructor = ({}).__proto__.constructor
            const Function = constructor.constructor
            return Function('return this')()
          } catch (e) {
            throw new Error('Memory access blocked')
          }
        }
      }

      manager.register(maliciousPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
    })

    it('should prevent function constructor escape', async () => {
      const maliciousPlugin: AgentKitPlugin = {
        name: 'malicious-function-constructor',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Try various function constructor escapes
          const badFunction = (function(){}).constructor('return process')
          badFunction()
        }
      }

      manager.register(maliciousPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
    })
  })

  describe('Valid Plugin Scenarios (should pass)', () => {
    it('should allow valid plugin execution', async () => {
      const validPlugin: AgentKitPlugin = {
        name: 'valid-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Valid operations should work
          const result = Math.max(1, 2, 3)
          const text = 'Hello from plugin'
          return { result, text, contextId: context.agentId }
        }
      }

      manager.register(validPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(true)
      expect(results[0].error).toBeUndefined()
      expect(results[0].timeout).toBeFalsy()
    })

    it('should allow async plugin execution', async () => {
      const asyncPlugin: AgentKitPlugin = {
        name: 'async-plugin',
        version: '1.0.0',
        onInit: async (context: AgentContext) => {
          // Async operations should work
          await new Promise(resolve => setTimeout(resolve, 10))
          return { completed: true, agentId: context.agentId }
        }
      }

      manager.register(asyncPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(true)
      expect(results[0].duration).toBeGreaterThan(10)
    })

    it('should allow plugin error handling', async () => {
      const errorPlugin: AgentKitPlugin = {
        name: 'error-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          throw new Error('Expected plugin error')
        }
      }

      manager.register(errorPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error?.message).toBe('Expected plugin error')
      expect(results[0].timeout).toBeFalsy()
    })
  })

  describe('Sandbox Configuration', () => {
    it('should allow opt-out of sandboxing per plugin', async () => {
      const unsandboxedManager = new PluginManager({ 
        debug: false,
        sandbox: false // Disable sandboxing
      })

      const plugin: AgentKitPlugin = {
        name: 'unsandboxed-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Should work without sandboxing
          return { nodeVersion: process.version }
        }
      }

      unsandboxedManager.register(plugin)
      const results = await unsandboxedManager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(true)
      
      unsandboxedManager.shutdown()
    })

    it('should provide sandbox options per plugin', async () => {
      const customManager = new PluginManager({ 
        debug: false,
        sandbox: true,
        sandboxTimeout: 100, // Custom timeout
        allowedGlobals: ['Math', 'Date'] // Custom allowed globals
      })

      const plugin: AgentKitPlugin = {
        name: 'custom-sandbox-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Should have access to allowed globals
          const now = Date.now()
          const random = Math.random()
          return { now, random }
        }
      }

      customManager.register(plugin)
      const results = await customManager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(true)
      
      customManager.shutdown()
    })
  })

  describe('Browser Compatibility', () => {
    it('should maintain browser compatibility when sandboxing unavailable', async () => {
      // Mock browser environment (no vm module)
      const originalVm = require.cache[require.resolve('vm')]
      delete require.cache[require.resolve('vm')]
      
      // Mock require to throw for vm module
      const originalRequire = require
      ;(global as any).require = (id: string) => {
        if (id === 'vm') {
          throw new Error('vm module not available in browser')
        }
        return originalRequire(id)
      }

      const browserManager = new PluginManager({ 
        debug: false,
        sandbox: true // Should fallback gracefully
      })

      const plugin: AgentKitPlugin = {
        name: 'browser-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          return { browserCompatible: true }
        }
      }

      browserManager.register(plugin)
      const results = await browserManager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(true)
      
      // Restore original require
      ;(global as any).require = originalRequire
      if (originalVm) {
        require.cache[require.resolve('vm')] = originalVm
      }
      
      browserManager.shutdown()
    })
  })

  describe('Metrics Integration', () => {
    it('should track sandbox timeout metrics', async () => {
      const metricsEvents: any[] = []
      
      const metricsManager = new PluginManager({
        debug: false,
        sandbox: true,
        observabilityHooks: {
          onPluginTimeout: (name, hook, timeout) => {
            metricsEvents.push({ type: 'timeout', name, hook, timeout })
          },
          onPluginSandboxEscape: (name, hook, attempt) => {
            metricsEvents.push({ type: 'sandbox_escape', name, hook, attempt })
          }
        }
      })

      const timeoutPlugin: AgentKitPlugin = {
        name: 'timeout-metrics-plugin',
        version: '1.0.0',
        onInit: () => {
          while (true) { /* timeout */ }
        }
      }

      metricsManager.register(timeoutPlugin)
      await metricsManager.executeHook('onInit', mockContext)
      
      expect(metricsEvents).toHaveLength(1)
      expect(metricsEvents[0].type).toBe('timeout')
      expect(metricsEvents[0].name).toBe('timeout-metrics-plugin')
      
      metricsManager.shutdown()
    })
  })
})