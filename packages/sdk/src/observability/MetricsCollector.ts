/**
 * MetricsCollector - Stripe-grade SDK observability with Prometheus compatibility
 * 
 * Provides comprehensive metrics collection for AgentKit SDK including:
 * - Plugin execution metrics with histogram support
 * - SDK-level latency tracking  
 * - Error counting by type
 * - Prometheus-compatible export format
 */

import { z } from 'zod'
import { EventEmitter } from 'events'

/**
 * Histogram bucket configuration for execution time metrics
 */
const HISTOGRAM_BUCKETS = [
  0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25, 50, 100
] as const

/**
 * Zod schema for histogram data
 */
const HistogramSchema = z.object({
  buckets: z.array(z.object({
    le: z.number(),
    count: z.number()
  })),
  count: z.number(),
  sum: z.number()
})

/**
 * Zod schema for counter metrics
 */
const CounterSchema = z.object({
  value: z.number().int().min(0),
  labels: z.record(z.string()).optional()
})

/**
 * Zod schema for gauge metrics
 */
const GaugeSchema = z.object({
  value: z.number(),
  labels: z.record(z.string()).optional()
})

/**
 * Zod schema for plugin execution metrics
 */
const PluginExecutionMetricSchema = z.object({
  pluginName: z.string(),
  hookName: z.enum(['onInit', 'onSend', 'onReceive', 'onError', 'onShutdown']),
  executionCount: z.number().int().min(0),
  totalDuration: z.number().min(0),
  histogram: HistogramSchema,
  errorCount: z.number().int().min(0),
  timeoutCount: z.number().int().min(0),
  lastExecution: z.number().optional()
})

/**
 * Zod schema for SDK-level metrics
 */
const SDKMetricsSchema = z.object({
  initLatency: HistogramSchema,
  sendLatency: HistogramSchema,
  shutdownLatency: HistogramSchema,
  totalRequests: CounterSchema,
  totalErrors: CounterSchema,
  activeSessions: GaugeSchema,
  uptime: GaugeSchema
})

/**
 * Zod schema for error metrics by type
 */
const ErrorMetricsSchema = z.object({
  byType: z.record(CounterSchema),
  byPlugin: z.record(CounterSchema),
  total: CounterSchema
})

/**
 * Complete metrics schema
 */
export const PrometheusMetricsSchema = z.object({
  timestamp: z.number(),
  sdk: SDKMetricsSchema,
  plugins: z.array(PluginExecutionMetricSchema),
  errors: ErrorMetricsSchema,
  metadata: z.object({
    version: z.string().optional(),
    platform: z.string(),
    environment: z.string().optional(),
    startTime: z.number()
  })
})

export type PrometheusMetrics = z.infer<typeof PrometheusMetricsSchema>
export type PluginExecutionMetric = z.infer<typeof PluginExecutionMetricSchema>
export type Histogram = z.infer<typeof HistogramSchema>

/**
 * Histogram data structure for tracking execution times
 */
class MetricHistogram {
  private buckets: Map<number, number> = new Map()
  private count = 0
  private sum = 0

  constructor() {
    // Initialize all buckets
    HISTOGRAM_BUCKETS.forEach(bucket => {
      this.buckets.set(bucket, 0)
    })
    this.buckets.set(Infinity, 0) // +Inf bucket
  }

  /**
   * Record a value in the histogram
   */
  observe(value: number): void {
    this.count++
    this.sum += value

    // Update buckets
    for (const [bucket, _] of this.buckets) {
      if (value <= bucket) {
        this.buckets.set(bucket, this.buckets.get(bucket)! + 1)
      }
    }
  }

  /**
   * Calculate percentile from histogram
   */
  percentile(p: number): number {
    if (this.count === 0) return 0

    const targetCount = (p / 100) * this.count
    let cumulativeCount = 0

    for (const [bucket, count] of this.buckets) {
      cumulativeCount += count
      if (cumulativeCount >= targetCount) {
        return bucket === Infinity ? this.sum / this.count : bucket
      }
    }

    return 0
  }

