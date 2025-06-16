/**
 * Plugin Performance Snapshot Tool
 * 
 * Captures comprehensive performance metrics for plugin analysis,
 * including execution times, memory usage, error rates, and throughput.
 */

import { PluginPerformanceSnapshot, PluginExecutionTrace } from './types'
import { DebugManager } from './DebugManager'

/**
 * Performance snapshot configuration
 */
export interface SnapshotConfig {
  includeRecentExecutions?: boolean
  maxRecentExecutions?: number
  calculatePercentiles?: boolean
  captureMemoryDetails?: boolean
  captureConcurrencyMetrics?: boolean
  includeHookBreakdown?: boolean
}

/**
 * Plugin performance metrics collector
 */
export class PluginPerformanceCollector {
  private executions: Map<string, PluginExecutionTrace[]> = new Map()
  private memorySnapshots: Map<string, number[]> = new Map()
  private concurrencyMetrics: Map<string, { current: number; peak: number; total: number }> = new Map()
  private debugManager: DebugManager

  constructor(debugManager?: DebugManager) {
    this.debugManager = debugManager || DebugManager.getInstance()
  }

  /**
   * Record a plugin execution
   */
  recordExecution(trace: PluginExecutionTrace): void {
    const pluginName = trace.pluginName
    
    if (!this.executions.has(pluginName)) {
      this.executions.set(pluginName, [])
      this.memorySnapshots.set(pluginName, [])
      this.concurrencyMetrics.set(pluginName, { current: 0, peak: 0, total: 0 })
    }

    this.executions.get(pluginName)!.push(trace)
    
    // Record memory usage if available
    if (trace.memoryUsage) {
      this.memorySnapshots.get(pluginName)!.push(trace.memoryUsage.heapUsed)
    }

    // Update concurrency metrics
    const metrics = this.concurrencyMetrics.get(pluginName)!
    if (trace.status === 'pending') {
      metrics.current++
      metrics.peak = Math.max(metrics.peak, metrics.current)
      metrics.total++
    } else if (metrics.current > 0) {
      metrics.current--
    }
  }

  /**
   * Create a performance snapshot for a specific plugin
   */
  createSnapshot(pluginName: string, config: SnapshotConfig = {}): PluginPerformanceSnapshot | null {
    const executions = this.executions.get(pluginName)
    if (!executions || executions.length === 0) {
      this.debugManager.log('warn', `No execution data found for plugin: ${pluginName}`)
      return null
    }

    const mergedConfig = {
      includeRecentExecutions: true,
      maxRecentExecutions: 10,
      calculatePercentiles: true,
      captureMemoryDetails: true,
      captureConcurrencyMetrics: true,
      includeHookBreakdown: true,
      ...config
    }

    const completedExecutions = executions.filter(e => e.duration !== undefined)
    const errorExecutions = executions.filter(e => e.status === 'error')
    const timeoutExecutions = executions.filter(e => e.status === 'timeout')

    // Calculate basic metrics
    const executionCount = executions.length
    const durations = completedExecutions.map(e => e.duration!).filter(d => d > 0)
    const totalExecutionTime = durations.reduce((sum, d) => sum + d, 0)
    const averageExecutionTime = durations.length > 0 ? totalExecutionTime / durations.length : 0
    const minExecutionTime = durations.length > 0 ? Math.min(...durations) : 0
    const maxExecutionTime = durations.length > 0 ? Math.max(...durations) : 0
    const successRate = executionCount > 0 ? ((executionCount - errorExecutions.length - timeoutExecutions.length) / executionCount) * 100 : 0

    // Calculate memory metrics
    const memoryUsage = this.calculateMemoryMetrics(pluginName)
    
    // Calculate hook-level metrics
    const hookMetrics = mergedConfig.includeHookBreakdown ? this.calculateHookMetrics(executions) : {}
    
    // Get recent executions
    const recentExecutions = mergedConfig.includeRecentExecutions 
      ? executions.slice(-mergedConfig.maxRecentExecutions)
      : []

    // Calculate performance percentiles
    const performance = mergedConfig.calculatePercentiles 
      ? this.calculatePerformanceMetrics(durations, executions) 
      : {
          percentiles: { p50: 0, p90: 0, p95: 0, p99: 0 },
          throughput: 0,
          concurrency: { current: 0, peak: 0, average: 0 }
        }

    const snapshot: PluginPerformanceSnapshot = {
      pluginName,
      snapshotTime: Date.now(),
      executionCount,
      totalExecutionTime,
      averageExecutionTime,
      minExecutionTime,
      maxExecutionTime,
      errorCount: errorExecutions.length,
      timeoutCount: timeoutExecutions.length,
      successRate,
      memoryUsage,
      hookMetrics,
      recentExecutions,
      performance
    }

    this.debugManager.log('debug', `Created performance snapshot for ${pluginName}`, {
      executionCount,
      averageExecutionTime: `${averageExecutionTime.toFixed(2)}ms`,
      successRate: `${successRate.toFixed(1)}%`,
      memoryUsage: `${(memoryUsage.current / 1024 / 1024).toFixed(2)}MB`
    })

    return snapshot
  }

