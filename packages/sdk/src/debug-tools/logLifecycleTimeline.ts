/**
 * Lifecycle Timeline Logger
 * 
 * Provides comprehensive lifecycle logging with timeline visualization,
 * performance analysis, and debugging output in multiple formats.
 */

import { LifecycleTimelineEntry, DebugTimeline } from './types'
import { DebugManager } from './DebugManager'

/**
 * Timeline logger configuration
 */
export interface TimelineLoggerConfig {
  enableConsoleOutput?: boolean
  enableTableOutput?: boolean
  enableGraphOutput?: boolean
  performanceThreshold?: number
  memoryThreshold?: number
  maxEntries?: number
  showOnlySlowOperations?: boolean
  includeStackTraces?: boolean
  outputFormat?: 'json' | 'table' | 'tree' | 'graph'
  filters?: {
    plugins?: string[]
    hooks?: string[]
    minDuration?: number
    maxDuration?: number
    statusFilter?: Array<'started' | 'completed' | 'failed' | 'timeout'>
  }
}

/**
 * Timeline logger class
 */
export class LifecycleTimelineLogger {
  private entries: LifecycleTimelineEntry[] = []
  private debugManager: DebugManager
  private config: Required<TimelineLoggerConfig>
  private executionOrder = 0

  constructor(config: TimelineLoggerConfig = {}) {
    this.debugManager = DebugManager.getInstance()
    this.config = {
      enableConsoleOutput: true,
      enableTableOutput: true,
      enableGraphOutput: false,
      performanceThreshold: 100,
      memoryThreshold: 10 * 1024 * 1024,
      maxEntries: 1000,
      showOnlySlowOperations: false,
      includeStackTraces: false,
      outputFormat: 'table',
      filters: {},
      ...config
    }
  }

  /**
   * Log the start of a lifecycle event
   */
  logStart(
    pluginName: string,
    hookName: string,
    context: any,
    payload?: any
  ): string {
    const id = this.generateEntryId(pluginName, hookName)
    const timestamp = performance.now()
    
    const entry: LifecycleTimelineEntry = {
      id,
      requestId: context.requestId || 'unknown',
      agentId: context.agentId || 'unknown',
      pluginName,
      hookName: hookName as any,
      timestamp,
      status: 'started',
      warningThreshold: this.config.performanceThreshold,
      isSlowExecution: false,
      executionOrder: ++this.executionOrder,
      concurrentExecutions: this.getActiveConcurrentExecutions(),
      retryAttempt: 0,
      payload: payload ? this.capturePayload(payload) : undefined,
      context: {
        agentId: context.agentId || 'unknown',
        transportId: context.transportId || 'unknown',
        requestId: context.requestId || 'unknown',
        timestamp: context.timestamp || Date.now(),
        metadata: context.metadata
      },
      performance: {
        cpuTime: this.getCpuTime(),
        memoryDelta: this.getMemoryUsage().heapUsed,
        blockingTime: 0
      },
      debugInfo: this.config.includeStackTraces ? {
        stackTrace: this.captureStackTrace(),
        environmentInfo: this.captureEnvironmentInfo()
      } : undefined
    }

    this.addEntry(entry)
    
    if (this.config.enableConsoleOutput) {
      this.debugManager.log('debug', `🚀 Started ${pluginName}.${hookName}`, {
        id,
        executionOrder: entry.executionOrder,
        concurrentExecutions: entry.concurrentExecutions
      })
    }

    return id
  }

  /**
   * Log the completion of a lifecycle event
   */
  logComplete(
    id: string,
    status: 'completed' | 'failed' | 'timeout' = 'completed',
    error?: string,
    _result?: any
  ): void {
    const entry = this.entries.find(e => e.id === id)
    if (!entry) {
      this.debugManager.log('warn', `Timeline entry not found: ${id}`)
      return
    }

    const endTime = performance.now()
    const duration = endTime - entry.timestamp
    
    entry.status = status
    entry.duration = duration
    entry.error = error
    entry.isSlowExecution = duration > this.config.performanceThreshold

    // Update performance metrics
    if (entry.performance) {
      entry.performance.cpuTime = this.getCpuTime() - (entry.performance.cpuTime || 0)
      entry.performance.memoryDelta = this.getMemoryUsage().heapUsed - (entry.performance.memoryDelta || 0)
    }

    const logLevel = entry.isSlowExecution ? 'warn' : 'debug'
    const statusEmoji = this.getStatusEmoji(status)
    
    if (this.config.enableConsoleOutput) {
      this.debugManager.log(logLevel, `${statusEmoji} ${status} ${entry.pluginName}.${entry.hookName}`, {
        id,
        duration: `${duration.toFixed(2)}ms`,
        isSlowExecution: entry.isSlowExecution,
        status,
        error
      })
    }

    // Log slow executions with additional details
    if (entry.isSlowExecution && this.config.enableConsoleOutput) {
      console.warn(`⚠️  Slow execution detected: ${entry.pluginName}.${entry.hookName}`, {
        duration: `${duration.toFixed(2)}ms`,
        threshold: `${this.config.performanceThreshold}ms`,
        memoryDelta: entry.performance?.memoryDelta ? `${(entry.performance.memoryDelta / 1024 / 1024).toFixed(2)}MB` : 'N/A',
        concurrentExecutions: entry.concurrentExecutions
      })
    }
  }

