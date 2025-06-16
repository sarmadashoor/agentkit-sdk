/**
 * DebugManager - Central debug state management for AgentKit SDK
 * 
 * Provides a unified interface for enabling/disabling debug mode,
 * collecting debug snapshots, and managing debug configuration across
 * the entire SDK lifecycle.
 */

import { z } from 'zod'
import { 
  DebugTimeline, 
  PluginPerformanceSnapshot, 
  ExecutionMetrics,
  DebugLevel,
  DebugTimelineSchema,
  PluginPerformanceSnapshotSchema,
  ExecutionMetricsSchema
} from './types'

/**
 * Debug configuration schema
 */
export const DebugConfigSchema = z.object({
  enabled: z.boolean().default(false),
  level: z.enum(['silent', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  verbose: z.boolean().default(false),
  captureStackTraces: z.boolean().default(false),
  captureMemoryUsage: z.boolean().default(true),
  captureCpuUsage: z.boolean().default(true),
  maxTimelineEntries: z.number().default(1000),
  maxSnapshotHistory: z.number().default(10),
  performanceThreshold: z.number().default(100), // ms
  memoryThreshold: z.number().default(10 * 1024 * 1024), // 10MB
  enableConsoleOutput: z.boolean().default(true),
  enableGraphOutput: z.boolean().default(false),
  outputFormat: z.enum(['json', 'table', 'graph']).default('table'),
  filters: z.object({
    includePlugins: z.array(z.string()).optional(),
    excludePlugins: z.array(z.string()).optional(),
    includeHooks: z.array(z.string()).optional(),
    excludeHooks: z.array(z.string()).optional(),
    minDuration: z.number().optional(),
    onlyErrors: z.boolean().default(false)
  }).default({}),
  environment: z.record(z.string()).optional()
})

export type DebugConfig = z.infer<typeof DebugConfigSchema>

/**
 * Debug snapshot containing all debug information
 */
export const DebugSnapshotSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  config: DebugConfigSchema,
  timeline: DebugTimelineSchema,
  pluginSnapshots: z.array(PluginPerformanceSnapshotSchema),
  executionMetrics: z.array(ExecutionMetricsSchema),
  systemInfo: z.object({
    nodeVersion: z.string(),
    platform: z.string(),
    architecture: z.string(),
    sdkVersion: z.string(),
    memoryUsage: z.object({
      heapUsed: z.number(),
      heapTotal: z.number(),
      external: z.number(),
      rss: z.number()
    }),
    cpuUsage: z.object({
      user: z.number(),
      system: z.number()
    }),
    uptime: z.number()
  }),
  warnings: z.array(z.object({
    type: z.string(),
    message: z.string(),
    timestamp: z.number(),
    severity: z.enum(['low', 'medium', 'high', 'critical'])
  })),
  errors: z.array(z.object({
    type: z.string(),
    message: z.string(),
    stack: z.string().optional(),
    timestamp: z.number(),
    pluginName: z.string().optional(),
    hookName: z.string().optional()
  }))
})

export type DebugSnapshot = z.infer<typeof DebugSnapshotSchema>

/**
 * DebugManager class for centralized debug state management
 */
export class DebugManager {
  private static instance: DebugManager | null = null
  private config: DebugConfig
  private timeline: DebugTimeline | null = null
  private pluginSnapshots: Map<string, PluginPerformanceSnapshot> = new Map()
  private executionMetrics: ExecutionMetrics[] = []
  private snapshotHistory: DebugSnapshot[] = []
  private isEnabled: boolean = false
  private startTime: number = Date.now()

  private constructor(config: Partial<DebugConfig> = {}) {
    this.config = DebugConfigSchema.parse(config)
    this.isEnabled = this.config.enabled || this.checkEnvironmentFlag()
    
    if (this.isEnabled) {
      this.initializeDebugMode()
    }
  }

  /**
   * Get singleton instance of DebugManager
   */
  static getInstance(config: Partial<DebugConfig> = {}): DebugManager {
    if (!DebugManager.instance) {
      DebugManager.instance = new DebugManager(config)
    }
    return DebugManager.instance
  }

