import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { VMRunner, createVMRunner, secureClone } from '../../src/security/vmRunner'
import type { AgentContext, SendPayload } from '@agentkit/types'
import { cleanupAllResources, flushPromises } from '../test-utils'

/**
 * Basic Plugin Lifecycle Hook Test Suite
 * 
 * Validates the fundamental plugin lifecycle hook system using vm.runInContext
 * without involving CLI or browser environments. Tests basic onStart, onMessage, 
 * and onStop hook execution in secure VM context with console.log assertions.
 */

// Test plugin factory for creating in-memory plugin source code
function createTestPlugin(options: {
  name?: string
  version?: string
  onStartBehavior?: 'success' | 'error' | 'timeout'
  onMessageBehavior?: 'success' | 'modify' | 'error'
  onStopBehavior?: 'success' | 'error'
  logMessages?: boolean
} = {}) {
  const {
    name = 'test-plugin',
    version = '1.0.0',
    onStartBehavior = 'success',
    onMessageBehavior = 'success',
    onStopBehavior = 'success',
    logMessages = true
  } = options

  return `
    const plugin = {
      name: '${name}',
      version: '${version}',
      
      async onInit(context) {
        ${logMessages ? `console.log('[${name}] onStart called with agentId:', context.agentId);` : ''}
        
        if ('${onStartBehavior}' === 'error') {
          throw new Error('onStart simulation error');
        }
        
        if ('${onStartBehavior}' === 'timeout') {
          // Create a busy loop to trigger execution timeout
          const start = Date.now();
          while (Date.now() - start < 2000) {
            // Busy wait to trigger timeout
          }
        }
        
        return { started: true, timestamp: Date.now() };
      },
      
      async onSend(payload, context) {
        ${logMessages ? `console.log('[${name}] onMessage called with payload:', payload?.input);` : ''}
        
        if ('${onMessageBehavior}' === 'error') {
          throw new Error('onMessage simulation error');
        }
        
        if ('${onMessageBehavior}' === 'modify') {
          // Attempt to modify payload (should be prevented by isolation)
          if (payload && payload.input) {
            payload.input.modified = true;
            payload.input.pluginName = '${name}';
          }
        }
        
        return { processed: true, messageCount: 1 };
      },
      
      async onShutdown(context) {
        ${logMessages ? `console.log('[${name}] onStop called for cleanup');` : ''}
        
        if ('${onStopBehavior}' === 'error') {
          throw new Error('onStop simulation error');
        }
        
        return { stopped: true, cleanedUp: true };
      }
    };
  `
}

