/**
 * Performance Observability Integration
 * 
 * Integrates enhanced performance metrics with existing AgentKit observability system
 */

import { z } from 'zod'
import { MetricsCollector, PrometheusMetricsSchema } from '../observability/MetricsCollector'
import { PluginExecutionTimeline } from '../observability/PluginExecutionTimeline'
import type { EnhancedBoundedExecutor, PerformanceMetrics } from './EnhancedBoundedExecutor'
import type { RetryableExecutor } from './RetryableExecutor'

// Extended schema for performance metrics
export const PerformanceMetricsSchema = z.object({
  // Existing observability metrics
  prometheus: PrometheusMetricsSchema,
  
  // Enhanced performance metrics
  performance: z.object({
    executor: z.object({
      queueMetrics: z.object({
        avgQueueSize: z.number(),
        peakQueueSize: z.number(),
        queueSizeHistogram: z.array(z.number()),
        totalEnqueued: z.number(),
        totalDequeued: z.number(),
        totalDropped: z.number()
      }),
      
      executionMetrics: z.object({
        avgExecutionLatency: z.number(),
        p50ExecutionLatency: z.number(),
        p95ExecutionLatency: z.number(),
        p99ExecutionLatency: z.number(),
        avgQueueWaitTime: z.number(),
        timeoutRate: z.number(),
        successRate: z.number()
      }),
      
      reliabilityMetrics: z.object({
        disabledPlugins: z.array(z.string()),
        pluginTimeouts: z.record(z.number()),
        pluginFailures: z.record(z.number()),
        guardrailViolations: z.number(),
        memoryPressureEvents: z.number()
      })
    }),
    
    retry: z.object({
      totalPlugins: z.number(),
      healthyPlugins: z.number(),
      unhealthyPlugins: z.number(),
      openCircuits: z.number(),
      totalRetries: z.number(),
      retryRate: z.number(),
      avgHealthScore: z.number()
    }).optional(),
    
    system: z.object({
      uptime: z.number(),
      peakMemoryUsage: z.number(),
      currentMemoryUsage: z.number(),
      gcEvents: z.number().optional(),
      eventLoopLag: z.number().optional()
    })
  })
})

export type EnhancedPerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>

export class PerformanceObservabilityCollector {
  private metricsCollector: MetricsCollector
  private timeline: PluginExecutionTimeline
  private executor?: EnhancedBoundedExecutor
  private retryExecutor?: RetryableExecutor
  private startTime = Date.now()
  
  // System monitoring
  private gcEventCount = 0
  private lastMemoryUsage = 0
  
  constructor(
    metricsCollector: MetricsCollector,
    timeline: PluginExecutionTimeline
  ) {
    this.metricsCollector = metricsCollector
    this.timeline = timeline
    
    this.setupSystemMonitoring()
  }
  
  setExecutor(executor: EnhancedBoundedExecutor): void {
    this.executor = executor
  }
  
  setRetryExecutor(retryExecutor: RetryableExecutor): void {
    this.retryExecutor = retryExecutor
  }
  
  private setupSystemMonitoring(): void {
    // Monitor GC events if available
    if (typeof global !== 'undefined' && global.gc) {
      const originalGC = global.gc
      global.gc = async () => {
        this.gcEventCount++
        return originalGC()
      }
    }
    
    // Track memory usage
    setInterval(() => {
      this.lastMemoryUsage = process.memoryUsage().heapUsed
    }, 1000)
  }
  
