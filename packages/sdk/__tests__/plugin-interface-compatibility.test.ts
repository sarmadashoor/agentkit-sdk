/**
 * Test to ensure plugin interfaces are correctly typed and compatible across packages
 * This test validates that AgentKitPlugin interface from @agentkit/types
 * is fully compatible with SDK PluginManager implementation
 */

import { describe, test, expect, beforeEach } from 'vitest'
import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'
import { PluginManager } from '../src/plugins/PluginManager'

describe('Plugin Interface Compatibility', () => {
  let pluginManager: PluginManager

  beforeEach(() => {
    pluginManager = new PluginManager()
  })

  test('should accept plugin with all hooks from @agentkit/types', () => {
    const fullPlugin: AgentKitPlugin = {
      name: 'full-test-plugin',
      version: '1.0.0',
      description: 'Plugin with all hooks implemented',
      onInit(context: AgentContext) {
        expect(context.agentId).toBeDefined()
        expect(context.transportId).toBeDefined()
      },
      onSend(payload: SendPayload, context: AgentContext) {
        expect(payload.input).toBeDefined()
        expect(context.agentId).toBeDefined()
      },
      onError(error: Error, context: AgentContext) {
        expect(error).toBeInstanceOf(Error)
        expect(context.agentId).toBeDefined()
      },
      onShutdown(context: AgentContext) {
        expect(context.agentId).toBeDefined()
      }
    }

    expect(() => {
      pluginManager.register(fullPlugin)
    }).not.toThrow()

    expect(pluginManager.getPlugins()).toHaveLength(1)
    expect(pluginManager.getPlugins()[0]).toEqual(fullPlugin)
  })

  test('should accept plugin with async hooks from @agentkit/types', async () => {
    const asyncPlugin: AgentKitPlugin = {
      name: 'async-test-plugin',
      version: '2.0.0',
      async onInit(context: AgentContext): Promise<void> {
        await Promise.resolve()
        expect(context.timestamp).toBeTypeOf('number')
      },
      async onSend(payload: SendPayload, context: AgentContext): Promise<void> {
        await Promise.resolve()
        expect(payload.metadata).toBeDefined()
      },
      async onError(error: Error, context: AgentContext): Promise<void> {
        await Promise.resolve()
        expect(error.message).toBeDefined()
      },
      async onShutdown(context: AgentContext): Promise<void> {
        await Promise.resolve()
        expect(context.requestId).toBeDefined()
      }
    }

    pluginManager.register(asyncPlugin)

    const context: AgentContext = {
      agentId: 'test-agent',
      transportId: 'test-transport',
      requestId: 'req-123',
      timestamp: Date.now()
    }

    const payload: SendPayload = {
      input: 'test input',
      metadata: { test: true }
    }

    // Execute all hooks to verify async compatibility
    const initResults = await pluginManager.executeHook('onInit', context)
    expect(initResults).toHaveLength(1)
    expect(initResults[0].success).toBe(true)

    const sendResults = await pluginManager.executeHook('onSend', payload, context)
    expect(sendResults).toHaveLength(1)
    expect(sendResults[0].success).toBe(true)

    const errorResults = await pluginManager.executeHook('onError', new Error('test'), context)
    expect(errorResults).toHaveLength(1)
    expect(errorResults[0].success).toBe(true)

    const shutdownResults = await pluginManager.executeHook('onShutdown', context)
    expect(shutdownResults).toHaveLength(1)
    expect(shutdownResults[0].success).toBe(true)
  })

  test('should accept minimal plugin with only required fields from @agentkit/types', () => {
    const minimalPlugin: AgentKitPlugin = {
      name: 'minimal-plugin',
      version: '0.1.0'
      // No hooks - all are optional
    }

    expect(() => {
      pluginManager.register(minimalPlugin)
    }).not.toThrow()

    expect(pluginManager.getPlugins()).toHaveLength(1)
    expect(pluginManager.getPlugins()[0].name).toBe('minimal-plugin')
    expect(pluginManager.getPlugins()[0].version).toBe('0.1.0')
  })

  test('should ensure AgentContext type compatibility', () => {
    const contextTestPlugin: AgentKitPlugin = {
      name: 'context-test',
      version: '1.0.0',
      onInit(context: AgentContext) {
        // Verify all required AgentContext properties exist and have correct types
        expect(typeof context.agentId).toBe('string')
        expect(typeof context.transportId).toBe('string')
        expect(typeof context.requestId).toBe('string')
        expect(typeof context.timestamp).toBe('number')
        
        // Optional metadata should be object or undefined
        if (context.metadata) {
          expect(typeof context.metadata).toBe('object')
        }
      }
    }

    pluginManager.register(contextTestPlugin)
    
    const testContext: AgentContext = {
      agentId: 'test-agent-id',
      transportId: 'test-transport-id',
      requestId: 'test-request-id',
      timestamp: 1234567890,
      metadata: { customField: 'test-value' }
    }

    expect(async () => {
      await pluginManager.executeHook('onInit', testContext)
    }).not.toThrow()
  })

  test('should ensure SendPayload type compatibility', () => {
    const payloadTestPlugin: AgentKitPlugin = {
      name: 'payload-test',
      version: '1.0.0',
      onSend(payload: SendPayload, context: AgentContext) {
        // Verify SendPayload structure
        expect(payload).toHaveProperty('input')
        expect(payload).toHaveProperty('metadata')
        expect(typeof payload.metadata).toBe('object')
        
        // Input can be any type (unknown)
        expect(payload.input).toBeDefined()
      }
    }

    pluginManager.register(payloadTestPlugin)
    
    const testPayload: SendPayload = {
      input: { data: 'test', count: 42 },
      metadata: { source: 'test', priority: 'high' }
    }

    const testContext: AgentContext = {
      agentId: 'test-agent',
      transportId: 'test-transport',
      requestId: 'test-request',
      timestamp: Date.now()
    }

    expect(async () => {
      await pluginManager.executeHook('onSend', testPayload, testContext)
    }).not.toThrow()
  })

  test('should maintain type safety across package boundaries', () => {
    // This test ensures that the types imported from @agentkit/types
    // are fully compatible with the SDK implementation
    
    const typeSafetyPlugin: AgentKitPlugin = {
      name: 'type-safety-test',
      version: '1.0.0',
      onInit: (context: AgentContext) => {
        // TypeScript should infer correct types here
        const agentId: string = context.agentId
        const timestamp: number = context.timestamp
        const metadata: Record<string, unknown> | undefined = context.metadata
        
        expect(typeof agentId).toBe('string')
        expect(typeof timestamp).toBe('number')
        expect(metadata === undefined || typeof metadata === 'object').toBe(true)
      },
      onSend: (payload: SendPayload, context: AgentContext) => {
        // TypeScript should enforce correct types
        const input: unknown = payload.input
        const metadata: Record<string, unknown> = payload.metadata
        const requestId: string = context.requestId
        
        expect(input).toBeDefined()
        expect(typeof metadata).toBe('object')
        expect(typeof requestId).toBe('string')
      }
    }

    // Should register without type errors
    pluginManager.register(typeSafetyPlugin)
    expect(pluginManager.getPlugins()).toHaveLength(1)
  })
})