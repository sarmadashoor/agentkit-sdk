import { MetricsCollector, AGENTKIT_METRICS, AGENTKIT_LABELS } from './MetricsInterface'
import { PrometheusCollector } from './PrometheusCollector'

/**
 * Configuration for metrics instrumentation
 */
export interface InstrumentationConfig {
  /** Whether metrics collection is enabled */
  enabled?: boolean
  /** Custom metrics collector implementation */
  collector?: MetricsCollector
  /** Prefix for all metric names */
  prefix?: string
  /** Default labels to add to all metrics */
  defaultLabels?: Record<string, string>
  /** Whether to collect resource usage metrics */
  collectResourceMetrics?: boolean
  /** Interval for collecting resource metrics (ms) */
  resourceMetricsInterval?: number
}

/**
 * Metrics instrumentation for AgentKit SDK
 * Automatically instruments core SDK components with Prometheus-compatible metrics
 */
export class Instrumentation {
  private collector: MetricsCollector
  private config: Required<InstrumentationConfig>
  private resourceMetricsTimer?: NodeJS.Timeout
  private startTime = Date.now()

  constructor(config: InstrumentationConfig = {}) {
    this.config = {
      enabled: true,
      collector: new PrometheusCollector(),
      prefix: '',
      defaultLabels: {},
      collectResourceMetrics: true,
      resourceMetricsInterval: 10000, // 10 seconds
      ...config
    }

    this.collector = this.config.collector

    if (this.config.enabled) {
      this.registerStandardMetrics()
      if (this.config.collectResourceMetrics) {
        this.startResourceMetricsCollection()
      }
    }
  }

  /**
   * Get the metrics collector instance
   */
  getCollector(): MetricsCollector {
    return this.collector
  }

  /**
   * Get metrics in Prometheus text format
   */
  getPrometheusMetrics(): string {
    return this.collector.getPrometheusMetrics()
  }

  /**
   * Record agent initialization
   */
  recordAgentInit(agentId: string, agentType: string, duration: number): void {
    if (!this.config.enabled) return

    this.collector.incrementCounter(
      this.withPrefix(AGENTKIT_METRICS.AGENT_INITIALIZATIONS_TOTAL),
      1,
      this.withDefaultLabels({
        [AGENTKIT_LABELS.AGENT_ID]: agentId,
        [AGENTKIT_LABELS.AGENT_TYPE]: agentType
      })
    )

    this.collector.observeHistogram(
      this.withPrefix(AGENTKIT_METRICS.AGENT_INITIALIZATION_DURATION_SECONDS),
      duration / 1000,
      this.withDefaultLabels({
        [AGENTKIT_LABELS.AGENT_ID]: agentId,
        [AGENTKIT_LABELS.AGENT_TYPE]: agentType
      })
    )

    this.updateActiveAgentCount()
  }

  /**
   * Record agent shutdown
   */
  recordAgentShutdown(agentId: string, agentType: string): void {
    if (!this.config.enabled) return

    this.collector.incrementCounter(
      this.withPrefix(AGENTKIT_METRICS.AGENT_SHUTDOWNS_TOTAL),
      1,
      this.withDefaultLabels({
        [AGENTKIT_LABELS.AGENT_ID]: agentId,
        [AGENTKIT_LABELS.AGENT_TYPE]: agentType
      })
    )

    this.updateActiveAgentCount()
  }

  /**
   * Record request handling
   */
  recordRequest(agentId: string, method: string, duration: number, status: string, requestSize?: number, responseSize?: number): void {
    if (!this.config.enabled) return

    const labels = this.withDefaultLabels({
      [AGENTKIT_LABELS.AGENT_ID]: agentId,
      [AGENTKIT_LABELS.METHOD]: method,
      [AGENTKIT_LABELS.STATUS]: status
    })

    this.collector.incrementCounter(
      this.withPrefix(AGENTKIT_METRICS.REQUESTS_TOTAL),
      1,
      labels
    )

    this.collector.observeHistogram(
      this.withPrefix(AGENTKIT_METRICS.REQUEST_DURATION_SECONDS),
      duration / 1000,
      labels
    )

    if (requestSize !== undefined) {
      this.collector.observeHistogram(
        this.withPrefix(AGENTKIT_METRICS.REQUEST_SIZE_BYTES),
        requestSize,
        labels
      )
    }

    if (responseSize !== undefined) {
      this.collector.observeHistogram(
        this.withPrefix(AGENTKIT_METRICS.RESPONSE_SIZE_BYTES),
        responseSize,
        labels
      )
    }
  }

