/**
 * Build-time guards for debug utilities
 * 
 * These utilities ensure that debug code is completely excluded from production builds
 * to minimize bundle size and prevent debug functionality from leaking into production.
 */

/**
 * Runtime check for debug mode availability
 * This will be true in development/test environments and false in production
 */
export const isDebugBuildEnabled = (): boolean => {
  // In production builds, this entire function should be tree-shaken out
  if (typeof process === 'undefined') {
    return false
  }
  
  return process.env.NODE_ENV !== 'production'
}

/**
 * Development-only function wrapper
 * Usage: devOnly(() => { debug code here })
 * 
 * In production builds, the callback will never be executed and should be tree-shaken out
 */
export const devOnly = <T>(fn: () => T): T | undefined => {
  if (process.env.NODE_ENV === 'production') {
    return undefined
  }
  return fn()
}

/**
 * Debug-only function wrapper with environment check
 * More strict than devOnly - requires explicit DEBUG flag
 */
export const debugOnly = <T>(fn: () => T): T | undefined => {
  if (process.env.NODE_ENV === 'production') {
    return undefined
  }
  
  if (!process.env.DEBUG && !process.env.DEBUG_TRACE) {
    return undefined
  }
  
  return fn()
}

/**
 * No-op function for production builds
 * Use this to replace debug functions in production
 */
export const noop = (): void => {
  // Intentionally empty - will be optimized out
}

/**
 * Conditional debug import helper
 * Allows lazy loading of debug modules only when needed
 */
export const importDebugModule = async <T>(
  importFn: () => Promise<T>
): Promise<T | null> => {
  if (process.env.NODE_ENV === 'production') {
    return null
  }
  
  try {
    return await importFn()
  } catch (error) {
    console.warn('Failed to load debug module:', error)
    return null
  }
}

/**
 * Build-time constants that can be used for dead code elimination
 */
export const BUILD_CONSTANTS = {
  // These will be replaced by bundlers with literal values
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
  IS_TEST: process.env.NODE_ENV === 'test',
  HAS_DEBUG: Boolean(process.env.DEBUG || process.env.DEBUG_TRACE)
} as const

/**
 * Type guard for ensuring debug mode is enabled
 */
export const assertDebugMode = (): void => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Debug utilities are not available in production builds')
  }
  
  if (!process.env.DEBUG && !process.env.DEBUG_TRACE) {
    throw new Error('Debug mode is not enabled. Set DEBUG=true or DEBUG_TRACE=true')
  }
}

/**
 * Safe console wrapper that respects production builds
 */
export const debugConsole = {
  log: (...args: unknown[]): void => {
    if (process.env.NODE_ENV !== 'production' && (process.env.DEBUG || process.env.DEBUG_TRACE)) {
      console.log(...args)
    }
  },
  
  warn: (...args: unknown[]): void => {
    if (process.env.NODE_ENV !== 'production' && (process.env.DEBUG || process.env.DEBUG_TRACE)) {
      console.warn(...args)
    }
  },
  
  error: (...args: unknown[]): void => {
    if (process.env.NODE_ENV !== 'production' && (process.env.DEBUG || process.env.DEBUG_TRACE)) {
      console.error(...args)
    }
  },
  
  table: (data: unknown): void => {
    if (process.env.NODE_ENV !== 'production' && (process.env.DEBUG || process.env.DEBUG_TRACE)) {
      console.table(data)
    }
  }
}