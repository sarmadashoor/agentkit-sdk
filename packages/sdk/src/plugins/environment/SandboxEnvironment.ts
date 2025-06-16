/**
 * Sandbox Environment - Security and Platform Management
 * 
 * Handles sandbox environment setup, security policies, and platform detection.
 */

import { debugLog } from '../../log'
import { isBrowserEnvironment, isWebWorkerSupported } from '../worker-utils'

// Platform detection for execution environment
let vm: any = null
let isNodeJS = false
let isBrowser = false
let supportsWebWorkers = false

try {
  // Check for Node.js environment
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    vm = require('vm')
    isNodeJS = true
  }
} catch (error) {
  // vm module not available
}

try {
  // Check for browser environment
  isBrowser = isBrowserEnvironment()
  supportsWebWorkers = isWebWorkerSupported()
} catch (error) {
  // Browser APIs not available
}

export interface SandboxEnvironmentOptions {
  enabled?: boolean
  timeout?: number
  allowedGlobals?: string[]
  debug?: boolean
}

export interface PlatformCapabilities {
  isNodeJS: boolean
  isBrowser: boolean
  supportsVM: boolean
  supportsWebWorkers: boolean
  sandboxingAvailable: boolean
  recommendedStrategy: 'vm' | 'webworker' | 'direct'
}

export interface SandboxContext {
  context: any
  cleanup: () => void
}

/**
 * Sandbox Environment manages platform detection and secure execution contexts
 */
export class SandboxEnvironment {
  private options: Required<SandboxEnvironmentOptions>

