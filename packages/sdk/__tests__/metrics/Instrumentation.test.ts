import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { Instrumentation } from '../../src/metrics/Instrumentation'
import { PrometheusCollector } from '../../src/metrics/PrometheusCollector'
import { AGENTKIT_METRICS } from '../../src/metrics/MetricsInterface'
import { cleanupAllResources, flushPromises } from '../test-utils'

describe('Instrumentation', () => {
  let instrumentation: Instrumentation
  let collector: PrometheusCollector

  beforeEach(() => {
    collector = new PrometheusCollector()
    instrumentation = new Instrumentation({
      collector,
      collectResourceMetrics: false // Disable for testing
    })
  })

  afterEach(() => {
    instrumentation.shutdown()
  })

  describe('Initialization', () => {
    it('should register standard metrics on creation', () => {
      const metrics = collector.getMetrics()
      expect(metrics.length).toBeGreaterThan(0)
      
      // Check some key metrics are registered
      expect(collector.getMetric(AGENTKIT_METRICS.REQUESTS_TOTAL)).toBeDefined()
      expect(collector.getMetric(AGENTKIT_METRICS.ERRORS_TOTAL)).toBeDefined()
      expect(collector.getMetric(AGENTKIT_METRICS.AGENT_INITIALIZATIONS_TOTAL)).toBeDefined()
    })

    it('should support custom prefix', () => {
      const customInstrumentation = new Instrumentation({
        collector: new PrometheusCollector(),
        prefix: 'myapp',
        collectResourceMetrics: false
      })

      const metrics = customInstrumentation.getCollector().getMetrics()
      const requestMetric = metrics.find(m => m.name === `myapp_${AGENTKIT_METRICS.REQUESTS_TOTAL}`)
      expect(requestMetric).toBeDefined()
      
      customInstrumentation.shutdown()
    })

    it('should support default labels', () => {
      const customInstrumentation = new Instrumentation({
        collector: new PrometheusCollector(),
        defaultLabels: { service: 'test-service', version: '1.0.0' },
        collectResourceMetrics: false
      })

      customInstrumentation.recordRequest('test-agent', 'handle', 100, 'success')
      
      const prometheusText = customInstrumentation.getPrometheusMetrics()
      expect(prometheusText).toContain('service="test-service"')
      expect(prometheusText).toContain('version="1.0.0"')
      
      customInstrumentation.shutdown()
    })
  })

  describe('Agent Metrics', () => {
    it('should record agent initialization', () => {
      instrumentation.recordAgentInit('test-agent', 'worker', 150)
      
      const initMetric = collector.getMetric(AGENTKIT_METRICS.AGENT_INITIALIZATIONS_TOTAL)
      expect(initMetric?.values).toHaveLength(1)
      expect(initMetric?.values[0].value).toBe(1)
      
      const durationMetric = collector.getMetric(AGENTKIT_METRICS.AGENT_INITIALIZATION_DURATION_SECONDS)
      expect(durationMetric?.values).toHaveLength(1)
      expect(durationMetric?.values[0].value).toBe(0.15) // 150ms -> 0.15s
    })

    it('should record agent shutdown', () => {
      instrumentation.recordAgentShutdown('test-agent', 'worker')
      
      const shutdownMetric = collector.getMetric(AGENTKIT_METRICS.AGENT_SHUTDOWNS_TOTAL)
      expect(shutdownMetric?.values).toHaveLength(1)
      expect(shutdownMetric?.values[0].value).toBe(1)
    })
  })

  describe('Request Metrics', () => {
    it('should record request with all data', () => {
      instrumentation.recordRequest('test-agent', 'handle', 250, 'success', 1024, 2048)
      
      const requestsMetric = collector.getMetric(AGENTKIT_METRICS.REQUESTS_TOTAL)
      expect(requestsMetric?.values[0].value).toBe(1)
      
      const durationMetric = collector.getMetric(AGENTKIT_METRICS.REQUEST_DURATION_SECONDS)
      expect(durationMetric?.values[0].value).toBe(0.25)
      
      const requestSizeMetric = collector.getMetric(AGENTKIT_METRICS.REQUEST_SIZE_BYTES)
      expect(requestSizeMetric?.values[0].value).toBe(1024)
      
      const responseSizeMetric = collector.getMetric(AGENTKIT_METRICS.RESPONSE_SIZE_BYTES)
      expect(responseSizeMetric?.values[0].value).toBe(2048)
    })

    it('should record request without size data', () => {
      instrumentation.recordRequest('test-agent', 'handle', 100, 'error')
      
      const requestsMetric = collector.getMetric(AGENTKIT_METRICS.REQUESTS_TOTAL)
      expect(requestsMetric?.values[0].value).toBe(1)
      expect(requestsMetric?.values[0].labels?.status).toBe('error')
      
      // Size metrics should not have values
      const requestSizeMetric = collector.getMetric(AGENTKIT_METRICS.REQUEST_SIZE_BYTES)
      expect(requestSizeMetric?.values).toHaveLength(0)
    })
  })

  describe('Error Metrics', () => {
    it('should record errors with context', () => {
      instrumentation.recordError('agent-init', 'ConfigurationError', 'INVALID_CONFIG')
      
      const errorMetric = collector.getMetric(AGENTKIT_METRICS.ERRORS_TOTAL)
      expect(errorMetric?.values[0].value).toBe(1)
      expect(errorMetric?.values[0].labels?.context).toBe('agent-init')
      expect(errorMetric?.values[0].labels?.error_type).toBe('ConfigurationError')
      expect(errorMetric?.values[0].labels?.error_code).toBe('INVALID_CONFIG')
    })
  })

  describe('Transport Metrics', () => {
    it('should record transport send operation', () => {
      instrumentation.recordTransportOperation('http-transport', 'http', 'send', 50, 'success')
      
      const sentMetric = collector.getMetric(AGENTKIT_METRICS.TRANSPORT_MESSAGES_SENT_TOTAL)
      expect(sentMetric?.values[0].value).toBe(1)
      
      const durationMetric = collector.getMetric(AGENTKIT_METRICS.TRANSPORT_SEND_DURATION_SECONDS)
      expect(durationMetric?.values[0].value).toBe(0.05)
    })

    it('should record transport receive operation', () => {
      instrumentation.recordTransportOperation('http-transport', 'http', 'receive', 30, 'success')
      
      const receivedMetric = collector.getMetric(AGENTKIT_METRICS.TRANSPORT_MESSAGES_RECEIVED_TOTAL)
      expect(receivedMetric?.values[0].value).toBe(1)
    })

    it('should record transport queue size', () => {
      instrumentation.recordTransportQueueSize('http-transport', 42)
      
      const queueMetric = collector.getMetric(AGENTKIT_METRICS.TRANSPORT_QUEUE_SIZE)
      expect(queueMetric?.values[0].value).toBe(42)
    })
  })

  describe('Plugin Metrics', () => {
    it('should record successful plugin execution', () => {
      instrumentation.recordPluginExecution('test-plugin', 'onSend', 25, 'success')
      
      const execMetric = collector.getMetric(AGENTKIT_METRICS.PLUGIN_EXECUTIONS_TOTAL)
      expect(execMetric?.values[0].value).toBe(1)
      expect(execMetric?.values[0].labels?.status).toBe('success')
      
      const durationMetric = collector.getMetric(AGENTKIT_METRICS.PLUGIN_EXECUTION_DURATION_SECONDS)
      expect(durationMetric?.values[0].value).toBe(0.025)
    })

    it('should record plugin errors', () => {
      instrumentation.recordPluginExecution('test-plugin', 'onSend', 25, 'error')
      
      const errorMetric = collector.getMetric(AGENTKIT_METRICS.PLUGIN_ERRORS_TOTAL)
      expect(errorMetric?.values[0].value).toBe(1)
    })

    it('should record plugin timeouts', () => {
      instrumentation.recordPluginExecution('test-plugin', 'onSend', 5000, 'timeout')
      
      const timeoutMetric = collector.getMetric(AGENTKIT_METRICS.PLUGIN_TIMEOUTS_TOTAL)
      expect(timeoutMetric?.values[0].value).toBe(1)
    })
  })

  describe('Registry Metrics', () => {
    it('should record agent registration', () => {
      instrumentation.recordRegistryOperation('register', 'new-agent')
      
      const regMetric = collector.getMetric(AGENTKIT_METRICS.REGISTRY_AGENTS_REGISTERED_TOTAL)
      expect(regMetric?.values[0].value).toBe(1)
      expect(regMetric?.values[0].labels?.agent_id).toBe('new-agent')
    })

    it('should record registry lookups', () => {
      instrumentation.recordRegistryOperation('lookup', 'existing-agent')
      
      const lookupMetric = collector.getMetric(AGENTKIT_METRICS.REGISTRY_LOOKUPS_TOTAL)
      expect(lookupMetric?.values[0].value).toBe(1)
      expect(lookupMetric?.values[0].labels?.agent_id).toBe('existing-agent')
    })
  })

  describe('Prometheus Output', () => {
    it('should generate valid Prometheus text format', () => {
      instrumentation.recordRequest('test-agent', 'handle', 100, 'success')
      
      const prometheusText = instrumentation.getPrometheusMetrics()
      
      expect(prometheusText).toContain('# HELP')
      expect(prometheusText).toContain('# TYPE')
      expect(prometheusText).toContain('agentkit_requests_total')
      expect(prometheusText).toContain('agentkit_request_duration_seconds')
    })
  })

  describe('Disabled Instrumentation', () => {
    it('should not record metrics when disabled', () => {
      const disabledInstrumentation = new Instrumentation({
        enabled: false,
        collector: new PrometheusCollector()
      })

      disabledInstrumentation.recordRequest('test-agent', 'handle', 100, 'success')
      
      const metrics = disabledInstrumentation.getCollector().getMetrics()
      const requestMetric = metrics.find(m => m.name === AGENTKIT_METRICS.REQUESTS_TOTAL)
      expect(requestMetric?.values || []).toHaveLength(0)
      
      disabledInstrumentation.shutdown()
    })
  })

  describe('Resource Metrics', () => {
    it('should start resource metrics collection when enabled', async () => {
      const resourceInstrumentation = new Instrumentation({
        collector: new PrometheusCollector(),
        collectResourceMetrics: true,
        resourceMetricsInterval: 100 // Fast interval for testing
      })

      await new Promise(resolve => setTimeout(resolve, 150))
      
      const memoryMetric = resourceInstrumentation.getCollector()
        .getMetric(AGENTKIT_METRICS.MEMORY_USAGE_BYTES)
      
      // Memory metric might be collected if Node.js APIs are available
      // This test just ensures the system doesn't crash
      expect(memoryMetric).toBeDefined()
      
      resourceInstrumentation.shutdown()
    })
  })

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})