  /**
   * Enable debug mode with optional configuration
   */
  enable(config: Partial<DebugConfig> = {}): void {
    this.config = DebugConfigSchema.parse({ ...this.config, ...config, enabled: true })
    this.isEnabled = true
    this.initializeDebugMode()
    
    if (this.config.enableConsoleOutput) {
      console.log('🐛 AgentKit Debug Mode Enabled', {
        level: this.config.level,
        verbose: this.config.verbose,
        performanceThreshold: this.config.performanceThreshold
      })
    }
  }

  /**
   * Disable debug mode
   */
  disable(): void {
    this.isEnabled = false
    this.config.enabled = false
    
    if (this.config.enableConsoleOutput) {
      console.log('🐛 AgentKit Debug Mode Disabled')
    }
  }

  /**
   * Check if debug mode is enabled
   */
  enabled(): boolean {
    return this.isEnabled
  }

  /**
   * Get current debug configuration
   */
  getConfig(): DebugConfig {
    return { ...this.config }
  }

  /**
   * Update debug configuration
   */
  updateConfig(updates: Partial<DebugConfig>): void {
    this.config = DebugConfigSchema.parse({ ...this.config, ...updates })
  }

  /**
   * Set debug level
   */
  setLevel(level: DebugLevel): void {
    this.config.level = level
  }

  /**
   * Get current debug level
   */
  getLevel(): DebugLevel {
    return this.config.level
  }

  /**
   * Initialize debug timeline
   */
  initializeTimeline(agentId: string): void {
    if (!this.isEnabled) return

    this.timeline = {
      timelineId: `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      startTime: Date.now(),
      entries: [],
      summary: {
        totalPlugins: 0,
        totalExecutions: 0,
        totalDuration: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        timeoutExecutions: 0,
        averageDuration: 0,
        slowExecutions: 0
      },
      performance: {
        peakMemoryUsage: 0,
        totalCpuTime: 0,
        maxConcurrency: 0,
        throughput: 0
      },
      warnings: [],
      metadata: {
        sdkVersion: this.getSDKVersion(),
        nodeVersion: process.version,
        platform: process.platform,
        debugLevel: this.config.level,
        environment: this.config.environment
      }
    }
  }

  /**
   * Get current debug timeline
   */
  getTimeline(): DebugTimeline | null {
    return this.timeline
  }

  /**
   * Add plugin performance snapshot
   */
  addPluginSnapshot(pluginName: string, snapshot: PluginPerformanceSnapshot): void {
    if (!this.isEnabled) return
    
    this.pluginSnapshots.set(pluginName, snapshot)
  }

  /**
   * Get plugin snapshots
   */
  getPluginSnapshots(): PluginPerformanceSnapshot[] {
    return Array.from(this.pluginSnapshots.values())
  }

  /**
   * Add execution metrics
   */
  addExecutionMetrics(metrics: ExecutionMetrics): void {
    if (!this.isEnabled) return
    
    this.executionMetrics.push(metrics)
    
    // Trim to max size
    if (this.executionMetrics.length > this.config.maxTimelineEntries) {
      this.executionMetrics = this.executionMetrics.slice(-this.config.maxTimelineEntries)
    }
  }

  /**
   * Get execution metrics
   */
  getExecutionMetrics(): ExecutionMetrics[] {
    return [...this.executionMetrics]
  }

  /**
   * Create a debug snapshot
   */
  createSnapshot(): DebugSnapshot {
    const snapshot: DebugSnapshot = {
      id: `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      config: { ...this.config },
      timeline: this.timeline || this.createEmptyTimeline(),
      pluginSnapshots: this.getPluginSnapshots(),
      executionMetrics: this.getExecutionMetrics(),
      systemInfo: this.getSystemInfo(),
      warnings: this.timeline?.warnings || [],
      errors: this.extractErrors()
    }

    // Add to snapshot history
    this.snapshotHistory.push(snapshot)
    
    // Trim history to max size
    if (this.snapshotHistory.length > this.config.maxSnapshotHistory) {
      this.snapshotHistory = this.snapshotHistory.slice(-this.config.maxSnapshotHistory)
    }

    return snapshot
  }

