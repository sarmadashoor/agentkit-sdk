/**
 * Legacy tests for plugin reliability features that are incompatible with sandboxed execution
 * 
 * These tests have been moved here because they rely on sandbox-incompatible patterns:
 * - Plugin self-modification (this.modified = true)
 * - Circular reference handling
 * - Global state pollution from within plugins
 * - Mock function interactions with sandbox
 * - Fake timer coordination
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { AgentManager } from '../../src/AgentManager'
import type { Agent, Transport, AgentContext, SendPayload, AgentKitPlugin } from '@agentkit/types'
import { cleanupAllResources, flushPromises } from '../test-utils'

// Mock implementations
const createMockAgent = (): Agent => ({
  id: 'test-agent',
  name: 'Test Agent',
  init: vi.fn().mockResolvedValue(undefined),
  handle: vi.fn().mockResolvedValue({ data: 'mock response' }),
  shutdown: vi.fn().mockResolvedValue(undefined)
})

const createMockTransport = (): Transport => ({
  id: 'test-transport',
  name: 'Test Transport',
  config: {},
  init: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined),
  receive: vi.fn().mockResolvedValue({ content: null, metadata: {} }),
  canAcceptMore: vi.fn().mockReturnValue(true)
})

describe.skip('Plugin Reliability Legacy Tests', () => {
  let agent: Agent
  let transport: Transport

  beforeEach(() => {
    vi.useFakeTimers()
    agent = createMockAgent()
    transport = createMockTransport()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ❌ Skipped due to sandbox-incompatible plugin patterns (circular references)
  describe.skip('Circular Reference Handling', () => {
    it('should handle plugins with circular reference issues', async () => {
      const circularPlugin: AgentKitPlugin = {
        name: 'CircularPlugin',
        version: '1.0.0',
        onSend: vi.fn().mockImplementation(async (payload: SendPayload, context: AgentContext) => {
          // Create circular reference that could break serialization
          const circular: any = { self: null }
          circular.self = circular
          
          // Try to modify the context with circular data (should be prevented by immutable copies)
          ;(context as any).circular = circular
          
          // Plugin should still complete successfully
          await new Promise(resolve => setTimeout(resolve, 10).unref())
        })
      }

      const agentManager = new AgentManager(agent, transport, {
        plugins: [circularPlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true
        },
        debug: false
      }, [], 'circular-test')

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
      await agentManager.shutdown()

      const timeline = agentManager.getDebugTimeline()
      const metrics = agentManager.getMetrics()

      // Plugin should still execute successfully despite circular references
      const circularEntries = timeline!.entries.filter(e => e.pluginName === 'CircularPlugin')
      expect(circularEntries.length).toBeGreaterThan(0)
      expect(circularEntries[0].status).toBe('success')

      const pluginMetric = metrics!.plugins.find(p => p.pluginName === 'CircularPlugin')
      expect(pluginMetric!.executionCount).toBe(1)
      expect(pluginMetric!.errorCount).toBe(0)
    }, 10000)
  })

  // ❌ Skipped due to sandbox-incompatible plugin patterns (self-modification)
  describe.skip('Self-Modifying Plugin Behavior', () => {
    it('should handle plugins that modify their own execution context', async () => {
      const selfModifyingPlugin: AgentKitPlugin = {
        name: 'SelfModifyingPlugin',
        version: '1.0.0',
        onSend: vi.fn().mockImplementation(async function(this: any, payload: SendPayload, context: AgentContext) {
          // Try to modify plugin itself
          this.modified = true
          this.onSend = vi.fn() // Try to replace own hook
          
          // Try to modify context
          ;(context as any).modified = true
          
          await new Promise(resolve => setTimeout(resolve, 20).unref())
        })
      }

      const agentManager = new AgentManager(agent, transport, {
        plugins: [selfModifyingPlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true
        },
        debug: false
      }, [], 'self-modifying-test')

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
      await agentManager.shutdown()

      const timeline = agentManager.getDebugTimeline()
      const metrics = agentManager.getMetrics()

      // Should still track execution successfully
      const pluginEntries = timeline!.entries.filter(e => e.pluginName === 'SelfModifyingPlugin')
      expect(pluginEntries.length).toBeGreaterThan(0)
      
      const sendEntry = pluginEntries.find(e => e.hookName === 'onSend')
      expect(sendEntry!.status).toBe('success')
      expect(sendEntry!.duration).toBeGreaterThanOrEqual(20)

      const sendMetric = metrics!.plugins.find(p => p.pluginName === 'SelfModifyingPlugin' && p.hookName === 'onSend')
      expect(sendMetric!.executionCount).toBe(1)
      expect(sendMetric!.errorCount).toBe(0)
    }, 10000)
  })

  // ❌ Skipped due to sandbox-incompatible plugin patterns (global pollution)
  describe.skip('Global State Pollution', () => {
    it('should handle timeline entries with global pollution attempts', async () => {
      const globalPollutionPlugin: AgentKitPlugin = {
        name: 'GlobalPollutionPlugin',
        version: '1.0.0',
        onSend: vi.fn().mockImplementation(async () => {
          // Plugin that tries to pollute global state
          ;(global as any).pollutedState = 'should not affect timeline'
          await new Promise(resolve => setTimeout(resolve, 10).unref())
        })
      }

      const agentManager = new AgentManager(agent, transport, {
        plugins: [globalPollutionPlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true
        },
        debug: false
      }, [], 'global-pollution-test')

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
      await agentManager.shutdown()

      const timeline = agentManager.getDebugTimeline()
      
      // Timeline should be valid despite plugin pollution
      expect(timeline).toBeDefined()
      expect(timeline!.entries.length).toBeGreaterThan(0)
      
      // Verify global pollution actually occurred (not possible in sandbox)
      expect((global as any).pollutedState).toBe('should not affect timeline')

      // Clean up pollution
      delete (global as any).pollutedState
    }, 10000)
  })

  // ❌ Skipped due to fake timer coordination issues with sandbox
  describe.skip('Fake Timer Coordination', () => {
    it('should handle multiple plugin timeouts with fake timers', async () => {
      const timeoutPlugin1: AgentKitPlugin = {
        name: 'TimeoutPlugin1',
        version: '1.0.0',
        onSend: vi.fn().mockImplementation(async () => {
          // Create a Promise-based timeout that works with fake timers
          await new Promise(resolve => setTimeout(resolve, 6000).unref())
        })
      }

      const timeoutPlugin2: AgentKitPlugin = {
        name: 'TimeoutPlugin2',
        version: '1.0.0',
        onSend: vi.fn().mockImplementation(async () => {
          // Create a Promise-based timeout that works with fake timers
          await new Promise(resolve => setTimeout(resolve, 7000).unref())
        })
      }

      const agentManager = new AgentManager(agent, transport, {
        plugins: [timeoutPlugin1, timeoutPlugin2],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true
        },
        debug: false
      }, [], 'multiple-timeout-test')

      await agentManager.initialize()
      
      // Start the send operation and advance timers to trigger timeouts
      const sendPromise = agentManager.send({ content: 'test message' })
      vi.advanceTimersByTime(8000) // Advance past both timeout periods
      await sendPromise
      
      await agentManager.shutdown()

      const timeline = agentManager.getDebugTimeline()
      const metrics = agentManager.getMetrics()

      // Both plugins should have timeout entries
      const timeoutEntries = timeline!.entries.filter(e => e.status === 'timeout')
      expect(timeoutEntries.length).toBe(2)

      const plugin1Timeout = timeoutEntries.find(e => e.pluginName === 'TimeoutPlugin1')
      const plugin2Timeout = timeoutEntries.find(e => e.pluginName === 'TimeoutPlugin2')

      expect(plugin1Timeout).toBeDefined()
      expect(plugin2Timeout).toBeDefined()

      // Metrics should track both timeouts
      expect(metrics!.errors.byType['PluginTimeoutError'].value).toBe(2)
      expect(metrics!.errors.byPlugin['TimeoutPlugin1'].value).toBe(1)
      expect(metrics!.errors.byPlugin['TimeoutPlugin2'].value).toBe(1)
    }, 20000)
  })

  // ❌ Skipped due to mock function interaction with sandbox
  describe.skip('Mock Function Interactions', () => {
    it('should handle complex mock implementations in sandbox', async () => {
      const complexMockPlugin: AgentKitPlugin = {
        name: 'ComplexMockPlugin',
        version: '1.0.0',
        onSend: vi.fn().mockImplementation(() => {
          // Return a non-promise that has a then method (promise-like but invalid)
          return {
            then: () => {
              throw new Error('Invalid promise-like object')
            }
          }
        })
      }

      const agentManager = new AgentManager(agent, transport, {
        plugins: [complexMockPlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true
        },
        debug: false
      }, [], 'complex-mock-test')

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
      await agentManager.shutdown()

      const timeline = agentManager.getDebugTimeline()
      const metrics = agentManager.getMetrics()

      // Should handle the mock interaction gracefully
      const errorEntries = timeline!.entries.filter(e => e.pluginName === 'ComplexMockPlugin' && e.status === 'error')
      expect(errorEntries.length).toBeGreaterThan(0)

      const pluginMetric = metrics!.plugins.find(p => p.pluginName === 'ComplexMockPlugin')
      expect(pluginMetric!.errorCount).toBeGreaterThan(0)
    }, 10000)
  })

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})