import { PrometheusCollector } from '../../src/metrics/PrometheusCollector'

describe('PrometheusCollector', () => {
  let collector: PrometheusCollector

  beforeEach(() => {
    collector = new PrometheusCollector()
  })

  describe('Metric Registration', () => {
    it('should register a counter metric', () => {
      collector.register({
        name: 'test_counter_total',
        type: 'counter',
        help: 'Test counter metric'
      })

      const metric = collector.getMetric('test_counter_total')
      expect(metric).toBeDefined()
      expect(metric?.type).toBe('counter')
      expect(metric?.help).toBe('Test counter metric')
    })

    it('should reject invalid metric names', () => {
      expect(() => {
        collector.register({
          name: '123invalid',
          type: 'counter',
          help: 'Invalid name'
        })
      }).toThrow('Invalid metric name')
    })

    it('should reject duplicate metric registration', () => {
      collector.register({
        name: 'test_metric',
        type: 'counter',
        help: 'Test metric'
      })

      expect(() => {
        collector.register({
          name: 'test_metric',
          type: 'gauge',
          help: 'Duplicate metric'
        })
      }).toThrow('Metric test_metric is already registered')
    })
  })

  describe('Counter Metrics', () => {
    beforeEach(() => {
      collector.register({
        name: 'test_counter_total',
        type: 'counter',
        help: 'Test counter'
      })
    })

    it('should increment counter without labels', () => {
      collector.incrementCounter('test_counter_total', 5)
      
      const metric = collector.getMetric('test_counter_total')
      expect(metric?.values).toHaveLength(1)
      expect(metric?.values[0].value).toBe(5)
    })

    it('should increment counter with labels', () => {
      collector.incrementCounter('test_counter_total', 3, { method: 'GET' })
      collector.incrementCounter('test_counter_total', 2, { method: 'POST' })
      
      const metric = collector.getMetric('test_counter_total')
      expect(metric?.values).toHaveLength(2)
    })

    it('should accumulate counter values', () => {
      collector.incrementCounter('test_counter_total', 3)
      collector.incrementCounter('test_counter_total', 2)
      
      const metric = collector.getMetric('test_counter_total')
      expect(metric?.values[0].value).toBe(5)
    })
  })

  describe('Gauge Metrics', () => {
    beforeEach(() => {
      collector.register({
        name: 'test_gauge',
        type: 'gauge',
        help: 'Test gauge'
      })
    })

    it('should set gauge values', () => {
      collector.setGauge('test_gauge', 42)
      
      const metric = collector.getMetric('test_gauge')
      expect(metric?.values[0].value).toBe(42)
    })

    it('should overwrite gauge values', () => {
      collector.setGauge('test_gauge', 10)
      collector.setGauge('test_gauge', 20)
      
      const metric = collector.getMetric('test_gauge')
      expect(metric?.values[0].value).toBe(20)
    })
  })

  describe('Histogram Metrics', () => {
    beforeEach(() => {
      collector.register({
        name: 'test_histogram',
        type: 'histogram',
        help: 'Test histogram'
      })
    })

    it('should record histogram observations', () => {
      collector.observeHistogram('test_histogram', 0.5)
      collector.observeHistogram('test_histogram', 1.5)
      
      const metric = collector.getMetric('test_histogram')
      expect(metric?.values).toHaveLength(1)
      
      const histValue = metric?.values[0] as any
      expect(histValue.sum).toBe(2.0)
      expect(histValue.count).toBe(2)
      expect(histValue.buckets).toBeDefined()
    })

    it('should update bucket counts correctly', () => {
      collector.observeHistogram('test_histogram', 0.1)
      collector.observeHistogram('test_histogram', 2.0)
      
      const metric = collector.getMetric('test_histogram')
      const histValue = metric?.values[0] as any
      
      // Check that buckets are incremented correctly
      const bucket1 = histValue.buckets.find((b: any) => b.le === 0.25)
      const bucket2 = histValue.buckets.find((b: any) => b.le === 2.5)
      
      expect(bucket1?.count).toBe(1) // Only 0.1 falls in this bucket
      expect(bucket2?.count).toBe(2) // Both values fall in this bucket
    })
  })

  describe('Summary Metrics', () => {
    beforeEach(() => {
      collector.register({
        name: 'test_summary',
        type: 'summary',
        help: 'Test summary'
      })
    })

    it('should record summary observations', () => {
      collector.observeSummary('test_summary', 1.0)
      collector.observeSummary('test_summary', 2.0)
      collector.observeSummary('test_summary', 3.0)
      
      const metric = collector.getMetric('test_summary')
      const summaryValue = metric?.values[0] as any
      
      expect(summaryValue.sum).toBe(6.0)
      expect(summaryValue.count).toBe(3)
      expect(summaryValue.quantiles).toBeDefined()
      expect(summaryValue.quantiles.length).toBeGreaterThan(0)
    })

    it('should calculate quantiles correctly', () => {
      // Add values that we can predict quantiles for
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      for (const value of values) {
        collector.observeSummary('test_summary', value)
      }
      
      const metric = collector.getMetric('test_summary')
      const summaryValue = metric?.values[0] as any
      
      const medianQuantile = summaryValue.quantiles.find((q: any) => q.quantile === 0.5)
      expect(medianQuantile?.value).toBeCloseTo(5.5, 1) // Median of 1-10
    })
  })

  describe('Prometheus Text Format', () => {
    it('should generate valid Prometheus text format', () => {
      collector.register({
        name: 'test_counter_total',
        type: 'counter',
        help: 'Test counter'
      })
      
      collector.incrementCounter('test_counter_total', 5, { status: 'success' })
      
      const prometheusText = collector.getPrometheusMetrics()
      
      expect(prometheusText).toContain('# HELP test_counter_total Test counter')
      expect(prometheusText).toContain('# TYPE test_counter_total counter')
      expect(prometheusText).toContain('test_counter_total{status="success"} 5')
    })

    it('should escape label values properly', () => {
      collector.register({
        name: 'test_metric',
        type: 'counter',
        help: 'Test metric'
      })
      
      collector.incrementCounter('test_metric', 1, { 
        path: '/api/test"path',
        message: 'Error\nwith\nnewlines'
      })
      
      const prometheusText = collector.getPrometheusMetrics()
      
      expect(prometheusText).toContain('path="/api/test\\"path"')
      expect(prometheusText).toContain('message="Error\\nwith\\nnewlines"')
    })
  })

  describe('Label Handling', () => {
    beforeEach(() => {
      collector.register({
        name: 'test_metric',
        type: 'counter',
        help: 'Test metric'
      })
    })

    it('should handle metrics without labels', () => {
      collector.incrementCounter('test_metric', 1)
      
      const prometheusText = collector.getPrometheusMetrics()
      expect(prometheusText).toContain('test_metric 1')
    })

    it('should sort labels consistently', () => {
      collector.incrementCounter('test_metric', 1, { b: '2', a: '1' })
      
      const prometheusText = collector.getPrometheusMetrics()
      expect(prometheusText).toContain('test_metric{a="1",b="2"} 1')
    })
  })

  describe('Error Handling', () => {
    it('should throw error for unregistered metric', () => {
      expect(() => {
        collector.incrementCounter('nonexistent_metric', 1)
      }).toThrow('Metric nonexistent_metric is not registered')
    })

    it('should throw error for wrong metric type', () => {
      collector.register({
        name: 'test_gauge',
        type: 'gauge',
        help: 'Test gauge'
      })

      expect(() => {
        collector.incrementCounter('test_gauge', 1)
      }).toThrow('Metric test_gauge is registered as gauge, not counter')
    })
  })

  describe('Clear and Reset', () => {
    it('should clear all metrics', () => {
      collector.register({
        name: 'test_metric',
        type: 'counter',
        help: 'Test metric'
      })
      
      collector.incrementCounter('test_metric', 5)
      expect(collector.getMetrics()).toHaveLength(1)
      
      collector.clear()
      expect(collector.getMetrics()).toHaveLength(0)
      expect(collector.getMetric('test_metric')).toBeUndefined()
    })
  })
})