  getEnhancedMetrics(): EnhancedPerformanceMetrics {
    const prometheusMetrics = this.metricsCollector.getMetrics()
    const executorStats = this.executor?.getStats()
    const retryStats = this.retryExecutor?.getStats()
    
    const enhancedMetrics: EnhancedPerformanceMetrics = {
      prometheus: prometheusMetrics,
      performance: {
        executor: {
          queueMetrics: {
            avgQueueSize: executorStats?.avgQueueSize || 0,
            peakQueueSize: executorStats?.peakQueueSize || 0,
            queueSizeHistogram: [], // Would be populated by executor
            totalEnqueued: 0, // Would be tracked by executor
            totalDequeued: 0, // Would be tracked by executor
            totalDropped: 0   // Would be tracked by executor
          },
          
          executionMetrics: {
            avgExecutionLatency: executorStats?.avgExecutionLatency || 0,
            p50ExecutionLatency: executorStats?.p50ExecutionLatency || 0,
            p95ExecutionLatency: executorStats?.p95ExecutionLatency || 0,
            p99ExecutionLatency: 0, // Would need to be calculated
            avgQueueWaitTime: executorStats?.avgQueueWaitTime || 0,
            timeoutRate: executorStats?.timeoutRate || 0,
            successRate: 1 - (executorStats?.timeoutRate || 0)
          },
          
          reliabilityMetrics: {
            disabledPlugins: executorStats?.disabledPlugins || [],
            pluginTimeouts: executorStats?.pluginTimeouts || {},
            pluginFailures: executorStats?.pluginFailures || {},
            guardrailViolations: executorStats?.guardrailViolations || 0,
            memoryPressureEvents: executorStats?.memoryPressureEvents || 0
          }
        },
        
        retry: retryStats ? {
          totalPlugins: retryStats.totalPlugins,
          healthyPlugins: retryStats.healthyPlugins,
          unhealthyPlugins: retryStats.unhealthyPlugins,
          openCircuits: retryStats.openCircuits,
          totalRetries: retryStats.totalRetries,
          retryRate: retryStats.retryRate,
          avgHealthScore: retryStats.avgHealthScore
        } : undefined,
        
        system: {
          uptime: Date.now() - this.startTime,
          peakMemoryUsage: 0, // Would be tracked over time
          currentMemoryUsage: this.lastMemoryUsage,
          gcEvents: this.gcEventCount,
          eventLoopLag: this.measureEventLoopLag()
        }
      }
    }
    
    // Validate against schema
    try {
      return PerformanceMetricsSchema.parse(enhancedMetrics)
    } catch (error) {
      console.error('Enhanced metrics validation failed:', error)
      // Return safe fallback
      return this.getSafeMetrics()
    }
  }
  
  private measureEventLoopLag(): number {
    const start = process.hrtime.bigint()
    return new Promise<number>(resolve => {
      setImmediate(() => {
        const end = process.hrtime.bigint()
        const lag = Number(end - start) / 1000000 // Convert to milliseconds
        resolve(lag)
      })
    }) as any // Return sync for now, would be async in real implementation
  }
  
  private getSafeMetrics(): EnhancedPerformanceMetrics {
    return {
      prometheus: this.metricsCollector.getMetrics(),
      performance: {
        executor: {
          queueMetrics: {
            avgQueueSize: 0,
            peakQueueSize: 0,
            queueSizeHistogram: [],
            totalEnqueued: 0,
            totalDequeued: 0,
            totalDropped: 0
          },
          executionMetrics: {
            avgExecutionLatency: 0,
            p50ExecutionLatency: 0,
            p95ExecutionLatency: 0,
            p99ExecutionLatency: 0,
            avgQueueWaitTime: 0,
            timeoutRate: 0,
            successRate: 1
          },
          reliabilityMetrics: {
            disabledPlugins: [],
            pluginTimeouts: {},
            pluginFailures: {},
            guardrailViolations: 0,
            memoryPressureEvents: 0
          }
        },
        system: {
          uptime: Date.now() - this.startTime,
          peakMemoryUsage: 0,
          currentMemoryUsage: this.lastMemoryUsage,
          gcEvents: this.gcEventCount
        }
      }
    }
  }
  
  exportPrometheusMetrics(): string {
    const metrics = this.getEnhancedMetrics()
    let prometheusText = this.metricsCollector.exportPrometheusMetrics()
    
    // Add enhanced performance metrics
    prometheusText += this.formatPerformanceMetricsForPrometheus(metrics.performance)
    
    return prometheusText
  }
  
