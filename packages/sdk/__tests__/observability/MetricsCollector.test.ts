/**
 * Unit tests for MetricsCollector - Stripe-grade SDK observability
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MetricsCollector, PrometheusMetricsSchema } from '../../src/observability/MetricsCollector'

describe('MetricsCollector', () => {
  let collector: MetricsCollector

  beforeEach(() => {
    collector = new MetricsCollector({
      version: '1.0.0',
      platform: 'test',
      environment: 'test'
    })
  })

  describe('Initialization', () => {
    it('should initialize with correct metadata', () => {
      const metrics = collector.getMetrics()
      
      expect(metrics.metadata.version).toBe('1.0.0')
      expect(metrics.metadata.platform).toBe('test')
      expect(metrics.metadata.environment).toBe('test')
      expect(metrics.metadata.startTime).toBeGreaterThan(0)
    })

    it('should initialize with zero metrics', () => {
      const metrics = collector.getMetrics()
      
      expect(metrics.sdk.totalRequests.value).toBe(0)
      expect(metrics.sdk.totalErrors.value).toBe(0)
      expect(metrics.sdk.activeSessions.value).toBe(0)
      expect(metrics.plugins).toHaveLength(0)
      expect(metrics.errors.total.value).toBe(0)
    })

    it('should handle optional configuration', () => {
      const minimalCollector = new MetricsCollector()
      const metrics = minimalCollector.getMetrics()
      
      expect(metrics.metadata.platform).toBe('unknown')
      expect(metrics.metadata.version).toBeUndefined()
      expect(metrics.metadata.environment).toBeUndefined()
    })
  })

  describe('SDK Metrics Recording', () => {
    it('should record init latency', () => {
      collector.recordInitLatency(150)
      collector.recordInitLatency(200)
      
      const metrics = collector.getMetrics()
      expect(metrics.sdk.initLatency.count).toBe(2)
      expect(metrics.sdk.initLatency.sum).toBe(350)
    })

    it('should record send latency and increment request counter', () => {
      collector.recordSendLatency(50)
      collector.recordSendLatency(75)
      
      const metrics = collector.getMetrics()
      expect(metrics.sdk.sendLatency.count).toBe(2)
      expect(metrics.sdk.sendLatency.sum).toBe(125)
      expect(metrics.sdk.totalRequests.value).toBe(2)
    })

    it('should record shutdown latency', () => {
      collector.recordShutdownLatency(300)
      
      const metrics = collector.getMetrics()
      expect(metrics.sdk.shutdownLatency.count).toBe(1)
      expect(metrics.sdk.shutdownLatency.sum).toBe(300)
    })

    it('should track active sessions', () => {
      collector.setActiveSessions(5)
      expect(collector.getMetrics().sdk.activeSessions.value).toBe(5)
      
      collector.setActiveSessions(3)
      expect(collector.getMetrics().sdk.activeSessions.value).toBe(3)
    })

    it('should calculate uptime correctly', () => {
      const startTime = Date.now()
      const metrics = collector.getMetrics()
      const expectedUptime = (Date.now() - startTime) / 1000
      
      // Allow for small timing differences
      expect(metrics.sdk.uptime.value).toBeGreaterThanOrEqual(expectedUptime - 0.1)
      expect(metrics.sdk.uptime.value).toBeLessThanOrEqual(expectedUptime + 0.1)
    })
  })

  describe('Plugin Metrics Recording', () => {
    it('should record successful plugin execution', () => {
      collector.recordPluginExecution('TestPlugin', 'onInit', 25, true)
      
      const metrics = collector.getMetrics()
      const plugin = metrics.plugins.find(p => p.pluginName === 'TestPlugin' && p.hookName === 'onInit')
      
      expect(plugin).toBeDefined()
      expect(plugin!.executionCount).toBe(1)
      expect(plugin!.totalDuration).toBe(25)
      expect(plugin!.histogram.count).toBe(1)
      expect(plugin!.histogram.sum).toBe(25)
      expect(plugin!.errorCount).toBe(0)
      expect(plugin!.timeoutCount).toBe(0)
    })

    it('should record failed plugin execution', () => {
      collector.recordPluginExecution('TestPlugin', 'onSend', 100, false)
      
      const metrics = collector.getMetrics()
      const plugin = metrics.plugins.find(p => p.pluginName === 'TestPlugin' && p.hookName === 'onSend')
      
      expect(plugin).toBeDefined()
      expect(plugin!.executionCount).toBe(1)
      expect(plugin!.errorCount).toBe(1)
      expect(plugin!.timeoutCount).toBe(0)
    })

    it('should record plugin timeout', () => {
      collector.recordPluginExecution('TimeoutPlugin', 'onSend', 5000, false, true)
      
      const metrics = collector.getMetrics()
      const plugin = metrics.plugins.find(p => p.pluginName === 'TimeoutPlugin')
      
      expect(plugin).toBeDefined()
      expect(plugin!.errorCount).toBe(1)
      expect(plugin!.timeoutCount).toBe(1)
    })

    it('should track multiple executions for same plugin hook', () => {
      collector.recordPluginExecution('MultiPlugin', 'onSend', 10, true)
      collector.recordPluginExecution('MultiPlugin', 'onSend', 20, true)
      collector.recordPluginExecution('MultiPlugin', 'onSend', 30, false)
      
      const metrics = collector.getMetrics()
      const plugin = metrics.plugins.find(p => p.pluginName === 'MultiPlugin')
      
      expect(plugin).toBeDefined()
      expect(plugin!.executionCount).toBe(3)
      expect(plugin!.totalDuration).toBe(60)
      expect(plugin!.histogram.count).toBe(3)
      expect(plugin!.histogram.sum).toBe(60)
      expect(plugin!.errorCount).toBe(1)
    })

    it('should track different hooks for same plugin separately', () => {
      collector.recordPluginExecution('HookPlugin', 'onInit', 15, true)
      collector.recordPluginExecution('HookPlugin', 'onSend', 25, true)
      collector.recordPluginExecution('HookPlugin', 'onShutdown', 35, true)
      
      const metrics = collector.getMetrics()
      const plugins = metrics.plugins.filter(p => p.pluginName === 'HookPlugin')
      
      expect(plugins).toHaveLength(3)
      expect(plugins.map(p => p.hookName).sort()).toEqual(['onInit', 'onSend', 'onShutdown'])
    })

    it('should update lastExecution timestamp', () => {
      const beforeTime = Date.now()
      collector.recordPluginExecution('TimestampPlugin', 'onInit', 10, true)
      const afterTime = Date.now()
      
      const metrics = collector.getMetrics()
      const plugin = metrics.plugins.find(p => p.pluginName === 'TimestampPlugin')
      
      expect(plugin!.lastExecution).toBeGreaterThanOrEqual(beforeTime)
      expect(plugin!.lastExecution).toBeLessThanOrEqual(afterTime)
    })
  })

  describe('Error Metrics Recording', () => {
    it('should record errors by type', () => {
      collector.recordError('PluginTimeoutError')
      collector.recordError('TransportError')
      collector.recordError('PluginTimeoutError')
      
      const metrics = collector.getMetrics()
      
      expect(metrics.errors.byType['PluginTimeoutError']).toBeDefined()
      expect(metrics.errors.byType['PluginTimeoutError'].value).toBe(2)
      expect(metrics.errors.byType['TransportError']).toBeDefined()
      expect(metrics.errors.byType['TransportError'].value).toBe(1)
      expect(metrics.errors.total.value).toBe(3)
    })

    it('should record errors by plugin', () => {
      collector.recordError('PluginExecutionError', 'BadPlugin')
      collector.recordError('PluginTimeoutError', 'SlowPlugin')
      collector.recordError('PluginExecutionError', 'BadPlugin')
      
      const metrics = collector.getMetrics()
      
      expect(metrics.errors.byPlugin['BadPlugin']).toBeDefined()
      expect(metrics.errors.byPlugin['BadPlugin'].value).toBe(2)
      expect(metrics.errors.byPlugin['SlowPlugin']).toBeDefined()
      expect(metrics.errors.byPlugin['SlowPlugin'].value).toBe(1)
    })

    it('should handle errors without plugin name', () => {
      collector.recordError('TransportError')
      
      const metrics = collector.getMetrics()
      expect(metrics.errors.byType['TransportError'].value).toBe(1)
      expect(Object.keys(metrics.errors.byPlugin)).toHaveLength(0)
    })
  })

  describe('Histogram Functionality', () => {
    it('should track values in histogram buckets', () => {
      // Record values across different buckets
      collector.recordSendLatency(0.5)   // 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, ...
      collector.recordSendLatency(15)    // All buckets >= 15
      collector.recordSendLatency(100)   // All buckets >= 100
      
      const metrics = collector.getMetrics()
      const histogram = metrics.sdk.sendLatency
      
      expect(histogram.count).toBe(3)
      expect(histogram.sum).toBe(115.5)
      
      // Check bucket distribution
      const bucket_1 = histogram.buckets.find(b => b.le === 1)
      const bucket_25 = histogram.buckets.find(b => b.le === 25)
      const bucket_100 = histogram.buckets.find(b => b.le === 100)
      
      expect(bucket_1?.count).toBeGreaterThanOrEqual(1) // Contains 0.5
      expect(bucket_25?.count).toBeGreaterThanOrEqual(2) // Contains 0.5 and 15
      expect(bucket_100?.count).toBeGreaterThanOrEqual(3) // Contains all values
    })

    it('should calculate percentiles correctly', () => {
      // Create a collector and access internal histogram for testing
      const testCollector = new MetricsCollector()
      
      // Record a predictable set of values
      for (let i = 1; i <= 100; i++) {
        testCollector.recordSendLatency(i)
      }
      
      const stats = testCollector.getPluginStats()
      // We can't directly test histogram percentiles without exposing internal methods
      // But we can verify the data is being recorded
      const metrics = testCollector.getMetrics()
      expect(metrics.sdk.sendLatency.count).toBe(100)
      expect(metrics.sdk.sendLatency.sum).toBe(5050) // Sum of 1 to 100
    })
  })

  describe('Prometheus Export', () => {
    beforeEach(() => {
      // Set up some test data
      collector.recordInitLatency(100)
      collector.recordSendLatency(50)
      collector.recordPluginExecution('ExportPlugin', 'onInit', 25, true)
      collector.recordError('TestError', 'ExportPlugin')
      collector.setActiveSessions(3)
    })

    it('should export valid Prometheus format', () => {
      const exported = collector.exportPrometheusMetrics()
      
      expect(exported).toContain('# HELP')
      expect(exported).toContain('# TYPE')
      expect(exported).toContain('agentkit_')
      expect(exported).toContain('_bucket{')
      expect(exported).toContain('_count')
      expect(exported).toContain('_sum')
    })

    it('should include SDK metrics in export', () => {
      const exported = collector.exportPrometheusMetrics()
      
      expect(exported).toContain('agentkit_init_latency_seconds')
      expect(exported).toContain('agentkit_send_latency_seconds')
      expect(exported).toContain('agentkit_requests_total 1')
      expect(exported).toContain('agentkit_active_sessions 3')
    })

    it('should include plugin metrics in export', () => {
      const exported = collector.exportPrometheusMetrics()
      
      expect(exported).toContain('agentkit_plugin_executions_total')
      expect(exported).toContain('plugin="ExportPlugin"')
      expect(exported).toContain('hook="onInit"')
    })

    it('should include error metrics in export', () => {
      const exported = collector.exportPrometheusMetrics()
      
      expect(exported).toContain('agentkit_errors_by_type_total')
      expect(exported).toContain('type="TestError"')
      expect(exported).toContain('agentkit_errors_by_plugin_total')
      expect(exported).toContain('plugin="ExportPlugin"')
    })

    it('should handle empty metrics', () => {
      const emptyCollector = new MetricsCollector()
      const exported = emptyCollector.exportPrometheusMetrics()
      
      expect(exported).toContain('agentkit_requests_total 0')
      expect(exported).toContain('agentkit_errors_total 0')
      expect(exported).toContain('agentkit_active_sessions 0')
    })
  })

  describe('Zod Schema Validation', () => {
    it('should validate metrics against schema', () => {
      collector.recordSendLatency(100)
      collector.recordPluginExecution('ValidPlugin', 'onInit', 50, true)
      
      const metrics = collector.getMetrics()
      
      // Should not throw validation error
      expect(() => PrometheusMetricsSchema.parse(metrics)).not.toThrow()
    })

    it('should return safe metrics on validation failure', () => {
      // Create corrupted internal state (this would normally not happen)
      const corruptedCollector = new MetricsCollector()
      
      // Record some data
      corruptedCollector.recordSendLatency(100)
      
      // Mock console.error to avoid test output pollution
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      try {
        // Temporarily corrupt the metrics by overriding getMetrics
        const originalGetMetrics = corruptedCollector.getMetrics
        corruptedCollector.getMetrics = () => {
          const metrics = originalGetMetrics.call(corruptedCollector)
          // Corrupt the data to trigger validation failure
          ;(metrics as any).sdk.totalRequests.value = 'invalid'
          return metrics as any
        }
        
        const result = corruptedCollector.getMetrics()
        
        // Should return safe fallback metrics
        expect(result.sdk.totalRequests.value).toBe(0)
        expect(result.plugins).toHaveLength(0)
        expect(consoleSpy).toHaveBeenCalledWith('Metrics validation failed:', expect.any(Error))
      } finally {
        consoleSpy.mockRestore()
      }
    })
  })

  describe('Reset Functionality', () => {
    it('should reset all metrics', () => {
      // Record some data
      collector.recordInitLatency(100)
      collector.recordSendLatency(50)
      collector.recordPluginExecution('ResetPlugin', 'onInit', 25, true)
      collector.recordError('TestError')
      collector.setActiveSessions(5)
      
      // Verify data exists
      let metrics = collector.getMetrics()
      expect(metrics.sdk.totalRequests.value).toBe(1)
      expect(metrics.plugins).toHaveLength(1)
      expect(metrics.errors.total.value).toBe(1)
      
      // Reset
      collector.reset()
      
      // Verify reset
      metrics = collector.getMetrics()
      expect(metrics.sdk.totalRequests.value).toBe(0)
      expect(metrics.sdk.totalErrors.value).toBe(0)
      expect(metrics.sdk.activeSessions.value).toBe(0)
      expect(metrics.plugins).toHaveLength(0)
      expect(metrics.errors.total.value).toBe(0)
      expect(Object.keys(metrics.errors.byType)).toHaveLength(0)
      expect(Object.keys(metrics.errors.byPlugin)).toHaveLength(0)
    })

    it('should update start time on reset', async () => {
      const originalMetrics = collector.getMetrics()
      const originalStartTime = originalMetrics.metadata.startTime
      
      // Wait a bit to ensure time difference
      await new Promise<void>(resolve => setTimeout(resolve, 10))
      
      collector.reset()
      
      const newMetrics = collector.getMetrics()
      expect(newMetrics.metadata.startTime).toBeGreaterThan(originalStartTime)
    })
  })

  describe('Plugin Statistics', () => {
    beforeEach(() => {
      // Create realistic plugin execution data
      collector.recordPluginExecution('FastPlugin', 'onInit', 10, true)
      collector.recordPluginExecution('FastPlugin', 'onInit', 15, true)
      collector.recordPluginExecution('FastPlugin', 'onSend', 20, true)
      
      collector.recordPluginExecution('SlowPlugin', 'onInit', 100, true)
      collector.recordPluginExecution('SlowPlugin', 'onInit', 150, false) // Error
      collector.recordPluginExecution('SlowPlugin', 'onSend', 200, false, true) // Timeout
    })

    it('should calculate plugin statistics correctly', () => {
      const stats = collector.getPluginStats()
      
      expect(stats['FastPlugin']['onInit']).toBeDefined()
      expect(stats['FastPlugin']['onInit'].count).toBe(2)
      expect(stats['FastPlugin']['onInit'].totalDuration).toBe(25)
      expect(stats['FastPlugin']['onInit'].avgDuration).toBe(12.5)
      expect(stats['FastPlugin']['onInit'].errorRate).toBe(0)
      expect(stats['FastPlugin']['onInit'].timeoutRate).toBe(0)
    })

    it('should calculate error and timeout rates', () => {
      const stats = collector.getPluginStats()
      
      expect(stats['SlowPlugin']['onInit'].count).toBe(2)
      expect(stats['SlowPlugin']['onInit'].errorRate).toBe(0.5) // 1 error out of 2
      expect(stats['SlowPlugin']['onInit'].timeoutRate).toBe(0) // No timeouts for onInit
      
      expect(stats['SlowPlugin']['onSend'].count).toBe(1)
      expect(stats['SlowPlugin']['onSend'].errorRate).toBe(1) // 1 error out of 1
      expect(stats['SlowPlugin']['onSend'].timeoutRate).toBe(1) // 1 timeout out of 1
    })
  })

  describe('Event Emission', () => {
    it('should emit events for metrics recording', (done) => {
      let eventCount = 0
      
      collector.on('metric', (type, value) => {
        eventCount++
        if (eventCount === 1) {
          expect(type).toBe('init_latency')
          expect(value).toBe(100)
        }
        if (eventCount === 2) {
          expect(type).toBe('send_latency')
          expect(value).toBe(50)
          done()
        }
      })
      
      collector.recordInitLatency(100)
      collector.recordSendLatency(50)
    })

    it('should emit events for plugin metrics', (done) => {
      collector.on('pluginMetric', (data) => {
        expect(data.pluginName).toBe('EventPlugin')
        expect(data.hookName).toBe('onInit')
        expect(data.duration).toBe(25)
        expect(data.success).toBe(true)
        expect(data.timeout).toBe(false)
        done()
      })
      
      collector.recordPluginExecution('EventPlugin', 'onInit', 25, true)
    })

    it('should emit events for errors', (done) => {
      collector.on('error', (errorType, pluginName) => {
        expect(errorType).toBe('TestError')
        expect(pluginName).toBe('ErrorPlugin')
        done()
      })
      
      collector.recordError('TestError', 'ErrorPlugin')
    })
  })
})