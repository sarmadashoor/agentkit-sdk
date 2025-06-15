/**
 * Test to ensure plugin types are correctly imported from @agentkit/types
 * This test validates that there are no duplicate type definitions and that
 * all plugin-related types come from the shared types package.
 */

import { describe, test, expect } from 'vitest'
import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'
import { PluginManager } from '../plugins/PluginManager'

describe('Plugin Type Imports', () => {
  test('should import AgentKitPlugin from @agentkit/types', () => {
    // This test validates that we can create a valid plugin using types from @agentkit/types
    const testPlugin: AgentKitPlugin = {
      name: 'test-plugin',
      version: '1.0.0',
      description: 'Test plugin for type validation',
      onInit(context: AgentContext) {
        // Type should be correctly imported from @agentkit/types
        expect(context.agentId).toBeDefined()
        expect(context.transportId).toBeDefined()
        expect(context.requestId).toBeDefined()
        expect(context.timestamp).toBeDefined()
      },
      onSend(payload: SendPayload, context: AgentContext) {
        // Type should be correctly imported from @agentkit/types  
        expect(payload.input).toBeDefined()
        expect(payload.metadata).toBeDefined()
        expect(context.agentId).toBeDefined()
      }
    }

    expect(testPlugin.name).toBe('test-plugin')
    expect(testPlugin.version).toBe('1.0.0')
    expect(typeof testPlugin.onInit).toBe('function')
    expect(typeof testPlugin.onSend).toBe('function')
  })

  test('should use imported types in PluginManager', () => {
    const pluginManager = new PluginManager()
    
    const testPlugin: AgentKitPlugin = {
      name: 'manager-test-plugin',
      version: '1.0.0'
    }

    // This should work with imported types
    expect(() => {
      pluginManager.register(testPlugin)
    }).not.toThrow()

    expect(pluginManager.getPlugins()).toHaveLength(1)
    expect(pluginManager.getPlugins()[0]).toEqual(testPlugin)
  })

  test('should correctly type async plugin hooks', async () => {
    const asyncPlugin: AgentKitPlugin = {
      name: 'async-test-plugin',
      version: '1.0.0',
      async onInit(context: AgentContext): Promise<void> {
        // Async hook with proper typing
        expect(context.agentId).toBeDefined()
      },
      async onSend(payload: SendPayload, context: AgentContext): Promise<void> {
        // Async hook with proper typing
        expect(payload.input).toBeDefined()
      }
    }

    const pluginManager = new PluginManager()
    pluginManager.register(asyncPlugin)

    const context: AgentContext = {
      agentId: 'test-agent',
      transportId: 'test-transport',
      requestId: 'req-123',
      timestamp: Date.now()
    }

    const payload: SendPayload = {
      input: 'test',
      metadata: {}
    }

    // These should execute without type errors
    const results1 = await pluginManager.executeHook('onInit', context)
    expect(results1).toHaveLength(1)
    expect(results1[0].success).toBe(true)

    const results2 = await pluginManager.executeHook('onSend', payload, context)
    expect(results2).toHaveLength(1)
    expect(results2[0].success).toBe(true)
  })
})