  /**
   * Record error occurrence
   */
  recordError(context: string, errorType: string, errorCode?: string): void {
    if (!this.config.enabled) return

    this.collector.incrementCounter(
      this.withPrefix(AGENTKIT_METRICS.ERRORS_TOTAL),
      1,
      this.withDefaultLabels({
        context,
        [AGENTKIT_LABELS.ERROR_TYPE]: errorType,
        [AGENTKIT_LABELS.ERROR_CODE]: errorCode || 'unknown'
      })
    )
  }

  /**
   * Record transport operation
   */
  recordTransportOperation(
    transportId: string,
    transportType: string,
    operation: 'send' | 'receive',
    duration: number,
    status: string
  ): void {
    if (!this.config.enabled) return

    const labels = this.withDefaultLabels({
      [AGENTKIT_LABELS.TRANSPORT_ID]: transportId,
      [AGENTKIT_LABELS.TRANSPORT_TYPE]: transportType,
      [AGENTKIT_LABELS.STATUS]: status
    })

    if (operation === 'send') {
      this.collector.incrementCounter(
        this.withPrefix(AGENTKIT_METRICS.TRANSPORT_MESSAGES_SENT_TOTAL),
        1,
        labels
      )
    } else {
      this.collector.incrementCounter(
        this.withPrefix(AGENTKIT_METRICS.TRANSPORT_MESSAGES_RECEIVED_TOTAL),
        1,
        labels
      )
    }

    this.collector.observeHistogram(
      this.withPrefix(AGENTKIT_METRICS.TRANSPORT_SEND_DURATION_SECONDS),
      duration / 1000,
      labels
    )
  }

  /**
   * Record transport queue size
   */
  recordTransportQueueSize(transportId: string, queueSize: number): void {
    if (!this.config.enabled) return

    this.collector.setGauge(
      this.withPrefix(AGENTKIT_METRICS.TRANSPORT_QUEUE_SIZE),
      queueSize,
      this.withDefaultLabels({
        [AGENTKIT_LABELS.TRANSPORT_ID]: transportId
      })
    )
  }

  /**
   * Record plugin execution
   */
  recordPluginExecution(
    pluginName: string,
    hookName: string,
    duration: number,
    status: 'success' | 'error' | 'timeout'
  ): void {
    if (!this.config.enabled) return

    const labels = this.withDefaultLabels({
      [AGENTKIT_LABELS.PLUGIN_NAME]: pluginName,
      [AGENTKIT_LABELS.HOOK_NAME]: hookName,
      [AGENTKIT_LABELS.STATUS]: status
    })

    this.collector.incrementCounter(
      this.withPrefix(AGENTKIT_METRICS.PLUGIN_EXECUTIONS_TOTAL),
      1,
      labels
    )

    this.collector.observeHistogram(
      this.withPrefix(AGENTKIT_METRICS.PLUGIN_EXECUTION_DURATION_SECONDS),
      duration / 1000,
      labels
    )

    if (status === 'error') {
      this.collector.incrementCounter(
        this.withPrefix(AGENTKIT_METRICS.PLUGIN_ERRORS_TOTAL),
        1,
        { [AGENTKIT_LABELS.PLUGIN_NAME]: pluginName, [AGENTKIT_LABELS.HOOK_NAME]: hookName }
      )
    }

    if (status === 'timeout') {
      this.collector.incrementCounter(
        this.withPrefix(AGENTKIT_METRICS.PLUGIN_TIMEOUTS_TOTAL),
        1,
        { [AGENTKIT_LABELS.PLUGIN_NAME]: pluginName, [AGENTKIT_LABELS.HOOK_NAME]: hookName }
      )
    }
  }

