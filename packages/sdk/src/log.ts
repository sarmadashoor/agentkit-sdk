/**
 * Internal logging system for AgentKit SDK
 * Provides structured debug logging with different levels
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface LogContext {
  [key: string]: unknown
}

export interface Logger {
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
}

class ConsoleLogger implements Logger {
  constructor(private enabled: boolean = false) {}

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString()
    const contextStr = context ? ` ${JSON.stringify(context)}` : ''
    return `[${timestamp}] [AgentKit:${level.toUpperCase()}] ${message}${contextStr}`
  }

  debug(message: string, context?: LogContext): void {
    if (this.enabled) {
      console.debug(this.formatMessage(LogLevel.DEBUG, message, context))
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.enabled) {
      console.info(this.formatMessage(LogLevel.INFO, message, context))
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.enabled) {
      console.warn(this.formatMessage(LogLevel.WARN, message, context))
    }
  }

  error(message: string, context?: LogContext): void {
    if (this.enabled) {
      console.error(this.formatMessage(LogLevel.ERROR, message, context))
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }
}

// Global logger instance
let globalLogger: ConsoleLogger = new ConsoleLogger(false)

/**
 * Simple logging function for backward compatibility
 */
export function log(message: string, debug: boolean): void {
  if (debug) {
    console.debug(`[AgentKit] ${message}`)
  }
}

/**
 * Get the current logger instance
 */
export function getLogger(): Logger {
  return globalLogger
}

/**
 * Create a logger with specific debug setting
 */
export function createLogger(debug: boolean = false): Logger {
  return new ConsoleLogger(debug)
}

/**
 * Set global debug mode
 */
export function setDebugMode(enabled: boolean): void {
  globalLogger.setEnabled(enabled)
}

/**
 * Log with context - main logging function for the SDK
 */
export function logWithContext(
  level: LogLevel,
  message: string,
  context?: LogContext,
  debug: boolean = false
): void {
  if (!debug) return

  const logger = createLogger(true)
  switch (level) {
    case LogLevel.DEBUG:
      logger.debug(message, context)
      break
    case LogLevel.INFO:
      logger.info(message, context)
      break
    case LogLevel.WARN:
      logger.warn(message, context)
      break
    case LogLevel.ERROR:
      logger.error(message, context)
      break
  }
}

/**
 * Convenience functions for common logging patterns
 */
export const debugLog = {
  agentResolution: (agentId: string, metadata: unknown, debug: boolean) => {
    logWithContext(
      LogLevel.DEBUG,
      'Agent resolved from registry',
      { agentId, metadata },
      debug
    )
  },

  transportResolution: (transportId: string, transport: unknown, debug: boolean) => {
    logWithContext(
      LogLevel.DEBUG,
      'Transport resolved from registry',
      { transportId, transportName: (transport as any)?.name },
      debug
    )
  },

  lifecycle: (phase: string, component: string, details?: LogContext, debug: boolean = false) => {
    logWithContext(
      LogLevel.DEBUG,
      `Lifecycle: ${component} ${phase}`,
      details,
      debug
    )
  },

  validation: (schema: string, success: boolean, error?: string, debug: boolean = false) => {
    logWithContext(
      success ? LogLevel.DEBUG : LogLevel.WARN,
      `Schema validation: ${schema}`,
      { success, error },
      debug
    )
  },

  operation: (operation: string, details?: LogContext, debug: boolean = false) => {
    logWithContext(
      LogLevel.DEBUG,
      `Operation: ${operation}`,
      details,
      debug
    )
  },

  error: (operation: string, error: Error, debug: boolean = false) => {
    logWithContext(
      LogLevel.ERROR,
      `Error in ${operation}`,
      { 
        error: error.message, 
        stack: error.stack?.split('\n').slice(0, 3).join('\n') 
      },
      debug
    )
  },

  warn: (message: string, context?: LogContext, debug: boolean = false) => {
    logWithContext(
      LogLevel.WARN,
      message,
      context,
      debug
    )
  }
}