  /**
   * Create snapshots for all plugins
   */
  createAllSnapshots(config: SnapshotConfig = {}): PluginPerformanceSnapshot[] {
    const snapshots: PluginPerformanceSnapshot[] = []
    
    for (const pluginName of this.executions.keys()) {
      const snapshot = this.createSnapshot(pluginName, config)
      if (snapshot) {
        snapshots.push(snapshot)
      }
    }

    return snapshots
  }

  /**
   * Get performance comparison between plugins
   */
  comparePlugins(pluginNames: string[]): {
    plugins: Array<{
      name: string
      averageExecutionTime: number
      successRate: number
      errorRate: number
      memoryUsage: number
      throughput: number
    }>
    fastest: string
    slowest: string
    mostReliable: string
    leastReliable: string
  } {
    const comparisons = pluginNames.map(name => {
      const snapshot = this.createSnapshot(name)
      if (!snapshot) {
        return {
          name,
          averageExecutionTime: Infinity,
          successRate: 0,
          errorRate: 100,
          memoryUsage: 0,
          throughput: 0
        }
      }

      return {
        name,
        averageExecutionTime: snapshot.averageExecutionTime,
        successRate: snapshot.successRate,
        errorRate: (snapshot.errorCount / snapshot.executionCount) * 100,
        memoryUsage: snapshot.memoryUsage.current,
        throughput: snapshot.performance.throughput
      }
    })

    const fastest = comparisons.reduce((min, p) => 
      p.averageExecutionTime < min.averageExecutionTime ? p : min
    ).name

    const slowest = comparisons.reduce((max, p) => 
      p.averageExecutionTime > max.averageExecutionTime ? p : max
    ).name

    const mostReliable = comparisons.reduce((max, p) => 
      p.successRate > max.successRate ? p : max
    ).name

    const leastReliable = comparisons.reduce((min, p) => 
      p.successRate < min.successRate ? p : min
    ).name

    return {
      plugins: comparisons,
      fastest,
      slowest,
      mostReliable,
      leastReliable
    }
  }

  /**
   * Export performance data as JSON
   */
  exportData(): string {
    const data = {
      snapshots: this.createAllSnapshots(),
      exportTime: Date.now(),
      summary: this.getSummary()
    }

    return JSON.stringify(data, null, 2)
  }

  /**
   * Display performance summary in table format
   */
  displaySummary(): void {
    const snapshots = this.createAllSnapshots()
    
    if (snapshots.length === 0) {
      console.log('📊 No plugin performance data available')
      return
    }

    const tableData = snapshots.map(snapshot => ({
      Plugin: snapshot.pluginName,
      Executions: snapshot.executionCount,
      'Avg Time': `${snapshot.averageExecutionTime.toFixed(2)}ms`,
      'Success Rate': `${snapshot.successRate.toFixed(1)}%`,
      Errors: snapshot.errorCount,
      Timeouts: snapshot.timeoutCount,
      'Memory': `${(snapshot.memoryUsage.current / 1024 / 1024).toFixed(2)}MB`,
      'Throughput': `${snapshot.performance.throughput.toFixed(2)}/s`
    }))

    this.debugManager.table(tableData, 'Plugin Performance Summary')
  }

  /**
   * Clear all performance data
   */
  clear(): void {
    this.executions.clear()
    this.memorySnapshots.clear()
    this.concurrencyMetrics.clear()
    this.debugManager.log('debug', 'Cleared all plugin performance data')
  }

  /**
   * Get overall summary statistics
   */
  getSummary(): {
    totalPlugins: number
    totalExecutions: number
    averageSuccessRate: number
    totalErrors: number
    totalTimeouts: number
    fastestPlugin: string | null
    slowestPlugin: string | null
  } {
    const snapshots = this.createAllSnapshots()
    
    if (snapshots.length === 0) {
      return {
        totalPlugins: 0,
        totalExecutions: 0,
        averageSuccessRate: 0,
        totalErrors: 0,
        totalTimeouts: 0,
        fastestPlugin: null,
        slowestPlugin: null
      }
    }

    const totalPlugins = snapshots.length
    const totalExecutions = snapshots.reduce((sum, s) => sum + s.executionCount, 0)
    const averageSuccessRate = snapshots.reduce((sum, s) => sum + s.successRate, 0) / totalPlugins
    const totalErrors = snapshots.reduce((sum, s) => sum + s.errorCount, 0)
    const totalTimeouts = snapshots.reduce((sum, s) => sum + s.timeoutCount, 0)
    
    const fastestPlugin = snapshots.reduce((min, s) => 
      s.averageExecutionTime < min.averageExecutionTime ? s : min
    ).pluginName

    const slowestPlugin = snapshots.reduce((max, s) => 
      s.averageExecutionTime > max.averageExecutionTime ? s : max
    ).pluginName

    return {
      totalPlugins,
      totalExecutions,
      averageSuccessRate,
      totalErrors,
      totalTimeouts,
      fastestPlugin,
      slowestPlugin
    }
  }