  /**
   * Get current timeline
   */
  getTimeline(): DebugTimeline {
    const now = performance.now()
    const filteredEntries = this.applyFilters(this.entries)
    
    return {
      timelineId: `timeline-${Date.now()}`,
      agentId: this.getAgentId(),
      startTime: this.entries.length > 0 ? Math.min(...this.entries.map(e => e.timestamp)) : now,
      endTime: now,
      entries: filteredEntries,
      summary: this.calculateSummary(filteredEntries),
      performance: this.calculatePerformanceMetrics(filteredEntries),
      warnings: this.extractWarnings(filteredEntries),
      metadata: {
        sdkVersion: this.getSDKVersion(),
        nodeVersion: process.version,
        platform: process.platform,
        debugLevel: this.debugManager.getLevel(),
        environment: process.env.NODE_ENV ? { NODE_ENV: process.env.NODE_ENV } : undefined
      }
    }
  }

  /**
   * Display timeline in table format
   */
  displayTable(): void {
    if (!this.config.enableTableOutput) {return}

    const entries = this.applyFilters(this.entries)
    const tableData = entries.map(entry => ({
      Plugin: entry.pluginName,
      Hook: entry.hookName,
      Status: entry.status,
      Duration: entry.duration ? `${entry.duration.toFixed(2)}ms` : 'N/A',
      Slow: entry.isSlowExecution ? '⚠️' : '',
      Concurrent: entry.concurrentExecutions,
      Order: entry.executionOrder,
      Error: entry.error ? entry.error.substring(0, 50) + '...' : ''
    }))

    this.debugManager.table(tableData, 'Plugin Execution Timeline')
  }

  /**
   * Display timeline in tree format
   */
  displayTree(): void {
    if (!this.config.enableConsoleOutput) {return}

    const entries = this.applyFilters(this.entries)
    const groupedByRequest = this.groupEntriesByRequest(entries)

    console.log('\n🌳 Plugin Execution Tree:')
    
    for (const [requestId, requestEntries] of groupedByRequest.entries()) {
      console.log(`\n📋 Request: ${requestId}`)
      
      const sortedEntries = requestEntries.sort((a, b) => a.executionOrder - b.executionOrder)
      
      sortedEntries.forEach((entry, index) => {
        const isLast = index === sortedEntries.length - 1
        const prefix = isLast ? '└── ' : '├── '
        const statusIcon = this.getStatusEmoji(entry.status)
        const duration = entry.duration ? ` (${entry.duration.toFixed(2)}ms)` : ''
        const slow = entry.isSlowExecution ? ' ⚠️' : ''
        
        console.log(`${prefix}${statusIcon} ${entry.pluginName}.${entry.hookName}${duration}${slow}`)
        
        if (entry.error) {
          const errorPrefix = isLast ? '    ' : '│   '
          console.log(`${errorPrefix}❌ ${entry.error}`)
        }
      })
    }
  }

  /**
   * Export timeline as JSON
   */
  exportJSON(): string {
    const timeline = this.getTimeline()
    return JSON.stringify(timeline, null, 2)
  }

