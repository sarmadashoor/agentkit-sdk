import type { AgentKitPlugin, PluginHookName, AgentContext, SendPayload } from '@agentkit/types'
import { AgentKitError, PluginTimeoutError } from '../../errors'
import { debugLog } from '../../log'
import { PluginRegistry } from '../core/PluginRegistry'
import { PluginSecurity } from '../security/PluginSecurity'
import { PluginExecutor } from '../execution/PluginExecutor'
import type { PluginExecutionResult, PluginManagerObservabilityHooks } from '../types'

/**
 * Plugin Observability Manager - Handles plugin execution lifecycle with full observability
 */
export class PluginObservability {
  private registry: PluginRegistry
  private security: PluginSecurity
  private executor: PluginExecutor
  private observabilityHooks?: PluginManagerObservabilityHooks
  private debug: boolean
  private hookTimeout: number
  private failFast: boolean
  private activeTimeouts = new Set<NodeJS.Timeout>()
  private isShutdown = false

  constructor(options: {
    registry: PluginRegistry
    security: PluginSecurity
    executor: PluginExecutor
    observabilityHooks?: PluginManagerObservabilityHooks
    debug?: boolean
    hookTimeout?: number
    failFast?: boolean
  }) {
    this.registry = options.registry
    this.security = options.security
    this.executor = options.executor
    this.observabilityHooks = options.observabilityHooks
    this.debug = options.debug ?? false
    this.hookTimeout = options.hookTimeout ?? 5000
    this.failFast = options.failFast ?? false
  }

  /**
   * Execute a hook on all plugins that implement it
   */
  async executeHook(hookName: 'onInit' | 'onShutdown', context: AgentContext): Promise<PluginExecutionResult[]>
  async executeHook(hookName: 'onSend', payload: SendPayload, context: AgentContext): Promise<PluginExecutionResult[]>
  async executeHook(hookName: 'onError', error: Error | AgentKitError, context: AgentContext): Promise<PluginExecutionResult[]>
  async executeHook(
    hookName: PluginHookName, 
    ...args: [AgentContext] | [SendPayload, AgentContext] | [Error | AgentKitError, AgentContext]
  ): Promise<PluginExecutionResult[]> {
    const startTime = Date.now()
    const results: PluginExecutionResult[] = []
    
    const pluginsWithHook = this.registry.getPluginsWithHook(hookName)
    
    debugLog.operation('plugin hook execution start', {
      hook: hookName,
      pluginCount: this.registry.getPlugins().length,
      hasPlugins: pluginsWithHook.length > 0
    }, this.debug)

    for (const { plugin, hook } of pluginsWithHook) {
      const result = await this.executePluginWithObservability(plugin, hookName, hook, args)
      results.push(result)
      
      // If failFast is enabled and plugin failed, throw error
      if (this.failFast && !result.success) {
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
    }, this.debug)

    return results
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
    const immutableArgs = this.security.createImmutableArgs(
      hookName, 
      args as [AgentContext] | [SendPayload, AgentContext] | [Error | AgentKitError, AgentContext]
    )
    
    // Notify observability hook of plugin start
    this.observabilityHooks?.onPluginStart?.(plugin.name, hookName)
    
    try {
      // Execute with timeout using Promise.race
      await this.executeWithTimeout(
        () => this.executor.executePluginHook(plugin, hookName, hook, immutableArgs),
        this.hookTimeout,
        `${plugin.name}.${hookName}`
      )
      
      const duration = Date.now() - startTime
      
      // Notify observability hook of success
      this.observabilityHooks?.onPluginSuccess?.(plugin.name, hookName, duration)
      
      debugLog.operation('plugin hook success', {
        plugin: plugin.name,
        hook: hookName,
        duration
      }, this.debug)
      
      return {
        pluginName: plugin.name,
        hookName,
        success: true,
        duration
      }
      
    } catch (error) {
      const duration = Date.now() - startTime
      const isTimeout = error instanceof PluginTimeoutError ||
                        (error instanceof Error && (
                          error.message.includes('Script execution timed out') ||
                          error.message.includes('timed out after') ||
                          error.message.includes('sandbox violation: Error: Script execution timed out')
                        ))
      
      // Notify observability hooks
      if (isTimeout) {
        this.observabilityHooks?.onPluginTimeout?.(plugin.name, hookName, this.hookTimeout)
      } else {
        this.observabilityHooks?.onPluginError?.(plugin.name, hookName, error as Error, duration)
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
    
    debugLog.error('plugin hook error', error as Error, this.debug)
    debugLog.error('Plugin execution failed', error as Error, this.debug)
  }

  /**
   * Create execution metrics summary
   */
  createExecutionSummary(results: PluginExecutionResult[]): {
    totalPlugins: number
    successCount: number
    errorCount: number
    timeoutCount: number
    totalDuration: number
    averageDuration: number
    slowestPlugin?: string
    fastestPlugin?: string
  } {
    const totalPlugins = results.length
    const successCount = results.filter(r => r.success).length
    const errorCount = results.filter(r => !r.success && !r.timeout).length
    const timeoutCount = results.filter(r => r.timeout).length
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)
    const averageDuration = totalPlugins > 0 ? totalDuration / totalPlugins : 0

    // Find slowest and fastest plugins
    const sortedByDuration = [...results].sort((a, b) => b.duration - a.duration)
    const slowestPlugin = sortedByDuration[0]?.pluginName
    const fastestPlugin = sortedByDuration[sortedByDuration.length - 1]?.pluginName

    return {
      totalPlugins,
      successCount,
      errorCount,
      timeoutCount,
      totalDuration,
      averageDuration,
      slowestPlugin,
      fastestPlugin
    }
  }

  /**
   * Shutdown observability manager and clean up resources
   */
  shutdown(): void {
    if (this.isShutdown) {
      return
    }

    this.isShutdown = true

    // Clear all active timeouts to prevent memory leaks
    for (const timeout of this.activeTimeouts) {
      clearTimeout(timeout)
    }
    this.activeTimeouts.clear()

    debugLog.operation('plugin observability shutdown', {
      clearedTimeouts: this.activeTimeouts.size
    }, this.debug)
  }

  /**
   * Helper method to create tracked timeouts that will be cleaned up on shutdown
   */
  private createTrackedTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    if (this.isShutdown) {
      throw new Error('Cannot create timeout after PluginObservability shutdown')
    }

    const timeout = setTimeout(() => {
      this.activeTimeouts.delete(timeout)
      if (!this.isShutdown) {
        callback()
      }
    }, delay)
    
    // Critical: Use .unref() to prevent keeping process alive
    if (timeout.unref) timeout.unref()
    
    this.activeTimeouts.add(timeout)
    return timeout
  }
}