/**
 * PluginExecutionTimeline - Plugin execution debugger with timeline tracking
 * 
 * Provides comprehensive timeline tracking for plugin lifecycle execution including:
 * - Hook-level execution windows per plugin
 * - Performance threshold warnings
 * - Zod-validated timeline schemas
 * - Console.table debugging support
 */

import { z } from 'zod'

/**
 * Zod schema for timeline entry
 */
export const TimelineEntrySchema = z.object({
  id: z.string(),
  hookName: z.enum(['onInit', 'onSend', 'onReceive', 'onError', 'onShutdown']),
  pluginName: z.string(),
  start: z.number(),
  end: z.number().optional(),
  duration: z.number().optional(),
  status: z.enum(['pending', 'success', 'error', 'timeout']),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
})

/**
 * Zod schema for complete timeline
 */
export const TimelineSchema = z.object({
  entries: z.array(TimelineEntrySchema),
  summary: z.object({
    totalEntries: z.number(),
    completedEntries: z.number(),
    errorEntries: z.number(),
    timeoutEntries: z.number(),
    averageDuration: z.number(),
    longestDuration: z.number(),
    shortestDuration: z.number(),
    totalDuration: z.number()
  }),
  metadata: z.object({
    startTime: z.number(),
    endTime: z.number().optional(),
    platform: z.string(),
    warningThreshold: z.number()
  })
})

export type TimelineEntry = z.infer<typeof TimelineEntrySchema>
export type Timeline = z.infer<typeof TimelineSchema>

/**
 * Performance thresholds by environment
 */
const PERFORMANCE_THRESHOLDS = {
  browser: 50, // 50ms
  node: 100,   // 100ms
  default: 75  // 75ms fallback
} as const

/**
 * Plugin execution timeline debugger
 */
export class PluginExecutionTimeline {
  private entries: Map<string, TimelineEntry> = new Map()
  private startTime = Date.now()
  private endTime?: number
  private platform: string
  private warningThreshold: number
  private enableConsoleWarnings: boolean

  constructor(options: {
    platform?: string
    warningThreshold?: number
    enableConsoleWarnings?: boolean
  } = {}) {
    this.platform = options.platform || 'default'
    
    // Set threshold based on platform
    this.warningThreshold = options.warningThreshold || 
      PERFORMANCE_THRESHOLDS[this.platform as keyof typeof PERFORMANCE_THRESHOLDS] || 
      PERFORMANCE_THRESHOLDS.default
    
    this.enableConsoleWarnings = options.enableConsoleWarnings ?? true
  }

  /**
   * Start tracking a plugin hook execution
   */
  startExecution(
    hookName: string, 
    pluginName: string, 
    metadata?: Record<string, unknown>
  ): string {
    const id = this.generateId()
    const entry: TimelineEntry = {
      id,
      hookName: hookName as any,
      pluginName,
      start: Date.now(),
      status: 'pending',
      metadata
    }

    // Validate entry before storing
    try {
      const validatedEntry = TimelineEntrySchema.parse(entry)
      this.entries.set(id, validatedEntry)
      return id
    } catch (error) {
      console.error('Failed to validate timeline entry:', error)
      // Return fallback ID but don't track invalid entry
      return id
    }
  }

  /**
   * End tracking a plugin hook execution
   */
  endExecution(
    id: string, 
    status: 'success' | 'error' | 'timeout' = 'success',
    error?: string
  ): void {
    const entry = this.entries.get(id)
    if (!entry) {
      console.warn(`Timeline entry not found for ID: ${id}`)
      return
    }

    const now = Date.now()
    const duration = now - entry.start

    // Update entry
    const updatedEntry: TimelineEntry = {
      ...entry,
      end: now,
      duration,
      status,
      error
    }

    try {
      const validatedEntry = TimelineEntrySchema.parse(updatedEntry)
      this.entries.set(id, validatedEntry)

      // Check for performance warnings
      if (this.enableConsoleWarnings && duration > this.warningThreshold) {
        console.warn(
          `⚠️  Plugin performance warning: ${entry.pluginName}.${entry.hookName} took ${duration}ms ` +
          `(threshold: ${this.warningThreshold}ms)`
        )
      }
    } catch (error) {
      console.error('Failed to validate updated timeline entry:', error)
      // Keep original entry if validation fails
    }
  }

