/**
 * Debug test to reproduce the "SyntaxError: Unexpected identifier 'onSend'" issue
 * with object literal plugins
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest'
import { PluginManager } from '../src/plugins/PluginManager'
import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'

describe('OnSend Syntax Error Debug', () => {
  let manager: PluginManager

  beforeEach(() => {
    manager = new PluginManager({ 
      debug: true, 
      sandbox: true,
      sandboxTimeout: 2000
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
    timestamp: Date.now()
  }

  const mockPayload: SendPayload = {
    input: { message: 'test' },
    metadata: { source: 'test' }
  }

  it('should handle object literal plugin with onSend', async () => {
    // This is likely the problematic pattern causing the syntax error
    const objectLiteralPlugin: AgentKitPlugin = {
      name: 'object-literal-plugin',
      version: '1.0.0',
      onSend: function(payload: SendPayload, context: AgentContext) {
        return { processed: true, payload }
      }
    }

    manager.register(objectLiteralPlugin)
    const results = await manager.executeHook('onSend', mockPayload, mockContext)
    
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)
    expect(results[0].error).toBeUndefined()
  })

  it('should handle object literal plugin with arrow function onSend', async () => {
    const arrowFunctionPlugin: AgentKitPlugin = {
      name: 'arrow-function-plugin',
      version: '1.0.0',
      onSend: (payload: SendPayload, context: AgentContext) => {
        return { processed: true, payload }
      }
    }

    manager.register(arrowFunctionPlugin)
    const results = await manager.executeHook('onSend', mockPayload, mockContext)
    
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)
    expect(results[0].error).toBeUndefined()
  })

  it('should handle object literal plugin with method shorthand onSend', async () => {
    // This is the most likely problematic pattern
    const methodShorthandPlugin: AgentKitPlugin = {
      name: 'method-shorthand-plugin',
      version: '1.0.0',
      onSend(payload: SendPayload, context: AgentContext) {
        return { processed: true, payload }
      }
    }

    manager.register(methodShorthandPlugin)
    const results = await manager.executeHook('onSend', mockPayload, mockContext)
    
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)
    expect(results[0].error).toBeUndefined()
  })

  it('should log function source during serialization', async () => {
    const consoleLogs: string[] = []
    const originalLog = console.log
    console.log = (...args) => {
      consoleLogs.push(args.join(' '))
      originalLog(...args)
    }

    const plugin: AgentKitPlugin = {
      name: 'debug-serialization-plugin',
      version: '1.0.0',
      onSend(payload: SendPayload, context: AgentContext) {
        return { method: 'shorthand', payload }
      }
    }

    try {
      manager.register(plugin)
      console.log('Function source:', plugin.onSend?.toString())
      await manager.executeHook('onSend', mockPayload, mockContext)
    } catch (error) {
      console.log('Error during execution:', error)
    }

    console.log = originalLog
  })

  it('should handle complex async method shorthand', async () => {
    const complexPlugin: AgentKitPlugin = {
      name: 'complex-async-plugin',
      version: '1.0.0',
      async onSend(payload: SendPayload, context: AgentContext): Promise<any> {
        // Complex async method with type annotations
        const processed = await Promise.resolve(payload)
        return { processed, context: context.agentId }
      }
    }

    console.log('Complex function source:', complexPlugin.onSend?.toString())
    
    manager.register(complexPlugin)
    const results = await manager.executeHook('onSend', mockPayload, mockContext)
    
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)
    expect(results[0].error).toBeUndefined()
  })

  it('should handle plugin with computed property names', async () => {
    const hookName = 'onSend' as const
    const computedPlugin: AgentKitPlugin = {
      name: 'computed-property-plugin',
      version: '1.0.0',
      [hookName]: function(payload: SendPayload, context: AgentContext) {
        return { computed: true, payload }
      }
    }

    console.log('Computed property function source:', computedPlugin.onSend?.toString())
    
    manager.register(computedPlugin)
    const results = await manager.executeHook('onSend', mockPayload, mockContext)
    
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)
    expect(results[0].error).toBeUndefined()
  })

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})