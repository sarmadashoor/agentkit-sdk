/**
 * SecurePluginManager - Cryptographically safe plugin execution with full sandboxing
 * Implements deterministic execution order, failure isolation, and version compatibility
 */

import type { 
  AgentKitPlugin,
  AgentContext,
  SendPayload,
  PluginHookName
} from '@agentkit/types'
import { 
  PluginManagerOptions,
  PluginExecutionResult
} from './types'
import { 
  AgentKitError,
  PluginValidationError,
  PluginCompatibilityError,
  PluginTimeoutError 
} from '@agentkit/errors'
import { debugLog } from '../log'
import { deepClone } from '../utils/deepClone'
import { PluginSandbox, SandboxOptions, SandboxExecutionResult } from './PluginSandbox'
import { PluginCompatibilityValidator, CompatibilityResult } from './PluginCompatibilityValidator'

/**
 * Plugin registration metadata
 */
interface RegisteredPlugin {
  plugin: AgentKitPlugin
  serializedCode: string
  compatibilityResult: CompatibilityResult
  registrationTime: number
  executionCount: number
  lastExecutionTime?: number
  cumulativeExecutionTime: number
  errorCount: number
  lastError?: Error
}

/**
 * Hook execution order configuration
 */
export interface HookExecutionOrder {
  /** Execute hooks in parallel (default: false for deterministic order) */
  parallel: boolean
  /** Stop execution if a plugin fails (default: false) */
  failFast: boolean
  /** Allow plugins to short-circuit remaining execution */
  allowShortCircuit: boolean
  /** Custom execution priorities (lower number = higher priority) */
  priorities?: Map<string, number>
}

/**
 * Execution context for hook calls
 */
interface ExecutionContext {
  requestId: string
  hookName: PluginHookName
  timestamp: number
  args: unknown[]
  shortCircuited: boolean
  executionOrder: string[]
}

/**
 * Comprehensive plugin execution result
 */
export interface PluginExecutionSummary {
  requestId: string
  hookName: PluginHookName
  totalExecutionTime: number
  successfulPlugins: string[]
  failedPlugins: Array<{
    name: string
    error: Error
    executionTime: number
    securityViolations: string[]
  }>
  shortCircuited: boolean
  shortCircuitedBy?: string
  executionOrder: string[]
}

/**
 * Enhanced plugin manager options
 */
export interface SecurePluginManagerOptions extends PluginManagerOptions {
  /** SDK version for compatibility checks */
  sdkVersion?: string
  /** Hook execution order configuration */
  executionOrder?: HookExecutionOrder
  /** Sandbox configuration */
  sandboxOptions?: Partial<SandboxOptions>
  /** Maximum number of plugins allowed */
  maxPlugins?: number
  /** Enable performance monitoring */
  enablePerformanceMonitoring?: boolean
}

/**
 * Secure plugin manager with cryptographic safety
 */
export class SecurePluginManager {
  private plugins = new Map<string, RegisteredPlugin>()
  private options: Required<Omit<SecurePluginManagerOptions, 'observabilityHooks' | 'sandboxOptions'>> & {
    observabilityHooks?: PluginManagerOptions['observabilityHooks']
    sandboxOptions: SandboxOptions
  }
  private sandbox: PluginSandbox
  private compatibilityValidator: PluginCompatibilityValidator
  private isShutdown = false
  
  // Performance monitoring
  private performanceMetrics = new Map<string, {
    totalExecutions: number
    totalTime: number
    averageTime: number
    errorRate: number
  }>()

  constructor(options: SecurePluginManagerOptions = {}) {
    // Set up default options
    this.options = {
      debug: options.debug ?? false,
      hookTimeout: options.hookTimeout ?? 5000,
      failFast: options.failFast ?? false,
      sandbox: options.sandbox ?? true,
      sandboxTimeout: options.sandboxTimeout ?? 500,
      allowedGlobals: options.allowedGlobals ?? [],
      enableDebugMode: options.enableDebugMode ?? false,
      sdkVersion: options.sdkVersion ?? '1.0.0',
      executionOrder: {
        parallel: false,
        failFast: false,
        allowShortCircuit: false,
        ...options.executionOrder
      },
      maxPlugins: options.maxPlugins ?? 50,
      enablePerformanceMonitoring: options.enablePerformanceMonitoring ?? true,
      observabilityHooks: options.observabilityHooks,
      sandboxOptions: {
        timeout: options.hookTimeout ?? 5000,
        maxMemory: 50 * 1024 * 1024, // 50MB default
        allowNetwork: false,
        allowFilesystem: false,
        debug: options.debug ?? false,
        ...options.sandboxOptions
      }
    }

    // Initialize components
    this.sandbox = new PluginSandbox(this.options.sandboxOptions)
    this.compatibilityValidator = new PluginCompatibilityValidator(
      this.options.sdkVersion,
      this.options.debug
    )

    debugLog.lifecycle('secure plugin manager created', 'SecurePluginManager', {
      options: this.options
    }, this.options.debug)
  }