  /**
   * Get snapshot history
   */
  getSnapshotHistory(): DebugSnapshot[] {
    return [...this.snapshotHistory]
  }

  /**
   * Export debug data as JSON
   */
  exportDebugData(): string {
    const snapshot = this.createSnapshot()
    return JSON.stringify(snapshot, null, 2)
  }

  /**
   * Reset debug state
   */
  reset(): void {
    this.timeline = null
    this.pluginSnapshots.clear()
    this.executionMetrics = []
    this.snapshotHistory = []
    this.startTime = Date.now()
  }

  /**
   * Log debug message if enabled
   */
  log(level: DebugLevel, message: string, data?: any): void {
    if (!this.isEnabled || !this.shouldLog(level)) return

    const timestamp = new Date().toISOString()
    const prefix = this.getLogPrefix(level)
    
    if (this.config.enableConsoleOutput) {
      if (data) {
        console.log(`${prefix} [${timestamp}] ${message}`, data)
      } else {
        console.log(`${prefix} [${timestamp}] ${message}`)
      }
    }
  }

  /**
   * Log with table format for better readability
   */
  table(data: any[], title?: string): void {
    if (!this.isEnabled || !this.config.enableConsoleOutput) return

    if (title) {
      console.log(`\n📊 ${title}`)
    }
    console.table(data)
  }

  private checkEnvironmentFlag(): boolean {
    return process.env.DEBUG === 'true' || 
           process.env.DEBUG === '1' || 
           process.env.AGENTKIT_DEBUG === 'true' ||
           process.env.NODE_ENV === 'development'
  }

  private initializeDebugMode(): void {
    if (this.config.enableConsoleOutput) {
      console.log('🚀 AgentKit SDK Debug Mode Initialized')
    }
  }

  private shouldLog(level: DebugLevel): boolean {
    const levels: DebugLevel[] = ['silent', 'error', 'warn', 'info', 'debug', 'trace']
    const currentLevelIndex = levels.indexOf(this.config.level)
    const messageLevelIndex = levels.indexOf(level)
    
    return messageLevelIndex <= currentLevelIndex
  }

  private getLogPrefix(level: DebugLevel): string {
    const prefixes = {
      silent: '',
      error: '❌',
      warn: '⚠️',
      info: 'ℹ️',
      debug: '🐛',
      trace: '🔍'
    }
    return prefixes[level] || '📝'
  }

  private createEmptyTimeline(): DebugTimeline {
    return {
      timelineId: 'empty',
      agentId: 'unknown',
      startTime: Date.now(),
      entries: [],
      summary: {
        totalPlugins: 0,
        totalExecutions: 0,
        totalDuration: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        timeoutExecutions: 0,
        averageDuration: 0,
        slowExecutions: 0
      },
      performance: {
        peakMemoryUsage: 0,
        totalCpuTime: 0,
        maxConcurrency: 0,
        throughput: 0
      },
      warnings: [],
      metadata: {
        sdkVersion: this.getSDKVersion(),
        nodeVersion: process.version,
        platform: process.platform,
        debugLevel: this.config.level
      }
    }
  }

  private getSystemInfo() {
    const memoryUsage = process.memoryUsage()
    const cpuUsage = process.cpuUsage()
    
    return {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      sdkVersion: this.getSDKVersion(),
      memoryUsage: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss
      },
      cpuUsage: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      uptime: process.uptime()
    }
  }

  private extractErrors(): Array<{
    type: string
    message: string
    stack?: string
    timestamp: number
    pluginName?: string
    hookName?: string
  }> {
    // Extract errors from timeline entries
    if (!this.timeline) return []
    
    return this.timeline.entries
      .filter(entry => entry.status === 'failed' && entry.error)
      .map(entry => ({
        type: 'PluginExecutionError',
        message: entry.error!,
        timestamp: entry.timestamp,
        pluginName: entry.pluginName,
        hookName: entry.hookName,
        stack: entry.debugInfo?.stackTrace?.join('\n')
      }))
  }

  private getSDKVersion(): string {
    try {
      // Try to read version from package.json
      return require('../../package.json').version || '0.0.0'
    } catch {
      return '0.0.0'
    }
  }
}