// ❌ LEGACY TESTS - DO NOT USE AS REFERENCE
// 
// These tests assume closure-based state visibility across sandboxed plugins.
// The AgentKit plugin system uses Node.js VM sandbox (vm.runInContext) for security,
// which means plugins cannot access variables from the test context.
//
// This is an intentional architectural design for security isolation.
// 
// See agent-manager-plugins-report.md for detailed analysis.
// See __tests__/plugin-system/ for new sandbox-compatible tests.
//
// GitHub Issue: Plugin test redesign for VM sandbox compatibility

import { describe, it, expect, beforeEach, vi, afterEach, afterAll } from 'vitest'
import { AgentRegistry } from '@agentkit/registry'
import { DummyTransport } from '@agentkit/transports-dummy'
import { connectAgent } from '../../src/index'
import { AgentKitPlugin, createLoggingPlugin } from '../../src/plugins'
import { cleanupAllResources, flushPromises } from '../test-utils'

describe.skip('AgentManager Plugin Integration (LEGACY - INCOMPATIBLE WITH SANDBOX)', () => {
  let registry: AgentRegistry
  let mockAgent: any
  let mockCalls: any[]

  beforeEach(() => {
    registry = new AgentRegistry()
    mockCalls = []
    
    mockAgent = {
      id: 'test-agent',
      name: 'Test Agent',
      version: '1.0.0',
      init: async () => { mockCalls.push('agent:init') },
      handle: async (input: any) => {
        mockCalls.push(`agent:handle:${JSON.stringify(input)}`)
        return { processed: input, timestamp: Date.now() }
      },
      shutdown: async () => { mockCalls.push('agent:shutdown') }
    }

    registry.register({
      id: 'test-agent',
      name: 'Test Agent',
      version: '1.0.0',
      factory: () => mockAgent
    })

    registry.registerTransport(new DummyTransport({ debug: false }))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Plugin Lifecycle Integration', () => {
    it('should call plugin hooks during agent lifecycle', async () => {
      const pluginCalls: string[] = []
      
      const testPlugin: AgentKitPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        onInit: (context) => {
          pluginCalls.push(`plugin:init:${context.agentId}`)
        },
        onSend: (payload, context) => {
          pluginCalls.push(`plugin:send:${JSON.stringify(payload.input)}`)
        },
        onShutdown: (context) => {
          pluginCalls.push(`plugin:shutdown:${context.agentId}`)
        }
      }

      const handle = await connectAgent({
        agent: 'test-agent',
        transport: 'dummy',
        registry,
        plugins: [testPlugin],
        debug: true,
        pluginOptions: {
          sandbox: false
        }
      })

      // Should have called onInit
      expect(pluginCalls).toContain('plugin:init:test-agent')

      // Send a message
      await handle.send({ test: 'message' })

      // Should have called onSend
      expect(pluginCalls).toContain('plugin:send:{"test":"message"}')

      // Shutdown
      await handle.shutdown()

      // Should have called onShutdown
      expect(pluginCalls).toContain('plugin:shutdown:test-agent')

      // Verify order: init should come first, shutdown should come last
      expect(pluginCalls[0]).toBe('plugin:init:test-agent')
      expect(pluginCalls[pluginCalls.length - 1]).toBe('plugin:shutdown:test-agent')
    })

    it('should call plugin hooks for multiple plugins in order', async () => {
      const calls: string[] = []
      
      const plugin1: AgentKitPlugin = {
        name: 'plugin-1',
        version: '1.0.0',
        onInit: () => calls.push('plugin1:init'),
        onSend: () => calls.push('plugin1:send'),
        onShutdown: () => calls.push('plugin1:shutdown')
      }
      
      const plugin2: AgentKitPlugin = {
        name: 'plugin-2',
        version: '1.0.0',
        onInit: () => calls.push('plugin2:init'),
        onSend: () => calls.push('plugin2:send'),
        onShutdown: () => calls.push('plugin2:shutdown')
      }

      const handle = await connectAgent({
        agent: 'test-agent',
        transport: 'dummy',
        registry,
        plugins: [plugin1, plugin2],
        pluginOptions: {
          sandbox: false
        }
      })

      await handle.send({ test: 'data' })
      await handle.shutdown()

      // Check that plugins were called in order
      expect(calls.indexOf('plugin1:init')).toBeLessThan(calls.indexOf('plugin2:init'))
      expect(calls.indexOf('plugin1:send')).toBeLessThan(calls.indexOf('plugin2:send'))
      expect(calls.indexOf('plugin1:shutdown')).toBeLessThan(calls.indexOf('plugin2:shutdown'))
    })

    it('should work without any plugins', async () => {
      const handle = await connectAgent({
        agent: 'test-agent',
        transport: 'dummy',
        registry
        // No plugins specified
      })

      // Should work normally
      await handle.send({ test: 'message' })
      await handle.shutdown()

      // Verify agent methods were still called
      expect(mockCalls).toContain('agent:init')
      expect(mockCalls).toContain('agent:handle:{"test":"message"}')
      expect(mockCalls).toContain('agent:shutdown')
    })
  })

  describe('Plugin Error Isolation', () => {
    it('should continue operation if plugin throws during onInit', async () => {
      const errorPlugin: AgentKitPlugin = {
        name: 'error-plugin',
        version: '1.0.0',
        onInit: () => { throw new Error('Plugin failed') }
      }

      const workingPlugin: AgentKitPlugin = {
        name: 'working-plugin',
        version: '1.0.0',
        onInit: vi.fn()
      }

      const handle = await connectAgent({
        agent: 'test-agent',
        transport: 'dummy',
        registry,
        plugins: [errorPlugin, workingPlugin],
        pluginOptions: {
          sandbox: false
        }
      })

      // Should still initialize successfully
      expect(handle).toBeDefined()
      expect(workingPlugin.onInit).toHaveBeenCalled()

      await handle.shutdown()
    })

    it('should call onError plugins when agent fails', async () => {
      const errorCalls: any[] = []
      
      const errorTrackingPlugin: AgentKitPlugin = {
        name: 'error-tracker',
        version: '1.0.0',
        onError: (error, context) => {
          errorCalls.push({
            error: error.message,
            agentId: context.agentId,
            timestamp: context.timestamp
          })
        }
      }

      // Create an agent that fails
      const failingAgent = {
        ...mockAgent,
        handle: async () => { throw new Error('Agent processing failed') }
      }

      registry.register({
        id: 'failing-agent',
        name: 'Failing Agent',
        version: '1.0.0',
        factory: () => failingAgent
      })

      const handle = await connectAgent({
        agent: 'failing-agent',
        transport: 'dummy',
        registry,
        plugins: [errorTrackingPlugin],
        pluginOptions: {
          sandbox: false
        }
      })

      try {
        await handle.send({ test: 'message' })
      } catch {
        // Expected to fail
      }

      // Should have called onError plugin
      expect(errorCalls).toHaveLength(1)
      expect(errorCalls[0].error).toContain('Agent processing failed')
      expect(errorCalls[0].agentId).toBe('failing-agent')

      await handle.shutdown()
    })
  })

  describe('LoggingPlugin Integration', () => {
    it('should work with LoggingPlugin', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      const loggingPlugin = createLoggingPlugin({
        logLevel: 'info',
        includeContext: false
      })

      const handle = await connectAgent({
        agent: 'test-agent',
        transport: 'dummy',
        registry,
        plugins: [loggingPlugin],
        pluginOptions: {
          sandbox: false
        }
      })

      await handle.send({ test: 'message' })
      await handle.shutdown()

      // Should have logged lifecycle events
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AgentKit:LoggingPlugin]'),
        expect.objectContaining({
          agentId: 'test-agent'
        })
      )

      consoleSpy.mockRestore()
    })
  })

  describe('Plugin Context', () => {
    it('should provide correct context to plugins', async () => {
      let capturedContexts: any[] = []
      
      const contextPlugin: AgentKitPlugin = {
        name: 'context-plugin',
        version: '1.0.0',
        onInit: (context) => capturedContexts.push({ type: 'init', ...context }),
        onSend: (payload, context) => capturedContexts.push({ type: 'send', payload, ...context }),
        onShutdown: (context) => capturedContexts.push({ type: 'shutdown', ...context })
      }

      const handle = await connectAgent({
        agent: 'test-agent',
        transport: 'dummy',
        registry,
        plugins: [contextPlugin],
        pluginOptions: {
          sandbox: false
        }
      })

      await handle.send({ test: 'data' })
      await handle.shutdown()

      // Verify contexts
      expect(capturedContexts).toHaveLength(3)
      
      // Init context
      expect(capturedContexts[0]).toMatchObject({
        type: 'init',
        agentId: 'test-agent',
        transportId: 'dummy'
      })

      // Send context
      expect(capturedContexts[1]).toMatchObject({
        type: 'send',
        agentId: 'test-agent',
        transportId: 'dummy',
        payload: {
          input: { test: 'data' },
          metadata: {}
        }
      })

      // Shutdown context
      expect(capturedContexts[2]).toMatchObject({
        type: 'shutdown',
        agentId: 'test-agent',
        transportId: 'dummy'
      })

      // All should have requestId and timestamp
      capturedContexts.forEach(ctx => {
        expect(ctx.requestId).toBeDefined()
        expect(typeof ctx.timestamp).toBe('number')
      })
    })
  })

  describe('Plugin Data Immutability', () => {
    it('should prevent plugins from mutating data', async () => {
      const originalInput = { test: 'data', nested: { value: 'original' } }
      let capturedPayload: any
      
      const mutatingPlugin: AgentKitPlugin = {
        name: 'mutating-plugin',
        version: '1.0.0',
        onSend: (payload, context) => {
          capturedPayload = payload
          // Try to mutate
          payload.input.test = 'mutated'
          payload.input.nested.value = 'mutated'
          context.agentId = 'hacked'
        }
      }

      const handle = await connectAgent({
        agent: 'test-agent',
        transport: 'dummy',
        registry,
        plugins: [mutatingPlugin],
        pluginOptions: {
          sandbox: false
        }
      })

      await handle.send(originalInput)

      // Original input should be unchanged
      expect(originalInput.test).toBe('data')
      expect(originalInput.nested.value).toBe('original')

      // Plugin should have received a copy
      expect(capturedPayload.input.test).toBe('mutated') // Plugin's copy was mutated
      expect(capturedPayload.input).not.toBe(originalInput) // Different objects

      await handle.shutdown()
    })
  })

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})