  /**
   * Record registry operation
   */
  recordRegistryOperation(operation: 'register' | 'lookup', agentId?: string): void {
    if (!this.config.enabled) return

    if (operation === 'register') {
      this.collector.incrementCounter(
        this.withPrefix(AGENTKIT_METRICS.REGISTRY_AGENTS_REGISTERED_TOTAL),
        1,
        this.withDefaultLabels(agentId ? { [AGENTKIT_LABELS.AGENT_ID]: agentId } : {})
      )
      this.updateRegistryAgentCount()
    } else {
      this.collector.incrementCounter(
        this.withPrefix(AGENTKIT_METRICS.REGISTRY_LOOKUPS_TOTAL),
        1,
        this.withDefaultLabels(agentId ? { [AGENTKIT_LABELS.AGENT_ID]: agentId } : {})
      )
    }
  }

  /**
   * Shutdown instrumentation and cleanup resources
   */
  shutdown(): void {
    if (this.resourceMetricsTimer) {
      clearInterval(this.resourceMetricsTimer)
      this.resourceMetricsTimer = undefined
    }
  }

  private registerStandardMetrics(): void {
    const metrics = [
      // Agent metrics
      { name: AGENTKIT_METRICS.AGENT_INITIALIZATIONS_TOTAL, type: 'counter' as const, help: 'Total number of agent initializations' },
      { name: AGENTKIT_METRICS.AGENT_SHUTDOWNS_TOTAL, type: 'counter' as const, help: 'Total number of agent shutdowns' },
      { name: AGENTKIT_METRICS.AGENT_ACTIVE_COUNT, type: 'gauge' as const, help: 'Current number of active agents' },
      { name: AGENTKIT_METRICS.AGENT_INITIALIZATION_DURATION_SECONDS, type: 'histogram' as const, help: 'Time taken to initialize agents' },

      // Request metrics
      { name: AGENTKIT_METRICS.REQUESTS_TOTAL, type: 'counter' as const, help: 'Total number of requests processed' },
      { name: AGENTKIT_METRICS.REQUEST_DURATION_SECONDS, type: 'histogram' as const, help: 'Request processing duration' },
      { name: AGENTKIT_METRICS.REQUEST_SIZE_BYTES, type: 'histogram' as const, help: 'Request payload size in bytes' },
      { name: AGENTKIT_METRICS.RESPONSE_SIZE_BYTES, type: 'histogram' as const, help: 'Response payload size in bytes' },

      // Error metrics
      { name: AGENTKIT_METRICS.ERRORS_TOTAL, type: 'counter' as const, help: 'Total number of errors' },

      // Transport metrics
      { name: AGENTKIT_METRICS.TRANSPORT_MESSAGES_SENT_TOTAL, type: 'counter' as const, help: 'Total number of messages sent via transport' },
      { name: AGENTKIT_METRICS.TRANSPORT_MESSAGES_RECEIVED_TOTAL, type: 'counter' as const, help: 'Total number of messages received via transport' },
      { name: AGENTKIT_METRICS.TRANSPORT_SEND_DURATION_SECONDS, type: 'histogram' as const, help: 'Transport send operation duration' },
      { name: AGENTKIT_METRICS.TRANSPORT_QUEUE_SIZE, type: 'gauge' as const, help: 'Current transport queue size' },

      // Plugin metrics
      { name: AGENTKIT_METRICS.PLUGIN_EXECUTIONS_TOTAL, type: 'counter' as const, help: 'Total number of plugin executions' },
      { name: AGENTKIT_METRICS.PLUGIN_EXECUTION_DURATION_SECONDS, type: 'histogram' as const, help: 'Plugin execution duration' },
      { name: AGENTKIT_METRICS.PLUGIN_ERRORS_TOTAL, type: 'counter' as const, help: 'Total number of plugin errors' },
      { name: AGENTKIT_METRICS.PLUGIN_TIMEOUTS_TOTAL, type: 'counter' as const, help: 'Total number of plugin timeouts' },

      // Registry metrics
      { name: AGENTKIT_METRICS.REGISTRY_AGENTS_REGISTERED_TOTAL, type: 'counter' as const, help: 'Total number of agents registered' },
      { name: AGENTKIT_METRICS.REGISTRY_AGENTS_COUNT, type: 'gauge' as const, help: 'Current number of registered agents' },
      { name: AGENTKIT_METRICS.REGISTRY_LOOKUPS_TOTAL, type: 'counter' as const, help: 'Total number of registry lookups' },

      // Resource metrics
      { name: AGENTKIT_METRICS.MEMORY_USAGE_BYTES, type: 'gauge' as const, help: 'Current memory usage in bytes' },
      { name: AGENTKIT_METRICS.CPU_USAGE_RATIO, type: 'gauge' as const, help: 'CPU usage ratio (0-1)' },
      { name: AGENTKIT_METRICS.ACTIVE_HANDLES_COUNT, type: 'gauge' as const, help: 'Number of active handles' }
    ]

    for (const metric of metrics) {
      this.collector.register({
        name: this.withPrefix(metric.name),
        type: metric.type,
        help: metric.help
      })
    }
  }