  /**
   * Add a completed execution in one call
   */
  addExecution(
    hookName: string,
    pluginName: string,
    duration: number,
    status: 'success' | 'error' | 'timeout' = 'success',
    error?: string,
    metadata?: Record<string, unknown>
  ): void {
    const now = Date.now()
    const entry: TimelineEntry = {
      id: this.generateId(),
      hookName: hookName as any,
      pluginName,
      start: now - duration,
      end: now,
      duration,
      status,
      error,
      metadata
    }

    try {
      const validatedEntry = TimelineEntrySchema.parse(entry)
      this.entries.set(entry.id, validatedEntry)

      // Check for performance warnings
      if (this.enableConsoleWarnings && duration > this.warningThreshold) {
        console.warn(
          `⚠️  Plugin performance warning: ${pluginName}.${hookName} took ${duration}ms ` +
          `(threshold: ${this.warningThreshold}ms)`
        )
      }
    } catch (error) {
      console.error('Failed to validate timeline entry:', error)
    }
  }

  /**
   * Get the complete timeline with validation
   */
  getTimeline(): Timeline {
    const entries = Array.from(this.entries.values())
    const completedEntries = entries.filter(e => e.end !== undefined)
    const errorEntries = entries.filter(e => e.status === 'error')
    const timeoutEntries = entries.filter(e => e.status === 'timeout')
    
    const durations = completedEntries
      .map(e => e.duration!)
      .filter(d => d !== undefined)

    const timeline: Timeline = {
      entries,
      summary: {
        totalEntries: entries.length,
        completedEntries: completedEntries.length,
        errorEntries: errorEntries.length,
        timeoutEntries: timeoutEntries.length,
        averageDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
        longestDuration: durations.length > 0 ? Math.max(...durations) : 0,
        shortestDuration: durations.length > 0 ? Math.min(...durations) : 0,
        totalDuration: durations.reduce((a, b) => a + b, 0)
      },
      metadata: {
        startTime: this.startTime,
        endTime: this.endTime,
        platform: this.platform,
        warningThreshold: this.warningThreshold
      }
    }

    try {
      return TimelineSchema.parse(timeline)
    } catch (error) {
      console.error('Timeline validation failed:', error)
      return this.getSafeTimeline()
    }
  }

  /**
   * Get timeline entries suitable for console.table()
   */
  getTableData(): Array<{
    Plugin: string
    Hook: string
    Duration: string
    Status: string
    Start: string
    End: string
    Error?: string
  }> {
    return Array.from(this.entries.values())
      .sort((a, b) => a.start - b.start)
      .map(entry => ({
        Plugin: entry.pluginName,
        Hook: entry.hookName,
        Duration: entry.duration ? `${entry.duration}ms` : 'pending',
        Status: entry.status,
        Start: new Date(entry.start).toISOString().split('T')[1].split('.')[0],
        End: entry.end ? new Date(entry.end).toISOString().split('T')[1].split('.')[0] : 'pending',
        ...(entry.error && { Error: entry.error })
      }))
  }

  /**
   * Print timeline to console as a table
   */
  printTimeline(): void {
    const tableData = this.getTableData()
    if (tableData.length === 0) {
      console.log('📊 No plugin executions recorded yet')
      return
    }

    console.log('📊 Plugin Execution Timeline:')
    console.table(tableData)
    
    const timeline = this.getTimeline()
    console.log('📈 Summary:')
    console.log(`  Total executions: ${timeline.summary.totalEntries}`)
    console.log(`  Completed: ${timeline.summary.completedEntries}`)
    console.log(`  Errors: ${timeline.summary.errorEntries}`)
    console.log(`  Timeouts: ${timeline.summary.timeoutEntries}`)
    console.log(`  Average duration: ${timeline.summary.averageDuration.toFixed(2)}ms`)
    console.log(`  Longest duration: ${timeline.summary.longestDuration}ms`)
    
    if (timeline.summary.longestDuration > this.warningThreshold) {
      console.warn(`⚠️  Performance threshold exceeded (${this.warningThreshold}ms)`)
    }
  }

