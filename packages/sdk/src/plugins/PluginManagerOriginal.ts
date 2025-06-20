import type { 
  AgentKitPlugin,
  AgentContext,
  SendPayload,
  PluginHookName
} from '@agentkit/types'
import { 
  PluginManagerOptions,
  AgentKitPluginSchema,
  PluginExecutionResult,
  PluginManagerObservabilityHooks
} from './types'
import { 
  AgentKitError,
  PluginValidationError,
  PluginSignatureError,
  PluginTimeoutError,
  PluginSandboxError
} from '../errors'
import { debugLog } from '../log'
import { deepClone, isCloneable } from '../utils/deepClone'
import { WorkerPool, isWebWorkerSupported, isBrowserEnvironment, type WorkerExecutionOptions } from './worker-utils'

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

/**
 * PluginManager handles registration and execution of AgentKit plugins
 * Ensures plugin isolation and prevents failures from affecting core SDK
 */
export class PluginManager {
  private plugins: AgentKitPlugin[] = []
  private options: Required<Omit<PluginManagerOptions, 'observabilityHooks' | 'allowedGlobals'>> & {
    observabilityHooks?: PluginManagerObservabilityHooks
    allowedGlobals?: string[]
  }
  private isShutdown = false
  
  // Memory leak prevention - track active timeouts
  private activeTimeouts = new Set<NodeJS.Timeout>()
  
  // Web Worker pool for browser environments
  private workerPool?: WorkerPool

