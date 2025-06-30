/**
 * Comprehensive tests for async PluginManager functionality
 */

import { describe, test, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { PluginManager } from '../../src/plugins/PluginManager'
import { 
  AgentKitPlugin, 
  AgentContext, 
  SendPayload, 
  PluginManagerOptions,
  PluginExecutionResult,
  PluginManagerObservabilityHooks
} from '../../src/plugins/types'
import { PluginTimeoutError, PluginSignatureError } from '../../src/errors'

describe('Async PluginManager', () => {
  let pluginManager: PluginManager
  let mockObservabilityHooks: PluginManagerObservabilityHooks
  let mockContext: AgentContext
  let mockPayload: SendPayload

  beforeEach(() => {
    vi.clearAllTimers()
    vi.useFakeTimers()
    
    mockObservabilityHooks = {
      onPluginStart: vi.fn(),
      onPluginSuccess: vi.fn(),
      onPluginError: vi.fn(),
      onPluginTimeout: vi.fn()
    }

    mockContext = {
      agentId: 'test-agent',
      transportId: 'test-transport',
      requestId: 'req-123',
      timestamp: Date.now(),
      metadata: { test: 'data' }
    }

    mockPayload = {
      input: 'test input',
      metadata: { type: 'test' }
    }
  })

  afterEach(async () => {
    // Explicit PluginManager cleanup to prevent resource leaks
    if (pluginManager) {
      try {
        await pluginManager.shutdown()
      } catch (error) {
        console.error('[CLEANUP] Error shutting down PluginManager:', error)
      }
    }
    vi.useRealTimers()
  })

  describe('Async Plugin Support', () => {
    test('executes async plugins successfully', async () => {
      const asyncPlugin: AgentKitPlugin = {
        name: 'async-test-plugin',
        version: '1.0.0',
        async onInit(context: AgentContext) {
          await new Promise(resolve => setTimeout(resolve, 100))
          // Simulate async work
        },
        async onSend(payload: SendPayload, context: AgentContext) {
          await new Promise(resolve => setTimeout(resolve, 50))
          // Simulate async processing
        }
      }

      pluginManager = new PluginManager({
        hookTimeout: 1000,
        observabilityHooks: mockObservabilityHooks,
        sandbox: false // Disable sandboxing for test plugins with inline functions
      })

      pluginManager.register(asyncPlugin)

      // Execute onInit
      const initPromise = pluginManager.executeHook('onInit', mockContext)
      
      // Fast-forward time to complete async operations
      vi.advanceTimersByTime(100)
      
      const initResults = await initPromise
      
      expect(initResults).toHaveLength(1)
      expect(initResults[0].success).toBe(true)
      expect(initResults[0].pluginName).toBe('async-test-plugin')
      expect(initResults[0].hookName).toBe('onInit')
      expect(initResults[0].duration).toBeGreaterThan(0)

      // Execute onSend
      const sendPromise = pluginManager.executeHook('onSend', mockPayload, mockContext)
      
      vi.advanceTimersByTime(50)
      
      const sendResults = await sendPromise
      
      expect(sendResults).toHaveLength(1)
      expect(sendResults[0].success).toBe(true)
      expect(sendResults[0].hookName).toBe('onSend')

      // Verify observability hooks were called
      expect(mockObservabilityHooks.onPluginStart).toHaveBeenCalledTimes(2)
      expect(mockObservabilityHooks.onPluginSuccess).toHaveBeenCalledTimes(2)
    })

    test('executes sync plugins successfully', async () => {
      const syncPlugin: AgentKitPlugin = {
        name: 'sync-test-plugin',
        version: '1.0.0',
        onInit(context: AgentContext) {
          // Sync operation
        },
        onSend(payload: SendPayload, context: AgentContext) {
          // Sync operation
        }
      }

      pluginManager = new PluginManager({
        observabilityHooks: mockObservabilityHooks,
        sandbox: false
      })

      pluginManager.register(syncPlugin)

      const results = await pluginManager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(true)
      expect(results[0].pluginName).toBe('sync-test-plugin')
      expect(results[0].duration).toBeGreaterThanOrEqual(0)

      expect(mockObservabilityHooks.onPluginStart).toHaveBeenCalledWith('sync-test-plugin', 'onInit')
      expect(mockObservabilityHooks.onPluginSuccess).toHaveBeenCalledWith('sync-test-plugin', 'onInit', expect.any(Number))
    })

    test('handles plugin that never resolves with timeout', async () => {
      const hangingPlugin: AgentKitPlugin = {
        name: 'hanging-plugin',
        version: '1.0.0',
        async onInit(context: AgentContext) {
          // Never resolves
          return new Promise(() => {})
        }
      }

      pluginManager = new PluginManager({
        hookTimeout: 500,
        observabilityHooks: mockObservabilityHooks,
        sandbox: false
      })

      pluginManager.register(hangingPlugin)

      const executePromise = pluginManager.executeHook('onInit', mockContext)
      
      // Fast-forward past timeout
      vi.advanceTimersByTime(500)
      
      const results = await executePromise
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].timeout).toBe(true)
      expect(results[0].error).toBeInstanceOf(PluginTimeoutError)
      expect(results[0].pluginName).toBe('hanging-plugin')

      expect(mockObservabilityHooks.onPluginTimeout).toHaveBeenCalledWith('hanging-plugin', 'onInit', 500)
    })

    test('handles multiple plugins with mixed sync/async and failures', async () => {
      const fastPlugin: AgentKitPlugin = {
        name: 'fast-plugin',
        version: '1.0.0',
        async onInit() {
          await new Promise(resolve => setTimeout(resolve, 10))
        }
      }

      const slowPlugin: AgentKitPlugin = {
        name: 'slow-plugin',
        version: '1.0.0',
        async onInit() {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      const failingPlugin: AgentKitPlugin = {
        name: 'failing-plugin',
        version: '1.0.0',
        onInit() {
          throw new Error('Plugin failed')
        }
      }

      const syncPlugin: AgentKitPlugin = {
        name: 'sync-plugin',
        version: '1.0.0',
        onInit() {
          // Sync success
        }
      }

      pluginManager = new PluginManager({
        hookTimeout: 1000,
        observabilityHooks: mockObservabilityHooks,
        sandbox: false
      })

      pluginManager.register(fastPlugin)
      pluginManager.register(slowPlugin)
      pluginManager.register(failingPlugin)
      pluginManager.register(syncPlugin)

      const executePromise = pluginManager.executeHook('onInit', mockContext)
      
      // Run all timers to completion
      await vi.runAllTimersAsync()
      
      const results = await executePromise
      
      expect(results).toHaveLength(4)
      
      // Check individual results
      const fastResult = results.find(r => r.pluginName === 'fast-plugin')
      expect(fastResult?.success).toBe(true)
      
      const slowResult = results.find(r => r.pluginName === 'slow-plugin')
      expect(slowResult?.success).toBe(true)
      
      const failingResult = results.find(r => r.pluginName === 'failing-plugin')
      expect(failingResult?.success).toBe(false)
      expect(failingResult?.error?.message).toBe('Plugin failed')
      
      const syncResult = results.find(r => r.pluginName === 'sync-plugin')
      expect(syncResult?.success).toBe(true)

      // Verify observability calls
      expect(mockObservabilityHooks.onPluginStart).toHaveBeenCalledTimes(4)
      expect(mockObservabilityHooks.onPluginSuccess).toHaveBeenCalledTimes(3)
      expect(mockObservabilityHooks.onPluginError).toHaveBeenCalledTimes(1)
    }, 10000)
  })

  describe('Fail Fast Mode', () => {
    test('fails fast when enabled and plugin fails', async () => {
      const failingPlugin: AgentKitPlugin = {
        name: 'failing-plugin',
        version: '1.0.0',
        async onInit() {
          throw new Error('Critical failure')
        }
      }

      const normalPlugin: AgentKitPlugin = {
        name: 'normal-plugin',
        version: '1.0.0',
        onInit() {
          // This should not execute due to fail fast
        }
      }

      pluginManager = new PluginManager({
        failFast: true,
        observabilityHooks: mockObservabilityHooks,
        sandbox: false
      })

      pluginManager.register(failingPlugin)
      pluginManager.register(normalPlugin)

      await expect(pluginManager.executeHook('onInit', mockContext))
        .rejects.toThrow('Critical failure')

      // Only the first plugin should have been attempted
      expect(mockObservabilityHooks.onPluginStart).toHaveBeenCalledTimes(1)
      expect(mockObservabilityHooks.onPluginError).toHaveBeenCalledTimes(1)
    })

    test('continues execution when fail fast is disabled', async () => {
      const failingPlugin: AgentKitPlugin = {
        name: 'failing-plugin',
        version: '1.0.0',
        async onInit() {
          throw new Error('Non-critical failure')
        }
      }

      const normalPlugin: AgentKitPlugin = {
        name: 'normal-plugin',
        version: '1.0.0',
        onInit() {
          // This should execute despite previous failure
        }
      }

      pluginManager = new PluginManager({
        failFast: false,
        observabilityHooks: mockObservabilityHooks,
        sandbox: false
      })

      pluginManager.register(failingPlugin)
      pluginManager.register(normalPlugin)

      const results = await pluginManager.executeHook('onInit', mockContext)

      expect(results).toHaveLength(2)
      expect(results[0].success).toBe(false)
      expect(results[1].success).toBe(true)

      expect(mockObservabilityHooks.onPluginStart).toHaveBeenCalledTimes(2)
      expect(mockObservabilityHooks.onPluginError).toHaveBeenCalledTimes(1)
      expect(mockObservabilityHooks.onPluginSuccess).toHaveBeenCalledTimes(1)
    })
  })

  describe('Error Handling', () => {
    test('handles plugin errors with proper metadata', async () => {
      const errorPlugin: AgentKitPlugin = {
        name: 'error-plugin',
        version: '1.0.0',
        async onSend() {
          const error = new Error('Specific error')
          error.stack = 'Mock stack trace'
          throw error
        }
      }

      pluginManager = new PluginManager({
        observabilityHooks: mockObservabilityHooks,
        sandbox: false
      })

      pluginManager.register(errorPlugin)

      const results = await pluginManager.executeHook('onSend', mockPayload, mockContext)
      
      expect(results[0].success).toBe(false)
      expect(results[0].error?.message).toBe('Specific error')
      expect(results[0].timeout).toBe(false)

      expect(mockObservabilityHooks.onPluginError).toHaveBeenCalledWith(
        'error-plugin',
        'onSend',
        expect.any(Error),
        expect.any(Number)
      )
    })

    test('isolates plugin errors from each other', async () => {
      const plugins: AgentKitPlugin[] = [
        {
          name: 'plugin-1',
          version: '1.0.0',
          async onInit() {
            throw new Error('Error 1')
          }
        },
        {
          name: 'plugin-2',
          version: '1.0.0',
          onInit() {
            // Should execute despite plugin-1 failure
          }
        },
        {
          name: 'plugin-3',
          version: '1.0.0',
          async onInit() {
            throw new Error('Error 3')
          }
        }
      ]

      pluginManager = new PluginManager({
        observabilityHooks: mockObservabilityHooks,
        sandbox: false
      })

      plugins.forEach(plugin => pluginManager.register(plugin))

      const results = await pluginManager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(3)
      expect(results[0].success).toBe(false)
      expect(results[0].error?.message).toBe('Error 1')
      expect(results[1].success).toBe(true)
      expect(results[2].success).toBe(false)
      expect(results[2].error?.message).toBe('Error 3')
    })
  })

  describe('Timeout Scenarios', () => {
    test('handles timeout for slow plugins', async () => {
      const timeoutPlugin: AgentKitPlugin = {
        name: 'timeout-plugin',
        version: '1.0.0',
        async onInit() {
          // Never resolves
          return new Promise(() => {})
        }
      }

      pluginManager = new PluginManager({
        hookTimeout: 100,
        observabilityHooks: mockObservabilityHooks,
        sandbox: false
      })

      pluginManager.register(timeoutPlugin)

      const executePromise = pluginManager.executeHook('onInit', mockContext)
      
      // Fast-forward past timeout
      vi.advanceTimersByTime(100)
      
      const results = await executePromise
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].timeout).toBe(true)
      expect(results[0].error).toBeInstanceOf(PluginTimeoutError)

      expect(mockObservabilityHooks.onPluginTimeout).toHaveBeenCalledWith('timeout-plugin', 'onInit', 100)
    })
  })

  describe('Plugin Registration and Validation', () => {
    test('validates async plugin signatures correctly', () => {
      const validAsyncPlugin: AgentKitPlugin = {
        name: 'valid-async-plugin',
        version: '1.0.0',
        async onInit(context: AgentContext) {
          // Valid async function
        },
        onSend(payload: SendPayload, context: AgentContext) {
          // Valid sync function
        }
      }

      pluginManager = new PluginManager({ sandbox: false })

      expect(() => {
        pluginManager.register(validAsyncPlugin)
      }).not.toThrow()

      expect(pluginManager.getPlugins()).toHaveLength(1)
    })

    test('provides detailed execution results', async () => {
      const testPlugin: AgentKitPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        async onInit() {
          await new Promise(resolve => setTimeout(resolve, 50))
        }
      }

      pluginManager = new PluginManager({
        observabilityHooks: mockObservabilityHooks,
        sandbox: false
      })

      pluginManager.register(testPlugin)

      const startTime = Date.now()
      const executePromise = pluginManager.executeHook('onInit', mockContext)
      
      vi.advanceTimersByTime(50)
      
      const results = await executePromise
      
      expect(results[0]).toMatchObject({
        pluginName: 'test-plugin',
        hookName: 'onInit',
        success: true,
        duration: expect.any(Number)
      })
      
      expect(results[0].timeout).toBeUndefined()
      expect(results[0].error).toBeUndefined()

      expect(results[0].duration).toBeGreaterThan(0)
    })
  })

  describe('Observability and Logging', () => {
    test('calls all observability hooks in correct order', async () => {
      const plugin: AgentKitPlugin = {
        name: 'observable-plugin',
        version: '1.0.0',
        async onInit() {
          await new Promise(resolve => setTimeout(resolve, 25))
        }
      }

      pluginManager = new PluginManager({
        observabilityHooks: mockObservabilityHooks,
        sandbox: false
      })

      pluginManager.register(plugin)

      const executePromise = pluginManager.executeHook('onInit', mockContext)
      
      vi.advanceTimersByTime(25)
      
      await executePromise

      expect(mockObservabilityHooks.onPluginStart).toHaveBeenCalledWith('observable-plugin', 'onInit')
      expect(mockObservabilityHooks.onPluginSuccess).toHaveBeenCalledWith('observable-plugin', 'onInit', expect.any(Number))
      
      // Verify call order
      const startCall = (mockObservabilityHooks.onPluginStart as any).mock.invocationCallOrder[0]
      const successCall = (mockObservabilityHooks.onPluginSuccess as any).mock.invocationCallOrder[0]
      expect(startCall).toBeLessThan(successCall)
    })

    test('provides accurate timing information', async () => {
      const plugin: AgentKitPlugin = {
        name: 'timed-plugin',
        version: '1.0.0',
        async onInit() {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      pluginManager = new PluginManager({
        observabilityHooks: mockObservabilityHooks,
        sandbox: false
      })

      pluginManager.register(plugin)

      const executePromise = pluginManager.executeHook('onInit', mockContext)
      
      vi.advanceTimersByTime(100)
      
      const results = await executePromise

      expect(results[0].duration).toBeGreaterThanOrEqual(99) // Account for timer precision
      expect(mockObservabilityHooks.onPluginSuccess).toHaveBeenCalledWith(
        'timed-plugin',
        'onInit',
        expect.any(Number)
      )

      const successCall = (mockObservabilityHooks.onPluginSuccess as any).mock.calls[0]
      expect(successCall[2]).toBeGreaterThanOrEqual(99)
    })
  })

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})