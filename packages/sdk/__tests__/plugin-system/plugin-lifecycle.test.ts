import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest'
import { AgentRegistry } from '@agentkit/registry'
import { DummyTransport } from '@agentkit/transports-dummy'
import { connectAgent } from '../../src/index'
import { AgentKitPlugin } from '../../src/plugins'
import { createTestAgent } from '@agentkit/test-agent'
import { 
  runPluginTest, 
  createObservablePlugin, 
  extractPluginLifecycleEvents,
  type PluginTestOptions 
} from './utils'

describe('Plugin Lifecycle Integration (Sandbox-Compatible)', () => {
  let registry: AgentRegistry
  let transport: DummyTransport

  beforeEach(() => {
    registry = new AgentRegistry()
    transport = new DummyTransport({ debug: false, logMessages: true })

    // Register test agent
    registry.register({
      id: 'test-agent',
      name: 'Test Agent',
      version: '1.0.0',
      factory: () => createTestAgent()
    })

    registry.registerTransport(transport)
  })

  afterEach(() => {
    // Clean up any resources if needed
  })

  describe('Plugin Hook Execution Order', () => {
    it('calls onInit/onSend/onShutdown in order', async () => {
      const plugin = createObservablePlugin('lifecycle-test', {
        onInit: 'INIT_MARKER',
        onSend: 'SEND_MARKER', 
        onShutdown: 'SHUTDOWN_MARKER'
      })

      const result = await runPluginTest({
        plugin,
        handleInput: { test: 'lifecycle-order' },
        agentId: 'test-agent'
      })

      // Extract lifecycle events from captured logs
      const events = extractPluginLifecycleEvents(result.logs)

      // Verify all hooks were called
      expect(events.init).toHaveLength(1)
      expect(events.send).toHaveLength(1)
      expect(events.shutdown).toHaveLength(1)

      // Verify correct order and content
      expect(events.init[0]).toContain('lifecycle-test:onInit:INIT_MARKER:test-agent')
      expect(events.send[0]).toContain('lifecycle-test:onSend:SEND_MARKER')
      expect(events.shutdown[0]).toContain('lifecycle-test:onShutdown:SHUTDOWN_MARKER:test-agent')

      // Verify chronological order (init should be first, shutdown should be last)
      const allLogs = result.logs.filter(log => log.includes('PLUGIN_LIFECYCLE:lifecycle-test:'))
      expect(allLogs[0]).toContain(':onInit:')
      expect(allLogs[allLogs.length - 1]).toContain(':onShutdown:')
    })

    it('handles plugin without all hooks gracefully', async () => {
      const partialPlugin = createObservablePlugin('partial-test', {
        onInit: 'INIT_ONLY'
        // No onSend or onShutdown
      })

      const result = await runPluginTest({
        plugin: partialPlugin,
        handleInput: { test: 'partial-hooks' },
        agentId: 'test-agent'
      })

      const events = extractPluginLifecycleEvents(result.logs)

      // Should only have init event
      expect(events.init).toHaveLength(1)
      expect(events.send).toHaveLength(0)
      expect(events.shutdown).toHaveLength(0)
      expect(events.init[0]).toContain('partial-test:onInit:INIT_ONLY')
    })
  })

  describe('Multiple Plugin Coordination', () => {
    it('executes multiple plugins in registration order', async () => {
      const plugin1 = createObservablePlugin('plugin-1', {
        onInit: 'P1_INIT',
        onSend: 'P1_SEND',
        onShutdown: 'P1_SHUTDOWN'
      })

      const plugin2 = createObservablePlugin('plugin-2', {
        onInit: 'P2_INIT', 
        onSend: 'P2_SEND',
        onShutdown: 'P2_SHUTDOWN'
      })

      // Set up console log capture BEFORE connectAgent to catch onInit hooks
      const logs: string[] = []
      const originalConsoleLog = console.log
      console.log = (...args) => {
        logs.push(`LOG: ${args.join(' ')}`)
        originalConsoleLog(...args)
      }

      // Test with multiple plugins via direct connectAgent usage
      const handle = await connectAgent({
        agent: 'test-agent',
        transport: 'dummy',
        registry,
        plugins: [plugin1, plugin2],
        debug: true
      })

      try {
        await handle.send({ test: 'multi-plugin' })
        await handle.shutdown()

        const events = extractPluginLifecycleEvents(logs)

        // Both plugins should execute all hooks
        expect(events.init).toHaveLength(2)
        expect(events.send).toHaveLength(2)
        expect(events.shutdown).toHaveLength(2)

        // Verify execution order: plugin-1 should come before plugin-2
        const initLogs = events.init
        expect(initLogs[0]).toContain('plugin-1:onInit')
        expect(initLogs[1]).toContain('plugin-2:onInit')

        const sendLogs = events.send
        expect(sendLogs[0]).toContain('plugin-1:onSend')
        expect(sendLogs[1]).toContain('plugin-2:onSend')

        const shutdownLogs = events.shutdown
        expect(shutdownLogs[0]).toContain('plugin-1:onShutdown')
        expect(shutdownLogs[1]).toContain('plugin-2:onShutdown')

      } finally {
        console.log = originalConsoleLog
      }
    })
  })

  describe('Plugin Error Isolation', () => {
    it('continues operation when plugin hook throws error', async () => {
      const errorPlugin: AgentKitPlugin = {
        name: 'error-plugin',
        version: '1.0.0',
        onInit: () => {
          console.log('PLUGIN_LIFECYCLE:error-plugin:onInit:BEFORE_ERROR')
          throw new Error('Plugin initialization failed')
        }
      }

      const workingPlugin = createObservablePlugin('working-plugin', {
        onInit: 'WORKING_INIT'
      })

      // Set up console log capture BEFORE connectAgent to catch onInit hooks
      const logs: string[] = []
      const originalConsoleLog = console.log
      console.log = (...args) => {
        logs.push(`LOG: ${args.join(' ')}`)
        originalConsoleLog(...args)
      }

      // Test both plugins together
      const handle = await connectAgent({
        agent: 'test-agent',
        transport: 'dummy',
        registry,
        plugins: [errorPlugin, workingPlugin],
        debug: true
      })

      try {
        await handle.shutdown()

        const events = extractPluginLifecycleEvents(logs)

        // Working plugin should still execute despite error plugin failure
        const workingInitEvents = events.init.filter(log => log.includes('working-plugin'))
        expect(workingInitEvents).toHaveLength(1)
        expect(workingInitEvents[0]).toContain('working-plugin:onInit:WORKING_INIT')

        // Error plugin should have started but failed
        const errorInitEvents = logs.filter(log => log.includes('error-plugin:onInit:BEFORE_ERROR'))
        expect(errorInitEvents).toHaveLength(1)

      } finally {
        console.log = originalConsoleLog
      }
    })
  })

  describe('Plugin Context Verification', () => {
    it('provides correct agent and transport context to plugins', async () => {
      const contextPlugin: AgentKitPlugin = {
        name: 'context-test',
        version: '1.0.0',
        onInit: (context) => {
          console.log(`PLUGIN_LIFECYCLE:context-test:onInit:CONTEXT:${JSON.stringify({
            agentId: context.agentId,
            transportId: context.transportId,
            hasRequestId: !!context.requestId,
            hasTimestamp: typeof context.timestamp === 'number'
          })}`)
        },
        onSend: (payload, context) => {
          console.log(`PLUGIN_LIFECYCLE:context-test:onSend:PAYLOAD:${JSON.stringify({
            hasInput: !!payload.input,
            hasMetadata: !!payload.metadata,
            agentId: context.agentId,
            transportId: context.transportId
          })}`)
        }
      }

      const result = await runPluginTest({
        plugin: contextPlugin,
        handleInput: { test: 'context-check' },
        agentId: 'test-agent'
      })

      // Verify context information in logs
      const contextLogs = result.logs.filter(log => log.includes('CONTEXT:') || log.includes('PAYLOAD:'))
      expect(contextLogs).toHaveLength(2)

      // Check init context
      const initContextLog = contextLogs.find(log => log.includes('CONTEXT:'))
      expect(initContextLog).toBeDefined()
      expect(initContextLog).toContain('agentId":"test-agent')
      expect(initContextLog).toContain('transportId":"dummy')
      expect(initContextLog).toContain('hasRequestId":true')
      expect(initContextLog).toContain('hasTimestamp":true')

      // Check send context  
      const sendContextLog = contextLogs.find(log => log.includes('PAYLOAD:'))
      expect(sendContextLog).toBeDefined()
      expect(sendContextLog).toContain('hasInput":true')
      expect(sendContextLog).toContain('hasMetadata":true')
      expect(sendContextLog).toContain('agentId":"test-agent')
    })
  })

  describe('No Plugin Scenario', () => {
    it('works normally without any plugins', async () => {
      const result = await runPluginTest({
        plugin: null as any, // No plugin
        handleInput: { test: 'no-plugins' },
        agentId: 'test-agent',
        connectOptions: { plugins: [] }
      })

      // Should not have any plugin lifecycle events
      const events = extractPluginLifecycleEvents(result.logs)
      expect(events.init).toHaveLength(0)
      expect(events.send).toHaveLength(0) 
      expect(events.shutdown).toHaveLength(0)

      // But should have processed the input successfully (response is handled by transport)
      expect(result.errors).toHaveLength(0)
      // Verify the transport received and processed the message
      expect(result.transportMessages).toHaveLength(1)
    })
  })

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})