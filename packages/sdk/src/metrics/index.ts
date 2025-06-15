/**
 * Prometheus-compatible metrics system for AgentKit SDK
 * 
 * This module provides comprehensive observability for AgentKit applications
 * with metrics that follow Prometheus naming conventions and best practices.
 * 
 * @example Basic usage
 * ```typescript
 * import { Instrumentation, PrometheusCollector } from '@agentkit/sdk/metrics'
 * 
 * // Create instrumentation with default settings
 * const instrumentation = new Instrumentation()
 * 
 * // Record some metrics
 * instrumentation.recordAgentInit('my-agent', 'worker', 150)
 * instrumentation.recordRequest('my-agent', 'handle', 250, 'success')
 * 
 * // Get Prometheus metrics
 * const prometheusText = instrumentation.getPrometheusMetrics()
 * console.log(prometheusText)
 * ```
 * 
 * @example Custom collector configuration
 * ```typescript
 * import { PrometheusCollector, Instrumentation } from '@agentkit/sdk/metrics'
 * 
 * const collector = new PrometheusCollector()
 * 
 * // Register custom metric
 * collector.register({
 *   name: 'my_custom_metric_total',
 *   type: 'counter',
 *   help: 'Description of my custom metric'
 * })
 * 
 * // Use with instrumentation
 * const instrumentation = new Instrumentation({
 *   collector,
 *   prefix: 'myapp',
 *   defaultLabels: { service: 'my-service', version: '1.0.0' }
 * })
 * ```
 * 
 * @example Express metrics endpoint
 * ```typescript
 * import express from 'express'
 * import { Instrumentation } from '@agentkit/sdk/metrics'
 * 
 * const app = express()
 * const instrumentation = new Instrumentation()
 * 
 * app.get('/metrics', (req, res) => {
 *   res.set('Content-Type', 'text/plain; charset=utf-8')
 *   res.send(instrumentation.getPrometheusMetrics())
 * })
 * ```
 */

// Core interfaces and types
export type {
  MetricType,
  MetricLabels,
  MetricValue,
  HistogramBucket,
  HistogramValue,
  SummaryQuantile,
  SummaryValue,
  MetricDefinition,
  SerializedMetric,
  MetricsCollector
} from './MetricsInterface'

export {
  DEFAULT_HISTOGRAM_BUCKETS,
  DEFAULT_SUMMARY_QUANTILES,
  AGENTKIT_METRICS,
  AGENTKIT_LABELS
} from './MetricsInterface'

// Implementations
export { PrometheusCollector } from './PrometheusCollector'
export { Instrumentation } from './Instrumentation'
export type { InstrumentationConfig } from './Instrumentation'

// Convenience utilities
export { createInstrumentation, createCollector } from './utils'