  /**
   * Export histogram in Prometheus format
   */
  toPrometheus(): Histogram {
    const buckets = Array.from(this.buckets.entries()).map(([le, count]) => ({
      le: le === Infinity ? Number.POSITIVE_INFINITY : le,
      count
    }))

    return {
      buckets,
      count: this.count,
      sum: this.sum
    }
  }

  /**
   * Get basic statistics
   */
  getStats() {
    return {
      count: this.count,
      sum: this.sum,
      avg: this.count > 0 ? this.sum / this.count : 0,
      p50: this.percentile(50),
      p95: this.percentile(95),
      p99: this.percentile(99)
    }
  }
}

/**
 * Counter metric for tracking counts
 */
class Counter {
  private value = 0
  private labels: Record<string, string> = {}

  constructor(labels: Record<string, string> = {}) {
    this.labels = labels
  }

  inc(amount = 1): void {
    this.value += amount
  }

  getValue(): number {
    return this.value
  }

  getLabels(): Record<string, string> {
    return { ...this.labels }
  }

  reset(): void {
    this.value = 0
  }

  toPrometheus(): z.infer<typeof CounterSchema> {
    return {
      value: this.value,
      labels: Object.keys(this.labels).length > 0 ? this.labels : undefined
    }
  }
}

/**
 * Gauge metric for tracking current values
 */
class Gauge {
  private value = 0
  private labels: Record<string, string> = {}

  constructor(labels: Record<string, string> = {}) {
    this.labels = labels
  }

  set(value: number): void {
    this.value = value
  }

  inc(amount = 1): void {
    this.value += amount
  }

  dec(amount = 1): void {
    this.value -= amount
  }

  getValue(): number {
    return this.value
  }

  getLabels(): Record<string, string> {
    return { ...this.labels }
  }

  toPrometheus(): z.infer<typeof GaugeSchema> {
    return {
      value: this.value,
      labels: Object.keys(this.labels).length > 0 ? this.labels : undefined
    }
  }
}

/**
 * Main metrics collector with Stripe-grade observability
 */
export class MetricsCollector extends EventEmitter {
  private startTime = Date.now()
  private version?: string
  private platform: string
  private environment?: string

  // SDK-level metrics
  private initLatency = new MetricHistogram()
  private sendLatency = new MetricHistogram()
  private shutdownLatency = new MetricHistogram()
  private totalRequests = new Counter()
  private totalErrors = new Counter()
  private activeSessions = new Gauge()

  // Plugin metrics
  private pluginMetrics = new Map<string, Map<string, {
    executionCount: Counter
    totalDuration: number
    histogram: MetricHistogram
    errorCount: Counter
    timeoutCount: Counter
    lastExecution?: number
  }>>()

  // Error metrics
  private errorsByType = new Map<string, Counter>()
  private errorsByPlugin = new Map<string, Counter>()
  private totalErrorsCounter = new Counter()

  constructor(options: {
    version?: string
    platform?: string
    environment?: string
  } = {}) {
    super()
    
    this.version = options.version
    this.platform = options.platform || 'unknown'
    this.environment = options.environment
  }

  /**
   * Record SDK initialization latency
   */
  recordInitLatency(duration: number): void {
    this.initLatency.observe(duration)
    this.emit('metric', 'init_latency', duration)
  }

  /**
   * Record SDK send operation latency
   */
  recordSendLatency(duration: number): void {
    this.sendLatency.observe(duration)
    this.totalRequests.inc()
    this.emit('metric', 'send_latency', duration)
  }

  /**
   * Record SDK shutdown latency
   */
  recordShutdownLatency(duration: number): void {
    this.shutdownLatency.observe(duration)
    this.emit('metric', 'shutdown_latency', duration)
  }