  /**
   * Get entries for a specific plugin
   */
  getPluginTimeline(pluginName: string): TimelineEntry[] {
    return Array.from(this.entries.values())
      .filter(entry => entry.pluginName === pluginName)
      .sort((a, b) => a.start - b.start)
  }

  /**
   * Get entries for a specific hook across all plugins
   */
  getHookTimeline(hookName: string): TimelineEntry[] {
    return Array.from(this.entries.values())
      .filter(entry => entry.hookName === hookName)
      .sort((a, b) => a.start - b.start)
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    totalPlugins: number
    totalHooks: number
    averageDurationByPlugin: Record<string, number>
    averageDurationByHook: Record<string, number>
    slowestPlugins: Array<{ plugin: string; avgDuration: number }>
    slowestHooks: Array<{ hook: string; avgDuration: number }>
    thresholdViolations: Array<{ plugin: string; hook: string; duration: number }>
  } {
    const entries = Array.from(this.entries.values())
    const completedEntries = entries.filter(e => e.duration !== undefined)

    // Group by plugin
    const byPlugin = new Map<string, number[]>()
    const byHook = new Map<string, number[]>()
    const violations: Array<{ plugin: string; hook: string; duration: number }> = []

    for (const entry of completedEntries) {
      const duration = entry.duration!
      
      // Group by plugin
      if (!byPlugin.has(entry.pluginName)) {
        byPlugin.set(entry.pluginName, [])
      }
      byPlugin.get(entry.pluginName)!.push(duration)

      // Group by hook
      if (!byHook.has(entry.hookName)) {
        byHook.set(entry.hookName, [])
      }
      byHook.get(entry.hookName)!.push(duration)

      // Check violations
      if (duration > this.warningThreshold) {
        violations.push({
          plugin: entry.pluginName,
          hook: entry.hookName,
          duration
        })
      }
    }

    // Calculate averages
    const averageDurationByPlugin: Record<string, number> = {}
    const averageDurationByHook: Record<string, number> = {}

    for (const [plugin, durations] of byPlugin) {
      averageDurationByPlugin[plugin] = durations.reduce((a, b) => a + b, 0) / durations.length
    }

    for (const [hook, durations] of byHook) {
      averageDurationByHook[hook] = durations.reduce((a, b) => a + b, 0) / durations.length
    }

    // Sort by slowest
    const slowestPlugins = Object.entries(averageDurationByPlugin)
      .map(([plugin, avgDuration]) => ({ plugin, avgDuration }))
      .sort((a, b) => b.avgDuration - a.avgDuration)

    const slowestHooks = Object.entries(averageDurationByHook)
      .map(([hook, avgDuration]) => ({ hook, avgDuration }))
      .sort((a, b) => b.avgDuration - a.avgDuration)

    return {
      totalPlugins: byPlugin.size,
      totalHooks: byHook.size,
      averageDurationByPlugin,
      averageDurationByHook,
      slowestPlugins,
      slowestHooks,
      thresholdViolations: violations.sort((a, b) => b.duration - a.duration)
    }
  }

  /**
   * Clear all timeline entries
   */
  clear(): void {
    this.entries.clear()
    this.startTime = Date.now()
    this.endTime = undefined
  }

  /**
   * Mark timeline as complete
   */
  finalize(): void {
    this.endTime = Date.now()
  }

  /**
   * Generate unique execution ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get safe fallback timeline when validation fails
   */
  private getSafeTimeline(): Timeline {
    return {
      entries: [],
      summary: {
        totalEntries: 0,
        completedEntries: 0,
        errorEntries: 0,
        timeoutEntries: 0,
        averageDuration: 0,
        longestDuration: 0,
        shortestDuration: 0,
        totalDuration: 0
      },
      metadata: {
        startTime: this.startTime,
        endTime: this.endTime,
        platform: this.platform,
        warningThreshold: this.warningThreshold
      }
    }
  }

  /**
   * Export timeline for browser debugging
   */
  exportForBrowser(): any {
    const timeline = this.getTimeline()
    return {
      ...timeline,
      tableData: this.getTableData(),
      performanceStats: this.getPerformanceStats(),
      printTimeline: () => this.printTimeline()
    }
  }
}