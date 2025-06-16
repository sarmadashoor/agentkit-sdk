import { LifecycleTimelineEntry } from './types'
import { debugConsole, debugOnly, BUILD_CONSTANTS } from './buildGuards'

/**
 * Visual trace output formatter for CLI debugging
 * Provides clear, time-stamped logs for plugin lifecycle execution
 */
export class TraceOutputFormatter {
  private startTime: number = Date.now()
  private colors: boolean
  
  constructor(options: { colors?: boolean } = {}) {
    this.colors = options.colors ?? (typeof process !== 'undefined' && process.stdout?.isTTY)
  }

  /**
   * Format a plugin lifecycle start event
   */
  formatStart(pluginName: string, hookName: string, timestamp?: number): string {
    const relativeTime = this.getRelativeTime(timestamp)
    const symbol = this.colorize('▶', 'blue')
    const hook = this.colorize(hookName, 'cyan')
    const plugin = this.colorize(`(${pluginName})`, 'gray')
    const time = this.colorize(`(t=${relativeTime}ms)`, 'gray')
    
    return `${symbol} ${hook}${plugin} start ${time}`
  }

  /**
   * Format a plugin lifecycle success event
   */
  formatSuccess(pluginName: string, hookName: string, duration: number, timestamp?: number): string {
    const relativeTime = this.getRelativeTime(timestamp)
    const symbol = this.colorize('✔', 'green')
    const hook = this.colorize(hookName, 'cyan')
    const plugin = this.colorize(`(${pluginName})`, 'gray')
    const time = this.colorize(`(t=${relativeTime}ms)`, 'gray')
    const dur = duration > 100 ? 
      this.colorize(`${duration.toFixed(1)}ms`, 'yellow') : 
      this.colorize(`${duration.toFixed(1)}ms`, 'green')
    
    return `${symbol} ${hook}${plugin} success ${time} [${dur}]`
  }

  /**
   * Format a plugin lifecycle error event
   */
  formatError(pluginName: string, hookName: string, error: string, duration: number, timestamp?: number): string {
    const relativeTime = this.getRelativeTime(timestamp)
    const symbol = this.colorize('✖', 'red')
    const hook = this.colorize(hookName, 'cyan')
    const plugin = this.colorize(`(${pluginName})`, 'gray')
    const time = this.colorize(`(t=${relativeTime}ms)`, 'gray')
    const dur = this.colorize(`${duration.toFixed(1)}ms`, 'red')
    const errorMsg = this.colorize(error, 'red')
    
    return `${symbol} ${hook}${plugin} error: ${errorMsg} ${time} [${dur}]`
  }

  /**
   * Format a plugin lifecycle timeout event
   */
  formatTimeout(pluginName: string, hookName: string, timeout: number, timestamp?: number): string {
    const relativeTime = this.getRelativeTime(timestamp)
    const symbol = this.colorize('⚠', 'yellow')
    const hook = this.colorize(hookName, 'cyan')
    const plugin = this.colorize(`(${pluginName})`, 'gray')
    const time = this.colorize(`(t=${relativeTime}ms)`, 'gray')
    const dur = this.colorize(`${timeout.toFixed(1)}ms`, 'yellow')
    
    return `${symbol} ${hook}${plugin} timeout ${time} [${dur}]`
  }

  /**
   * Format a timeline entry for display
   */
  formatTimelineEntry(entry: LifecycleTimelineEntry): string {
    switch (entry.status) {
      case 'pending':
        return this.formatStart(entry.pluginName, entry.hookName, entry.startTime)
      case 'success':
        return this.formatSuccess(entry.pluginName, entry.hookName, entry.duration || 0, entry.endTime)
      case 'error':
        return this.formatError(entry.pluginName, entry.hookName, entry.errorMessage || 'Unknown error', entry.duration || 0, entry.endTime)
      case 'timeout':
        return this.formatTimeout(entry.pluginName, entry.hookName, entry.duration || 0, entry.endTime)
      default:
        return `${entry.hookName}(${entry.pluginName}) ${entry.status}`
    }
  }

  /**
   * Format a batch of timeline entries
   */
  formatTimeline(entries: LifecycleTimelineEntry[]): string[] {
    return entries
      .sort((a, b) => a.startTime - b.startTime)
      .map(entry => this.formatTimelineEntry(entry))
  }

  /**
   * Reset the start time reference
   */
  resetTimer(): void {
    this.startTime = Date.now()
  }

  /**
   * Get relative time from start
   */
  private getRelativeTime(timestamp?: number): number {
    const time = timestamp || Date.now()
    return time - this.startTime
  }

  /**
   * Apply color formatting if colors are enabled
   */
  private colorize(text: string, color: string): string {
    if (!this.colors) {
      return text
    }

    const colors: Record<string, string> = {
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      cyan: '\x1b[36m',
      gray: '\x1b[90m',
      reset: '\x1b[0m'
    }

    return `${colors[color] || ''}${text}${colors.reset}`
  }
}

/**
 * Global trace output formatter instance
 */
let globalFormatter: TraceOutputFormatter | null = null

/**
 * Get or create the global trace formatter
 */
export function getTraceFormatter(): TraceOutputFormatter {
  if (!globalFormatter) {
    globalFormatter = new TraceOutputFormatter()
  }
  return globalFormatter
}

/**
 * Log a formatted trace message to console (only in debug mode)
 */
export function logTrace(message: string): void {
  // Production guard - this entire function should be tree-shaken out in production
  if (BUILD_CONSTANTS.IS_PRODUCTION) {
    return
  }
  
  debugConsole.log(message)
}

/**
 * Log a plugin lifecycle start event
 */
export function logPluginStart(pluginName: string, hookName: string, timestamp?: number): void {
  debugOnly(() => {
    const formatter = getTraceFormatter()
    const message = formatter.formatStart(pluginName, hookName, timestamp)
    logTrace(message)
  })
}

/**
 * Log a plugin lifecycle success event
 */
export function logPluginSuccess(pluginName: string, hookName: string, duration: number, timestamp?: number): void {
  debugOnly(() => {
    const formatter = getTraceFormatter()
    const message = formatter.formatSuccess(pluginName, hookName, duration, timestamp)
    logTrace(message)
  })
}

/**
 * Log a plugin lifecycle error event
 */
export function logPluginError(pluginName: string, hookName: string, error: string, duration: number, timestamp?: number): void {
  debugOnly(() => {
    const formatter = getTraceFormatter()
    const message = formatter.formatError(pluginName, hookName, error, duration, timestamp)
    logTrace(message)
  })
}

/**
 * Log a plugin lifecycle timeout event
 */
export function logPluginTimeout(pluginName: string, hookName: string, timeout: number, timestamp?: number): void {
  debugOnly(() => {
    const formatter = getTraceFormatter()
    const message = formatter.formatTimeout(pluginName, hookName, timeout, timestamp)
    logTrace(message)
  })
}