/**
 * Integration tests for observability features across multiple plugins
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgentManager } from '../../src/observability/../AgentManager'
import { MetricsCollector } from '../../src/observability/MetricsCollector'
import { PluginExecutionTimeline } from '../../src/observability/PluginExecutionTimeline'
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

// Test plugins with different behaviors
const createFastPlugin = (): AgentKitPlugin => ({
  name: 'FastPlugin',
  version: '1.0.0',
  onInit: vi.fn().mockImplementation(async (context: AgentContext) => {
    await new Promise(resolve => setTimeout(resolve, 10))
  }),
  onSend: vi.fn().mockImplementation(async (payload: SendPayload, context: AgentContext) => {
    await new Promise(resolve => setTimeout(resolve, 15))
  }),
  onShutdown: vi.fn().mockImplementation(async (context: AgentContext) => {
    await new Promise(resolve => setTimeout(resolve, 5))
  })
})

const createSlowPlugin = (): AgentKitPlugin => ({
  name: 'SlowPlugin',
  version: '1.0.0',
  onInit: vi.fn().mockImplementation(async (context: AgentContext) => {
    await new Promise(resolve => setTimeout(resolve, 80))
  }),
  onSend: vi.fn().mockImplementation(async (payload: SendPayload, context: AgentContext) => {
    await new Promise(resolve => setTimeout(resolve, 120))
  }),
  onShutdown: vi.fn().mockImplementation(async (context: AgentContext) => {
    await new Promise(resolve => setTimeout(resolve, 60))
  })
})

const createErrorPlugin = (): AgentKitPlugin => ({
  name: 'ErrorPlugin',
  version: '1.0.0',
  onInit: vi.fn().mockResolvedValue(undefined),
  onSend: vi.fn().mockRejectedValue(new Error('Send failed')),
  onShutdown: vi.fn().mockResolvedValue(undefined)
})

const createTimeoutPlugin = (): AgentKitPlugin => ({
  name: 'TimeoutPlugin',
  version: '1.0.0',
  onInit: jest.fn().mockResolvedValue(undefined),
  onSend: vi.fn().mockImplementation(async () => {
    // Simulate timeout by waiting longer than hook timeout
    await new Promise(resolve => setTimeout(resolve, 6000))
  }),
  onShutdown: jest.fn().mockResolvedValue(undefined)
})

describe('Observability Integration Tests', () => {
  let agent: Agent
  let transport: Transport
  let fastPlugin: AgentKitPlugin
  let slowPlugin: AgentKitPlugin
  let errorPlugin: AgentKitPlugin
  let timeoutPlugin: AgentKitPlugin

  beforeEach(() => {
    agent = createMockAgent()
    transport = createMockTransport()
    fastPlugin = createFastPlugin()
    slowPlugin = createSlowPlugin()
    errorPlugin = createErrorPlugin()
    timeoutPlugin = createTimeoutPlugin()
  })

  describe('Multi-Plugin Timeline Tracking', () => {
    it('should track execution timeline across multiple plugins', async () => {
      const agentManager = new AgentManager(agent, transport, {
        plugins: [fastPlugin, slowPlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true,
          performanceThreshold: 50
        },
        debug: false
      })

      await agentManager.initialize()
      
      const timeline = agentManager.getDebugTimeline()
      expect(timeline).toBeDefined()
      
      // Should have entries for both plugins' onInit hooks
      expect(timeline!.entries.length).toBeGreaterThanOrEqual(2)
      
      const fastPluginEntries = timeline!.entries.filter(e => e.pluginName === 'FastPlugin')
      const slowPluginEntries = timeline!.entries.filter(e => e.pluginName === 'SlowPlugin')
      
      expect(fastPluginEntries.length).toBeGreaterThanOrEqual(1)
      expect(slowPluginEntries.length).toBeGreaterThanOrEqual(1)
      
      // Verify timeline ordering
      const initEntries = timeline!.entries.filter(e => e.hookName === 'onInit')
      expect(initEntries).toHaveLength(2)
      
      await agentManager.shutdown()
    }, 10000)

    it('should track performance differences between plugins', async () => {
      const agentManager = new AgentManager(agent, transport, {
        plugins: [fastPlugin, slowPlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          performanceThreshold: 50,
          enableConsoleWarnings: false
        },
        debug: false
      })

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
      await agentManager.shutdown()
      
      const performanceStats = agentManager.getPerformanceStats()
      expect(performanceStats).toBeDefined()
      
      expect(performanceStats!.totalPlugins).toBe(2)
      expect(performanceStats!.averageDurationByPlugin['FastPlugin']).toBeLessThan(
        performanceStats!.averageDurationByPlugin['SlowPlugin']
      )
      
      // SlowPlugin should have threshold violations
      const violations = performanceStats!.thresholdViolations
      expect(violations.length).toBeGreaterThan(0)
      expect(violations.some(v => v.plugin === 'SlowPlugin')).toBe(true)
    }, 15000)

    it('should maintain timeline consistency during concurrent operations', async () => {
      const agentManager = new AgentManager(agent, transport, {
        plugins: [fastPlugin, slowPlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true
        },
        debug: false
      })

      await agentManager.initialize()
      
      // Send multiple messages concurrently
      const sendPromises = Array.from({ length: 3 }, (_, i) => 
        agentManager.send({ content: `test message ${i}` })
      )
      
      await Promise.all(sendPromises)
      await agentManager.shutdown()
      
      const timeline = agentManager.getDebugTimeline()
      expect(timeline).toBeDefined()
      
      // Should have multiple send operations recorded
      const sendEntries = timeline!.entries.filter(e => e.hookName === 'onSend')
      expect(sendEntries.length).toBeGreaterThanOrEqual(6) // 3 sends × 2 plugins
      
      // All entries should have valid durations
      expect(sendEntries.every(e => e.duration !== undefined && e.duration >= 0)).toBe(true)
    }, 15000)
  })

  describe('Error and Timeout Handling', () => {
    it('should track plugin errors in timeline and metrics', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      const agentManager = new AgentManager(agent, transport, {
        plugins: [fastPlugin, errorPlugin],
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
      
      // Timeline should show error entries
      const errorEntries = timeline!.entries.filter(e => e.status === 'error')
      expect(errorEntries.length).toBeGreaterThan(0)
      expect(errorEntries.some(e => e.pluginName === 'ErrorPlugin')).toBe(true)
      
      // Metrics should track plugin errors
      const errorPlugin = metrics!.plugins.find(p => p.pluginName === 'ErrorPlugin')
      expect(errorPlugin).toBeDefined()
      expect(errorPlugin!.errorCount).toBeGreaterThan(0)
      
      // Error metrics should be recorded
      expect(metrics!.errors.byPlugin['ErrorPlugin']).toBeDefined()
      expect(metrics!.errors.byPlugin['ErrorPlugin'].value).toBeGreaterThan(0)
      
      consoleSpy.mockRestore()
    }, 10000)

    it('should handle plugin timeouts correctly', async () => {
      const agentManager = new AgentManager(agent, transport, {
        plugins: [fastPlugin, timeoutPlugin],
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
      
      // Timeline should show timeout entries
      const timeoutEntries = timeline!.entries.filter(e => e.status === 'timeout')
      expect(timeoutEntries.length).toBeGreaterThan(0)
      
      // Metrics should track timeouts
      const timeoutPluginMetrics = metrics!.plugins.find(p => p.pluginName === 'TimeoutPlugin')
      expect(timeoutPluginMetrics).toBeDefined()
      expect(timeoutPluginMetrics!.timeoutCount).toBeGreaterThan(0)
      
      // Should record timeout errors
      expect(metrics!.errors.byType['PluginTimeoutError']).toBeDefined()
      expect(metrics!.errors.byType['PluginTimeoutError'].value).toBeGreaterThan(0)
    }, 15000)
  })

  describe('Metrics Collection Integration', () => {
    it('should collect comprehensive metrics across plugin lifecycle', async () => {
      const agentManager = new AgentManager(agent, transport, {
        plugins: [fastPlugin, slowPlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true
        },
        debug: false
      })

      const startTime = Date.now()
      
      await agentManager.initialize()
      await agentManager.send({ content: 'test message 1' })
      await agentManager.send({ content: 'test message 2' })
      await agentManager.shutdown()
      
      const endTime = Date.now()
      const metrics = agentManager.getMetrics()
      
      expect(metrics).toBeDefined()
      
      // SDK-level metrics
      expect(metrics!.sdk.totalRequests.value).toBe(2)
      expect(metrics!.sdk.initLatency.count).toBe(1)
      expect(metrics!.sdk.sendLatency.count).toBe(2)
      expect(metrics!.sdk.shutdownLatency.count).toBe(1)
      
      // Plugin metrics for both plugins
      expect(metrics!.plugins.length).toBeGreaterThanOrEqual(6) // 2 plugins × 3 hooks minimum
      
      const fastPluginMetrics = metrics!.plugins.filter(p => p.pluginName === 'FastPlugin')
      const slowPluginMetrics = metrics!.plugins.filter(p => p.pluginName === 'SlowPlugin')
      
      expect(fastPluginMetrics.length).toBeGreaterThanOrEqual(3) // init, send, shutdown
      expect(slowPluginMetrics.length).toBeGreaterThanOrEqual(3)
      
      // Verify execution counts
      const fastSendMetric = fastPluginMetrics.find(m => m.hookName === 'onSend')
      expect(fastSendMetric?.executionCount).toBe(2)
      
      // Uptime should be reasonable
      const uptimeSeconds = (endTime - startTime) / 1000
      expect(metrics!.sdk.uptime.value).toBeGreaterThanOrEqual(uptimeSeconds - 1)
      expect(metrics!.sdk.uptime.value).toBeLessThanOrEqual(uptimeSeconds + 1)
    }, 15000)

    it('should generate valid Prometheus export', async () => {
      const agentManager = new AgentManager(agent, transport, {
        plugins: [fastPlugin, slowPlugin],
        observabilityConfig: {
          enableMetricsCollection: true
        },
        debug: false
      })

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
      await agentManager.shutdown()
      
      const prometheusExport = agentManager.exportPrometheusMetrics()
      
      expect(prometheusExport).toBeTruthy()
      expect(prometheusExport.length).toBeGreaterThan(0)
      
      // Should contain standard Prometheus formatting
      expect(prometheusExport).toContain('# HELP')
      expect(prometheusExport).toContain('# TYPE')
      expect(prometheusExport).toContain('agentkit_')
      
      // Should contain SDK metrics
      expect(prometheusExport).toContain('agentkit_requests_total')
      expect(prometheusExport).toContain('agentkit_init_latency_seconds')
      expect(prometheusExport).toContain('agentkit_send_latency_seconds')
      
      // Should contain plugin metrics
      expect(prometheusExport).toContain('agentkit_plugin_executions_total')
      expect(prometheusExport).toContain('plugin="FastPlugin"')
      expect(prometheusExport).toContain('plugin="SlowPlugin"')
      
      // Should contain histogram buckets
      expect(prometheusExport).toContain('_bucket{')
      expect(prometheusExport).toContain('le="')
      expect(prometheusExport).toContain('_count')
      expect(prometheusExport).toContain('_sum')
    }, 15000)
  })

  describe('Debug Mode Features', () => {
    it('should expose timeline globally in debug mode', async () => {
      // Mock window object for browser environment
      const mockWindow = { __AGENTKIT_TIMELINE__: undefined }
      ;(global as any).window = mockWindow
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      const agentManager = new AgentManager(agent, transport, {
        plugins: [fastPlugin],
        enableDebugMode: true,
        observabilityConfig: {
          enableTimelineDebug: true
        },
        debug: false
      })

      await agentManager.initialize()
      
      expect(mockWindow.__AGENTKIT_TIMELINE__).toBeDefined()
      expect(typeof mockWindow.__AGENTKIT_TIMELINE__.printTimeline).toBe('function')
      expect(consoleSpy).toHaveBeenCalledWith('🔍 AgentKit Timeline exposed as window.__AGENTKIT_TIMELINE__')
      
      await agentManager.shutdown()
      
      consoleSpy.mockRestore()
      delete (global as any).window
    }, 10000)

    it('should provide console debugging capabilities', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {})
      
      const agentManager = new AgentManager(agent, transport, {
        plugins: [fastPlugin, slowPlugin],
        observabilityConfig: {
          enableTimelineDebug: true
        },
        debug: false
      })

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
      
      // Test console.table output
      agentManager.printTimeline()
      
      expect(tableSpy).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith('📊 Plugin Execution Timeline:')
      
      await agentManager.shutdown()
      
      consoleSpy.mockRestore()
      tableSpy.mockRestore()
    }, 10000)
  })

  describe('Performance Warning Integration', () => {
    it('should warn about slow plugins when enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const agentManager = new AgentManager(agent, transport, {
        plugins: [fastPlugin, slowPlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          performanceThreshold: 30,
          enableConsoleWarnings: true
        },
        debug: false
      })

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
      await agentManager.shutdown()
      
      // Should have warnings for SlowPlugin
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Plugin performance warning: SlowPlugin')
      )
      
      consoleSpy.mockRestore()
    }, 15000)

    it('should not warn when console warnings are disabled', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const agentManager = new AgentManager(agent, transport, {
        plugins: [slowPlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          performanceThreshold: 30,
          enableConsoleWarnings: false
        },
        debug: false
      })

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
      await agentManager.shutdown()
      
      // Should not have performance warnings
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Plugin performance warning')
      )
      
      consoleSpy.mockRestore()
    }, 15000)
  })

  describe('Resource Cleanup', () => {
    it('should properly clean up observability resources on shutdown', async () => {
      const agentManager = new AgentManager(agent, transport, {
        plugins: [fastPlugin, slowPlugin],
        observabilityConfig: {
          enableTimelineDebug: true,
          enableMetricsCollection: true
        },
        debug: false
      })

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
      
      // Verify resources are active
      expect(agentManager.getMetrics()).toBeDefined()
      expect(agentManager.getDebugTimeline()).toBeDefined()
      
      await agentManager.shutdown()
      
      // Timeline should be finalized
      const timeline = agentManager.getDebugTimeline()
      expect(timeline?.metadata.endTime).toBeDefined()
      expect(timeline?.metadata.endTime).toBeGreaterThan(timeline?.metadata.startTime)
    }, 15000)
  })

  describe('Configuration Validation', () => {
    it('should handle disabled observability features gracefully', async () => {
      const agentManager = new AgentManager(agent, transport, {
        plugins: [fastPlugin],
        observabilityConfig: {
          enableTimelineDebug: false,
          enableMetricsCollection: false
        },
        debug: false
      })

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
      await agentManager.shutdown()
      
      // Should return undefined for disabled features
      expect(agentManager.getMetrics()).toBeUndefined()
      expect(agentManager.getDebugTimeline()).toBeUndefined()
      expect(agentManager.exportPrometheusMetrics()).toBe('')
    }, 10000)

    it('should use default configuration when not specified', async () => {
      const agentManager = new AgentManager(agent, transport, {
        plugins: [fastPlugin],
        debug: false
      })

      await agentManager.initialize()
      await agentManager.send({ content: 'test message' })
      await agentManager.shutdown()
      
      // Should have default observability enabled
      expect(agentManager.getMetrics()).toBeDefined()
      expect(agentManager.getDebugTimeline()).toBeDefined()
    }, 10000)
  })
})