  /**
   * Record plugin execution metrics
   */
  recordPluginExecution(
    pluginName: string,
    hookName: string,
    duration: number,
    success: boolean,
    timeout = false
  ): void {
    // Get or create plugin metrics
    if (!this.pluginMetrics.has(pluginName)) {
      this.pluginMetrics.set(pluginName, new Map())
    }

    const pluginMap = this.pluginMetrics.get(pluginName)!
    if (!pluginMap.has(hookName)) {
      pluginMap.set(hookName, {
        executionCount: new Counter(),
        totalDuration: 0,
        histogram: new MetricHistogram(),
        errorCount: new Counter(),
        timeoutCount: new Counter()
      })
    }

    const metrics = pluginMap.get(hookName)!
    
    // Update metrics
    metrics.executionCount.inc()
    metrics.totalDuration += duration
    metrics.histogram.observe(duration)
    metrics.lastExecution = Date.now()

    if (!success) {
      metrics.errorCount.inc()
      this.recordError('PluginExecutionError', pluginName)
    }

    if (timeout) {
      metrics.timeoutCount.inc()
      this.recordError('PluginTimeoutError', pluginName)
    }

    this.emit('pluginMetric', {
      pluginName,
      hookName,
      duration,
      success,
      timeout
    })
  }

  /**
   * Record error by type and plugin
   */
  recordError(errorType: string, pluginName?: string): void {
    // Error by type
    if (!this.errorsByType.has(errorType)) {
      this.errorsByType.set(errorType, new Counter({ type: errorType }))
    }
    this.errorsByType.get(errorType)!.inc()

    // Error by plugin
    if (pluginName) {
      if (!this.errorsByPlugin.has(pluginName)) {
        this.errorsByPlugin.set(pluginName, new Counter({ plugin: pluginName }))
      }
      this.errorsByPlugin.get(pluginName)!.inc()
    }

    // Total errors
    this.totalErrors.inc()
    this.totalErrorsCounter.inc()

    this.emit('error', errorType, pluginName)
  }

  /**
   * Update active sessions count
   */
  setActiveSessions(count: number): void {
    this.activeSessions.set(count)
  }

  /**
   * Get current uptime in seconds
   */
  private getUptime(): number {
    return (Date.now() - this.startTime) / 1000
  }

  /**
   * Get comprehensive metrics in validated format
   */
  getMetrics(): PrometheusMetrics {
    const metrics: PrometheusMetrics = {
      timestamp: Date.now(),
      sdk: {
        initLatency: this.initLatency.toPrometheus(),
        sendLatency: this.sendLatency.toPrometheus(),
        shutdownLatency: this.shutdownLatency.toPrometheus(),
        totalRequests: this.totalRequests.toPrometheus(),
        totalErrors: this.totalErrors.toPrometheus(),
        activeSessions: this.activeSessions.toPrometheus(),
        uptime: { value: this.getUptime() }
      },
      plugins: this.getPluginMetrics(),
      errors: {
        byType: Object.fromEntries(
          Array.from(this.errorsByType.entries()).map(([type, counter]) => [
            type,
            counter.toPrometheus()
          ])
        ),
        byPlugin: Object.fromEntries(
          Array.from(this.errorsByPlugin.entries()).map(([plugin, counter]) => [
            plugin,
            counter.toPrometheus()
          ])
        ),
        total: this.totalErrorsCounter.toPrometheus()
      },
      metadata: {
        version: this.version,
        platform: this.platform,
        environment: this.environment,
        startTime: this.startTime
      }
    }

    // Validate against schema
    try {
      return PrometheusMetricsSchema.parse(metrics)
    } catch (error) {
      console.error('Metrics validation failed:', error)
      // Return safe fallback metrics
      return this.getSafeMetrics()
    }
  }

