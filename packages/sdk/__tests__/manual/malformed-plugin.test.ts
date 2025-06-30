/**
 * Malformed Plugin Test Suite - Fixed Version
 * 
 * Validates proper error handling and observability for plugins with broken or
 * missing metadata, invalid structures, and missing required components.
 * Tests comprehensive validation, error categorization, and logging.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { PluginManager } from '../../src/plugins'
import { VMRunner, createVMRunner, secureClone } from '../../src/security/vmRunner'
import { MetricsCollector } from '../../src/observability/MetricsCollector'
import { PluginExecutionTimeline } from '../../src/observability/PluginExecutionTimeline'
import type { AgentKitPlugin, AgentContext } from '@agentkit/types'
import { cleanupAllResources, flushPromises } from '../test-utils'

/**
 * Create various types of malformed plugins for testing
 */
const MALFORMED_PLUGINS = {
  // Missing required name field
  noName: {
    version: '1.0.0',
    onInit: vi.fn(),
    onSend: vi.fn()
  } as any as AgentKitPlugin,

  // Invalid name type
  invalidNameType: {
    name: 123, // Should be string
    version: '1.0.0',
    onInit: vi.fn()
  } as any as AgentKitPlugin,

  // Empty name
  emptyName: {
    name: '',
    version: '1.0.0',
    onSend: vi.fn()
  } as any as AgentKitPlugin,

  // Missing version
  noVersion: {
    name: 'no-version-plugin',
    onInit: vi.fn()
  } as any as AgentKitPlugin,

  // Invalid version format
  invalidVersion: {
    name: 'invalid-version-plugin',
    version: 'not-semver',
    onSend: vi.fn()
  } as any as AgentKitPlugin,

  // No hooks at all
  noHooks: {
    name: 'no-hooks-plugin',
    version: '1.0.0'
  } as any as AgentKitPlugin,

  // Invalid hook types
  invalidHookTypes: {
    name: 'invalid-hooks-plugin',
    version: '1.0.0',
    onInit: 'not-a-function', // Should be function
    onSend: 123, // Should be function
    onError: true, // Should be function
    onShutdown: null // Should be function
  } as any as AgentKitPlugin,

  // Valid plugin that should pass
  validPlugin: {
    name: 'valid-plugin',
    version: '1.0.0',
    onInit: vi.fn()
  } as AgentKitPlugin
}

/**
 * Create malformed plugin source code for VM testing
 */
function createMalformedPluginCode(type: 'no-export' | 'wrong-export' | 'syntax-error' | 'runtime-error') {
  switch (type) {
    case 'no-export':
      return `
        // Missing plugin variable assignment
        {
          name: 'no-export-plugin',
          version: '1.0.0',
          onInit: async function(context) {
            console.log('This plugin has no export')
          }
        }
      `
    
    case 'wrong-export':
      return `
        // Wrong variable name
        const myPlugin = {
          name: 'wrong-export-plugin',
          version: '1.0.0',
          onSend: async function(payload, context) {
            return payload
          }
        }
      `
    
    case 'syntax-error':
      return `
        const plugin = {
          name: 'syntax-error-plugin',
          version: '1.0.0',
          onInit: async function(context) {
            console.log('Missing closing brace'
          }
        // Missing closing brace
      `
    
    case 'runtime-error':
      return `
        const plugin = {
          name: 'runtime-error-plugin',
          version: '1.0.0',
          onInit: async function(context) {
            // This will throw at runtime
            undefinedVariable.doSomething()
          }
        };
      `
  }
}