  /**
   * Serialize plugin code for sandbox execution
   */
  private serializePlugin(plugin: AgentKitPlugin): string {
    try {
      // Create plugin object with function strings
      const parts: string[] = ['{']
      
      // Add basic properties
      parts.push(`name: ${JSON.stringify(plugin.name)},`)
      parts.push(`version: ${JSON.stringify(plugin.version)},`)
      if (plugin.description) {
        parts.push(`description: ${JSON.stringify(plugin.description)},`)
      }
      
      // Add hook functions
      if (plugin.onInit) {
        parts.push(`onInit: ${plugin.onInit.toString()},`)
      }
      if (plugin.onSend) {
        parts.push(`onSend: ${plugin.onSend.toString()},`)
      }
      if (plugin.onError) {
        parts.push(`onError: ${plugin.onError.toString()},`)
      }
      if (plugin.onShutdown) {
        parts.push(`onShutdown: ${plugin.onShutdown.toString()},`)
      }
      
      parts.push('}')
      
      return `(${parts.join('\n')})`
    } catch (error) {
      throw new PluginValidationError(
        plugin.name,
        `Failed to serialize plugin: ${error}`,
        { cause: error instanceof Error ? error : new Error(String(error)) }
      )
    }
  }

  /**
   * Register a plugin with full validation and compatibility checks
   */
  register(plugin: AgentKitPlugin): void {
    if (this.isShutdown) {
      throw new PluginValidationError(
        plugin.name,
        'Cannot register plugin: manager is shutdown'
      )
    }

    if (this.plugins.size >= this.options.maxPlugins) {
      throw new PluginValidationError(
        plugin.name,
        `Maximum number of plugins exceeded (${this.options.maxPlugins})`
      )
    }

    // Check if plugin already exists
    if (this.plugins.has(plugin.name)) {
      throw new PluginValidationError(
        plugin.name,
        'Plugin with this name is already registered'
      )
    }

    // Validate plugin structure
    this.validatePluginStructure(plugin)

    // Check compatibility
    const compatibilityResult = this.compatibilityValidator.validate(
      plugin.name,
      plugin.compatibility,
      plugin.permissions
    )

    if (!compatibilityResult.compatible) {
      throw new PluginCompatibilityError(
        plugin.name,
        compatibilityResult.errors.join('; '),
        { 
          context: { 
            errors: compatibilityResult.errors,
            warnings: compatibilityResult.warnings 
          } 
        }
      )
    }

    // Serialize plugin for sandbox execution
    const serializedCode = this.serializePlugin(plugin)

    // Register the plugin
    const registeredPlugin: RegisteredPlugin = {
      plugin,
      serializedCode,
      compatibilityResult,
      registrationTime: Date.now(),
      executionCount: 0,
      cumulativeExecutionTime: 0,
      errorCount: 0
    }

    this.plugins.set(plugin.name, registeredPlugin)

    // Log warnings if any
    if (compatibilityResult.warnings.length > 0) {
      debugLog.warn('Plugin compatibility warnings', {
        pluginName: plugin.name,
        warnings: compatibilityResult.warnings
      }, this.options.debug)
    }

    debugLog.operation('plugin registered', {
      name: plugin.name,
      version: plugin.version,
      permissions: compatibilityResult.permissions,
      warnings: compatibilityResult.warnings.length
    }, this.options.debug)
  }

  /**
   * Validate plugin structure
   */
  private validatePluginStructure(plugin: AgentKitPlugin): void {
    if (!plugin.name || typeof plugin.name !== 'string') {
      throw new PluginValidationError(
        plugin.name || 'unknown',
        'Plugin must have a valid name'
      )
    }

    if (!plugin.version || typeof plugin.version !== 'string') {
      throw new PluginValidationError(
        plugin.name,
        'Plugin must have a valid version'
      )
    }

    // Validate version format
    if (!/^\d+\.\d+\.\d+/.test(plugin.version)) {
      throw new PluginValidationError(
        plugin.name,
        'Plugin version must follow semantic versioning (x.y.z)'
      )
    }

    // Check that at least one hook is implemented
    const hasHooks = ['onInit', 'onSend', 'onError', 'onShutdown'].some(
      hook => typeof plugin[hook as keyof AgentKitPlugin] === 'function'
    )

    if (!hasHooks) {
      throw new PluginValidationError(
        plugin.name,
        'Plugin must implement at least one hook method'
      )
    }
  }

