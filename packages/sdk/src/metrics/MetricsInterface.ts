/**
 * Prometheus-compatible metrics interface for AgentKit SDK
 * Supports standard Prometheus metric types and conventions
 */

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary'

export interface MetricLabels {
  [key: string]: string | number | boolean
}

export interface MetricValue {
  value: number
  timestamp?: number
  labels?: MetricLabels
}

export interface HistogramBucket {
  le: number // "less than or equal to"
  count: number
}

export interface HistogramValue extends MetricValue {
  buckets: HistogramBucket[]
  sum: number
  count: number
}

export interface SummaryQuantile {
  quantile: number
  value: number
}

export interface SummaryValue extends MetricValue {
  quantiles: SummaryQuantile[]
  sum: number
  count: number
}

export interface MetricDefinition {
  name: string
  type: MetricType
  help: string
  unit?: string
  labelNames?: string[]
}

export interface SerializedMetric {
  name: string
  type: MetricType
  help: string
  values: (MetricValue | HistogramValue | SummaryValue)[]
}

/**
 * Interface for metric collectors that can be scraped by Prometheus
 */
export interface MetricsCollector {
  /**
   * Register a new metric definition
   */
  register(metric: MetricDefinition): void

  /**
   * Record a counter increment
   */
  incrementCounter(name: string, value?: number, labels?: MetricLabels): void

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, labels?: MetricLabels): void

  /**
   * Record a histogram observation
   */
  observeHistogram(name: string, value: number, labels?: MetricLabels): void

  /**
   * Record a summary observation
   */
  observeSummary(name: string, value: number, labels?: MetricLabels): void

  /**
   * Get all metrics in Prometheus text format
   */
  getPrometheusMetrics(): string

  /**
   * Get all metrics as structured data
   */
  getMetrics(): SerializedMetric[]

  /**
   * Clear all recorded metrics (useful for testing)
   */
  clear(): void

  /**
   * Get metric by name
   */
  getMetric(name: string): SerializedMetric | undefined
}

/**
 * Default histogram buckets following Prometheus conventions
 */
export const DEFAULT_HISTOGRAM_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0, Infinity
]

/**
 * Default summary quantiles following Prometheus conventions
 */
export const DEFAULT_SUMMARY_QUANTILES = [0.5, 0.9, 0.95, 0.99]

/**
 * Standard AgentKit metric names following Prometheus naming conventions
 */
export const AGENTKIT_METRICS = {
  // Agent lifecycle metrics
  AGENT_INITIALIZATIONS_TOTAL: 'agentkit_agent_initializations_total',
  AGENT_SHUTDOWNS_TOTAL: 'agentkit_agent_shutdowns_total',
  AGENT_ACTIVE_COUNT: 'agentkit_agent_active_count',
  AGENT_INITIALIZATION_DURATION_SECONDS: 'agentkit_agent_initialization_duration_seconds',

  // Request handling metrics
  REQUESTS_TOTAL: 'agentkit_requests_total',
  REQUEST_DURATION_SECONDS: 'agentkit_request_duration_seconds',
  REQUEST_SIZE_BYTES: 'agentkit_request_size_bytes',
  RESPONSE_SIZE_BYTES: 'agentkit_response_size_bytes',

  // Error metrics
  ERRORS_TOTAL: 'agentkit_errors_total',
  ERROR_RATE: 'agentkit_error_rate',

  // Transport metrics
  TRANSPORT_CONNECTIONS_TOTAL: 'agentkit_transport_connections_total',
  TRANSPORT_MESSAGES_SENT_TOTAL: 'agentkit_transport_messages_sent_total',
  TRANSPORT_MESSAGES_RECEIVED_TOTAL: 'agentkit_transport_messages_received_total',
  TRANSPORT_SEND_DURATION_SECONDS: 'agentkit_transport_send_duration_seconds',
  TRANSPORT_QUEUE_SIZE: 'agentkit_transport_queue_size',

  // Plugin metrics
  PLUGIN_EXECUTIONS_TOTAL: 'agentkit_plugin_executions_total',
  PLUGIN_EXECUTION_DURATION_SECONDS: 'agentkit_plugin_execution_duration_seconds',
  PLUGIN_ERRORS_TOTAL: 'agentkit_plugin_errors_total',
  PLUGIN_TIMEOUTS_TOTAL: 'agentkit_plugin_timeouts_total',

  // Registry metrics
  REGISTRY_AGENTS_REGISTERED_TOTAL: 'agentkit_registry_agents_registered_total',
  REGISTRY_AGENTS_COUNT: 'agentkit_registry_agents_count',
  REGISTRY_LOOKUPS_TOTAL: 'agentkit_registry_lookups_total',

  // Resource usage metrics
  MEMORY_USAGE_BYTES: 'agentkit_memory_usage_bytes',
  CPU_USAGE_RATIO: 'agentkit_cpu_usage_ratio',
  ACTIVE_HANDLES_COUNT: 'agentkit_active_handles_count'
} as const

/**
 * Standard label names for AgentKit metrics
 */
export const AGENTKIT_LABELS = {
  AGENT_ID: 'agent_id',
  AGENT_TYPE: 'agent_type',
  TRANSPORT_ID: 'transport_id',
  TRANSPORT_TYPE: 'transport_type',
  PLUGIN_NAME: 'plugin_name',
  HOOK_NAME: 'hook_name',
  ERROR_TYPE: 'error_type',
  ERROR_CODE: 'error_code',
  STATUS: 'status',
  METHOD: 'method',
  ENDPOINT: 'endpoint'
} as const