describe('Malformed Plugin Validation - Fixed', () => {
  let pluginManager: PluginManager
  let vmRunner: VMRunner
  let mockContext: AgentContext

  beforeEach(() => {
    // Initialize plugin manager
    pluginManager = new PluginManager({
      debug: false,
      observabilityHooks: {
        onPluginError: vi.fn(),
        onPluginTimeout: vi.fn(),
        onPluginStart: vi.fn(),
        onPluginSuccess: vi.fn()
      }
    })

    // Initialize VM runner
    vmRunner = createVMRunner({
      timeoutMs: 1000,
      memoryLimitBytes: 5 * 1024 * 1024,
      enableStaticAnalysis: true,
      allowedGlobals: ['console', 'Date', 'Math', 'JSON', 'Object', 'Promise']
    })

    // Setup mock context
    mockContext = {
      agentId: 'test-agent',
      transportId: 'test-transport',
      requestId: 'test-request',
      timestamp: Date.now()
    }
  })

  afterEach(() => {
    vmRunner.dispose()
  })

  describe('🚫 Missing Required Fields', () => {
    it('should throw error for plugin with no name', () => {
      expect(() => {
        pluginManager.register(MALFORMED_PLUGINS.noName)
      }).toThrow(/Required/)
    })

    it('should throw error for plugin with invalid name type', () => {
      expect(() => {
        pluginManager.register(MALFORMED_PLUGINS.invalidNameType)
      }).toThrow(/Expected string/)
    })

    it('should throw error for plugin with empty name', () => {
      expect(() => {
        pluginManager.register(MALFORMED_PLUGINS.emptyName)
      }).toThrow(/String must contain at least 1 character/)
    })

    it('should throw error for plugin with no version', () => {
      expect(() => {
        pluginManager.register(MALFORMED_PLUGINS.noVersion)
      }).toThrow(/Required/)
    })

    it('should handle plugin with invalid version format', () => {
      expect(() => {
        pluginManager.register(MALFORMED_PLUGINS.invalidVersion)
      }).toThrow(/Invalid/)
    })
  })

  describe('🔌 Invalid Hook Configurations', () => {
    it('should accept plugin with no hooks', () => {
      // Plugins with no hooks are valid
      pluginManager.register(MALFORMED_PLUGINS.noHooks)
      expect(pluginManager.getPlugins()).toHaveLength(1)
    })

    it('should throw error for invalid hook types', () => {
      expect(() => {
        pluginManager.register(MALFORMED_PLUGINS.invalidHookTypes)
      }).toThrow(/function/)
    })
  })

  describe('📝 Plugin Source Code Validation', () => {
    it('should handle plugin with no export', async () => {
      const pluginCode = createMalformedPluginCode('no-export')
      
      let error: Error | null = null
      try {
        await vmRunner.executePluginHook(
          'no-export-plugin',
          'onInit',
          pluginCode,
          {
            plugin: { name: 'no-export-plugin', version: '1.0.0' },
            agentContext: secureClone(mockContext)
          }
        )
      } catch (e) {
        error = e as Error
      }

      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/plugin is not defined|Unexpected token/)
    })

    it('should handle plugin with wrong export variable', async () => {
      const pluginCode = createMalformedPluginCode('wrong-export')
      
      let error: Error | null = null
      try {
        await vmRunner.executePluginHook(
          'wrong-export-plugin',
          'onSend',
          pluginCode,
          {
            plugin: { name: 'wrong-export-plugin', version: '1.0.0' },
            agentContext: secureClone(mockContext),
            sendPayload: { input: { content: 'test' }, metadata: {} }
          }
        )
      } catch (e) {
        error = e as Error
      }

      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/plugin is not defined|Plugin must be an object/)
    })

    it('should handle plugin with syntax errors', async () => {
      const pluginCode = createMalformedPluginCode('syntax-error')
      
      let error: Error | null = null
      try {
        await vmRunner.executePluginHook(
          'syntax-error-plugin',
          'onInit',
          pluginCode,
          {
            plugin: { name: 'syntax-error-plugin', version: '1.0.0' },
            agentContext: secureClone(mockContext)
          }
        )
      } catch (e) {
        error = e as Error
      }

      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/Unexpected|SyntaxError|missing/)
    })

    it('should handle plugin with runtime errors', async () => {
      const pluginCode = createMalformedPluginCode('runtime-error')
      
      let error: Error | null = null
      try {
        await vmRunner.executePluginHook(
          'runtime-error-plugin',
          'onInit',
          pluginCode,
          {
            plugin: { name: 'runtime-error-plugin', version: '1.0.0' },
            agentContext: secureClone(mockContext)
          }
        )
      } catch (e) {
        error = e as Error
      }

      expect(error).not.toBeNull()
      expect(error?.message).toContain('undefinedVariable is not defined')
    })
  })

  describe('🔔 Error Tracking', () => {
    it('should track registration failures', () => {
      const testCases = [
        { plugin: MALFORMED_PLUGINS.noName, shouldFail: true },
        { plugin: MALFORMED_PLUGINS.invalidNameType, shouldFail: true },
        { plugin: MALFORMED_PLUGINS.invalidHookTypes, shouldFail: true },
        { plugin: MALFORMED_PLUGINS.validPlugin, shouldFail: false }
      ]

      let failureCount = 0
      let successCount = 0

      for (const testCase of testCases) {
        try {
          pluginManager.register(testCase.plugin)
          successCount++
        } catch (error) {
          failureCount++
        }
      }

      expect(failureCount).toBe(3)
      expect(successCount).toBe(1)
    })

    it('should categorize errors correctly', () => {
      const errors: Error[] = []

      try {
        pluginManager.register(MALFORMED_PLUGINS.noName)
      } catch (error) {
        errors.push(error as Error)
      }

      try {
        pluginManager.register(MALFORMED_PLUGINS.invalidHookTypes)
      } catch (error) {
        errors.push(error as Error)
      }

      expect(errors).toHaveLength(2)
      errors.forEach(error => {
        expect(error.message).toMatch(/Required|Expected|function/)
      })
    })

    it('should work with metrics collector', () => {
      const metricsCollector = new MetricsCollector()

      // Handle error events to prevent unhandled errors
      metricsCollector.on('error', () => {
        // Expected error events
      })

      // Record some errors
      metricsCollector.recordError('PluginRegistrationError', 'test-plugin')
      metricsCollector.recordError('PluginValidationError', 'another-plugin')

      const metrics = metricsCollector.getMetrics()
      expect(metrics.errors.total.value).toBeGreaterThan(0)
    })
  })

  describe('🔄 Recovery and Fallback', () => {
    it('should continue loading valid plugins after encountering malformed ones', () => {
      const plugins = [
        MALFORMED_PLUGINS.noName,
        MALFORMED_PLUGINS.validPlugin,
        MALFORMED_PLUGINS.invalidHookTypes,
        { name: 'valid-plugin-2', version: '1.0.0', onSend: vi.fn() }
      ]

      let loadedCount = 0
      let errorCount = 0

      plugins.forEach(plugin => {
        try {
          pluginManager.register(plugin as AgentKitPlugin)
          loadedCount++
        } catch (error) {
          errorCount++
        }
      })

      expect(loadedCount).toBe(2)
      expect(errorCount).toBe(2)
      expect(pluginManager.getPlugins()).toHaveLength(2)
    })
  })

  describe('📊 Error Details', () => {
    it('should capture complete error context', () => {
      const errorDetails: any[] = []
      
      const captureErrorDetails = (plugin: any) => {
        try {
          pluginManager.register(plugin)
        } catch (error: any) {
          errorDetails.push({
            pluginName: plugin.name || 'unknown',
            errorType: error.constructor.name,
            message: error.message,
            stack: error.stack,
            timestamp: Date.now()
          })
        }
      }

      // Test malformed plugins
      captureErrorDetails(MALFORMED_PLUGINS.noName)
      captureErrorDetails(MALFORMED_PLUGINS.invalidHookTypes)

      expect(errorDetails).toHaveLength(2)
      
      errorDetails.forEach(detail => {
        expect(detail.errorType).toBeDefined()
        expect(detail.message).toBeDefined()
        expect(detail.stack).toBeDefined()
        expect(detail.timestamp).toBeGreaterThan(0)
      })

      const validationErrors = errorDetails.filter(d => 
        d.errorType.includes('Validation') || d.message.includes('validation') ||
        d.message.includes('Required') || d.message.includes('function')
      )
      expect(validationErrors.length).toBeGreaterThan(0)
    })
  })

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})