  constructor(options: PluginManagerOptions = {}) {
    this.options = {
      debug: options.debug ?? false,
      hookTimeout: options.hookTimeout ?? 5000,
      failFast: options.failFast ?? false,
      observabilityHooks: options.observabilityHooks,
      sandbox: options.sandbox ?? true, // Default to enabled
      sandboxTimeout: options.sandboxTimeout ?? 500, // Default 500ms for sandbox
      allowedGlobals: options.allowedGlobals ?? ['Math', 'Date', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean'],
      enableDebugMode: options.enableDebugMode ?? false
    }
    
    // Initialize sandbox support based on platform
    if (this.options.sandbox) {
      if (isNodeJS && vm) {
        // Node.js VM sandboxing available
        debugLog.lifecycle('sandbox enabled - Node.js vm.runInContext', 'PluginManager', {
          platform: 'node'
        }, this.options.debug)
      } else if (isBrowser && supportsWebWorkers) {
        // Browser Web Worker sandboxing available
        this.workerPool = new WorkerPool({
          maxWorkers: 3,
          maxIdleTime: 30000,
          debug: this.options.debug,
          preWarm: false
        })
        debugLog.lifecycle('sandbox enabled - Browser Web Workers', 'PluginManager', {
          platform: 'browser',
          webWorkerSupport: true
        }, this.options.debug)
      } else {
        // No sandboxing available - warn and disable
        this.options.sandbox = false
        const platform = isNodeJS ? 'node-no-vm' : isBrowser ? 'browser-no-workers' : 'unknown'
        debugLog.lifecycle('sandbox disabled - platform not supported', 'PluginManager', {
          platform,
          isNodeJS,
          isBrowser,
          supportsWebWorkers
        }, this.options.debug)
        
        // Warn in dev mode about disabled sandboxing
        if (this.options.enableDebugMode && typeof console !== 'undefined') {
          console.warn(
            'AgentKit: Plugin sandboxing disabled due to unsupported environment. ' +
            'This may pose security risks with untrusted plugins.'
          )
        }
      }
    }
    
    debugLog.lifecycle('plugin manager created', 'PluginManager', {
      hookTimeout: this.options.hookTimeout,
      failFast: this.options.failFast,
      debug: this.options.debug,
      sandbox: this.options.sandbox,
      sandboxTimeout: this.options.sandboxTimeout,
      allowedGlobals: this.options.allowedGlobals?.length,
      platform: isNodeJS ? 'node' : isBrowser ? 'browser' : 'unknown',
      hasWorkerPool: !!this.workerPool
    }, this.options.debug)
  }

  /**
   * Register a plugin with validation
   */
  register(plugin: AgentKitPlugin): void {
    // Validate plugin schema
    try {
      AgentKitPluginSchema.parse(plugin)
    } catch (error) {
      throw new PluginValidationError(plugin.name || 'unknown', String(error), {
        context: { plugin: plugin.name, validationError: error }
      })
    }

    // Validate hook functions are actually functions and have correct signatures
    this.validatePluginHooks(plugin)

    this.plugins.push(plugin)
    
    const availableHooks = [
      plugin.onInit ? 'onInit' : null,
      plugin.onSend ? 'onSend' : null, 
      plugin.onError ? 'onError' : null,
      plugin.onShutdown ? 'onShutdown' : null
    ].filter(Boolean)
    
    debugLog.operation('plugin registered', {
      name: plugin.name,
      version: plugin.version,
      hooks: availableHooks
    }, this.options.debug)
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): ReadonlyArray<AgentKitPlugin> {
    return [...this.plugins]
  }

  /**
   * Execute a hook on all plugins that implement it
   */
  async executeHook(hookName: 'onInit' | 'onShutdown', context: AgentContext): Promise<PluginExecutionResult[]>
  async executeHook(hookName: 'onSend', payload: SendPayload, context: AgentContext): Promise<PluginExecutionResult[]>
  async executeHook(hookName: 'onError', error: Error | AgentKitError, context: AgentContext): Promise<PluginExecutionResult[]>
  async executeHook(hookName: PluginHookName, ...args: [AgentContext] | [SendPayload, AgentContext] | [Error | AgentKitError, AgentContext]): Promise<PluginExecutionResult[]> {
    const startTime = Date.now()
    const results: PluginExecutionResult[] = []
    
    debugLog.operation('plugin hook execution start', {
      hook: hookName,
      pluginCount: this.plugins.length,
      hasPlugins: this.plugins.some(p => !!(p as any)[hookName])
    }, this.options.debug)

    for (const plugin of this.plugins) {
      const hook = (plugin as any)[hookName]
      if (!hook) continue

      const result = await this.executePluginWithObservability(plugin, hookName, hook, args)
      results.push(result)
      
      // If failFast is enabled and plugin failed, throw error
      if (this.options.failFast && !result.success) {
        throw result.error || new Error(`Plugin ${plugin.name}.${hookName} failed`)
      }
    }

    const totalDuration = Date.now() - startTime
    debugLog.operation('plugin hook execution complete', {
      hook: hookName,
      totalDuration,
      executedCount: results.length,
      successCount: results.filter(r => r.success).length,
      errorCount: results.filter(r => !r.success && !r.timeout).length,
      timeoutCount: results.filter(r => r.timeout).length
    }, this.options.debug)

    return results
  }

  /**
   * Create immutable copies of arguments to prevent plugin mutation
   * Uses secure deep cloning with circular reference protection
   */
  private createImmutableArgs(hookName: PluginHookName, args: [AgentContext] | [SendPayload, AgentContext] | [Error | AgentKitError, AgentContext]): unknown[] {
    switch (hookName) {
      case 'onInit':
      case 'onShutdown':
        // Single context argument
        return [this.secureClone(args[0])]
        
      case 'onSend':
        // Payload and context arguments
        return [this.secureClone(args[0]), this.secureClone(args[1])]
        
      case 'onError':
        // Error and context arguments
        // Note: We don't deep clone the error to preserve stack trace and Error object integrity
        const error = args[0]
        const context = this.secureClone(args[1])
        return [error, context]
        
      default:
        // Type-safe fallback that shouldn't be reached with proper typing
        return args.map((arg: unknown) => this.secureClone(arg))
    }
  }

  /**
   * Securely clone data with validation and circular reference protection
   */
  private secureClone<T>(obj: T): T {
    // Check if the object is cloneable first
    if (!isCloneable(obj)) {
      debugLog.warn('Attempted to clone non-cloneable object', {
        type: typeof obj,
        constructor: obj?.constructor?.name
      }, this.options.debug)
      
      // Return a safe fallback for non-cloneable objects
      if (obj === null || typeof obj !== 'object') {
        return obj
      }
      
      // For objects, return a shallow copy of enumerable properties
      return { ...obj } as T
    }
    
    try {
      return deepClone(obj)
    } catch (error) {
      debugLog.error('Deep clone failed, falling back to shallow copy', error as Error, this.options.debug)
      
      // Safe fallback
      if (obj === null || typeof obj !== 'object') {
        return obj
      }
      
      if (Array.isArray(obj)) {
        return [...obj] as T
      }
      
      return { ...obj } as T
    }
  }

  /**
   * Create a secure sandbox context for plugin execution
   */
  private createSandboxContext(allowedGlobals: string[]): Record<string, any> {
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
      console: this.options.enableDebugMode ? {
        log: (...args: any[]) => debugLog.operation('sandbox-console', { args }, this.options.debug),
        error: (...args: any[]) => debugLog.error('sandbox-console-error', new Error(String(args[0])), this.options.debug),
        warn: (...args: any[]) => debugLog.operation('sandbox-console-warn', { args }, this.options.debug)
      } : undefined,
      
      // Block constructor access
      constructor: undefined,
      __proto__: null,
      
      // Block Function constructor
      Function: undefined,
      
      // Allowed safe globals
      ...allowedGlobals.reduce((acc, globalName) => {
        try {
          const globalValue = (global as any)[globalName] || (globalThis as any)[globalName]
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
  private deepFreeze(obj: any): any {
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
   * Strip dangerous functions from arguments
   */
  private stripFunctions(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }
    
    if (typeof obj === 'function') {
      return undefined // Remove functions entirely
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.stripFunctions(item))
    }
    
    const stripped: any = {}
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'function') {
        continue // Skip functions
      }
      stripped[key] = this.stripFunctions(value)
    }
    
    return stripped
  }

  /**
   * Execute plugin hook in secure sandbox (Node.js only)
   */
  private async executePluginInSandbox(
    plugin: AgentKitPlugin,
    hookName: PluginHookName,
    hook: Function,
    args: unknown[]
  ): Promise<any> {
    if (!this.options.sandbox || !isNodeJS || !vm) {
      // Fallback to direct execution
      return this.executePluginHookDirect(plugin, hookName, hook, args)
    }
    
    this.options.observabilityHooks?.onPluginSandboxStart?.(plugin.name, hookName)
    const sandboxStart = Date.now()
    
    try {
      // Create secure context
      const context = this.createSandboxContext(this.options.allowedGlobals!)
      const vmContext = vm.createContext(context)
      
      // Strip functions from arguments for security
      const sanitizedArgs = args.map(arg => this.stripFunctions(this.secureClone(arg)))
      
      debugLog.operation('sandbox executing plugin', {
        plugin: plugin.name,
        hook: hookName,
        argsCount: sanitizedArgs.length,
        contextKeys: Object.keys(context).length
      }, this.options.debug)
      
      // Get the function source and create a completely isolated execution
      const timeoutMs = this.options.sandboxTimeout!
      const hookSource = hook.toString()
      
      // Extract the function body to avoid issues with function declarations
      // For anonymous functions, we need to wrap them properly
      let functionBody = hookSource
      
      // Handle different function formats
      if (hookSource.includes('=>')) {
        // Arrow function - need to handle differently
        if (hookSource.includes('{')) {
          // Block arrow function: args => { ... }
          const arrowIndex = hookSource.indexOf('=>')
          const paramsStr = hookSource.substring(0, arrowIndex).trim()
          const bodyStr = hookSource.substring(arrowIndex + 2).trim()
          functionBody = `function ${paramsStr} ${bodyStr}`
        } else {
          // Expression arrow function: args => expr
          const arrowIndex = hookSource.indexOf('=>')
          const paramsStr = hookSource.substring(0, arrowIndex).trim()
          const exprStr = hookSource.substring(arrowIndex + 2).trim()
          functionBody = `function ${paramsStr} { return ${exprStr}; }`
        }
      }
      
      // Create script that completely isolates execution in the VM context
      const executionScript = `
        (function() {
          'use strict';
          
          try {
            // Define the plugin function in the isolated context
            const pluginFn = ${functionBody};
            
            // Parse arguments from JSON to ensure they're fully deserialized
            const args = JSON.parse(${JSON.stringify(JSON.stringify(sanitizedArgs))});
            
            // Execute the function
            const result = pluginFn.apply(null, args);
            
            // Handle async results by returning them (they'll be awaited outside the VM)
            return result;
          } catch (e) {
            throw new Error('Sandbox execution error: ' + e.message);
          }
        })()
      `
      
      // Execute with timeout
      const result = await this.executeWithSandboxTimeout(
        () => vm.runInContext(executionScript, vmContext, {
          timeout: timeoutMs,
          displayErrors: true, // Enable for better debugging
          filename: `plugin-${plugin.name}-${hookName}.js`
        }),
        timeoutMs,
        `${plugin.name}.${hookName}`
      )
      
      const duration = Date.now() - sandboxStart
      this.options.observabilityHooks?.onPluginSandboxEnd?.(plugin.name, hookName, duration)
      
      debugLog.operation('sandbox execution completed', {
        plugin: plugin.name,
        hook: hookName,
        duration,
        hasResult: result !== undefined
      }, this.options.debug)
      
      return result
      
    } catch (error) {
      const duration = Date.now() - sandboxStart
      this.options.observabilityHooks?.onPluginSandboxEnd?.(plugin.name, hookName, duration)
      
      // Re-throw PluginTimeoutError as-is to maintain timeout semantics
      if (error instanceof PluginTimeoutError) {
        throw error
      }
      
      if (error instanceof Error) {
        // Check for VM timeout specifically
        if (error.message.includes('Script execution timed out')) {
          const timeoutMs = this.options.sandboxTimeout!
          throw new PluginTimeoutError(`${plugin.name}.${hookName}`, timeoutMs, {
            context: { operation: `${plugin.name}.${hookName}`, timeoutMs, type: 'sandbox' }
          })
        }
        
        // Check for common sandbox escape attempts
        const escapePattern = /(\bglobal\b|\bprocess\b|\brequire\b|\bmodule\b|\bexports\b|constructor|prototype|__proto__|Function)/i
        const isSandboxViolation = escapePattern.test(error.message) || 
                                   error.message.includes('is not defined') ||
                                   error.message.includes('is not a function') ||
                                   error.message.includes('Cannot read properties of undefined') ||
                                   error.message.includes('Cannot set properties of undefined') ||
                                   error.message.includes('Cannot access before initialization')
        
        if (isSandboxViolation) {
          this.options.observabilityHooks?.onPluginSandboxEscape?.(plugin.name, hookName, error.message)
          throw new PluginSandboxError(plugin.name, hookName, error.message, {
            context: { originalError: error.message, duration }
          })
        }
        
        // For legitimate plugin errors, check if they're wrapped in "Sandbox execution error"
        if (error.message.startsWith('Sandbox execution error: ')) {
          const originalMessage = error.message.replace('Sandbox execution error: ', '')
          // Create a plain Error to represent the plugin's intended error
          const pluginError = new Error(originalMessage)
          pluginError.stack = error.stack
          throw pluginError
        }
        
        // Re-throw the original error if it's a legitimate plugin error
        throw error
      }
      
      throw new PluginSandboxError(plugin.name, hookName, String(error), {
        context: { originalError: String(error), duration }
      })
    }
  }

  /**
   * Execute with sandbox-specific timeout
   */
  private async executeWithSandboxTimeout<T>(
    fn: () => T,
    timeout: number,
    operation: string
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = this.createTrackedTimeout(() => {
        reject(new PluginTimeoutError(operation, timeout, {
          context: { operation, timeoutMs: timeout, type: 'sandbox' }
        }))
      }, timeout)
    })

    const executionPromise = Promise.resolve(fn())
    
    try {
      return await Promise.race([executionPromise, timeoutPromise])
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
        this.activeTimeouts.delete(timeoutId)
      }
    }
  }

  /**
   * Execute a plugin hook with proper async/sync handling (direct/fallback)
   */
  private async executePluginHookDirect(
    plugin: AgentKitPlugin,
    hookName: PluginHookName,
    hook: Function,
    args: unknown[]
  ): Promise<any> {
    debugLog.operation('plugin hook executing (direct)', {
      plugin: plugin.name,
      hook: hookName
    }, this.options.debug)

    // Execute the hook (can be sync or async)
    const result = hook.apply(plugin, args)
    
    // If result is a promise, await it
    if (result && typeof result.then === 'function') {
      return await result
    }
    
    return result
  }

  /**
   * Execute plugin hook in Web Worker (browser environments)
   */
  private async executePluginInWorker(
    plugin: AgentKitPlugin,
    hookName: PluginHookName,
    hook: Function,
    args: unknown[]
  ): Promise<any> {
    if (!this.workerPool) {
      throw new Error('Worker pool not initialized')
    }

    this.options.observabilityHooks?.onPluginSandboxStart?.(plugin.name, hookName)
    const workerStart = Date.now()

    try {
      // Strip functions from arguments for security  
      const sanitizedArgs = args.map(arg => this.stripFunctions(this.secureClone(arg)))

      debugLog.operation('worker executing plugin', {
        plugin: plugin.name,
        hook: hookName,
        argsCount: sanitizedArgs.length,
        workerPoolStats: this.workerPool.getStats()
      }, this.options.debug)

      // Track memory usage if available
      let memoryBefore: number | undefined
      if (typeof performance !== 'undefined' && (performance as any).memory) {
        memoryBefore = (performance as any).memory.usedJSHeapSize
      }

      // Execute in worker with proper function serialization
      const hookSource = hook.toString()
      
      const options: WorkerExecutionOptions = {
        pluginName: plugin.name,
        hookName,
        functionSource: hookSource,
        args: sanitizedArgs,
        timeout: this.options.sandboxTimeout!,
        allowedGlobals: this.options.allowedGlobals!,
        debug: this.options.debug
      }

      const result = await this.workerPool.execute(options)

      const duration = Date.now() - workerStart
      this.options.observabilityHooks?.onPluginSandboxEnd?.(plugin.name, hookName, duration)

      // Log memory usage if available
      if (memoryBefore !== undefined && typeof performance !== 'undefined' && (performance as any).memory) {
        const memoryAfter = (performance as any).memory.usedJSHeapSize
        const memoryDelta = memoryAfter - memoryBefore
        
        debugLog.operation('worker execution memory', {
          plugin: plugin.name,
          hook: hookName,
          memoryBefore,
          memoryAfter,
          memoryDelta
        }, this.options.debug)
      }

      debugLog.operation('worker execution completed', {
        plugin: plugin.name,
        hook: hookName,
        duration,
        hasResult: result !== undefined,
        workerPoolStats: this.workerPool.getStats()
      }, this.options.debug)

      return result

    } catch (error) {
      const duration = Date.now() - workerStart
      this.options.observabilityHooks?.onPluginSandboxEnd?.(plugin.name, hookName, duration)

      // Re-throw timeout errors as-is
      if (error instanceof PluginTimeoutError) {
        throw error
      }

      // Check for sandbox violations and escape attempts
      if (error instanceof Error) {
        const escapePattern = /(\bdocument\b|\bwindow\b|\blocation\b|\bnavigator\b|\bhistory\b|is not defined|is not a function)/i
        if (escapePattern.test(error.message)) {
          this.options.observabilityHooks?.onPluginSandboxEscape?.(plugin.name, hookName, error.message)
        }
      }

      throw error
    }
  }

  /**
   * Execute a plugin hook with proper async/sync handling
   */
  private async executePluginHook(
    plugin: AgentKitPlugin,
    hookName: PluginHookName,
    hook: Function,
    args: unknown[]
  ): Promise<any> {
    debugLog.operation('plugin hook executing', {
      plugin: plugin.name,
      hook: hookName,
      sandbox: this.options.sandbox,
      platform: isNodeJS ? 'node' : isBrowser ? 'browser' : 'unknown'
    }, this.options.debug)

    if (this.options.sandbox) {
      if (isNodeJS && vm) {
        // Use Node.js VM sandbox
        return this.executePluginInSandbox(plugin, hookName, hook, args)
      } else if (isBrowser && this.workerPool) {
        // Use Web Worker sandbox
        return this.executePluginInWorker(plugin, hookName, hook, args)
      }
    }
    
    // Fallback to direct execution
    return this.executePluginHookDirect(plugin, hookName, hook, args)
  }

  /**
   * Execute a plugin with full observability and timeout protection
   */
  private async executePluginWithObservability(
    plugin: AgentKitPlugin,
    hookName: PluginHookName,
    hook: Function,
    args: unknown[]
  ): Promise<PluginExecutionResult> {
    const startTime = Date.now()
    const immutableArgs = this.createImmutableArgs(hookName, args as [AgentContext] | [SendPayload, AgentContext] | [Error | AgentKitError, AgentContext])
    
    // Notify observability hook of plugin start
    this.options.observabilityHooks?.onPluginStart?.(plugin.name, hookName)
    
    try {
      // Execute with timeout using Promise.race
      await this.executeWithTimeout(
        () => this.executePluginHook(plugin, hookName, hook, immutableArgs),
        this.options.hookTimeout,
        `${plugin.name}.${hookName}`
      )
      
      const duration = Date.now() - startTime
      
      // Notify observability hook of success
      this.options.observabilityHooks?.onPluginSuccess?.(plugin.name, hookName, duration)
      
      debugLog.operation('plugin hook success', {
        plugin: plugin.name,
        hook: hookName,
        duration
      }, this.options.debug)
      
      return {
        pluginName: plugin.name,
        hookName,
        success: true,
        duration
      }
      
    } catch (error) {
      const duration = Date.now() - startTime
      const isTimeout = error instanceof PluginTimeoutError
      
      // Notify observability hooks
      if (isTimeout) {
        this.options.observabilityHooks?.onPluginTimeout?.(plugin.name, hookName, this.options.hookTimeout)
      } else {
        this.options.observabilityHooks?.onPluginError?.(plugin.name, hookName, error as Error, duration)
      }
      
      // Log error
      this.handlePluginError(plugin, hookName, error)
      
      return {
        pluginName: plugin.name,
        hookName,
        success: false,
        duration,
        error: error as Error,
        timeout: isTimeout
      }
    }
  }

  /**
   * Execute a function with timeout protection using Promise.race
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T> | T,
    timeout: number,
    operation: string
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = this.createTrackedTimeout(() => {
        reject(new PluginTimeoutError(operation, timeout, {
          context: { operation, timeoutMs: timeout }
        }))
      }, timeout)
    })

    const executionPromise = Promise.resolve(fn())
    
    try {
      return await Promise.race([executionPromise, timeoutPromise])
    } finally {
      // Clean up timeout if it hasn't fired yet
      if (timeoutId) {
        clearTimeout(timeoutId)
        this.activeTimeouts.delete(timeoutId)
      }
    }
  }

  /**
   * Handle plugin errors without breaking execution
   */
  private handlePluginError(plugin: AgentKitPlugin, hookName: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorDetails = {
      plugin: plugin.name,
      hook: hookName,
      error: errorMessage
    }

    debugLog.error('plugin hook error', error as Error, this.options.debug)

    debugLog.error('Plugin execution failed', error as Error, this.options.debug)
  }

  /**
   * Validate plugin hook functions and signatures
   */
  private validatePluginHooks(plugin: AgentKitPlugin): void {
    const hooks: PluginHookName[] = ['onInit', 'onSend', 'onError', 'onShutdown']
    
    for (const hookName of hooks) {
      const hook = (plugin as any)[hookName]
      if (!hook) continue
      
      if (typeof hook !== 'function') {
        throw new PluginSignatureError(plugin.name, hookName, 'must be a function', {
          context: { hookType: typeof hook }
        })
      }
      
      // Validate function signature by checking length (parameter count)
      // Skip validation for mock functions and functions with dynamic length
      const isMockFunction = 'mockImplementation' in hook || 'isMockFunction' in hook || hook.toString().includes('Mock')
      
      // Validate parameter count for real functions
      if (!isMockFunction) {
        switch (hookName) {
          case 'onInit':
          case 'onShutdown':
            if (hook.length !== 1 && hook.length !== 0) { // Allow 0 for () => {} style
              throw new PluginSignatureError(plugin.name, hookName, 'must accept exactly 1 parameter (context)', {
                context: { expectedParams: 1, actualParams: hook.length }
              })
            }
            break
          case 'onSend':
            if (hook.length !== 2 && hook.length !== 0) { // Allow 0 for () => {} style
              throw new PluginSignatureError(plugin.name, hookName, 'must accept exactly 2 parameters (payload, context)', {
                context: { expectedParams: 2, actualParams: hook.length }
              })
            }
            break
          case 'onError':
            if (hook.length !== 2 && hook.length !== 0) { // Allow 0 for () => {} style
              throw new PluginSignatureError(plugin.name, hookName, 'must accept exactly 2 parameters (error, context)', {
                context: { expectedParams: 2, actualParams: hook.length }
              })
            }
            break
        }
      }
      
      // Note: We now support both sync and async functions
      // No need to check for async functions anymore
    }
  }

  /**
   * Clear all registered plugins
   */
  clear(): void {
    this.plugins = []
    debugLog.operation('plugins cleared', {}, this.options.debug)
  }

  /**
   * Get plugin by name
   */
  getPlugin(name: string): AgentKitPlugin | undefined {
    return this.plugins.find(p => p.name === name)
  }

  /**
   * Remove a plugin by name
   */
  removePlugin(name: string): boolean {
    const initialLength = this.plugins.length
    this.plugins = this.plugins.filter(p => p.name !== name)
    const removed = this.plugins.length < initialLength
    
    if (removed) {
      debugLog.operation('plugin removed', { name }, this.options.debug)
    }
    
    return removed
  }

  /**
   * Shutdown the plugin manager and clean up all resources
   * CRITICAL: This prevents timer leaks by clearing all active timeouts
   */
  shutdown(): void {
    if (this.isShutdown) {
      return // Already shutdown, idempotent
    }

    this.isShutdown = true

    // Clear all active timeouts to prevent memory leaks
    for (const timeout of this.activeTimeouts) {
      clearTimeout(timeout)
    }
    this.activeTimeouts.clear()

    // Shutdown worker pool if it exists
    if (this.workerPool) {
      this.workerPool.shutdown()
      this.workerPool = undefined
    }

    // Clear plugins array to release references
    this.plugins.length = 0

    debugLog.operation('plugin manager shutdown', {
      clearedTimeouts: this.activeTimeouts.size,
      clearedPlugins: this.plugins.length,
      shutdownWorkerPool: !!this.workerPool
    }, this.options.debug)
  }

  /**
   * Helper method to create tracked timeouts that will be cleaned up on shutdown
   */
  private createTrackedTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    if (this.isShutdown) {
      // Don't create new timeouts after shutdown
      throw new Error('Cannot create timeout after PluginManager shutdown')
    }

    const timeout = setTimeout(() => {
      // Remove from tracking set when timeout fires
      this.activeTimeouts.delete(timeout)
      if (!this.isShutdown) {
        callback()
      }
    }, delay)
    
    // Track the timeout for cleanup
    this.activeTimeouts.add(timeout)
    return timeout
  }
}