  /**
   * Get plugin metrics in validated format
   */
  private getPluginMetrics(): PluginExecutionMetric[] {
    const metrics: PluginExecutionMetric[] = []

    for (const [pluginName, hooks] of this.pluginMetrics) {
      for (const [hookName, hookMetrics] of hooks) {
        try {
          const metric: PluginExecutionMetric = {
            pluginName,
            hookName: hookName as any,
            executionCount: hookMetrics.executionCount.getValue(),
            totalDuration: hookMetrics.totalDuration,
            histogram: hookMetrics.histogram.toPrometheus(),
            errorCount: hookMetrics.errorCount.getValue(),
            timeoutCount: hookMetrics.timeoutCount.getValue(),
            lastExecution: hookMetrics.lastExecution
          }

          // Validate individual plugin metric
          const validated = PluginExecutionMetricSchema.parse(metric)
          metrics.push(validated)
        } catch (error) {
          console.error(`Failed to validate plugin metric for ${pluginName}.${hookName}:`, error)
          // Skip invalid metrics but continue processing
        }
      }
    }

    return metrics
  }

  /**
   * Export metrics in Prometheus text format
   */
  exportPrometheusMetrics(): string {
    const metrics = this.getMetrics()
    const lines: string[] = []

    // Helper function to format metric name
    const formatMetricName = (name: string) => `agentkit_${name}`

    // SDK metrics
    lines.push(`# HELP ${formatMetricName('init_latency_seconds')} SDK initialization latency histogram`)
    lines.push(`# TYPE ${formatMetricName('init_latency_seconds')} histogram`)
    this.addHistogramLines(lines, 'init_latency_seconds', metrics.sdk.initLatency)

    lines.push(`# HELP ${formatMetricName('send_latency_seconds')} SDK send operation latency histogram`)
    lines.push(`# TYPE ${formatMetricName('send_latency_seconds')} histogram`)
    this.addHistogramLines(lines, 'send_latency_seconds', metrics.sdk.sendLatency)

    lines.push(`# HELP ${formatMetricName('shutdown_latency_seconds')} SDK shutdown latency histogram`)
    lines.push(`# TYPE ${formatMetricName('shutdown_latency_seconds')} histogram`)
    this.addHistogramLines(lines, 'shutdown_latency_seconds', metrics.sdk.shutdownLatency)

    lines.push(`# HELP ${formatMetricName('requests_total')} Total number of requests`)
    lines.push(`# TYPE ${formatMetricName('requests_total')} counter`)
    lines.push(`${formatMetricName('requests_total')} ${metrics.sdk.totalRequests.value}`)

    lines.push(`# HELP ${formatMetricName('errors_total')} Total number of errors`)
    lines.push(`# TYPE ${formatMetricName('errors_total')} counter`)
    lines.push(`${formatMetricName('errors_total')} ${metrics.sdk.totalErrors.value}`)

    lines.push(`# HELP ${formatMetricName('active_sessions')} Current number of active sessions`)
    lines.push(`# TYPE ${formatMetricName('active_sessions')} gauge`)
    lines.push(`${formatMetricName('active_sessions')} ${metrics.sdk.activeSessions.value}`)

    lines.push(`# HELP ${formatMetricName('uptime_seconds')} SDK uptime in seconds`)
    lines.push(`# TYPE ${formatMetricName('uptime_seconds')} gauge`)
    lines.push(`${formatMetricName('uptime_seconds')} ${metrics.sdk.uptime.value}`)

    // Plugin metrics
    lines.push(`# HELP ${formatMetricName('plugin_executions_total')} Total plugin executions by plugin and hook`)
    lines.push(`# TYPE ${formatMetricName('plugin_executions_total')} counter`)
    
    for (const plugin of metrics.plugins) {
      const labels = `plugin="${plugin.pluginName}",hook="${plugin.hookName}"`
      lines.push(`${formatMetricName('plugin_executions_total')}{${labels}} ${plugin.executionCount}`)
    }

    lines.push(`# HELP ${formatMetricName('plugin_duration_seconds')} Plugin execution duration histogram`)
    lines.push(`# TYPE ${formatMetricName('plugin_duration_seconds')} histogram`)
    
    for (const plugin of metrics.plugins) {
      const labels = `plugin="${plugin.pluginName}",hook="${plugin.hookName}"`
      this.addHistogramLines(lines, 'plugin_duration_seconds', plugin.histogram, labels)
    }

    // Error metrics
    lines.push(`# HELP ${formatMetricName('errors_by_type_total')} Errors by type`)
    lines.push(`# TYPE ${formatMetricName('errors_by_type_total')} counter`)
    
    for (const [type, counter] of Object.entries(metrics.errors.byType)) {
      lines.push(`${formatMetricName('errors_by_type_total')}{type="${type}"} ${counter.value}`)
    }

    lines.push(`# HELP ${formatMetricName('errors_by_plugin_total')} Errors by plugin`)
    lines.push(`# TYPE ${formatMetricName('errors_by_plugin_total')} counter`)
    
    for (const [plugin, counter] of Object.entries(metrics.errors.byPlugin)) {
      lines.push(`${formatMetricName('errors_by_plugin_total')}{plugin="${plugin}"} ${counter.value}`)
    }

    return lines.join('\n') + '\n'
  }