  private calculateMemoryMetrics(pluginName: string) {
    const snapshots = this.memorySnapshots.get(pluginName) || []
    
    if (snapshots.length === 0) {
      return { current: 0, peak: 0, average: 0 }
    }

    const current = snapshots[snapshots.length - 1] || 0
    const peak = Math.max(...snapshots)
    const average = snapshots.reduce((sum, s) => sum + s, 0) / snapshots.length

    return { current, peak, average }
  }

  private calculateHookMetrics(executions: PluginExecutionTrace[]) {
    const hookStats: Record<string, {
      executionCount: number
      totalTime: number
      averageTime: number
      errorCount: number
    }> = {}

    executions.forEach(exec => {
      const hookName = exec.hookName
      
      if (!hookStats[hookName]) {
        hookStats[hookName] = {
          executionCount: 0,
          totalTime: 0,
          averageTime: 0,
          errorCount: 0
        }
      }

      const stats = hookStats[hookName]
      stats.executionCount++
      
      if (exec.duration) {
        stats.totalTime += exec.duration
      }
      
      if (exec.status === 'error') {
        stats.errorCount++
      }
    })

    // Calculate averages
    Object.values(hookStats).forEach(stats => {
      stats.averageTime = stats.executionCount > 0 ? stats.totalTime / stats.executionCount : 0
    })

    return hookStats
  }

  private calculatePerformanceMetrics(durations: number[], executions: PluginExecutionTrace[]) {
    const percentiles = this.calculatePercentiles(durations)
    const throughput = this.calculateThroughput(executions)
    const concurrency = this.calculateConcurrencyMetrics(executions)

    return {
      percentiles,
      throughput,
      concurrency
    }
  }

  private calculatePercentiles(durations: number[]) {
    if (durations.length === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0 }
    }

    const sorted = [...durations].sort((a, b) => a - b)
    
    return {
      p50: this.getPercentile(sorted, 50),
      p90: this.getPercentile(sorted, 90),
      p95: this.getPercentile(sorted, 95),
      p99: this.getPercentile(sorted, 99)
    }
  }

  private getPercentile(sorted: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sorted.length) - 1
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))]
  }

  private calculateThroughput(executions: PluginExecutionTrace[]): number {
    if (executions.length === 0) return 0

    const completedExecutions = executions.filter(e => e.status === 'success')
    if (completedExecutions.length === 0) return 0

    const timeSpan = Math.max(...executions.map(e => e.endTime || e.startTime)) - 
                    Math.min(...executions.map(e => e.startTime))
    
    return timeSpan > 0 ? (completedExecutions.length / timeSpan) * 1000 : 0 // per second
  }

  private calculateConcurrencyMetrics(executions: PluginExecutionTrace[]) {
    // This is a simplified calculation
    // In a real implementation, you'd track concurrent executions over time
    const maxConcurrent = Math.max(1, Math.ceil(executions.length / 10))
    
    return {
      current: executions.filter(e => e.status === 'pending').length,
      peak: maxConcurrent,
      average: maxConcurrent / 2
    }
  }
}

/**
 * Create a performance snapshot for a plugin
 */
export function snapshotPluginPerf(
  pluginName: string,
  executions: PluginExecutionTrace[],
  config: SnapshotConfig = {}
): PluginPerformanceSnapshot | null {
  const collector = new PluginPerformanceCollector()
  
  // Record all executions
  executions.forEach(exec => collector.recordExecution(exec))
  
  return collector.createSnapshot(pluginName, config)
}

/**
 * Compare performance between multiple plugins
 */
export function comparePluginPerformance(
  pluginData: Record<string, PluginExecutionTrace[]>
): void {
  const collector = new PluginPerformanceCollector()
  
  // Record all executions
  Object.entries(pluginData).forEach(([pluginName, executions]) => {
    executions.forEach(exec => collector.recordExecution(exec))
  })
  
  const comparison = collector.comparePlugins(Object.keys(pluginData))
  
  console.log('\n🏆 Plugin Performance Comparison:')
  console.log(`   Fastest: ${comparison.fastest}`)
  console.log(`   Slowest: ${comparison.slowest}`)
  console.log(`   Most Reliable: ${comparison.mostReliable}`)
  console.log(`   Least Reliable: ${comparison.leastReliable}`)
  
  collector.displaySummary()
}

// Global performance collector
export const globalPerformanceCollector = new PluginPerformanceCollector()