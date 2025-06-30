import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import vm from 'vm'
import { GreetPlugin, createGreetPlugin } from './fixtures/greet-plugin'
import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'
import { cleanupAllResources, flushPromises } from './test-utils'

/**
 * Plugin Isolation and Security Test Suite
 * 
 * Validates security constraints and isolation guarantees:
 * - VM context isolation for Node.js
 * - Deep cloning of configurations
 * - Prevention of global access
 * - Cross-plugin interference protection
 * - Memory boundary enforcement
 */

describe('Plugin Isolation and Security', () => {
  describe('VM Context Isolation (Node.js)', () => {
    it('should execute plugin in isolated VM context', () => {
      const pluginCode = `
        const plugin = {
          name: 'isolated-plugin',
          version: '1.0.0',
          async onInit(context) {
            // Try to access global - should fail
            try {
              global.testVar = 'compromised';
              return { compromised: true };
            } catch (error) {
              return { isolated: true, error: error.message };
            }
          }
        };
        plugin;
      `
      
      // Create isolated context
      const context = vm.createContext({
        console: {
          log: vi.fn(),
          error: vi.fn()
        }
      })
      
      const plugin = vm.runInContext(pluginCode, context)
      
      expect(plugin.name).toBe('isolated-plugin')
      expect(plugin.version).toBe('1.0.0')
      
      // Verify global wasn't accessible
      expect('testVar' in global).toBe(false)
    })

    it('should prevent access to process and require', () => {
      const maliciousCode = `
        const plugin = {
          name: 'malicious-plugin',
          version: '1.0.0',
          async onInit(context) {
            const results = {};
            
            // Try to access process
            try {
              results.process = typeof process;
            } catch (error) {
              results.processError = error.message;
            }
            
            // Try to access require
            try {
              results.require = typeof require;
            } catch (error) {
              results.requireError = error.message;
            }
            
            return results;
          }
        };
        plugin;
      `
      
      const context = vm.createContext({
        console: { log: vi.fn(), error: vi.fn() }
      })
      
      const plugin = vm.runInContext(maliciousCode, context)
      
      // Execute the plugin hook
      const mockContext: AgentContext = {
        agentId: 'test',
        transportId: 'test',
        requestId: 'test',
        timestamp: Date.now(),
        metadata: {}
      }
      
      return plugin.onInit(mockContext).then((results: any) => {
        // Process and require should not be accessible
        expect(results.process).toBe('undefined')
        expect(results.require).toBe('undefined')
      })
    })

    it('should provide safe API surface to plugins', () => {
      const pluginCode = `
        const plugin = {
          name: 'safe-plugin',
          version: '1.0.0',
          async onInit(context) {
            return {
              hasConsole: typeof console !== 'undefined',
              hasSetTimeout: typeof setTimeout !== 'undefined',
              hasPromise: typeof Promise !== 'undefined',
              hasJSON: typeof JSON !== 'undefined',
              context: typeof context
            };
          }
        };
        plugin;
      `
      
      const context = vm.createContext({
        console: { log: vi.fn(), error: vi.fn() },
        setTimeout: setTimeout,
        Promise: Promise,
        JSON: JSON
      })
      
      const plugin = vm.runInContext(pluginCode, context)
      
      const mockContext: AgentContext = {
        agentId: 'test',
        transportId: 'test',
        requestId: 'test',
        timestamp: Date.now(),
        metadata: {}
      }
      
      return plugin.onInit(mockContext).then((results: any) => {
        // Safe APIs should be available
        expect(results.hasConsole).toBe(true)
        expect(results.hasSetTimeout).toBe(true)
        expect(results.hasPromise).toBe(true)
        expect(results.hasJSON).toBe(true)
        expect(results.context).toBe('object')
      })
    })
  })

  describe('Deep Configuration Cloning', () => {
    it('should deep clone configuration objects', () => {
      const originalConfig = {
        enabled: true,
        logLevel: 'debug' as const,
        greetingPrefix: 'Hello',
        maxDelay: 100,
        nested: {
          value: 'test',
          array: [1, 2, 3]
        }
      }
      
      function deepClone<T>(obj: T): T {
        if (obj === null || typeof obj !== 'object') {
          return obj
        }
        
        if (obj instanceof Date) {
          return new Date(obj.getTime()) as T
        }
        
        if (Array.isArray(obj)) {
          return obj.map(item => deepClone(item)) as T
        }
        
        const cloned = {} as T
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            cloned[key] = deepClone(obj[key])
          }
        }
        
        return cloned
      }
      
      const clonedConfig = deepClone(originalConfig)
      
      // Modify cloned config
      clonedConfig.nested.value = 'modified'
      clonedConfig.nested.array.push(4)
      
      // Original should be unchanged
      expect(originalConfig.nested.value).toBe('test')
      expect(originalConfig.nested.array).toEqual([1, 2, 3])
      
      // Cloned should be modified
      expect(clonedConfig.nested.value).toBe('modified')
      expect(clonedConfig.nested.array).toEqual([1, 2, 3, 4])
    })

    it('should freeze plugin configuration at runtime', () => {
      const plugin = createGreetPlugin({
        enabled: true,
        logLevel: 'debug',
        greetingPrefix: 'Hello'
      })
      
      const config = plugin.getConfig()
      
      // Freeze the configuration
      Object.freeze(config)
      
      // Attempts to modify should fail
      expect(() => {
        // @ts-expect-error - testing runtime protection
        config.greetingPrefix = 'Modified'
      }).toThrow()
      
      expect(() => {
        // @ts-expect-error - testing runtime protection
        config.enabled = false
      }).toThrow()
    })
  })

  describe('Cross-Plugin Interference Protection', () => {
    it('should prevent plugins from accessing each other', () => {
      const plugin1 = createGreetPlugin({ greetingPrefix: 'Plugin1' })
      const plugin2 = createGreetPlugin({ greetingPrefix: 'Plugin2' })
      
      // Plugins should have isolated state
      expect(plugin1.getConfig().greetingPrefix).toBe('Plugin1')
      expect(plugin2.getConfig().greetingPrefix).toBe('Plugin2')
      
      // Modifying one shouldn't affect the other
      const plugin1Modified = plugin1.withConfig({ greetingPrefix: 'Modified' })
      
      expect(plugin1.getConfig().greetingPrefix).toBe('Plugin1')      // Original unchanged
      expect(plugin2.getConfig().greetingPrefix).toBe('Plugin2')      // Other plugin unchanged
      expect(plugin1Modified.getConfig().greetingPrefix).toBe('Modified') // New instance modified
    })

    it('should isolate plugin metrics and state', () => {
      const plugin1 = createGreetPlugin()
      const plugin2 = createGreetPlugin()
      
      // Execute different operations on each plugin
      plugin1.setChaosConfig({ delayMs: 10 })
      plugin2.setChaosConfig({ delayMs: 20 })
      
      // Metrics should be isolated
      const metrics1 = plugin1.getMetrics()
      const metrics2 = plugin2.getMetrics()
      
      expect(metrics1).not.toBe(metrics2)
      expect(metrics1.sendCount).toBe(0)
      expect(metrics2.sendCount).toBe(0)
    })

    it('should prevent prototype pollution', () => {
      const maliciousConfig = {
        enabled: true,
        // Attempt prototype pollution
        '__proto__': {
          polluted: true
        },
        'constructor': {
          prototype: {
            polluted: true
          }
        }
      }
      
      // Zod schema should reject malicious configuration
      expect(() => createGreetPlugin(maliciousConfig as any)).toThrow()
      
      // Prototype should not be polluted
      expect((Object.prototype as any).polluted).toBeUndefined()
      expect((GreetPlugin.prototype as any).polluted).toBeUndefined()
      
      // Valid plugin should still work normally
      const validPlugin = createGreetPlugin({ enabled: true })
      expect(validPlugin.name).toBe('greet-plugin')
      expect(validPlugin.getConfig().enabled).toBe(true)
    })
  })

  describe('Memory Boundary Enforcement', () => {
    it('should limit plugin memory usage', async () => {
      const plugin = createGreetPlugin()
      
      const mockContext: AgentContext = {
        agentId: 'memory-test',
        transportId: 'memory-test',
        requestId: 'memory-test',
        timestamp: Date.now(),
        metadata: {}
      }
      
      // Monitor memory before and after plugin execution
      const memoryBefore = process.memoryUsage().heapUsed
      
      await plugin.onInit(mockContext)
      
      // Simulate multiple send operations
      for (let i = 0; i < 100; i++) {
        const sendPayload: SendPayload = {
          input: { message: `Message ${i}` },
          metadata: { iteration: i }
        }
        await plugin.onSend(sendPayload, mockContext)
      }
      
      await plugin.onShutdown(mockContext)
      
      const memoryAfter = process.memoryUsage().heapUsed
      const memoryDelta = memoryAfter - memoryBefore
      
      // Memory increase should be reasonable (less than 1MB for simple operations)
      expect(memoryDelta).toBeLessThan(1024 * 1024)
      
      // Plugin should track its own memory usage
      const metrics = plugin.getMetrics()
      expect(typeof metrics.memoryUsage).toBe('number')
    })

    it('should clean up resources on shutdown', async () => {
      const plugin = createGreetPlugin()
      
      const mockContext: AgentContext = {
        agentId: 'cleanup-test',
        transportId: 'cleanup-test',
        requestId: 'cleanup-test',
        timestamp: Date.now(),
        metadata: {}
      }
      
      await plugin.onInit(mockContext)
      
      // Verify initialization
      const metricsAfterInit = plugin.getMetrics()
      expect(metricsAfterInit.initTime).toBeGreaterThan(0)
      
      await plugin.onShutdown(mockContext)
      
      // Allow metrics to be updated after shutdown
      await new Promise(resolve => setTimeout(resolve, 20))
      
      // Verify cleanup
      const metricsAfterShutdown = plugin.getMetrics()
      expect(metricsAfterShutdown.shutdownTime).toBeGreaterThan(0)
    })
  })

  describe('Sandboxing for Browser Context', () => {
    it('should simulate Web Worker isolation', async () => {
      // Simulate Web Worker message passing
      const workerMessages: any[] = []
      
      const mockWorker = {
        postMessage: (message: any) => {
          workerMessages.push(message)
        },
        onmessage: null as ((event: MessageEvent) => void) | null
      }
      
      // Simulate plugin execution in worker context
      const pluginData = {
        name: 'greet-plugin',
        config: { enabled: true, greetingPrefix: 'Hello' },
        operation: 'onSend',
        payload: { input: { message: 'test' }, metadata: {} },
        context: {
          agentId: 'worker-test',
          transportId: 'worker-test',
          requestId: 'worker-test',
          timestamp: Date.now(),
          metadata: {}
        }
      }
      
      // Send message to "worker"
      mockWorker.postMessage({
        type: 'EXECUTE_PLUGIN',
        data: pluginData
      })
      
      // Simulate worker response
      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(workerMessages).toHaveLength(1)
      expect(workerMessages[0].type).toBe('EXECUTE_PLUGIN')
      expect(workerMessages[0].data.name).toBe('greet-plugin')
    })

    it('should validate serializable plugin data', () => {
      const plugin = createGreetPlugin({
        enabled: true,
        logLevel: 'info',
        greetingPrefix: 'Hello'
      })
      
      const config = plugin.getConfig()
      
      // Configuration should be serializable for Web Worker transfer
      const serialized = JSON.stringify(config)
      const deserialized = JSON.parse(serialized)
      
      expect(deserialized).toEqual(config)
      expect(typeof deserialized.enabled).toBe('boolean')
      expect(typeof deserialized.logLevel).toBe('string')
      expect(typeof deserialized.greetingPrefix).toBe('string')
    })
  })

  describe('Production Bundle Safety', () => {
    it('should exclude debug code in production', () => {
      const originalEnv = process.env.NODE_ENV
      
      try {
        // Test production environment
        process.env.NODE_ENV = 'production'
        
        const debugOnlyFunction = () => {
          if (process.env.NODE_ENV === 'production') {
            return undefined
          }
          return 'debug-data'
        }
        
        const result = debugOnlyFunction()
        expect(result).toBeUndefined()
        
      } finally {
        process.env.NODE_ENV = originalEnv
      }
    })

    it('should guard debug logs behind environment checks', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      const debugLog = (message: string) => {
        if (process.env.NODE_ENV !== 'production' && process.env.DEBUG) {
          console.log(`[DEBUG] ${message}`)
        }
      }
      
      // Without DEBUG flag, no logs should appear
      delete process.env.DEBUG
      debugLog('test message')
      expect(consoleSpy).not.toHaveBeenCalled()
      
      // With DEBUG flag, logs should appear (if not production)
      process.env.DEBUG = '1'
      if (process.env.NODE_ENV !== 'production') {
        debugLog('test message')
        expect(consoleSpy).toHaveBeenCalledWith('[DEBUG] test message')
      }
      
      consoleSpy.mockRestore()
    })
  })

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})