  /**
   * Get plugin execution order
   */
  private getExecutionOrder(): string[] {
    const plugins = Array.from(this.plugins.keys())
    
    if (this.options.executionOrder.priorities) {
      // Sort by priority (lower number = higher priority)
      plugins.sort((a, b) => {
        const priorityA = this.options.executionOrder.priorities?.get(a) ?? 999
        const priorityB = this.options.executionOrder.priorities?.get(b) ?? 999
        return priorityA - priorityB
      })
    }

    return plugins
  }

  /**
   * Execute hooks with full security and isolation
   */
  async executeHook(
    hookName: PluginHookName,
    ...args: [AgentContext] | [SendPayload, AgentContext] | [Error | AgentKitError, AgentContext]
  ): Promise<PluginExecutionSummary> {
    if (this.isShutdown) {
      throw new PluginValidationError(
        'system',
        'Cannot execute hooks: manager is shutdown'
      )
    }

    const requestId = this.generateRequestId()
    const startTime = Date.now()
    
    const context: ExecutionContext = {
      requestId,
      hookName,
      timestamp: startTime,
      args,
      shortCircuited: false,
      executionOrder: this.getExecutionOrder()
    }

    debugLog.operation('hook execution start', {
      hookName,
      requestId,
      pluginCount: context.executionOrder.length,
      parallel: this.options.executionOrder.parallel
    }, this.options.debug)

    const successfulPlugins: string[] = []
    const failedPlugins: Array<{
      name: string
      error: Error
      executionTime: number
      securityViolations: string[]
    }> = []

    if (this.options.executionOrder.parallel) {
      // Execute all plugins in parallel
      const results = await Promise.allSettled(
        context.executionOrder.map(pluginName => 
          this.executePluginHook(pluginName, hookName, args)
        )
      )

      results.forEach((result, index) => {
        const pluginName = context.executionOrder[index]
        if (result.status === 'fulfilled' && result.value.success) {
          successfulPlugins.push(pluginName)
        } else {
          const error = result.status === 'rejected' 
            ? result.reason 
            : result.value.error || new Error('Unknown error')
          
          failedPlugins.push({
            name: pluginName,
            error,
            executionTime: result.status === 'fulfilled' ? result.value.executionTime : 0,
            securityViolations: result.status === 'fulfilled' ? result.value.securityViolations : []
          })
        }
      })
    } else {
      // Execute plugins sequentially
      for (const pluginName of context.executionOrder) {
        if (context.shortCircuited) {
          break
        }

        try {
          const result = await this.executePluginHook(pluginName, hookName, args)
          
          if (result.success) {
            successfulPlugins.push(pluginName)
            
            // Check for short-circuit signal
            if (this.options.executionOrder.allowShortCircuit && result.shortCircuit) {
              context.shortCircuited = true
              debugLog.operation('plugin execution short-circuited', {
                pluginName,
                hookName,
                requestId
              }, this.options.debug)
            }
          } else {
            failedPlugins.push({
              name: pluginName,
              error: result.error || new Error('Unknown error'),
              executionTime: result.executionTime,
              securityViolations: result.securityViolations
            })

            // Check fail-fast option
            if (this.options.executionOrder.failFast) {
              debugLog.warn('Plugin execution stopped due to fail-fast', {
                pluginName,
                hookName,
                requestId
              }, this.options.debug)
              break
            }
          }
        } catch (error) {
          failedPlugins.push({
            name: pluginName,
            error: error as Error,
            executionTime: 0,
            securityViolations: []
          })

          if (this.options.executionOrder.failFast) {
            break
          }
        }
      }
    }

    const totalExecutionTime = Date.now() - startTime

    // Update performance metrics
    if (this.options.enablePerformanceMonitoring) {
      this.updatePerformanceMetrics(hookName, totalExecutionTime, failedPlugins.length > 0)
    }

    const summary: PluginExecutionSummary = {
      requestId,
      hookName,
      totalExecutionTime,
      successfulPlugins,
      failedPlugins,
      shortCircuited: context.shortCircuited,
      shortCircuitedBy: context.shortCircuited 
        ? successfulPlugins[successfulPlugins.length - 1] 
        : undefined,
      executionOrder: context.executionOrder
    }

    debugLog.operation('hook execution complete', {
      hookName,
      requestId,
      totalExecutionTime,
      successCount: successfulPlugins.length,
      failureCount: failedPlugins.length,
      shortCircuited: context.shortCircuited
    }, this.options.debug)

    // Report to observability hooks
    if (failedPlugins.length > 0) {
      failedPlugins.forEach(failure => {
        this.options.observabilityHooks?.onPluginError?.(failure.name, hookName, failure.error)
      })
    }

    successfulPlugins.forEach(pluginName => {
      const plugin = this.plugins.get(pluginName)
      if (plugin) {
        this.options.observabilityHooks?.onPluginSuccess?.(
          pluginName, 
          hookName, 
          plugin.lastExecutionTime || 0
        )
      }
    })

    return summary
  }

