/**
 * Debug Mode Utilities
 * 
 * Global debug mode management with environment variable support,
 * level-based logging, and programmatic control.
 */

import { DebugLevel } from './types'
import { DebugManager } from './DebugManager'

/**
 * Global debug state
 */
let globalDebugEnabled = false
let globalDebugLevel: DebugLevel = 'info'
let globalDebugManager: DebugManager | null = null

/**
 * Initialize debug mode from environment variables
 */
function initializeFromEnvironment(): void {
  // Check various environment variables
  const debugFlag = process.env.DEBUG
  const agentKitDebug = process.env.AGENTKIT_DEBUG
  const nodeEnv = process.env.NODE_ENV
  
  // Enable debug mode if any debug flag is set
  if (debugFlag === 'true' || debugFlag === '1' || 
      agentKitDebug === 'true' || agentKitDebug === '1' ||
      nodeEnv === 'development') {
    globalDebugEnabled = true
  }
  
  // Set debug level from environment
  const debugLevel = process.env.DEBUG_LEVEL || process.env.AGENTKIT_DEBUG_LEVEL
  if (debugLevel && isValidDebugLevel(debugLevel)) {
    globalDebugLevel = debugLevel as DebugLevel
  }
  
  // Auto-initialize debug manager if enabled
  if (globalDebugEnabled) {
    globalDebugManager = DebugManager.getInstance({
      enabled: true,
      level: globalDebugLevel,
      verbose: process.env.DEBUG_VERBOSE === 'true',
      enableConsoleOutput: process.env.DEBUG_CONSOLE !== 'false',
      enableGraphOutput: process.env.DEBUG_GRAPH === 'true'
    })
  }
}

/**
 * Enable global debug mode
 */
export function enableGlobalDebugMode(options: {
  level?: DebugLevel
  verbose?: boolean
  enableConsoleOutput?: boolean
  enableGraphOutput?: boolean
} = {}): void {
  globalDebugEnabled = true
  globalDebugLevel = options.level || globalDebugLevel
  
  if (!globalDebugManager) {
    globalDebugManager = DebugManager.getInstance({
      enabled: true,
      level: globalDebugLevel,
      verbose: options.verbose,
      enableConsoleOutput: options.enableConsoleOutput,
      enableGraphOutput: options.enableGraphOutput
    })
  } else {
    globalDebugManager.enable({
      level: globalDebugLevel,
      verbose: options.verbose,
      enableConsoleOutput: options.enableConsoleOutput,
      enableGraphOutput: options.enableGraphOutput
    })
  }
  
  console.log(`🐛 AgentKit Global Debug Mode Enabled (Level: ${globalDebugLevel})`)
}

/**
 * Disable global debug mode
 */
export function disableGlobalDebugMode(): void {
  globalDebugEnabled = false
  
  if (globalDebugManager) {
    globalDebugManager.disable()
  }
  
  console.log('🐛 AgentKit Global Debug Mode Disabled')
}

/**
 * Check if debug mode is enabled
 */
export function isDebugModeEnabled(): boolean {
  return globalDebugEnabled
}

/**
 * Set global debug level
 */
export function setDebugLevel(level: DebugLevel): void {
  if (!isValidDebugLevel(level)) {
    throw new Error(`Invalid debug level: ${level}. Valid levels: silent, error, warn, info, debug, trace`)
  }
  
  globalDebugLevel = level
  
  if (globalDebugManager) {
    globalDebugManager.setLevel(level)
  }
  
  console.log(`🐛 AgentKit Debug Level set to: ${level}`)
}

/**
 * Get current debug level
 */
export function getDebugLevel(): DebugLevel {
  return globalDebugLevel
}

/**
 * Get global debug manager instance
 */
export function getGlobalDebugManager(): DebugManager | null {
  return globalDebugManager
}

/**
 * Log debug message if debug mode is enabled
 */
export function debugLog(level: DebugLevel, message: string, data?: any): void {
  if (!globalDebugEnabled || !globalDebugManager) return
  
  globalDebugManager.log(level, message, data)
}

/**
 * Create a debug context for a specific component
 */
export function createDebugContext(component: string) {
  return {
    log: (level: DebugLevel, message: string, data?: any) => {
      debugLog(level, `[${component}] ${message}`, data)
    },
    trace: (message: string, data?: any) => debugLog('trace', `[${component}] ${message}`, data),
    debug: (message: string, data?: any) => debugLog('debug', `[${component}] ${message}`, data),
    info: (message: string, data?: any) => debugLog('info', `[${component}] ${message}`, data),
    warn: (message: string, data?: any) => debugLog('warn', `[${component}] ${message}`, data),
    error: (message: string, data?: any) => debugLog('error', `[${component}] ${message}`, data),
    enabled: () => globalDebugEnabled,
    level: () => globalDebugLevel
  }
}

