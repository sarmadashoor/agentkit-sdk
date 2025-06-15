/**
 * Simple sandbox debugging test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PluginManager } from '../PluginManager'
import type { AgentKitPlugin, AgentContext } from '@agentkit/types'

describe('Sandbox Debug', () => {
  let manager: PluginManager

  beforeEach(() => {
    manager = new PluginManager({ 
      debug: true, 
      sandbox: true,
      sandboxTimeout: 1000
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

  it('should execute basic plugin in sandbox', async () => {
    const basicPlugin: AgentKitPlugin = {
      name: 'basic-plugin',
      version: '1.0.0',
      onInit: (context: AgentContext) => {
        return { executed: true, agentId: context.agentId }
      }
    }

    manager.register(basicPlugin)
    const results = await manager.executeHook('onInit', mockContext)
    
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)
    expect(results[0].error).toBeUndefined()
  })

  it('should prevent global access', async () => {
    const globalPlugin: AgentKitPlugin = {
      name: 'global-access-plugin',
      version: '1.0.0',
      onInit: (context: AgentContext) => {
        try {
          ;(global as any).TEST_VALUE = 'hacked'
          return { success: true }
        } catch (e) {
          throw new Error('Global access blocked: ' + (e as Error).message)
        }
      }
    }

    manager.register(globalPlugin)
    const results = await manager.executeHook('onInit', mockContext)
    
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(false)
    expect(results[0].error?.message).toContain('Cannot set properties of undefined')
  })
})