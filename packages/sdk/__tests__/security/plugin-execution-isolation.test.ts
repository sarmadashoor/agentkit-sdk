import { describe, it, expect, vi } from 'vitest'
import { PluginHookError } from '../../src/errors'
import { PluginExecutor } from '../../src/plugins/execution/PluginExecutor'
import { PlatformEnvironment } from '../../src/plugins/environment/PlatformEnvironment'
import { PluginSecurity } from '../../src/plugins/security/PluginSecurity'
import type { AgentKitPlugin } from '@agentkit/types'

describe('PluginExecutor Security - Hook Isolation', () => {
  const createMockExecutor = () => {
    const platformEnv = new PlatformEnvironment(false)
    const security = new PluginSecurity(false)
    
    return new PluginExecutor({
      platformEnv,
      security,
      sandbox: false, // Disable sandbox to test direct execution error handling
      debug: false
    })
  }

  const createTestPlugin = (name: string, hook?: Function): AgentKitPlugin => ({
    name,
    version: '1.0.0',
    description: `Test plugin ${name}`,
    onInit: hook || vi.fn()
  })

  it('should catch hook errors and throw PluginHookError', async () => {
    const executor = createMockExecutor()
    const faultyHook = () => {
      throw new Error('Test failure')
    }
    const plugin = createTestPlugin('faulty-plugin', faultyHook)

    await expect(async () => {
      await executor.executePluginHook(plugin, 'onInit', faultyHook, [{}])
    }).rejects.toThrow(PluginHookError)
  })

  it('should include plugin name and hook name in error', async () => {
    const executor = createMockExecutor()
    const faultyHook = () => {
      throw new Error('Original error message')
    }
    const plugin = createTestPlugin('error-plugin', faultyHook)

    try {
      await executor.executePluginHook(plugin, 'onInit', faultyHook, [{}])
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error).toBeInstanceOf(PluginHookError)
      expect((error as PluginHookError).message).toContain('error-plugin')
      expect((error as PluginHookError).message).toContain('onInit')
      expect((error as PluginHookError).message).toContain('Original error message')
    }
  })

  it('should handle async hook errors', async () => {
    const executor = createMockExecutor()
    const asyncFaultyHook = async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      throw new Error('Async error')
    }
    const plugin = createTestPlugin('async-error-plugin', asyncFaultyHook)

    await expect(async () => {
      await executor.executePluginHook(plugin, 'onInit', asyncFaultyHook, [{}])
    }).rejects.toThrow(PluginHookError)
  })

  it('should handle synchronous hook errors', async () => {
    const executor = createMockExecutor()
    const syncFaultyHook = () => {
      throw new Error('Sync error')
    }
    const plugin = createTestPlugin('sync-error-plugin', syncFaultyHook)

    await expect(async () => {
      await executor.executePluginHook(plugin, 'onInit', syncFaultyHook, [{}])
    }).rejects.toThrow(PluginHookError)
  })

  it('should isolate errors between different plugin executions', async () => {
    const executor = createMockExecutor()
    
    const goodHook = () => 'success'
    const badHook = () => {
      throw new Error('Isolated error')
    }
    
    const goodPlugin = createTestPlugin('good-plugin', goodHook)
    const badPlugin = createTestPlugin('bad-plugin', badHook)

    // Good plugin should work
    const result = await executor.executePluginHook(goodPlugin, 'onInit', goodHook, [{}])
    expect(result).toBe('success')

    // Bad plugin should throw isolated error
    await expect(async () => {
      await executor.executePluginHook(badPlugin, 'onInit', badHook, [{}])
    }).rejects.toThrow(PluginHookError)

    // Good plugin should still work after bad plugin failure
    const result2 = await executor.executePluginHook(goodPlugin, 'onInit', goodHook, [{}])
    expect(result2).toBe('success')
  })

  it('should handle different hook types consistently', async () => {
    const executor = createMockExecutor()
    
    const createErrorHook = (hookName: string) => () => {
      throw new Error(`Error in ${hookName}`)
    }

    const plugin = createTestPlugin('multi-hook-plugin')

    // Test different hook names
    const hookTypes = ['onInit', 'onSend', 'onError', 'onShutdown'] as const

    for (const hookName of hookTypes) {
      const errorHook = createErrorHook(hookName)
      
      await expect(async () => {
        await executor.executePluginHook(plugin, hookName, errorHook, [{}])
      }).rejects.toThrow(PluginHookError)
    }
  })

  it('should preserve original error information in wrapped error', async () => {
    const executor = createMockExecutor()
    const originalError = new Error('Original detailed error message')
    originalError.stack = 'Original stack trace'
    
    const faultyHook = () => {
      throw originalError
    }
    const plugin = createTestPlugin('preserve-error-plugin', faultyHook)

    try {
      await executor.executePluginHook(plugin, 'onInit', faultyHook, [{}])
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error).toBeInstanceOf(PluginHookError)
      expect((error as PluginHookError).message).toContain('Original detailed error message')
    }
  })

  it('should handle non-Error exceptions', async () => {
    const executor = createMockExecutor()
    const faultyHook = () => {
      throw 'String error' // Throwing a non-Error object
    }
    const plugin = createTestPlugin('string-error-plugin', faultyHook)

    await expect(async () => {
      await executor.executePluginHook(plugin, 'onInit', faultyHook, [{}])
    }).rejects.toThrow(PluginHookError)
  })
})