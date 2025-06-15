import {
  MetricsCollector,
  MetricDefinition,
  MetricLabels,
  MetricValue,
  HistogramValue,
  SummaryValue,
  SerializedMetric,
  HistogramBucket,
  SummaryQuantile,
  DEFAULT_HISTOGRAM_BUCKETS,
  DEFAULT_SUMMARY_QUANTILES
} from './MetricsInterface'

interface RegisteredMetric extends MetricDefinition {
  values: Map<string, MetricValue | HistogramValue | SummaryValue>
}

/**
 * Prometheus-compatible metrics collector implementation
 */
export class PrometheusCollector implements MetricsCollector {
  private metrics = new Map<string, RegisteredMetric>()
  private histogramBuckets = new Map<string, number[]>()
  private summaryQuantiles = new Map<string, number[]>()

  register(metric: MetricDefinition): void {
    if (this.metrics.has(metric.name)) {
      throw new Error(`Metric ${metric.name} is already registered`)
    }

    // Validate metric name follows Prometheus conventions
    if (!this.isValidMetricName(metric.name)) {
      throw new Error(`Invalid metric name: ${metric.name}. Must match [a-zA-Z_:][a-zA-Z0-9_:]*`)
    }

    // Set default buckets for histograms
    if (metric.type === 'histogram') {
      this.histogramBuckets.set(metric.name, DEFAULT_HISTOGRAM_BUCKETS)
    }

    // Set default quantiles for summaries
    if (metric.type === 'summary') {
      this.summaryQuantiles.set(metric.name, DEFAULT_SUMMARY_QUANTILES)
    }

    const registeredMetric: RegisteredMetric = {
      ...metric,
      values: new Map()
    }

    this.metrics.set(metric.name, registeredMetric)
  }

  incrementCounter(name: string, value = 1, labels?: MetricLabels): void {
    this.ensureMetricExists(name, 'counter')
    const key = this.getLabelKey(labels)
    const metric = this.metrics.get(name)!
    
    const existing = metric.values.get(key) as MetricValue | undefined
    const newValue: MetricValue = {
      value: (existing?.value || 0) + value,
      timestamp: Date.now(),
      labels
    }
    
    metric.values.set(key, newValue)
  }

  setGauge(name: string, value: number, labels?: MetricLabels): void {
    this.ensureMetricExists(name, 'gauge')
    const key = this.getLabelKey(labels)
    const metric = this.metrics.get(name)!
    
    const newValue: MetricValue = {
      value,
      timestamp: Date.now(),
      labels
    }
    
    metric.values.set(key, newValue)
  }

  observeHistogram(name: string, value: number, labels?: MetricLabels): void {
    this.ensureMetricExists(name, 'histogram')
    const key = this.getLabelKey(labels)
    const metric = this.metrics.get(name)!
    const buckets = this.histogramBuckets.get(name) || DEFAULT_HISTOGRAM_BUCKETS
    
    const existing = metric.values.get(key) as HistogramValue | undefined
    
    // Update bucket counts
    const newBuckets: HistogramBucket[] = buckets.map(le => {
      const existingBucket = existing?.buckets.find(b => b.le === le)
      const count = (existingBucket?.count || 0) + (value <= le ? 1 : 0)
      return { le, count }
    })
    
    const newValue: HistogramValue = {
      value,
      timestamp: Date.now(),
      labels,
      buckets: newBuckets,
      sum: (existing?.sum || 0) + value,
      count: (existing?.count || 0) + 1
    }
    
    metric.values.set(key, newValue)
  }

  observeSummary(name: string, value: number, labels?: MetricLabels): void {
    this.ensureMetricExists(name, 'summary')
    const key = this.getLabelKey(labels)
    const metric = this.metrics.get(name)!
    const quantiles = this.summaryQuantiles.get(name) || DEFAULT_SUMMARY_QUANTILES
    
    const existing = metric.values.get(key) as SummaryValue | undefined
    
    // For simplicity, we'll store all observations and calculate quantiles on-demand
    // In production, you might want to use a more efficient streaming quantile algorithm
    const allValues = [...(existing?.values || []), value].sort((a, b) => a - b)
    
    const newQuantiles: SummaryQuantile[] = quantiles.map(q => ({
      quantile: q,
      value: this.calculateQuantile(allValues, q)
    }))
    
    const newValue: SummaryValue = {
      value,
      timestamp: Date.now(),
      labels,
      quantiles: newQuantiles,
      sum: (existing?.sum || 0) + value,
      count: (existing?.count || 0) + 1,
      values: allValues
    }
    
    metric.values.set(key, newValue)
  }

  getPrometheusMetrics(): string {
    const lines: string[] = []
    
    for (const [name, metric] of this.metrics) {
      // Add HELP line
      lines.push(`# HELP ${name} ${metric.help}`)
      
      // Add TYPE line
      lines.push(`# TYPE ${name} ${metric.type}`)
      
      // Add metric values
      for (const value of metric.values.values()) {
        lines.push(...this.formatMetricValue(name, metric.type, value))
      }
      
      lines.push('') // Empty line between metrics
    }
    
    return lines.join('\n')
  }

