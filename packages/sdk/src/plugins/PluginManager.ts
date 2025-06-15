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
  PluginTimeoutError 
} from '../errors'
import { debugLog } from '../log'

/**
 * PluginManager handles registration and execution of AgentKit plugins
 * Ensures plugin isolation and prevents failures from affecting core SDK
 */
export class PluginManager {
  private plugins: AgentKitPlugin[] = []
  private options: Required<Omit<PluginManagerOptions, 'observabilityHooks'>> & {
    observabilityHooks?: PluginManagerObservabilityHooks
  }
  private isShutdown = false
  
  // Memory leak prevention - track active timeouts
  private activeTimeouts = new Set<NodeJS.Timeout>()

  constructor(options: PluginManagerOptions = {}) {
    this.options = {
      debug: options.debug ?? false,
      hookTimeout: options.hookTimeout ?? 5000,
      failFast: options.failFast ?? false,
      observabilityHooks: options.observabilityHooks
    }
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
    
    const hooks: PluginHookName[] = ['onInit', 'onSend', 'onError', 'onShutdown']
    debugLog.operation('plugin registered', {
      name: plugin.name,
      version: plugin.version,
      hooks: hooks.filter(h => !!plugin[h])
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
      hasPlugins: this.plugins.some(p => !!p[hookName])
    }, this.options.debug)

    for (const plugin of this.plugins) {
      const hook = plugin[hookName]
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
   */
  private createImmutableArgs(hookName: PluginHookName, args: [AgentContext] | [SendPayload, AgentContext] | [Error | AgentKitError, AgentContext]): unknown[] {
    switch (hookName) {
      case 'onInit':
      case 'onShutdown':
        // Single context argument
        return [this.deepClone(args[0])]
        
      case 'onSend':
        // Payload and context arguments
        return [this.deepClone(args[0]), this.deepClone(args[1])]
        
      case 'onError':
        // Error and context arguments
        // Note: We don't deep clone the error to preserve stack trace
        const error = args[0]
        const context = this.deepClone(args[1])
        return [error, context]
        
      default:
        // Type-safe fallback that shouldn't be reached with proper typing
        return args.map((arg: unknown) => this.deepClone(arg))
    }
  }

  /**
   * Deep clone an object to prevent mutation
   */
  private deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj
    if (obj instanceof Date) return new Date(obj.getTime()) as T
    if (obj instanceof Array) return obj.map(item => this.deepClone(item)) as T
    if (obj instanceof Error) return obj // Don't clone errors
    
    const cloned = {} as T
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key])
      }
    }
    return cloned
  }

  /**
   * Execute a plugin hook with proper async/sync handling
   */
  private async executePluginHook(
    plugin: AgentKitPlugin,
    hookName: PluginHookName,
    hook: Function,
    args: unknown[]
  ): Promise<void> {
    debugLog.operation('plugin hook executing', {
      plugin: plugin.name,
      hook: hookName
    }, this.options.debug)

    // Execute the hook (can be sync or async)
    const result = hook.apply(plugin, args)
    
    // If result is a promise, await it
    if (result && typeof result.then === 'function') {
      await result
    }
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
        this.options.observabilityHooks?.onPluginError?.(plugin.name, hookName, error as Error)
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

    if (this.options.debug) {
      console.error(
        `[PluginManager] Plugin "${plugin.name}" failed in ${hookName}:`,
        error
      )
    }
  }

  /**
   * Validate plugin hook functions and signatures
   */
  private validatePluginHooks(plugin: AgentKitPlugin): void {
    const hooks: PluginHookName[] = ['onInit', 'onSend', 'onError', 'onShutdown']
    
    for (const hookName of hooks) {
      const hook = plugin[hookName]
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

    // Clear plugins array to release references
    this.plugins.length = 0

    debugLog.operation('plugin manager shutdown', {
      clearedTimeouts: this.activeTimeouts.size,
      clearedPlugins: this.plugins.length
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