  private startResourceMetricsCollection(): void {
    this.resourceMetricsTimer = setInterval(() => {
      this.collectResourceMetrics()
    }, this.config.resourceMetricsInterval)

    // Collect initial metrics
    this.collectResourceMetrics()
  }

  private collectResourceMetrics(): void {
    if (!this.config.enabled) return

    try {
      // Memory usage
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const memUsage = process.memoryUsage()
        this.collector.setGauge(
          this.withPrefix(AGENTKIT_METRICS.MEMORY_USAGE_BYTES),
          memUsage.heapUsed,
          this.withDefaultLabels({ type: 'heap_used' })
        )
      }

      // CPU usage (simplified - in production you'd want a more sophisticated implementation)
      if (typeof process !== 'undefined' && process.cpuUsage) {
        const cpuUsage = process.cpuUsage()
        const totalUsage = cpuUsage.user + cpuUsage.system
        const ratio = totalUsage / (Date.now() - this.startTime) / 1000
        this.collector.setGauge(
          this.withPrefix(AGENTKIT_METRICS.CPU_USAGE_RATIO),
          Math.min(ratio, 1), // Cap at 100%
          this.withDefaultLabels()
        )
      }

      // Active handles (Node.js specific)
      if (typeof process !== 'undefined' && (process as any)._getActiveHandles) {
        const handles = (process as any)._getActiveHandles()
        this.collector.setGauge(
          this.withPrefix(AGENTKIT_METRICS.ACTIVE_HANDLES_COUNT),
          handles.length,
          this.withDefaultLabels()
        )
      }
    } catch (error) {
      // Silently ignore errors in resource metrics collection
      // to avoid breaking the main application
    }
  }

  private updateActiveAgentCount(): void {
    // This is a placeholder - in a real implementation you'd track this
    // based on actual agent lifecycle events
    const activeCount = 1 // Would be calculated from actual state
    this.collector.setGauge(
      this.withPrefix(AGENTKIT_METRICS.AGENT_ACTIVE_COUNT),
      activeCount,
      this.withDefaultLabels()
    )
  }

  private updateRegistryAgentCount(): void {
    // This is a placeholder - in a real implementation you'd track this
    // based on actual registry state
    const registeredCount = 1 // Would be calculated from actual registry
    this.collector.setGauge(
      this.withPrefix(AGENTKIT_METRICS.REGISTRY_AGENTS_COUNT),
      registeredCount,
      this.withDefaultLabels()
    )
  }

  private withPrefix(metricName: string): string {
    return this.config.prefix ? `${this.config.prefix}_${metricName}` : metricName
  }

  private withDefaultLabels(labels: Record<string, string> = {}): Record<string, string> {
    return { ...this.config.defaultLabels, ...labels }
  }
}