  constructor(options: SandboxEnvironmentOptions = {}) {
    this.options = {
      enabled: options.enabled ?? true,
      timeout: options.timeout ?? 500,
      allowedGlobals: options.allowedGlobals ?? ['Math', 'Date', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean'],
      debug: options.debug ?? false
    }
  }

  /**
   * Get platform capabilities
   */
  getPlatformCapabilities(): PlatformCapabilities {
    const capabilities: PlatformCapabilities = {
      isNodeJS,
      isBrowser,
      supportsVM: !!(isNodeJS && vm),
      supportsWebWorkers,
      sandboxingAvailable: false,
      recommendedStrategy: 'direct'
    }

    // Determine sandboxing availability and recommended strategy
    if (capabilities.supportsVM) {
      capabilities.sandboxingAvailable = true
      capabilities.recommendedStrategy = 'vm'
    } else if (capabilities.supportsWebWorkers) {
      capabilities.sandboxingAvailable = true
      capabilities.recommendedStrategy = 'webworker'
    } else {
      capabilities.sandboxingAvailable = false
      capabilities.recommendedStrategy = 'direct'
    }

    return capabilities
  }

  /**
   * Create a secure sandbox context for Node.js VM execution
   */
  createVMSandbox(): SandboxContext {
    if (!isNodeJS || !vm) {
      throw new Error('VM sandbox not available - Node.js vm module required')
    }

    // Create a new context with limited globals
    const sandboxGlobals = this.createSafeGlobals()
    const context = vm.createContext(sandboxGlobals)

    // Freeze the context to prevent modifications
    this.freezeContext(context)

    debugLog.lifecycle('VM sandbox created', 'SandboxEnvironment', {
      allowedGlobals: this.options.allowedGlobals,
      globalCount: Object.keys(sandboxGlobals).length
    }, this.options.debug)

    return {
      context,
      cleanup: () => {
        // VM contexts are automatically garbage collected
        // No explicit cleanup needed for VM contexts
      }
    }
  }

  /**
   * Create safe globals for sandbox execution
   */
  private createSafeGlobals(): Record<string, any> {
    const safeGlobals: Record<string, any> = {}

    // Add allowed globals
    for (const globalName of this.options.allowedGlobals) {
      if (typeof globalThis[globalName as keyof typeof globalThis] !== 'undefined') {
        safeGlobals[globalName] = globalThis[globalName as keyof typeof globalThis]
      }
    }

    // Add safe console for debugging (if enabled)
    if (this.options.debug) {
      safeGlobals.console = {
        log: (...args: any[]) => console.log('[Plugin]', ...args),
        warn: (...args: any[]) => console.warn('[Plugin]', ...args),
        error: (...args: any[]) => console.error('[Plugin]', ...args),
        info: (...args: any[]) => console.info('[Plugin]', ...args)
      }
    }

    // Add minimal necessary globals
    safeGlobals.undefined = undefined
    safeGlobals.null = null
    safeGlobals.NaN = NaN
    safeGlobals.Infinity = Infinity

    return safeGlobals
  }

  /**
   * Freeze context to prevent tampering
   */
  private freezeContext(context: any): void {
    try {
      // Freeze all objects in the context to prevent modification
      for (const key of Object.keys(context)) {
        const value = context[key]
        if (value && typeof value === 'object') {
          this.deepFreeze(value)
        }
      }

      // Freeze the context itself
      Object.freeze(context)

    } catch (error) {
      debugLog.warn('context freezing failed', error as Error, this.options.debug)
      // Continue execution even if freezing fails
    }
  }

  /**
   * Deep freeze objects to prevent modification
   */
  private deepFreeze(obj: any): void {
    try {
      if (obj === null || typeof obj !== 'object') {
        return
      }

      // Freeze the object first
      Object.freeze(obj)

      // Recursively freeze properties
      for (const prop of Object.getOwnPropertyNames(obj)) {
        try {
          const value = obj[prop]
          if (value && typeof value === 'object') {
            this.deepFreeze(value)
          }
        } catch (error) {
          // Continue with other properties if one fails
        }
      }
    } catch (error) {
      // Ignore freezing errors - not critical for security
    }
  }

  /**
   * Strip functions from plugin object for secure serialization
   */
  stripFunctions(plugin: any): any {
    if (!plugin || typeof plugin !== 'object') {
      return plugin
    }

    const stripped: any = {}

    for (const [key, value] of Object.entries(plugin)) {
      if (typeof value === 'function') {
        // Convert function to string representation
        stripped[key] = {
          __type: 'function',
          __source: value.toString(),
          __name: value.name || 'anonymous'
        }
      } else if (value && typeof value === 'object') {
        // Recursively strip nested objects
        stripped[key] = this.stripFunctions(value)
      } else {
        // Copy primitive values
        stripped[key] = value
      }
    }

    return stripped
  }

  /**
   * Create immutable execution arguments
   */
  createImmutableArgs(...args: any[]): any[] {
    return args.map(arg => {
      if (arg === null || arg === undefined || typeof arg !== 'object') {
        return arg
      }

      try {
        // Create a deep clone and freeze it
        const cloned = this.deepClone(arg)
        return this.deepFreeze(cloned)
      } catch (error) {
        debugLog.warn('argument immutability failed', error as Error, this.options.debug)
        return arg
      }
    })
  }

  /**
   * Simple deep clone implementation
   */
  private deepClone(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime())
    }

    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item))
    }

    if (typeof obj === 'object') {
      const cloned: any = {}
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = this.deepClone(obj[key])
        }
      }
      return cloned
    }

    return obj
  }

  /**
   * Validate sandbox security
   */
  validateSandboxSecurity(): { secure: boolean; warnings: string[] } {
    const warnings: string[] = []
    let secure = true

    const capabilities = this.getPlatformCapabilities()

    if (!capabilities.sandboxingAvailable) {
      warnings.push('No sandboxing available - plugins will execute in main context')
      secure = false
    }

    if (!this.options.enabled) {
      warnings.push('Sandbox is explicitly disabled')
      secure = false
    }

    if (this.options.allowedGlobals.includes('eval')) {
      warnings.push('eval is allowed in sandbox globals - potential security risk')
      secure = false
    }

    if (this.options.allowedGlobals.includes('Function')) {
      warnings.push('Function constructor is allowed in sandbox - potential security risk')
      secure = false
    }

    return { secure, warnings }
  }

  /**
   * Get sandbox configuration
   */
  getConfiguration(): Required<SandboxEnvironmentOptions> {
    return { ...this.options }
  }

  /**
   * Update sandbox configuration
   */
  updateConfiguration(options: Partial<SandboxEnvironmentOptions>): void {
    this.options = { ...this.options, ...options }
    
    debugLog.lifecycle('sandbox configuration updated', 'SandboxEnvironment', {
      newOptions: options
    }, this.options.debug)
  }

  /**
   * Check if sandboxing is enabled and available
   */
  isSandboxingEnabled(): boolean {
    const capabilities = this.getPlatformCapabilities()
    return this.options.enabled && capabilities.sandboxingAvailable
  }

  /**
   * Get recommended execution strategy
   */
  getRecommendedStrategy(): 'vm' | 'webworker' | 'direct' {
    return this.getPlatformCapabilities().recommendedStrategy
  }
}

// Export platform detection utilities
export {
  isNodeJS,
  isBrowser,
  supportsWebWorkers,
  vm
};