describe('Basic Plugin Lifecycle Hooks with VM Context', () => {
  let vmRunner: VMRunner
  let mockContext: AgentContext
  let consoleLogSpy: any
  let consoleErrorSpy: any

  beforeEach(() => {
    // Create VM runner with reasonable security config for testing
    vmRunner = createVMRunner({
      timeoutMs: 1000,
      memoryLimitBytes: 5 * 1024 * 1024, // 5MB
      enableStaticAnalysis: true,
      allowedGlobals: ['console', 'Date', 'Math', 'JSON', 'Object', 'Promise', 'setTimeout', 'clearTimeout']
    })

    // Setup mock context
    mockContext = {
      agentId: 'test-agent-001',
      transportId: 'vm-transport',
      requestId: 'req-' + Date.now(),
      timestamp: Date.now(),
      metadata: { test: 'hook-basic' }
    }

    // Setup console spies for log assertion
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    // Clean up VM contexts and restore console
    vmRunner.dispose()
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('onStart Hook Validation', () => {
    it('should execute onStart hook successfully with console.log assertion', async () => {
      const pluginCode = createTestPlugin({
        name: 'start-test-plugin',
        onStartBehavior: 'success'
      })

      const secureContext = {
        plugin: { name: 'start-test-plugin', version: '1.0.0' },
        agentContext: secureClone(mockContext)
      }

      const result = await vmRunner.executePluginHook(
        'start-test-plugin',
        'onInit', // VMRunner uses onInit for start hook
        pluginCode,
        secureContext
      )

      // Verify successful execution
      expect(result.withinLimits).toBe(true)
      expect(result.executionTimeMs).toBeGreaterThan(0)
      expect(result.securityViolations).toHaveLength(0)
      expect(result.result).toEqual({
        started: true,
        timestamp: expect.any(Number)
      })

      // Assert console.log was called for onStart
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Plugin:start-test-plugin]',
        '[start-test-plugin] onStart called with agentId:',
        'test-agent-001'
      )
    })

    it('should handle onStart hook errors gracefully', async () => {
      const pluginCode = createTestPlugin({
        name: 'error-start-plugin',
        onStartBehavior: 'error'
      })

      const secureContext = {
        plugin: { name: 'error-start-plugin', version: '1.0.0' },
        agentContext: secureClone(mockContext)
      }

      await expect(
        vmRunner.executePluginHook(
          'error-start-plugin',
          'onInit',
          pluginCode,
          secureContext
        )
      ).rejects.toThrow('onStart simulation error')

      // Should still have logged the start message before error
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Plugin:error-start-plugin]',
        '[error-start-plugin] onStart called with agentId:',
        'test-agent-001'
      )
    })

    it('should enforce timeout limits on slow onStart hooks', async () => {
      const pluginCode = createTestPlugin({
        name: 'slow-start-plugin',
        onStartBehavior: 'timeout'
      })

      const secureContext = {
        plugin: { name: 'slow-start-plugin', version: '1.0.0' },
        agentContext: secureClone(mockContext)
      }

      await expect(
        vmRunner.executePluginHook(
          'slow-start-plugin',
          'onInit',
          pluginCode,
          secureContext
        )
      ).rejects.toThrow(/timed out/)
    })
  })

  describe('onMessage Hook Validation', () => {
    it('should execute onMessage hook successfully with console.log assertion', async () => {
      const pluginCode = createTestPlugin({
        name: 'message-test-plugin',
        onMessageBehavior: 'success'
      })

      const sendPayload: SendPayload = {
        input: { message: 'test message content', data: 'payload-data' },
        metadata: { priority: 'high' }
      }

      const secureContext = {
        plugin: { name: 'message-test-plugin', version: '1.0.0' },
        sendPayload: secureClone(sendPayload),
        agentContext: secureClone(mockContext)
      }

      const result = await vmRunner.executePluginHook(
        'message-test-plugin',
        'onSend', // VMRunner uses onSend for message hook
        pluginCode,
        secureContext
      )

      // Verify successful execution
      expect(result.withinLimits).toBe(true)
      expect(result.securityViolations).toHaveLength(0)
      expect(result.result).toEqual({
        processed: true,
        messageCount: 1
      })

      // Assert console.log was called for onMessage with payload data
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Plugin:message-test-plugin]',
        '[message-test-plugin] onMessage called with payload:',
        { message: 'test message content', data: 'payload-data' }
      )
    })

    it('should prevent payload mutation through context isolation', async () => {
      const pluginCode = createTestPlugin({
        name: 'mutating-plugin',
        onMessageBehavior: 'modify'
      })

      const originalPayload: SendPayload = {
        input: { message: 'original message', immutable: true },
        metadata: { secure: true }
      }

      const secureContext = {
        plugin: { name: 'mutating-plugin', version: '1.0.0' },
        sendPayload: secureClone(originalPayload),
        agentContext: secureClone(mockContext)
      }

      const result = await vmRunner.executePluginHook(
        'mutating-plugin',
        'onSend',
        pluginCode,
        secureContext
      )

      // Plugin should execute successfully
      expect(result.result).toEqual({
        processed: true,
        messageCount: 1
      })

      // Original payload should remain unchanged due to deep cloning
      expect(originalPayload.input).not.toHaveProperty('modified')
      expect(originalPayload.input).not.toHaveProperty('pluginName')
      expect(originalPayload.input.message).toBe('original message')

      // Assert console logging occurred - the payload shown will be modified within VM context
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Plugin:mutating-plugin]',
        '[mutating-plugin] onMessage called with payload:',
        expect.objectContaining({
          message: 'original message',
          immutable: true
        })
      )
    })

    it('should handle onMessage hook errors gracefully', async () => {
      const pluginCode = createTestPlugin({
        name: 'error-message-plugin',
        onMessageBehavior: 'error'
      })

      const sendPayload: SendPayload = {
        input: { message: 'error test' },
        metadata: {}
      }

      const secureContext = {
        plugin: { name: 'error-message-plugin', version: '1.0.0' },
        sendPayload: secureClone(sendPayload),
        agentContext: secureClone(mockContext)
      }

      await expect(
        vmRunner.executePluginHook(
          'error-message-plugin',
          'onSend',
          pluginCode,
          secureContext
        )
      ).rejects.toThrow('onMessage simulation error')

      // Should still have logged before error
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Plugin:error-message-plugin]',
        '[error-message-plugin] onMessage called with payload:',
        { message: 'error test' }
      )
    })
  })

  describe('onStop Hook Validation', () => {
    it('should execute onStop hook successfully with console.log assertion', async () => {
      const pluginCode = createTestPlugin({
        name: 'stop-test-plugin',
        onStopBehavior: 'success'
      })

      const secureContext = {
        plugin: { name: 'stop-test-plugin', version: '1.0.0' },
        agentContext: secureClone(mockContext)
      }

      const result = await vmRunner.executePluginHook(
        'stop-test-plugin',
        'onShutdown', // VMRunner uses onShutdown for stop hook
        pluginCode,
        secureContext
      )

      // Verify successful execution
      expect(result.withinLimits).toBe(true)
      expect(result.securityViolations).toHaveLength(0)
      expect(result.result).toEqual({
        stopped: true,
        cleanedUp: true
      })

      // Assert console.log was called for onStop
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Plugin:stop-test-plugin]',
        '[stop-test-plugin] onStop called for cleanup'
      )
    })

    it('should handle onStop hook errors gracefully', async () => {
      const pluginCode = createTestPlugin({
        name: 'error-stop-plugin',
        onStopBehavior: 'error'
      })

      const secureContext = {
        plugin: { name: 'error-stop-plugin', version: '1.0.0' },
        agentContext: secureClone(mockContext)
      }

      await expect(
        vmRunner.executePluginHook(
          'error-stop-plugin',
          'onShutdown',
          pluginCode,
          secureContext
        )
      ).rejects.toThrow('onStop simulation error')

      // Should still have logged before error
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Plugin:error-stop-plugin]',
        '[error-stop-plugin] onStop called for cleanup'
      )
    })
  })

  describe('Context and Logger Integration', () => {
    it('should verify context.logger works through console API', async () => {
      const pluginCode = `
        const plugin = {
          name: 'logger-test-plugin',
          version: '1.0.0',
          
          async onInit(context) {
            // Test various console methods available as context.logger
            console.log('Logger test: info message');
            console.warn('Logger test: warning message');
            console.error('Logger test: error message');
            
            return {
              loggerAvailable: typeof console !== 'undefined',
              logMethods: {
                log: typeof console.log,
                warn: typeof console.warn,
                error: typeof console.error,
                info: typeof console.info
              }
            };
          }
        };
      `

      const secureContext = {
        plugin: { name: 'logger-test-plugin', version: '1.0.0' },
        agentContext: secureClone(mockContext)
      }

      // Setup spy for console.warn
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await vmRunner.executePluginHook(
        'logger-test-plugin',
        'onInit',
        pluginCode,
        secureContext
      )

      // Verify logger functionality
      expect(result.result.loggerAvailable).toBe(true)
      expect(result.result.logMethods).toEqual({
        log: 'function',
        warn: 'function',
        error: 'function',
        info: 'function'
      })

      // Assert all console methods were called with plugin prefix
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Plugin:logger-test-plugin]',
        'Logger test: info message'
      )
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Plugin:logger-test-plugin]',
        'Logger test: warning message'
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Plugin:logger-test-plugin]',
        'Logger test: error message'
      )

      consoleWarnSpy.mockRestore()
    })

    it('should provide isolated context per plugin execution', async () => {
      const plugin1Code = createTestPlugin({
        name: 'isolation-plugin-1',
        logMessages: true
      })

      const plugin2Code = createTestPlugin({
        name: 'isolation-plugin-2',
        logMessages: true
      })

      const context1 = { ...mockContext, agentId: 'agent-1' }
      const context2 = { ...mockContext, agentId: 'agent-2' }

      const secureContext1 = {
        plugin: { name: 'isolation-plugin-1', version: '1.0.0' },
        agentContext: secureClone(context1)
      }

      const secureContext2 = {
        plugin: { name: 'isolation-plugin-2', version: '1.0.0' },
        agentContext: secureClone(context2)
      }

      // Execute both plugins
      const [result1, result2] = await Promise.all([
        vmRunner.executePluginHook('isolation-plugin-1', 'onInit', plugin1Code, secureContext1),
        vmRunner.executePluginHook('isolation-plugin-2', 'onInit', plugin2Code, secureContext2)
      ])

      // Both should succeed
      expect(result1.result.started).toBe(true)
      expect(result2.result.started).toBe(true)

      // Each should have logged with their respective agent IDs
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Plugin:isolation-plugin-1]',
        '[isolation-plugin-1] onStart called with agentId:',
        'agent-1'
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Plugin:isolation-plugin-2]',
        '[isolation-plugin-2] onStart called with agentId:',
        'agent-2'
      )
    })
  })

  describe('Complete Lifecycle Coverage', () => {
    it('should execute full plugin lifecycle: onStart → onMessage → onStop', async () => {
      const pluginCode = createTestPlugin({
        name: 'full-lifecycle-plugin',
        onStartBehavior: 'success',
        onMessageBehavior: 'success',
        onStopBehavior: 'success'
      })

      const secureContext = {
        plugin: { name: 'full-lifecycle-plugin', version: '1.0.0' },
        agentContext: secureClone(mockContext)
      }

      // Execute onStart
      const startResult = await vmRunner.executePluginHook(
        'full-lifecycle-plugin',
        'onInit',
        pluginCode,
        secureContext
      )
      expect(startResult.result.started).toBe(true)

      // Execute onMessage
      const messageContext = {
        ...secureContext,
        sendPayload: secureClone({ input: { message: 'lifecycle test' }, metadata: {} })
      }
      const messageResult = await vmRunner.executePluginHook(
        'full-lifecycle-plugin',
        'onSend',
        pluginCode,
        messageContext
      )
      expect(messageResult.result.processed).toBe(true)

      // Execute onStop
      const stopResult = await vmRunner.executePluginHook(
        'full-lifecycle-plugin',
        'onShutdown',
        pluginCode,
        secureContext
      )
      expect(stopResult.result.stopped).toBe(true)

      // Verify all hooks logged their execution
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Plugin:full-lifecycle-plugin]',
        '[full-lifecycle-plugin] onStart called with agentId:',
        'test-agent-001'
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Plugin:full-lifecycle-plugin]',
        '[full-lifecycle-plugin] onMessage called with payload:',
        { message: 'lifecycle test' }
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Plugin:full-lifecycle-plugin]',
        '[full-lifecycle-plugin] onStop called for cleanup'
      )
    })

    it('should track execution metrics across lifecycle hooks', async () => {
      const pluginCode = createTestPlugin({
        name: 'metrics-plugin',
        logMessages: false // Disable console noise for metrics test
      })

      const executions: Array<{ hook: string; time: number; memory: number }> = []

      const secureContext = {
        plugin: { name: 'metrics-plugin', version: '1.0.0' },
        agentContext: secureClone(mockContext)
      }

      // Track onStart metrics
      const startResult = await vmRunner.executePluginHook(
        'metrics-plugin',
        'onInit',
        pluginCode,
        secureContext
      )
      executions.push({
        hook: 'onStart',
        time: startResult.executionTimeMs,
        memory: startResult.memoryUsageBytes
      })

      // Track onMessage metrics
      const messageContext = {
        ...secureContext,
        sendPayload: secureClone({ input: { message: 'metrics test' }, metadata: {} })
      }
      const messageResult = await vmRunner.executePluginHook(
        'metrics-plugin',
        'onSend',
        pluginCode,
        messageContext
      )
      executions.push({
        hook: 'onMessage',
        time: messageResult.executionTimeMs,
        memory: messageResult.memoryUsageBytes
      })

      // Track onStop metrics
      const stopResult = await vmRunner.executePluginHook(
        'metrics-plugin',
        'onShutdown',
        pluginCode,
        secureContext
      )
      executions.push({
        hook: 'onStop',
        time: stopResult.executionTimeMs,
        memory: stopResult.memoryUsageBytes
      })

      // Verify all executions recorded metrics
      expect(executions).toHaveLength(3)
      executions.forEach(execution => {
        expect(execution.time).toBeGreaterThan(0)
        expect(execution.memory).toBeGreaterThanOrEqual(0)
      })

      // Verify no security violations occurred
      expect(startResult.securityViolations).toHaveLength(0)
      expect(messageResult.securityViolations).toHaveLength(0)
      expect(stopResult.securityViolations).toHaveLength(0)
    })
  })

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})