  getMetrics(): SerializedMetric[] {
    return Array.from(this.metrics.values()).map(metric => ({
      name: metric.name,
      type: metric.type,
      help: metric.help,
      values: Array.from(metric.values.values())
    }))
  }

  clear(): void {
    this.metrics.clear()
    this.histogramBuckets.clear()
    this.summaryQuantiles.clear()
  }

  getMetric(name: string): SerializedMetric | undefined {
    const metric = this.metrics.get(name)
    if (!metric) return undefined
    
    return {
      name: metric.name,
      type: metric.type,
      help: metric.help,
      values: Array.from(metric.values.values())
    }
  }

  /**
   * Configure custom histogram buckets for a metric
   */
  setHistogramBuckets(name: string, buckets: number[]): void {
    const sortedBuckets = [...buckets, Infinity].sort((a, b) => a - b)
    this.histogramBuckets.set(name, sortedBuckets)
  }

  /**
   * Configure custom summary quantiles for a metric
   */
  setSummaryQuantiles(name: string, quantiles: number[]): void {
    const validQuantiles = quantiles.filter(q => q >= 0 && q <= 1).sort()
    this.summaryQuantiles.set(name, validQuantiles)
  }

  private ensureMetricExists(name: string, expectedType: string): void {
    const metric = this.metrics.get(name)
    if (!metric) {
      throw new Error(`Metric ${name} is not registered. Call register() first.`)
    }
    if (metric.type !== expectedType) {
      throw new Error(`Metric ${name} is registered as ${metric.type}, not ${expectedType}`)
    }
  }

  private getLabelKey(labels?: MetricLabels): string {
    if (!labels || Object.keys(labels).length === 0) {
      return ''
    }
    
    // Sort labels by key for consistent hashing
    const sortedEntries = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
    
    return sortedEntries.join(',')
  }

  private formatMetricValue(name: string, type: string, value: MetricValue | HistogramValue | SummaryValue): string[] {
    const lines: string[] = []
    const labelStr = this.formatLabels(value.labels)
    
    switch (type) {
      case 'counter':
      case 'gauge':
        lines.push(`${name}${labelStr} ${value.value} ${value.timestamp}`)
        break
        
      case 'histogram':
        const histValue = value as HistogramValue
        
        // Add bucket values
        for (const bucket of histValue.buckets) {
          const bucketLabels = { ...value.labels, le: bucket.le === Infinity ? '+Inf' : bucket.le.toString() }
          const bucketLabelStr = this.formatLabels(bucketLabels)
          lines.push(`${name}_bucket${bucketLabelStr} ${bucket.count} ${value.timestamp}`)
        }
        
        // Add sum and count
        lines.push(`${name}_sum${labelStr} ${histValue.sum} ${value.timestamp}`)
        lines.push(`${name}_count${labelStr} ${histValue.count} ${value.timestamp}`)
        break
        
      case 'summary':
        const summaryValue = value as SummaryValue
        
        // Add quantile values
        for (const quantile of summaryValue.quantiles) {
          const quantileLabels = { ...value.labels, quantile: quantile.quantile.toString() }
          const quantileLabelStr = this.formatLabels(quantileLabels)
          lines.push(`${name}${quantileLabelStr} ${quantile.value} ${value.timestamp}`)
        }
        
        // Add sum and count
        lines.push(`${name}_sum${labelStr} ${summaryValue.sum} ${value.timestamp}`)
        lines.push(`${name}_count${labelStr} ${summaryValue.count} ${value.timestamp}`)
        break
    }
    
    return lines
  }

  private formatLabels(labels?: MetricLabels): string {
    if (!labels || Object.keys(labels).length === 0) {
      return ''
    }
    
    const labelPairs = Object.entries(labels)
      .map(([key, value]) => `${key}="${this.escapeLabel(value.toString())}"`)
      .join(',')
    
    return `{${labelPairs}}`
  }

  private escapeLabel(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t')
      .replace(/\r/g, '\\r')
  }

  private calculateQuantile(sortedValues: number[], quantile: number): number {
    if (sortedValues.length === 0) return 0
    if (quantile <= 0) return sortedValues[0]
    if (quantile >= 1) return sortedValues[sortedValues.length - 1]
    
    const index = quantile * (sortedValues.length - 1)
    const lower = Math.floor(index)
    const upper = Math.ceil(index)
    
    if (lower === upper) {
      return sortedValues[lower]
    }
    
    const weight = index - lower
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight
  }

  private isValidMetricName(name: string): boolean {
    // Prometheus metric name regex: [a-zA-Z_:][a-zA-Z0-9_:]*
    return /^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name)
  }
}

// Add missing property to SummaryValue interface
declare module './MetricsInterface' {
  interface SummaryValue {
    values?: number[]
  }
}