  /**
   * Execute a single plugin hook with full sandboxing
   */
  private async executePluginHook(
    pluginName: string,
    hookName: PluginHookName,
    args: unknown[]
  ): Promise<SandboxExecutionResult & { shortCircuit?: boolean }> {
    const registeredPlugin = this.plugins.get(pluginName)
    if (!registeredPlugin) {
      throw new PluginValidationError(
        pluginName,
        'Plugin not found'
      )
    }

    const startTime = Date.now()

    try {
      // Deep clone arguments to ensure immutability
      const clonedArgs = args.map(arg => deepClone(arg))

      // Execute in sandbox
      const result = await this.sandbox.executePlugin(
        registeredPlugin.serializedCode,
        hookName,
        clonedArgs
      )

      const executionTime = Date.now() - startTime

      // Update plugin statistics
      registeredPlugin.executionCount++
      registeredPlugin.lastExecutionTime = executionTime
      registeredPlugin.cumulativeExecutionTime += executionTime

      if (!result.success) {
        registeredPlugin.errorCount++
        registeredPlugin.lastError = result.error
      }

      return {
        ...result,
        executionTime
      }
    } catch (error) {
      const executionTime = Date.now() - startTime
      registeredPlugin.errorCount++
      registeredPlugin.lastError = error as Error

      return {
        success: false,
        error: error as Error,
        executionTime,
        securityViolations: []
      }
    }
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(hookName: string, executionTime: number, hasErrors: boolean): void {
    const current = this.performanceMetrics.get(hookName) || {
      totalExecutions: 0,
      totalTime: 0,
      averageTime: 0,
      errorRate: 0
    }

    current.totalExecutions++
    current.totalTime += executionTime
    current.averageTime = current.totalTime / current.totalExecutions
    
    if (hasErrors) {
      current.errorRate = (current.errorRate * (current.totalExecutions - 1) + 1) / current.totalExecutions
    } else {
      current.errorRate = (current.errorRate * (current.totalExecutions - 1)) / current.totalExecutions
    }

    this.performanceMetrics.set(hookName, current)
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get registered plugins
   */
  getPlugins(): AgentKitPlugin[] {
    return Array.from(this.plugins.values()).map(registered => registered.plugin)
  }

  /**
   * Get plugin statistics
   */
  getPluginStatistics(): Record<string, {
    registrationTime: number
    executionCount: number
    cumulativeExecutionTime: number
    averageExecutionTime: number
    errorCount: number
    errorRate: number
    lastError?: string
  }> {
    const stats: Record<string, any> = {}

    this.plugins.forEach((registered, name) => {
      stats[name] = {
        registrationTime: registered.registrationTime,
        executionCount: registered.executionCount,
        cumulativeExecutionTime: registered.cumulativeExecutionTime,
        averageExecutionTime: registered.executionCount > 0 
          ? registered.cumulativeExecutionTime / registered.executionCount 
          : 0,
        errorCount: registered.errorCount,
        errorRate: registered.executionCount > 0 
          ? registered.errorCount / registered.executionCount 
          : 0,
        lastError: registered.lastError?.message
      }
    })

    return stats
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): Record<string, {
    totalExecutions: number
    totalTime: number
    averageTime: number
    errorRate: number
  }> {
    return Object.fromEntries(this.performanceMetrics.entries())
  }

  /**
   * Remove a plugin
   */
  unregister(pluginName: string): boolean {
    return this.plugins.delete(pluginName)
  }

  /**
   * Clear all plugins
   */
  clear(): void {
    this.plugins.clear()
    this.performanceMetrics.clear()
  }

  /**
   * Shutdown the manager
   */
  async shutdown(): Promise<void> {
    if (this.isShutdown) {
      return
    }

    debugLog.lifecycle('shutdown start', 'SecurePluginManager', {
      pluginCount: this.plugins.size
    }, this.options.debug)

    this.isShutdown = true
    this.clear()

    debugLog.lifecycle('shutdown complete', 'SecurePluginManager', {}, this.options.debug)
  }
}