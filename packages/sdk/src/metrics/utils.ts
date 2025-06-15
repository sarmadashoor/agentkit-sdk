import { Instrumentation, InstrumentationConfig } from './Instrumentation'
import { PrometheusCollector } from './PrometheusCollector'
import { MetricsCollector } from './MetricsInterface'

/**
 * Create a new Instrumentation instance with sensible defaults
 */
export function createInstrumentation(config?: InstrumentationConfig): Instrumentation {
  const defaultConfig: InstrumentationConfig = {
    enabled: process.env.NODE_ENV !== 'test',
    collectResourceMetrics: true,
    resourceMetricsInterval: 10000, // 10 seconds
    defaultLabels: {
      version: process.env.npm_package_version || 'unknown',
      service: process.env.SERVICE_NAME || 'agentkit'
    }
  }

  return new Instrumentation({ ...defaultConfig, ...config })
}

/**
 * Create a new PrometheusCollector instance
 */
export function createCollector(): MetricsCollector {
  return new PrometheusCollector()
}

/**
 * Create an instrumentation instance for testing with metrics disabled
 */
export function createTestInstrumentation(): Instrumentation {
  return new Instrumentation({
    enabled: false,
    collectResourceMetrics: false
  })
}

/**
 * Validate Prometheus metric name
 */
export function isValidPrometheusName(name: string): boolean {
  return /^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name)
}

/**
 * Sanitize metric name to be Prometheus-compatible
 */
export function sanitizeMetricName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_:]/g, '_')
    .replace(/^[^a-zA-Z_:]/, '_')
    .replace(/__+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * Create histogram buckets for latency measurements
 */
export function createLatencyBuckets(): number[] {
  return [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, Infinity]
}

/**
 * Create histogram buckets for size measurements (bytes)
 */
export function createSizeBuckets(): number[] {
  return [
    100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000, 5000000, 10000000, Infinity
  ]
}

/**
 * Get standard quantiles for summary metrics
 */
export function getStandardQuantiles(): number[] {
  return [0.5, 0.9, 0.95, 0.99, 0.999]
}