  /**
   * Add histogram lines to Prometheus export
   */
  private addHistogramLines(
    lines: string[],
    metricName: string,
    histogram: Histogram,
    labels = ''
  ): void {
    const baseLabels = labels ? `${labels},` : ''
    
    // Bucket lines
    for (const bucket of histogram.buckets) {
      const le = bucket.le === Number.POSITIVE_INFINITY ? '+Inf' : bucket.le.toString()
      lines.push(`agentkit_${metricName}_bucket{${baseLabels}le="${le}"} ${bucket.count}`)
    }
    
    // Count and sum
    lines.push(`agentkit_${metricName}_count${labels ? `{${labels}}` : ''} ${histogram.count}`)
    lines.push(`agentkit_${metricName}_sum${labels ? `{${labels}}` : ''} ${histogram.sum}`)
  }

  /**
   * Get safe fallback metrics when validation fails
   */
  private getSafeMetrics(): PrometheusMetrics {
    return {
      timestamp: Date.now(),
      sdk: {
        initLatency: { buckets: [], count: 0, sum: 0 },
        sendLatency: { buckets: [], count: 0, sum: 0 },
        shutdownLatency: { buckets: [], count: 0, sum: 0 },
        totalRequests: { value: 0 },
        totalErrors: { value: 0 },
        activeSessions: { value: 0 },
        uptime: { value: this.getUptime() }
      },
      plugins: [],
      errors: {
        byType: {},
        byPlugin: {},
        total: { value: 0 }
      },
      metadata: {
        version: this.version,
        platform: this.platform,
        environment: this.environment,
        startTime: this.startTime
      }
    }
  }

  /**
   * Get plugin execution statistics for debugging
   */
  getPluginStats(): Record<string, Record<string, {
    count: number
    totalDuration: number
    avgDuration: number
    p50: number
    p95: number
    p99: number
    errorRate: number
    timeoutRate: number
  }>> {
    const stats: any = {}

    for (const [pluginName, hooks] of this.pluginMetrics) {
      stats[pluginName] = {}
      
      for (const [hookName, hookMetrics] of hooks) {
        const histogramStats = hookMetrics.histogram.getStats()
        const execCount = hookMetrics.executionCount.getValue()
        const errorCount = hookMetrics.errorCount.getValue()
        const timeoutCount = hookMetrics.timeoutCount.getValue()
        
        stats[pluginName][hookName] = {
          count: execCount,
          totalDuration: hookMetrics.totalDuration,
          avgDuration: histogramStats.avg,
          p50: histogramStats.p50,
          p95: histogramStats.p95,
          p99: histogramStats.p99,
          errorRate: execCount > 0 ? errorCount / execCount : 0,
          timeoutRate: execCount > 0 ? timeoutCount / execCount : 0
        }
      }
    }

    return stats
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.startTime = Date.now()
    this.initLatency = new MetricHistogram()
    this.sendLatency = new MetricHistogram()
    this.shutdownLatency = new MetricHistogram()
    this.totalRequests.reset()
    this.totalErrors.reset()
    this.activeSessions.set(0)
    this.pluginMetrics.clear()
    this.errorsByType.clear()
    this.errorsByPlugin.clear()
    this.totalErrorsCounter.reset()
    
    this.emit('reset')
  }
}