  private formatPerformanceMetricsForPrometheus(perfMetrics: any): string {
    const lines: string[] = []
    
    // Queue metrics
    lines.push('')
    lines.push('# HELP agentkit_queue_size_avg Average queue size')
    lines.push('# TYPE agentkit_queue_size_avg gauge')
    lines.push(`agentkit_queue_size_avg ${perfMetrics.executor.queueMetrics.avgQueueSize}`)
    
    lines.push('# HELP agentkit_queue_size_peak Peak queue size')
    lines.push('# TYPE agentkit_queue_size_peak gauge') 
    lines.push(`agentkit_queue_size_peak ${perfMetrics.executor.queueMetrics.peakQueueSize}`)
    
    // Execution latency percentiles
    lines.push('# HELP agentkit_execution_latency_p50 50th percentile execution latency')
    lines.push('# TYPE agentkit_execution_latency_p50 gauge')
    lines.push(`agentkit_execution_latency_p50 ${perfMetrics.executor.executionMetrics.p50ExecutionLatency}`)
    
    lines.push('# HELP agentkit_execution_latency_p95 95th percentile execution latency')
    lines.push('# TYPE agentkit_execution_latency_p95 gauge')
    lines.push(`agentkit_execution_latency_p95 ${perfMetrics.executor.executionMetrics.p95ExecutionLatency}`)
    
    // Reliability metrics
    lines.push('# HELP agentkit_disabled_plugins_total Total disabled plugins')
    lines.push('# TYPE agentkit_disabled_plugins_total gauge')
    lines.push(`agentkit_disabled_plugins_total ${perfMetrics.executor.reliabilityMetrics.disabledPlugins.length}`)
    
    lines.push('# HELP agentkit_guardrail_violations_total Total performance guardrail violations')
    lines.push('# TYPE agentkit_guardrail_violations_total counter')
    lines.push(`agentkit_guardrail_violations_total ${perfMetrics.executor.reliabilityMetrics.guardrailViolations}`)
    
    // System metrics
    lines.push('# HELP agentkit_memory_usage_bytes Current memory usage')
    lines.push('# TYPE agentkit_memory_usage_bytes gauge')
    lines.push(`agentkit_memory_usage_bytes ${perfMetrics.system.currentMemoryUsage}`)
    
    if (perfMetrics.system.gcEvents !== undefined) {
      lines.push('# HELP agentkit_gc_events_total Total garbage collection events')
      lines.push('# TYPE agentkit_gc_events_total counter')
      lines.push(`agentkit_gc_events_total ${perfMetrics.system.gcEvents}`)
    }
    
    // Retry metrics if available
    if (perfMetrics.retry) {
      lines.push('# HELP agentkit_plugin_health_score_avg Average plugin health score')
      lines.push('# TYPE agentkit_plugin_health_score_avg gauge')
      lines.push(`agentkit_plugin_health_score_avg ${perfMetrics.retry.avgHealthScore}`)
      
      lines.push('# HELP agentkit_circuit_breakers_open Open circuit breakers')
      lines.push('# TYPE agentkit_circuit_breakers_open gauge')
      lines.push(`agentkit_circuit_breakers_open ${perfMetrics.retry.openCircuits}`)
      
      lines.push('# HELP agentkit_retry_rate Retry rate (retries per total attempts)')
      lines.push('# TYPE agentkit_retry_rate gauge')
      lines.push(`agentkit_retry_rate ${perfMetrics.retry.retryRate}`)
    }
    
    return lines.join('\n') + '\n'
  }
  
  getPerformanceSummary(): string {
    const metrics = this.getEnhancedMetrics()
    const executor = metrics.performance.executor
    const system = metrics.performance.system
    
    return `
📊 Performance Summary:

🚀 Execution Metrics:
  Avg Latency: ${executor.executionMetrics.avgExecutionLatency.toFixed(2)}ms
  P50 Latency: ${executor.executionMetrics.p50ExecutionLatency}ms
  P95 Latency: ${executor.executionMetrics.p95ExecutionLatency}ms
  Success Rate: ${(executor.executionMetrics.successRate * 100).toFixed(1)}%
  Timeout Rate: ${(executor.executionMetrics.timeoutRate * 100).toFixed(1)}%

📦 Queue Performance:
  Avg Queue Size: ${executor.queueMetrics.avgQueueSize.toFixed(1)}
  Peak Queue Size: ${executor.queueMetrics.peakQueueSize}
  Queue Wait Time: ${executor.executionMetrics.avgQueueWaitTime.toFixed(2)}ms

🔧 Reliability:
  Disabled Plugins: ${executor.reliabilityMetrics.disabledPlugins.length}
  Guardrail Violations: ${executor.reliabilityMetrics.guardrailViolations}
  Memory Pressure Events: ${executor.reliabilityMetrics.memoryPressureEvents}

💾 System Health:
  Memory Usage: ${Math.round(system.currentMemoryUsage / 1024 / 1024)}MB
  Uptime: ${Math.round(system.uptime / 1000)}s
  GC Events: ${system.gcEvents || 'N/A'}

${metrics.performance.retry ? `🔄 Retry Health:
  Healthy Plugins: ${metrics.performance.retry.healthyPlugins}/${metrics.performance.retry.totalPlugins}
  Open Circuits: ${metrics.performance.retry.openCircuits}
  Avg Health Score: ${metrics.performance.retry.avgHealthScore.toFixed(1)}/100
  Retry Rate: ${(metrics.performance.retry.retryRate * 100).toFixed(1)}%` : ''}
`
  }
}