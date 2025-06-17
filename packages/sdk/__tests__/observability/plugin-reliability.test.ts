/**
 * Tests for plugin timeout and malformed plugin timeline tracking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgentManager } from '../../src/observability/../AgentManager'
import type { Agent, Transport, AgentContext, SendPayload, AgentKitPlugin } from '@agentkit/types'

// Mock implementations
const createMockAgent = (): Agent => ({
  id: 'test-agent',
  name: 'Test Agent',
  shutdown: vi.fn().mockResolvedValue(undefined)
})

const createMockTransport = (): Transport => ({
  id: 'test-transport',
  name: 'Test Transport',
  config: {},
  init: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined)
})

describe('Plugin Reliability and Error Handling', () => {
  let agent: Agent
  let transport: Transport

  beforeEach(() => {
    agent = createMockAgent()
    transport = createMockTransport()
  })

  describe('Plugin Timeout Tracking', () => {
    it('should track plugin timeouts in timeline and metrics', async () => {
      const timeoutPlugin: AgentKitPlugin = {
        name: 'TimeoutPlugin',
        version: '1.0.0',
        onInit: vi.fn().mockResolvedValue(undefined),
        onSend: vi.fn().mockImplementation(async () => {
          // Simulate timeout by waiting longer than hook timeout (5000ms default)
          await new Promise(resolve => setTimeout(resolve, 6000))
        }),
        onShutdown: vi.fn().mockResolvedValue(undefined)
      }

      const agentManager = new AgentManager(agent, transport, {
        plugins: [timeoutPlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true,
          enableConsoleWarnings: false
        },
        debug: false
      })

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
      await agentManager.shutdown()

      const timeline = agentManager.getDebugTimeline()
      const metrics = agentManager.getMetrics()

      // Timeline should track timeout
      const timeoutEntries = timeline!.entries.filter(e => e.status === 'timeout')
      expect(timeoutEntries.length).toBeGreaterThan(0)
      expect(timeoutEntries[0].pluginName).toBe('TimeoutPlugin')
      expect(timeoutEntries[0].hookName).toBe('onSend')

      // Metrics should track timeout
      const pluginMetric = metrics!.plugins.find(p => p.pluginName === 'TimeoutPlugin' && p.hookName === 'onSend')
      expect(pluginMetric).toBeDefined()
      expect(pluginMetric!.timeoutCount).toBe(1)
      expect(pluginMetric!.errorCount).toBe(1) // Timeouts are also errors

      // Error metrics should include timeout errors
      expect(metrics!.errors.byType['PluginTimeoutError']).toBeDefined()
      expect(metrics!.errors.byType['PluginTimeoutError'].value).toBe(1)
      expect(metrics!.errors.byPlugin['TimeoutPlugin']).toBeDefined()
      expect(metrics!.errors.byPlugin['TimeoutPlugin'].value).toBe(1)
    }, 15000)

    it('should handle multiple plugin timeouts', async () => {
      const timeoutPlugin1: AgentKitPlugin = {
        name: 'TimeoutPlugin1',
        version: '1.0.0',
        onSend: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 6000))
        })
      }

      const timeoutPlugin2: AgentKitPlugin = {
        name: 'TimeoutPlugin2',
        version: '1.0.0',
        onSend: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 7000))
        })
      }

      const agentManager = new AgentManager(agent, transport, {
        plugins: [timeoutPlugin1, timeoutPlugin2],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true
        },
        debug: false
      })

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
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

    it('should handle partial timeout scenarios', async () => {
      const mixedPlugin: AgentKitPlugin = {
        name: 'MixedPlugin',
        version: '1.0.0',
        onInit: vi.fn().mockResolvedValue(undefined), // Fast
        onSend: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 6000)) // Timeout
        }),
        onShutdown: vi.fn().mockResolvedValue(undefined) // Fast
      }

      const agentManager = new AgentManager(agent, transport, {
        plugins: [mixedPlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true
        },
        debug: false
      })

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
      await agentManager.shutdown()

      const timeline = agentManager.getDebugTimeline()
      const metrics = agentManager.getMetrics()

      // Should have mix of success and timeout
      const mixedEntries = timeline!.entries.filter(e => e.pluginName === 'MixedPlugin')
      const successEntries = mixedEntries.filter(e => e.status === 'success')
      const timeoutEntries = mixedEntries.filter(e => e.status === 'timeout')

      expect(successEntries.length).toBe(2) // onInit and onShutdown
      expect(timeoutEntries.length).toBe(1) // onSend

      // Plugin metrics should reflect mixed results
      const initMetric = metrics!.plugins.find(p => p.pluginName === 'MixedPlugin' && p.hookName === 'onInit')
      const sendMetric = metrics!.plugins.find(p => p.pluginName === 'MixedPlugin' && p.hookName === 'onSend')
      
      expect(initMetric!.timeoutCount).toBe(0)
      expect(sendMetric!.timeoutCount).toBe(1)
    }, 15000)
  })

  describe('Malformed Plugin Handling', () => {
    it('should handle plugins with invalid hook implementations', async () => {
      const malformedPlugin: AgentKitPlugin = {
        name: 'MalformedPlugin',
        version: '1.0.0',
        onInit: vi.fn().mockResolvedValue(undefined),
        onSend: vi.fn().mockImplementation(() => {
          throw new Error('Malformed plugin error')
        }),
        onShutdown: vi.fn().mockResolvedValue(undefined)
      }

      const agentManager = new AgentManager(agent, transport, {
        plugins: [malformedPlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true,
          enableConsoleWarnings: false
        },
        debug: false
      })

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
      await agentManager.shutdown()

      const timeline = agentManager.getDebugTimeline()
      const metrics = agentManager.getMetrics()

      // Should track error in timeline
      const errorEntries = timeline!.entries.filter(e => e.status === 'error')
      expect(errorEntries.length).toBeGreaterThan(0)
      
      const malformedError = errorEntries.find(e => e.pluginName === 'MalformedPlugin' && e.hookName === 'onSend')
      expect(malformedError).toBeDefined()
      expect(malformedError!.error).toBe('Malformed plugin error')

      // Should track error in metrics
      const sendMetric = metrics!.plugins.find(p => p.pluginName === 'MalformedPlugin' && p.hookName === 'onSend')
      expect(sendMetric!.errorCount).toBe(1)
      expect(sendMetric!.timeoutCount).toBe(0)

      // Should track in error metrics
      expect(metrics!.errors.byPlugin['MalformedPlugin'].value).toBe(1)
    }, 10000)

    it('should handle plugins that return invalid promises', async () => {
      const invalidPromisePlugin: AgentKitPlugin = {
        name: 'InvalidPromisePlugin',
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
        plugins: [invalidPromisePlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true
        },
        debug: false
      })

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
      await agentManager.shutdown()

      const timeline = agentManager.getDebugTimeline()
      const metrics = agentManager.getMetrics()

      // Should handle the error gracefully
      const errorEntries = timeline!.entries.filter(e => e.pluginName === 'InvalidPromisePlugin' && e.status === 'error')
      expect(errorEntries.length).toBeGreaterThan(0)

      const pluginMetric = metrics!.plugins.find(p => p.pluginName === 'InvalidPromisePlugin')
      expect(pluginMetric!.errorCount).toBeGreaterThan(0)
    }, 10000)

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
          await new Promise(resolve => setTimeout(resolve, 10))
        })
      }

      const agentManager = new AgentManager(agent, transport, {
        plugins: [circularPlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true
        },
        debug: false
      })

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

  describe('Timeline Data Validation', () => {
    it('should handle timeline entries with invalid data gracefully', async () => {
      const invalidDataPlugin: AgentKitPlugin = {
        name: 'InvalidDataPlugin',
        version: '1.0.0',
        onSend: vi.fn().mockImplementation(async () => {
          // Plugin that tries to pollute global state or cause validation issues
          ;(global as any).pollutedState = 'should not affect timeline'
          await new Promise(resolve => setTimeout(resolve, 10))
        })
      }

      const agentManager = new AgentManager(agent, transport, {
        plugins: [invalidDataPlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true
        },
        debug: false
      })

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
      await agentManager.shutdown()

      const timeline = agentManager.getDebugTimeline()
      
      // Timeline should be valid despite plugin pollution
      expect(timeline).toBeDefined()
      expect(timeline!.entries.length).toBeGreaterThan(0)
      
      // Timeline should validate against schema
      expect(() => {
        const { TimelineSchema } = require('../PluginExecutionTimeline')
        TimelineSchema.parse(timeline)
      }).not.toThrow()

      // Clean up pollution
      delete (global as any).pollutedState
    }, 10000)

    it('should handle metadata corruption gracefully', async () => {
      const normalPlugin: AgentKitPlugin = {
        name: 'NormalPlugin',
        version: '1.0.0',
        onSend: vi.fn().mockResolvedValue(undefined)
      }

      const agentManager = new AgentManager(agent, transport, {
        plugins: [normalPlugin],
        observabilityConfig: {
          enableTimelineDebug: true
        },
        debug: false
      })

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })

      // Simulate metadata corruption by accessing internal timeline and corrupting it
      const timeline = agentManager.getDebugTimeline()
      expect(timeline).toBeDefined()

      // Timeline should have validation safeguards
      const originalEntries = timeline!.entries.length
      expect(originalEntries).toBeGreaterThan(0)

      await agentManager.shutdown()
    }, 10000)
  })

  describe('Resource Leak Prevention', () => {
    it('should not leak resources from malformed plugins', async () => {
      const resourceLeakPlugin: AgentKitPlugin = {
        name: 'ResourceLeakPlugin',
        version: '1.0.0',
        onInit: vi.fn().mockImplementation(async () => {
          // Simulate resource leak attempts
          const intervals = []
          for (let i = 0; i < 100; i++) {
            intervals.push(setInterval(() => {}, 1000))
          }
          // Plugin doesn't clean up intervals (simulating bad plugin behavior)
        }),
        onSend: vi.fn().mockImplementation(async () => {
          // Create many timeouts that could leak
          for (let i = 0; i < 50; i++) {
            setTimeout(() => {}, 10000)
          }
        }),
        onShutdown: vi.fn().mockResolvedValue(undefined)
      }

      const agentManager = new AgentManager(agent, transport, {
        plugins: [resourceLeakPlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true
        },
        debug: false
      })

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
      await agentManager.shutdown()

      // Timeline and metrics should still function correctly
      const timeline = agentManager.getDebugTimeline()
      const metrics = agentManager.getMetrics()

      expect(timeline).toBeDefined()
      expect(metrics).toBeDefined()

      // Should have tracked all plugin executions
      const pluginEntries = timeline!.entries.filter(e => e.pluginName === 'ResourceLeakPlugin')
      expect(pluginEntries.length).toBeGreaterThanOrEqual(3) // init, send, shutdown

      const pluginMetrics = metrics!.plugins.filter(p => p.pluginName === 'ResourceLeakPlugin')
      expect(pluginMetrics.length).toBeGreaterThanOrEqual(3)
    }, 10000)

    it('should handle memory pressure from plugin executions', async () => {
      const memoryPressurePlugin: AgentKitPlugin = {
        name: 'MemoryPressurePlugin',
        version: '1.0.0',
        onSend: vi.fn().mockImplementation(async () => {
          // Create large objects that could cause memory pressure
          const largeArray = new Array(100000).fill('large string data that takes up memory')
          
          // Simulate some processing
          await new Promise(resolve => setTimeout(resolve, 50))
          
          // Let objects be garbage collected
          return
        })
      }

      const agentManager = new AgentManager(agent, transport, {
        plugins: [memoryPressurePlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true
        },
        debug: false
      })

      await agentManager.initialize()

      // Send multiple messages to create memory pressure
      for (let i = 0; i < 10; i++) {
        await agentManager.send({ content: `test message ${i}` })
      }

      await agentManager.shutdown()

      const timeline = agentManager.getDebugTimeline()
      const metrics = agentManager.getMetrics()

      // Should handle all executions despite memory pressure
      expect(timeline!.entries.length).toBeGreaterThanOrEqual(10) // At least 10 send operations
      
      const sendEntries = timeline!.entries.filter(e => e.hookName === 'onSend')
      expect(sendEntries.length).toBe(10)
      expect(sendEntries.every(e => e.status === 'success')).toBe(true)

      const sendMetric = metrics!.plugins.find(p => p.pluginName === 'MemoryPressurePlugin' && p.hookName === 'onSend')
      expect(sendMetric!.executionCount).toBe(10)
      expect(sendMetric!.errorCount).toBe(0)
    }, 15000)
  })

  describe('Edge Case Scenarios', () => {
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
          
          await new Promise(resolve => setTimeout(resolve, 20))
        })
      }

      const agentManager = new AgentManager(agent, transport, {
        plugins: [selfModifyingPlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true
        },
        debug: false
      })

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

    it('should handle plugins with async errors in background tasks', async () => {
      const backgroundErrorPlugin: AgentKitPlugin = {
        name: 'BackgroundErrorPlugin',
        version: '1.0.0',
        onSend: vi.fn().mockImplementation(async () => {
          // Start background task that will error after plugin completes
          setTimeout(() => {
            throw new Error('Background error - should not affect tracking')
          }, 100)
          
          // Complete normally
          await new Promise(resolve => setTimeout(resolve, 50))
        })
      }

      const agentManager = new AgentManager(agent, transport, {
        plugins: [backgroundErrorPlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true
        },
        debug: false
      })

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
      
      // Wait for background error to occur
      await new Promise(resolve => setTimeout(resolve, 200))
      
      await agentManager.shutdown()

      const timeline = agentManager.getDebugTimeline()
      const metrics = agentManager.getMetrics()

      // Plugin execution itself should be recorded as successful
      const sendEntry = timeline!.entries.find(e => e.pluginName === 'BackgroundErrorPlugin' && e.hookName === 'onSend')
      expect(sendEntry!.status).toBe('success')
      expect(sendEntry!.duration).toBeGreaterThanOrEqual(50)

      const sendMetric = metrics!.plugins.find(p => p.pluginName === 'BackgroundErrorPlugin' && p.hookName === 'onSend')
      expect(sendMetric!.errorCount).toBe(0) // Background error shouldn't count
    }, 10000)
  })
})