import { debugLog } from '../../log'

/**
 * Platform environment detection and capability assessment
 */
export interface PlatformCapabilities {
  isNodeJS: boolean
  isBrowser: boolean
  supportsWebWorkers: boolean
  supportsVM: boolean
  vm?: any
}

/**
 * Detects platform capabilities and provides environment-specific functionality
 */
export class PlatformEnvironment {
  private capabilities: PlatformCapabilities
  private debug: boolean

  constructor(debug: boolean = false) {
    this.debug = debug
    this.capabilities = this.detectPlatformCapabilities()
    
    debugLog.lifecycle('platform detected', 'PlatformEnvironment', {
      platform: this.getPlatformName(),
      capabilities: {
        nodeJS: this.capabilities.isNodeJS,
        browser: this.capabilities.isBrowser,
        webWorkers: this.capabilities.supportsWebWorkers,
        vm: this.capabilities.supportsVM
      }
    }, this.debug)
  }

  /**
   * Get platform capabilities
   */
  getCapabilities(): PlatformCapabilities {
    return { ...this.capabilities }
  }

  /**
   * Get human-readable platform name
   */
  getPlatformName(): string {
    if (this.capabilities.isNodeJS) return 'node'
    if (this.capabilities.isBrowser) return 'browser'
    return 'unknown'
  }

  /**
   * Check if sandboxing is supported in current environment
   */
  supportsSandboxing(): boolean {
    return (this.capabilities.isNodeJS && this.capabilities.supportsVM) ||
           (this.capabilities.isBrowser && this.capabilities.supportsWebWorkers)
  }

  /**
   * Get recommended sandbox strategy for current platform
   */
  getRecommendedSandboxStrategy(): 'vm' | 'worker' | 'none' {
    if (this.capabilities.isNodeJS && this.capabilities.supportsVM) {
      return 'vm'
    }
    if (this.capabilities.isBrowser && this.capabilities.supportsWebWorkers) {
      return 'worker'
    }
    return 'none'
  }

  /**
   * Create a secure sandbox context for plugin execution
   */
  createSandboxContext(allowedGlobals: string[], enableDebugMode: boolean = false): Record<string, any> {
    const context: Record<string, any> = {
      // Explicitly undefined dangerous globals
      global: undefined,
      globalThis: undefined,
      process: undefined,
      require: undefined,
      module: undefined,
      exports: undefined,
      __dirname: undefined,
      __filename: undefined,
      Buffer: undefined,
      console: enableDebugMode ? {
        log: (...args: any[]) => debugLog.operation('sandbox-console', { args }, this.debug),
        error: (...args: any[]) => debugLog.error('sandbox-console-error', new Error(String(args[0])), this.debug),
        warn: (...args: any[]) => debugLog.operation('sandbox-console-warn', { args }, this.debug)
      } : undefined,
      
      // Block constructor access
      constructor: undefined,
      __proto__: null,
      
      // Block Function constructor
      Function: undefined,
      
      // Allowed safe globals
      ...allowedGlobals.reduce((acc, globalName) => {
        try {
          const globalValue = this.getGlobalValue(globalName)
          if (globalValue !== undefined) {
            // Deep freeze the global to prevent mutation
            acc[globalName] = this.deepFreeze(globalValue)
          }
        } catch (error) {
          // Ignore globals that can't be accessed
        }
        return acc
      }, {} as Record<string, any>),
      
      // Safe utilities
      setTimeout: undefined, // Prevent infinite loops with timeouts
      setInterval: undefined,
      setImmediate: undefined,
      clearTimeout: undefined,
      clearInterval: undefined,
      clearImmediate: undefined
    }
    
    return context
  }

  /**
   * Deep freeze an object to prevent mutation in sandbox
   */
  deepFreeze(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }
    
    // Already frozen
    if (Object.isFrozen(obj)) {
      return obj
    }
    
    // Freeze properties first
    Object.getOwnPropertyNames(obj).forEach(prop => {
      const value = obj[prop]
      if (value !== null && typeof value === 'object') {
        this.deepFreeze(value)
      }
    })
    
    return Object.freeze(obj)
  }

  /**
   * Detect platform capabilities at runtime
   */
  private detectPlatformCapabilities(): PlatformCapabilities {
    let vm: any = null
    let isNodeJS = false
    let isBrowser = false
    let supportsWebWorkers = false

    // Check for Node.js environment
    try {
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        vm = require('vm')
        isNodeJS = true
      }
    } catch (error) {
      // vm module not available
    }

    // Check for browser environment
    try {
      isBrowser = this.isBrowserEnvironment()
      supportsWebWorkers = this.isWebWorkerSupported()
    } catch (error) {
      // Browser APIs not available
    }

    return {
      isNodeJS,
      isBrowser,
      supportsWebWorkers,
      supportsVM: !!vm,
      vm
    }
  }

  /**
   * Check if running in browser environment
   */
  private isBrowserEnvironment(): boolean {
    return typeof window !== 'undefined' && 
           typeof document !== 'undefined' && 
           typeof navigator !== 'undefined'
  }

  /**
   * Check if Web Workers are supported
   */
  private isWebWorkerSupported(): boolean {
    return typeof Worker !== 'undefined' && 
           typeof URL !== 'undefined' && 
           typeof Blob !== 'undefined'
  }

  /**
   * Get global value safely
   */
  private getGlobalValue(globalName: string): any {
    if (typeof global !== 'undefined' && global && globalName in global) {
      return (global as any)[globalName]
    }
    if (typeof globalThis !== 'undefined' && globalThis && globalName in globalThis) {
      return (globalThis as any)[globalName]
    }
    if (typeof window !== 'undefined' && window && globalName in window) {
      return (window as any)[globalName]
    }
    return undefined
  }
}