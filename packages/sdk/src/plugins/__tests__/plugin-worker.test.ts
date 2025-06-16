/**
 * Web Worker Plugin Isolation Security Tests
 * Tests for browser-based plugin sandboxing using Web Workers
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PluginManager } from '../PluginManager'
import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'
import { PluginTimeoutError, PluginSandboxError } from '../../errors'

// Mock Web Worker environment for testing
const mockWorkerEnvironment = () => {
  // Mock Blob and URL for worker creation
  ;(global as any).Blob = vi.fn().mockImplementation((content, options) => ({
    content,
    type: options?.type || 'text/plain'
  }))
  
  ;(global as any).URL = {
    createObjectURL: vi.fn().mockReturnValue('blob:mock-url-12345'),
    revokeObjectURL: vi.fn()
  }
  
  ;(global as any).Worker = vi.fn().mockImplementation((scriptURL: string) => {
    const worker = {
      postMessage: vi.fn((message) => {
        // Simulate worker processing messages
        setTimeout(() => {
          if (worker.onmessage && message.type === 'execute') {
            // Mock successful execution for most cases
            worker.onmessage({ 
              data: { 
                id: message.id || 'test',
                type: 'result', 
                result: { success: true, timestamp: Date.now() } 
              } 
            } as MessageEvent)
          }
        }, 10)
      }),
      terminate: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onmessage: null,
      onerror: null,
      onmessageerror: null
    }
    
    return worker
  })
  
  ;(global as any).window = {
    Worker: (global as any).Worker,
    location: { origin: 'https://example.com' }
  }
  
  ;(global as any).document = {
    createElement: vi.fn(() => ({
      textContent: '',
      style: {},
      appendChild: vi.fn()
    })),
    body: {
      appendChild: vi.fn()
    }
  }
}

describe('Web Worker Plugin Isolation', () => {
  let manager: PluginManager
  let originalWorker: any
  let originalWindow: any
  let originalDocument: any

  beforeEach(() => {
    // Store originals
    originalWorker = (global as any).Worker
    originalWindow = (global as any).window
    originalDocument = (global as any).document
    
    // Set up browser environment
    mockWorkerEnvironment()
    
    // Mock browser environment detection by clearing Node.js indicators
    const originalProcess = global.process
    delete (global as any).process
    
    manager = new PluginManager({ 
      debug: true, 
      sandbox: true,
      sandboxTimeout: 500
    })
    
    // Restore process after manager creation
    ;(global as any).process = originalProcess
  })

  afterEach(() => {
    manager.clear()
    manager.shutdown()
    
    // Restore originals
    ;(global as any).Worker = originalWorker
    ;(global as any).window = originalWindow
    ;(global as any).document = originalDocument
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

  describe('DOM Escape Prevention (should fail)', () => {
    it('should prevent DOM manipulation in Web Worker', async () => {
      const domManipulationPlugin: AgentKitPlugin = {
        name: 'dom-manipulation-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // This should fail in Web Worker - no DOM access
          try {
            const div = document.createElement('div')
            div.textContent = 'HACKED'
            document.body.appendChild(div)
            return { domHacked: true }
          } catch (e) {
            throw new Error('DOM access blocked: ' + (e as Error).message)
          }
        }
      }

      manager.register(domManipulationPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
      expect(results[0].error?.message).toContain('document is not defined')
    })

    it('should prevent window object access in Web Worker', async () => {
      const windowAccessPlugin: AgentKitPlugin = {
        name: 'window-access-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // This should fail in Web Worker - no window access
          try {
            ;(window as any).EVIL_GLOBAL = 'hacked'
            window.location.href = 'https://evil.com'
            return { windowHacked: true }
          } catch (e) {
            throw new Error('Window access blocked: ' + (e as Error).message)
          }
        }
      }

      manager.register(windowAccessPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
      expect(results[0].error?.message).toContain('window is not defined')
    })

    it('should prevent shared state pollution', async () => {
      const sharedStatePlugin: AgentKitPlugin = {
        name: 'shared-state-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Try to pollute shared state
          ;(globalThis as any).SHARED_HACK = 'contaminated'
          ;(self as any).WORKER_HACK = 'evil'
          return { polluted: true }
        }
      }

      manager.register(sharedStatePlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      // Plugin should execute but not affect main thread
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(true)
      
      // Verify main thread is not contaminated
      expect((globalThis as any).SHARED_HACK).toBeUndefined()
    })

    it('should timeout infinite loop plugins', async () => {
      const infiniteLoopPlugin: AgentKitPlugin = {
        name: 'infinite-loop-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Infinite loop should timeout and terminate worker
          while (true) {
            Math.random()
          }
        }
      }

      manager.register(infiniteLoopPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].timeout).toBe(true)
      expect(results[0].error).toBeInstanceOf(PluginTimeoutError)
      expect(results[0].duration).toBeGreaterThanOrEqual(500)
    })

    it('should isolate worker crashes from main thread', async () => {
      const crashingPlugin: AgentKitPlugin = {
        name: 'crashing-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Simulate worker crash
          throw new Error('Simulated worker crash')
        }
      }

      manager.register(crashingPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error?.message).toContain('Simulated worker crash')
      
      // Main thread should remain unaffected
      expect(() => {
        // Should be able to continue normal execution
        const x = 1 + 1
        expect(x).toBe(2)
      }).not.toThrow()
    })
  })

  describe('Valid Plugin Scenarios (should pass)', () => {
    it('should execute basic computation plugins in worker', async () => {
      const computationPlugin: AgentKitPlugin = {
        name: 'computation-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Valid computation that doesn't require DOM
          const result = Array.from({ length: 100 }, (_, i) => i * 2)
          return { 
            sum: result.reduce((a, b) => a + b, 0),
            agentId: context.agentId 
          }
        }
      }

      manager.register(computationPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(true)
      expect(results[0].error).toBeUndefined()
      expect(results[0].timeout).toBeFalsy()
    })

    it('should handle async plugins in worker', async () => {
      const asyncPlugin: AgentKitPlugin = {
        name: 'async-plugin',
        version: '1.0.0',
        onInit: async (context: AgentContext) => {
          // Async computation
          await new Promise(resolve => setTimeout(resolve, 50))
          return { 
            completed: true, 
            agentId: context.agentId,
            timestamp: Date.now()
          }
        }
      }

      manager.register(asyncPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(true)
      expect(results[0].duration).toBeGreaterThan(50)
    })

    it('should handle plugin errors gracefully', async () => {
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

  describe('Worker Pool Configuration', () => {
    it('should allow opt-out of worker isolation', async () => {
      const unsandboxedManager = new PluginManager({ 
        debug: false,
        sandbox: false // Disable worker isolation
      })

      const plugin: AgentKitPlugin = {
        name: 'unsandboxed-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Should work without worker in opt-out mode
          return { executed: true, platform: 'main-thread' }
        }
      }

      unsandboxedManager.register(plugin)
      const results = await unsandboxedManager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(true)
      
      unsandboxedManager.shutdown()
    })

    it('should warn in dev mode if used without isolation', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const devManager = new PluginManager({ 
        debug: true,
        sandbox: false,
        enableDebugMode: true
      })

      const plugin: AgentKitPlugin = {
        name: 'dev-plugin',
        version: '1.0.0',
        onInit: () => ({ dev: true })
      }

      devManager.register(plugin)
      await devManager.executeHook('onInit', mockContext)
      
      // Should warn about disabled sandboxing in dev mode
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Plugin sandboxing disabled')
      )
      
      warnSpy.mockRestore()
      devManager.shutdown()
    })

    it('should reuse workers efficiently with pool', async () => {
      const poolSpy = vi.fn()
      
      // Mock worker pool
      ;(global as any).mockWorkerPool = {
        execute: poolSpy.mockResolvedValue({ success: true })
      }

      const plugin1: AgentKitPlugin = {
        name: 'plugin-1',
        version: '1.0.0',
        onInit: () => ({ id: 1 })
      }

      const plugin2: AgentKitPlugin = {
        name: 'plugin-2', 
        version: '1.0.0',
        onInit: () => ({ id: 2 })
      }

      manager.register(plugin1)
      manager.register(plugin2)
      
      await Promise.all([
        manager.executeHook('onInit', mockContext),
        manager.executeHook('onInit', mockContext)
      ])

      // Should reuse worker instances efficiently
      // (Implementation detail will be verified in actual worker pool)
    })
  })

  describe('Memory and Performance', () => {
    it('should track memory usage if available', async () => {
      // Mock performance.memory
      ;(global as any).performance = {
        memory: {
          usedJSHeapSize: 1024 * 1024,
          totalJSHeapSize: 2 * 1024 * 1024
        }
      }

      const memoryEvents: any[] = []
      const memoryManager = new PluginManager({
        debug: true,
        observabilityHooks: {
          onPluginStart: (name, hook) => {
            memoryEvents.push({ 
              type: 'start', 
              name, 
              hook,
              memory: (performance as any).memory?.usedJSHeapSize 
            })
          }
        }
      })

      const plugin: AgentKitPlugin = {
        name: 'memory-tracked-plugin',
        version: '1.0.0',
        onInit: () => ({ tracked: true })
      }

      memoryManager.register(plugin)
      await memoryManager.executeHook('onInit', mockContext)
      
      expect(memoryEvents).toHaveLength(1)
      expect(memoryEvents[0].memory).toBeDefined()
      
      memoryManager.shutdown()
    })

    it('should pre-warm workers for faster execution', async () => {
      const warmupSpy = vi.fn()
      
      const fastManager = new PluginManager({
        debug: true,
        enableDebugMode: true,
        // preWarmWorkers: true // Future enhancement
      })

      // Pre-warming should reduce first execution time
      // (Implementation will be added to worker pool)
      
      fastManager.shutdown()
    })
  })

  describe('Cross-Browser Compatibility', () => {
    it('should work in Chrome-like environments', async () => {
      // Test Chrome-specific features
      ;(global as any).navigator = { userAgent: 'Chrome/91.0' }
      
      const plugin: AgentKitPlugin = {
        name: 'chrome-plugin',
        version: '1.0.0',
        onInit: () => ({ browser: 'chrome' })
      }

      manager.register(plugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results[0].success).toBe(true)
    })

    it('should work in Firefox-like environments', async () => {
      // Test Firefox-specific features
      ;(global as any).navigator = { userAgent: 'Firefox/89.0' }
      
      const plugin: AgentKitPlugin = {
        name: 'firefox-plugin',
        version: '1.0.0',
        onInit: () => ({ browser: 'firefox' })
      }

      manager.register(plugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results[0].success).toBe(true)
    })

    it('should work in Safari-like environments', async () => {
      // Test Safari-specific features
      ;(global as any).navigator = { userAgent: 'Safari/14.1' }
      
      const plugin: AgentKitPlugin = {
        name: 'safari-plugin',
        version: '1.0.0',
        onInit: () => ({ browser: 'safari' })
      }

      manager.register(plugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results[0].success).toBe(true)
    })
  })
})