  /**
   * Clear timeline entries
   */
  clear(): void {
    this.entries = []
    this.executionOrder = 0
    this.debugManager.log('debug', 'Cleared lifecycle timeline')
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    totalExecutions: number
    averageDuration: number
    slowExecutions: number
    errorRate: number
    timeoutRate: number
    peakConcurrency: number
  } {
    const completedEntries = this.entries.filter(e => e.duration !== undefined)
    const totalExecutions = completedEntries.length
    
    if (totalExecutions === 0) {
      return {
        totalExecutions: 0,
        averageDuration: 0,
        slowExecutions: 0,
        errorRate: 0,
        timeoutRate: 0,
        peakConcurrency: 0
      }
    }

    const totalDuration = completedEntries.reduce((sum, e) => sum + (e.duration || 0), 0)
    const slowExecutions = completedEntries.filter(e => e.isSlowExecution).length
    const errorExecutions = this.entries.filter(e => e.status === 'failed').length
    const timeoutExecutions = this.entries.filter(e => e.status === 'timeout').length
    const peakConcurrency = Math.max(...this.entries.map(e => e.concurrentExecutions))

    return {
      totalExecutions,
      averageDuration: totalDuration / totalExecutions,
      slowExecutions,
      errorRate: (errorExecutions / totalExecutions) * 100,
      timeoutRate: (timeoutExecutions / totalExecutions) * 100,
      peakConcurrency
    }
  }