/**
 * Debug decorator for automatic method tracing
 */
export function debugTrace(component?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value
    const componentName = component || target.constructor.name
    
    descriptor.value = function (...args: any[]) {
      if (!globalDebugEnabled) {
        return originalMethod.apply(this, args)
      }
      
      const startTime = performance.now()
      debugLog('trace', `[${componentName}] Starting ${propertyKey}`, { args })
      
      try {
        const result = originalMethod.apply(this, args)
        
        // Handle async methods
        if (result && typeof result.then === 'function') {
          return result
            .then((value: any) => {
              const duration = performance.now() - startTime
              debugLog('trace', `[${componentName}] Completed ${propertyKey}`, { 
                duration: `${duration.toFixed(2)}ms`, 
                result: value 
              })
              return value
            })
            .catch((error: any) => {
              const duration = performance.now() - startTime
              debugLog('error', `[${componentName}] Failed ${propertyKey}`, { 
                duration: `${duration.toFixed(2)}ms`, 
                error: error.message 
              })
              throw error
            })
        } else {
          const duration = performance.now() - startTime
          debugLog('trace', `[${componentName}] Completed ${propertyKey}`, { 
            duration: `${duration.toFixed(2)}ms`, 
            result 
          })
          return result
        }
      } catch (error) {
        const duration = performance.now() - startTime
        debugLog('error', `[${componentName}] Failed ${propertyKey}`, { 
          duration: `${duration.toFixed(2)}ms`, 
          error: error instanceof Error ? error.message : String(error)
        })
        throw error
      }
    }
    
    return descriptor
  }
}

/**
 * Performance monitoring decorator
 */
export function debugPerformance(threshold: number = 100) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value
    const componentName = target.constructor.name
    
    descriptor.value = function (...args: any[]) {
      if (!globalDebugEnabled) {
        return originalMethod.apply(this, args)
      }
      
      const startTime = performance.now()
      const startMemory = process.memoryUsage().heapUsed
      
      const measurePerformance = (result?: any, error?: any) => {
        const duration = performance.now() - startTime
        const endMemory = process.memoryUsage().heapUsed
        const memoryDelta = endMemory - startMemory
        
        if (duration > threshold) {
          debugLog('warn', `[${componentName}] Slow execution detected in ${propertyKey}`, {
            duration: `${duration.toFixed(2)}ms`,
            threshold: `${threshold}ms`,
            memoryDelta: `${(memoryDelta / 1024 / 1024).toFixed(2)}MB`,
            error: error?.message
          })
        } else {
          debugLog('debug', `[${componentName}] Performance ${propertyKey}`, {
            duration: `${duration.toFixed(2)}ms`,
            memoryDelta: `${(memoryDelta / 1024 / 1024).toFixed(2)}MB`
          })
        }
      }
      
      try {
        const result = originalMethod.apply(this, args)
        
        // Handle async methods
        if (result && typeof result.then === 'function') {
          return result
            .then((value: any) => {
              measurePerformance(value)
              return value
            })
            .catch((error: any) => {
              measurePerformance(undefined, error)
              throw error
            })
        } else {
          measurePerformance(result)
          return result
        }
      } catch (error) {
        measurePerformance(undefined, error)
        throw error
      }
    }
    
    return descriptor
  }
}

/**
 * Export debug state snapshot
 */
export function exportDebugState(): {
  enabled: boolean
  level: DebugLevel
  environment: Record<string, string | undefined>
  snapshot?: any
} {
  return {
    enabled: globalDebugEnabled,
    level: globalDebugLevel,
    environment: {
      DEBUG: process.env.DEBUG,
      AGENTKIT_DEBUG: process.env.AGENTKIT_DEBUG,
      DEBUG_LEVEL: process.env.DEBUG_LEVEL,
      NODE_ENV: process.env.NODE_ENV
    },
    snapshot: globalDebugManager?.createSnapshot()
  }
}

/**
 * Reset debug state
 */
export function resetDebugState(): void {
  globalDebugEnabled = false
  globalDebugLevel = 'info'
  
  if (globalDebugManager) {
    globalDebugManager.reset()
    globalDebugManager = null
  }
  
  console.log('🐛 AgentKit Debug State Reset')
}

/**
 * Validate debug level
 */
function isValidDebugLevel(level: string): level is DebugLevel {
  return ['silent', 'error', 'warn', 'info', 'debug', 'trace'].includes(level)
}

/**
 * Auto-initialize from environment on module load
 */
initializeFromEnvironment()

// Export level constants for convenience
export const DEBUG_LEVELS = {
  SILENT: 'silent' as const,
  ERROR: 'error' as const,
  WARN: 'warn' as const,
  INFO: 'info' as const,
  DEBUG: 'debug' as const,
  TRACE: 'trace' as const
} as const

export { DebugLevel }