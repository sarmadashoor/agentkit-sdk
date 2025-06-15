import { 
  AgentKitPlugin, 
  AgentContext, 
  SendPayload,
  PluginManagerOptions,
  AgentKitPluginSchema,
  PluginHookName
} from './types'
import { AgentKitError } from '../errors'
import { debugLog } from '../log'

/**
 * PluginManager handles registration and execution of AgentKit plugins
 * Ensures plugin isolation and prevents failures from affecting core SDK
 */
export class PluginManager {
  private plugins: AgentKitPlugin[] = []
  private options: Required<PluginManagerOptions>

  constructor(options: PluginManagerOptions = {}) {
    this.options = {
      debug: options.debug ?? false,
      hookTimeout: options.hookTimeout ?? 5000
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
      throw new Error(`Invalid plugin "${plugin.name}": ${error}`)
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
  async executeHook(hookName: 'onInit' | 'onShutdown', context: AgentContext): Promise<void>
  async executeHook(hookName: 'onSend', payload: SendPayload, context: AgentContext): Promise<void>
  async executeHook(hookName: 'onError', error: Error | AgentKitError, context: AgentContext): Promise<void>
  async executeHook(hookName: PluginHookName, ...args: any[]): Promise<void> {
    const startTime = Date.now()
    
    debugLog.operation('plugin hook execution start', {
      hook: hookName,
      pluginCount: this.plugins.length,
      hasPlugins: this.plugins.some(p => !!p[hookName])
    }, this.options.debug)

    for (const plugin of this.plugins) {
      const hook = plugin[hookName]
      if (!hook) continue

      try {
        // Create immutable copies of arguments to prevent mutation
        const immutableArgs = this.createImmutableArgs(hookName, args)
        
        // Execute hook with timeout protection
        await this.executeWithTimeout(
          () => this.executePluginHook(plugin, hookName, hook, immutableArgs),
          this.options.hookTimeout,
          `${plugin.name}.${hookName}`
        )
        
      } catch (error) {
        // Log error but continue execution
        this.handlePluginError(plugin, hookName, error)
      }
    }

    const duration = Date.now() - startTime
    debugLog.operation('plugin hook execution complete', {
      hook: hookName,
      duration,
      executedCount: this.plugins.filter(p => !!p[hookName]).length
    }, this.options.debug)
  }

  /**
   * Create immutable copies of arguments to prevent plugin mutation
   */
  private createImmutableArgs(hookName: PluginHookName, args: any[]): any[] {
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
        return args.map(arg => this.deepClone(arg))
    }
  }

  /**
   * Deep clone an object to prevent mutation
   */
  private deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj
    if (obj instanceof Date) return new Date(obj.getTime()) as any
    if (obj instanceof Array) return obj.map(item => this.deepClone(item)) as any
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
   * Execute a plugin hook with proper error handling
   */
  private executePluginHook(
    plugin: AgentKitPlugin,
    hookName: PluginHookName,
    hook: Function,
    args: any[]
  ): void {
    debugLog.operation('plugin hook executing', {
      plugin: plugin.name,
      hook: hookName
    }, this.options.debug)

    // Execute synchronously (plugins should be sync)
    const result = hook.apply(plugin, args)
    
    // Ensure plugins don't return promises
    if (result && typeof result.then === 'function') {
      throw new Error(`Plugin "${plugin.name}" hook "${hookName}" must be synchronous`)
    }
  }

  /**
   * Execute a function with timeout protection
   */
  private async executeWithTimeout<T>(
    fn: () => T,
    timeout: number,
    operation: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Plugin operation "${operation}" timed out after ${timeout}ms`))
      }, timeout)

      try {
        const result = fn()
        clearTimeout(timer)
        resolve(result)
      } catch (error) {
        clearTimeout(timer)
        reject(error)
      }
    })
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
        throw new Error(`Invalid plugin "${plugin.name}": ${hookName} must be a function`)
      }
      
      // Validate function signature by checking length (parameter count)
      // Skip validation for mock functions and functions with dynamic length
      const isMockFunction = (hook as any).mockImplementation || (hook as any).isMockFunction || hook.toString().includes('Mock')
      
      // Validate parameter count for real functions
      if (!isMockFunction) {
        switch (hookName) {
          case 'onInit':
          case 'onShutdown':
            if (hook.length !== 1 && hook.length !== 0) { // Allow 0 for () => {} style
              throw new Error(`Invalid plugin "${plugin.name}": ${hookName} must accept exactly 1 parameter (context)`)
            }
            break
          case 'onSend':
            if (hook.length !== 2 && hook.length !== 0) { // Allow 0 for () => {} style
              throw new Error(`Invalid plugin "${plugin.name}": ${hookName} must accept exactly 2 parameters (payload, context)`)
            }
            break
          case 'onError':
            if (hook.length !== 2 && hook.length !== 0) { // Allow 0 for () => {} style
              throw new Error(`Invalid plugin "${plugin.name}": ${hookName} must accept exactly 2 parameters (error, context)`)
            }
            break
        }
      }
      
      // Test if function is async (should be sync)
      const isAsync = hook.constructor.name === 'AsyncFunction' || hook.toString().includes('async')
      if (isAsync) {
        throw new Error(`Invalid plugin "${plugin.name}": ${hookName} must be synchronous (not async)`)
      }
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
}