  private addEntry(entry: LifecycleTimelineEntry): void {
    this.entries.push(entry)
    
    // Trim entries if exceeding max
    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries)
    }
  }

  private applyFilters(entries: LifecycleTimelineEntry[]): LifecycleTimelineEntry[] {
    let filtered = [...entries]

    if (this.config.showOnlySlowOperations) {
      filtered = filtered.filter(e => e.isSlowExecution)
    }

    if (this.config.filters.plugins?.length) {
      filtered = filtered.filter(e => this.config.filters.plugins!.includes(e.pluginName))
    }

    if (this.config.filters.hooks?.length) {
      filtered = filtered.filter(e => this.config.filters.hooks!.includes(e.hookName))
    }

    if (this.config.filters.minDuration !== undefined) {
      filtered = filtered.filter(e => (e.duration || 0) >= this.config.filters.minDuration!)
    }

    if (this.config.filters.maxDuration !== undefined) {
      filtered = filtered.filter(e => (e.duration || 0) <= this.config.filters.maxDuration!)
    }

    if (this.config.filters.statusFilter?.length) {
      filtered = filtered.filter(e => this.config.filters.statusFilter!.includes(e.status))
    }

    return filtered
  }

  private calculateSummary(entries: LifecycleTimelineEntry[]) {
    const completedEntries = entries.filter(e => e.duration !== undefined)
    const totalDuration = completedEntries.reduce((sum, e) => sum + (e.duration || 0), 0)
    
    return {
      totalPlugins: new Set(entries.map(e => e.pluginName)).size,
      totalExecutions: entries.length,
      totalDuration,
      successfulExecutions: entries.filter(e => e.status === 'completed').length,
      failedExecutions: entries.filter(e => e.status === 'failed').length,
      timeoutExecutions: entries.filter(e => e.status === 'timeout').length,
      averageDuration: completedEntries.length > 0 ? totalDuration / completedEntries.length : 0,
      slowExecutions: entries.filter(e => e.isSlowExecution).length
    }
  }

  private calculatePerformanceMetrics(entries: LifecycleTimelineEntry[]) {
    const memoryUsages = entries
      .map(e => e.performance?.memoryDelta || 0)
      .filter(m => m > 0)
    
    const cpuTimes = entries
      .map(e => e.performance?.cpuTime || 0)
      .filter(c => c > 0)

    return {
      peakMemoryUsage: memoryUsages.length > 0 ? Math.max(...memoryUsages) : 0,
      totalCpuTime: cpuTimes.reduce((sum, c) => sum + c, 0),
      maxConcurrency: Math.max(...entries.map(e => e.concurrentExecutions)),
      throughput: this.calculateThroughput(entries)
    }
  }

  private calculateThroughput(entries: LifecycleTimelineEntry[]): number {
    if (entries.length === 0) {return 0}
    
    const completedEntries = entries.filter(e => e.status === 'completed')
    if (completedEntries.length === 0) {return 0}
    
    const timeSpan = Math.max(...entries.map(e => e.timestamp)) - Math.min(...entries.map(e => e.timestamp))
    return timeSpan > 0 ? (completedEntries.length / timeSpan) * 1000 : 0 // per second
  }

  private extractWarnings(entries: LifecycleTimelineEntry[]) {
    const warnings: any[] = []
    
    entries.forEach(entry => {
      if (entry.isSlowExecution) {
        warnings.push({
          type: 'slow_execution',
          message: `Slow execution: ${entry.pluginName}.${entry.hookName} took ${entry.duration?.toFixed(2)}ms`,
          timestamp: entry.timestamp,
          pluginName: entry.pluginName,
          severity: entry.duration! > this.config.performanceThreshold * 2 ? 'high' : 'medium'
        })
      }
      
      if (entry.status === 'failed') {
        warnings.push({
          type: 'error',
          message: `Plugin execution failed: ${entry.pluginName}.${entry.hookName} - ${entry.error}`,
          timestamp: entry.timestamp,
          pluginName: entry.pluginName,
          severity: 'high'
        })
      }
      
      if (entry.status === 'timeout') {
        warnings.push({
          type: 'timeout',
          message: `Plugin execution timeout: ${entry.pluginName}.${entry.hookName}`,
          timestamp: entry.timestamp,
          pluginName: entry.pluginName,
          severity: 'critical'
        })
      }
      
      if (entry.performance?.memoryDelta && entry.performance.memoryDelta > this.config.memoryThreshold) {
        warnings.push({
          type: 'high_memory',
          message: `High memory usage: ${entry.pluginName}.${entry.hookName} used ${(entry.performance.memoryDelta / 1024 / 1024).toFixed(2)}MB`,
          timestamp: entry.timestamp,
          pluginName: entry.pluginName,
          severity: 'medium'
        })
      }
    })
    
    return warnings
  }

  private groupEntriesByRequest(entries: LifecycleTimelineEntry[]): Map<string, LifecycleTimelineEntry[]> {
    const grouped = new Map<string, LifecycleTimelineEntry[]>()
    
    entries.forEach(entry => {
      const requestId = entry.requestId
      if (!grouped.has(requestId)) {
        grouped.set(requestId, [])
      }
      grouped.get(requestId)!.push(entry)
    })
    
    return grouped
  }

  private getActiveConcurrentExecutions(): number {
    return this.entries.filter(e => e.status === 'started').length
  }

  private generateEntryId(pluginName: string, hookName: string): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 9)
    return `entry-${pluginName}-${hookName}-${timestamp}-${random}`
  }

  private capturePayload(payload: any) {
    try {
      const serialized = JSON.stringify(payload)
      const size = serialized.length
      const maxSize = 1024 // 1KB
      
      return {
        type: typeof payload,
        size,
        truncated: size > maxSize,
        preview: size > maxSize ? serialized.substring(0, maxSize) + '...' : serialized
      }
    } catch {
      return {
        type: typeof payload,
        size: 0,
        truncated: false,
        preview: '[Non-serializable]'
      }
    }
  }

  private captureStackTrace(): string[] {
    const stack = new Error().stack
    if (!stack) {return []}
    
    return stack
      .split('\n')
      .slice(3) // Remove Error line and first two calls (this function and caller)
      .map(line => line.trim())
      .filter(line => line.startsWith('at '))
      .slice(0, 5) // Limit to 5 frames
  }

  private captureEnvironmentInfo(): Record<string, string> {
    return {
      NODE_ENV: process.env.NODE_ENV || 'unknown',
      DEBUG: process.env.DEBUG || 'false',
      AGENTKIT_DEBUG: process.env.AGENTKIT_DEBUG || 'false'
    }
  }

  private getStatusEmoji(status: string): string {
    const emojis = {
      started: '🚀',
      completed: '✅',
      failed: '❌',
      timeout: '⏰'
    }
    return emojis[status as keyof typeof emojis] || '❓'
  }

  private getCpuTime(): number {
    const usage = process.cpuUsage()
    return usage.user + usage.system
  }

  private getMemoryUsage() {
    return process.memoryUsage()
  }

  private getAgentId(): string {
    return this.entries.length > 0 ? this.entries[0].agentId : 'unknown'
  }

  private getSDKVersion(): string {
    try {
      return require('../../package.json').version || '0.0.0'
    } catch {
      return '0.0.0'
    }
  }
}

/**
 * Create a lifecycle timeline logger
 */
export function createTimelineLogger(config: TimelineLoggerConfig = {}): LifecycleTimelineLogger {
  return new LifecycleTimelineLogger(config)
}

/**
 * Log lifecycle timeline with automatic formatting
 */
export function logLifecycleTimeline(
  entries: LifecycleTimelineEntry[],
  config: TimelineLoggerConfig = {}
): void {
  const logger = new LifecycleTimelineLogger(config)
  
  // Add entries to logger
  entries.forEach(entry => {
    logger['addEntry'](entry)
  })
  
  // Display based on format
  switch (config.outputFormat) {
    case 'table':
      logger.displayTable()
      break
    case 'tree':
      logger.displayTree()
      break
    case 'json':
      console.log(logger.exportJSON())
      break
    default:
      logger.displayTable()
  }
}

// Global timeline logger
export const globalTimelineLogger = new LifecycleTimelineLogger()