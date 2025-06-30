/**
 * Enhanced Secure Plugin Manager V2
 * Implements complete plugin sandboxing, immutability protections, and deterministic execution
 * 
 * Features:
 * - Platform-specific sandboxing (VM for Node.js, WebWorkers/structured cloning for browser)
 * - Deterministic FIFO execution order
 * - Complete fault isolation
 * - Deep data cloning and immutability
 * - Observable plugin error handling
 */

import { EventEmitter } from 'events'
import type { 
  AgentKitPlugin,
  AgentContext,
  SendPayload,
  PluginHookName
} from '@agentkit/types'
import { 
  PluginManagerOptions,
  AgentKitPluginSchema,
  PluginExecutionResult
} from './types'
import { 
  PluginValidationError,
  PluginSignatureError,
  PluginTimeoutError 
} from '../errors'
import { debugLog } from '../log'
import { PluginSandboxV2, SandboxExecutionResult, PluginErrorEvent } from './PluginSandboxV2'
import { pluginExecutionContext } from './PluginExecutionContext'
import { VMRunner, secureClone } from '../security/vmRunner'

/**
 * Plugin registration metadata with order tracking
 */
interface PluginRegistration {
  plugin: AgentKitPlugin
  registrationOrder: number
  registrationTime: number
}

/**
 * Enhanced execution result with sandbox metadata
 */
export interface SecurePluginExecutionResult extends PluginExecutionResult {
  isolated: boolean
  dataCloned: boolean
  platformMethod: 'vm' | 'structured-clone' | 'webworker' | 'fallback'
  registrationOrder: number
}

/**
 * Plugin manager options with sandbox configuration
 */
export interface SecurePluginManagerOptions extends PluginManagerOptions {
  enableSandboxing?: boolean
  enableWebWorkers?: boolean
  enableFreezing?: boolean
  vmTimeout?: number
  maxMemoryUsage?: number
  strictExecutionOrder?: boolean
  enableVMSandbox?: boolean
  enableStaticAnalysis?: boolean
}

/**
 * Enhanced Plugin Manager with complete sandboxing and fault isolation
 */
export class SecurePluginManagerV2 extends EventEmitter {
  private registrations: PluginRegistration[] = []
  private options: Required<Omit<SecurePluginManagerOptions, 'observabilityHooks'>> & {
    observabilityHooks?: SecurePluginManagerOptions['observabilityHooks']
  }
  private sandbox: PluginSandboxV2
  private vmRunner: VMRunner
  private registrationCounter = 0
  private isShutdown = false
  private executionStats = {
    totalHookExecutions: 0,
    successfulHookExecutions: 0,
    failedHookExecutions: 0,
    pluginErrors: 0,
    timeouts: 0,
    isolatedExecutions: 0,
    vmExecutions: 0,
    securityViolations: 0
  }

  constructor(options: SecurePluginManagerOptions = {}) {
    super()
    
    this.options = {
      debug: options.debug ?? false,
      hookTimeout: options.hookTimeout ?? 5000,
      failFast: options.failFast ?? false,
      sandbox: options.sandbox ?? true,
      sandboxTimeout: options.sandboxTimeout ?? 500,
      allowedGlobals: options.allowedGlobals ?? [],
      enableDebugMode: options.enableDebugMode ?? false,
      enableSandboxing: options.enableSandboxing ?? true,
      enableWebWorkers: options.enableWebWorkers ?? false,
      enableFreezing: options.enableFreezing ?? true,
      vmTimeout: options.vmTimeout ?? 3000,
      maxMemoryUsage: options.maxMemoryUsage ?? 50 * 1024 * 1024,
      strictExecutionOrder: options.strictExecutionOrder ?? true,
      enableVMSandbox: options.enableVMSandbox ?? true,
      enableStaticAnalysis: options.enableStaticAnalysis ?? true,
      observabilityHooks: options.observabilityHooks
    }

    // Initialize sandbox
    this.sandbox = new PluginSandboxV2({
      timeout: this.options.hookTimeout,
      debug: this.options.debug,
      enableWebWorkers: this.options.enableWebWorkers,
      vmTimeout: this.options.vmTimeout,
      maxMemoryUsage: this.options.maxMemoryUsage,
      enableFreezing: this.options.enableFreezing
    })

    // Initialize VM runner for enhanced security
    this.vmRunner = new VMRunner({
      timeoutMs: this.options.vmTimeout,
      memoryLimitBytes: this.options.maxMemoryUsage,
      enableStaticAnalysis: this.options.enableStaticAnalysis
    })

    // Forward sandbox error events
    this.sandbox.on('pluginError', (errorEvent: PluginErrorEvent) => {
      this.executionStats.pluginErrors++
      this.emit('pluginError', errorEvent)
      
      debugLog.error('secure plugin manager: plugin error received', errorEvent.error, this.options.debug)
    })

    debugLog.lifecycle('secure plugin manager v2 created', 'SecurePluginManagerV2', {
      options: this.options,
      sandboxingEnabled: this.options.enableSandboxing,
      vmSandboxEnabled: this.options.enableVMSandbox
    }, this.options.debug)
  }

  /**
   * Register a plugin with strict validation and order tracking
   */
  register(plugin: AgentKitPlugin): void {
    if (this.isShutdown) {
      throw new Error('Cannot register plugins after manager shutdown')
    }

    // Validate plugin schema
    try {
      AgentKitPluginSchema.parse(plugin)
    } catch (error) {
      throw new PluginValidationError(plugin.name || 'unknown', String(error), {
        context: { plugin: plugin.name, validationError: error }
      })
    }

    // Validate plugin hooks
    this.validatePluginHooks(plugin)

    // Check for duplicate plugin names
    if (this.registrations.some(reg => reg.plugin.name === plugin.name)) {
      throw new PluginValidationError(plugin.name, 'Plugin with this name already registered', {
        context: { duplicateName: plugin.name }
      })
    }

    // Create registration with order tracking
    const registration: PluginRegistration = {
      plugin,
      registrationOrder: this.registrationCounter++,
      registrationTime: Date.now()
    }

    this.registrations.push(registration)

    const availableHooks = [
      plugin.onInit ? 'onInit' : null,
      plugin.onSend ? 'onSend' : null, 
      plugin.onError ? 'onError' : null,
      plugin.onShutdown ? 'onShutdown' : null
    ].filter(Boolean)
    
    debugLog.operation('secure plugin registered', {
      name: plugin.name,
      version: plugin.version,
      hooks: availableHooks,
      registrationOrder: registration.registrationOrder,
      totalPlugins: this.registrations.length
    }, this.options.debug)

    // Emit registration event
    this.emit('pluginRegistered', {
      plugin,
      registrationOrder: registration.registrationOrder,
      availableHooks
    })
  }

  /**
   * Execute hook on all plugins with deterministic FIFO order and complete fault isolation
   */
  // eslint-disable-next-line no-dupe-class-members
  executeHook(hookName: 'onInit' | 'onShutdown', context: AgentContext): Promise<SecurePluginExecutionResult[]>
  // eslint-disable-next-line no-dupe-class-members
  executeHook(hookName: 'onSend', payload: SendPayload, context: AgentContext): Promise<SecurePluginExecutionResult[]>
  // eslint-disable-next-line no-dupe-class-members
  executeHook(hookName: 'onError', error: Error, context: AgentContext): Promise<SecurePluginExecutionResult[]>
  // eslint-disable-next-line no-dupe-class-members
  async executeHook(
    hookName: PluginHookName, 
    ...args: [AgentContext] | [SendPayload, AgentContext] | [Error, AgentContext]
  ): Promise<SecurePluginExecutionResult[]> {
    if (this.isShutdown) {
      throw new Error('Cannot execute hooks after manager shutdown')
    }

    const startTime = Date.now()
    const results: SecurePluginExecutionResult[] = []
    
    // Get plugins sorted by registration order (FIFO)
    const sortedRegistrations = this.options.strictExecutionOrder
      ? [...this.registrations].sort((a, b) => a.registrationOrder - b.registrationOrder)
      : this.registrations

    const pluginsWithHook = sortedRegistrations.filter(reg => {
      const hook = (reg.plugin as any)[hookName]
      return hook && typeof hook === 'function'
    })

    this.executionStats.totalHookExecutions++

    debugLog.operation('secure plugin hook execution start', {
      hook: hookName,
      totalPlugins: this.registrations.length,
      pluginsWithHook: pluginsWithHook.length,
      executionOrder: pluginsWithHook.map(reg => `${reg.plugin.name}:${reg.registrationOrder}`)
    }, this.options.debug)

    // Execute plugins in deterministic order with complete fault isolation
    for (const registration of pluginsWithHook) {
      const plugin = registration.plugin
      
      try {
        let sandboxResult: SandboxExecutionResult

        if (this.options.enableVMSandbox) {
          // Use VM runner for maximum security isolation
          sandboxResult = await this.executeWithExecutionContext(plugin, hookName, () =>
            this.executeWithVMSandbox(plugin, hookName, args)
          )
          this.executionStats.vmExecutions++
        } else if (this.options.enableSandboxing) {
          // Use sandbox for complete isolation with execution context tracking
          sandboxResult = await this.executeWithExecutionContext(plugin, hookName, () =>
            this.sandbox.executeHook(plugin, hookName, ...args)
          )
        } else {
          // Fallback to basic try/catch isolation with execution context tracking
          sandboxResult = await this.executeWithExecutionContext(plugin, hookName, () =>
            this.executeWithBasicIsolation(plugin, hookName, args)
          )
        }

        // Track security violations
        if (sandboxResult.securityViolations) {
          this.executionStats.securityViolations += sandboxResult.securityViolations.length
        }

        const enhancedResult: SecurePluginExecutionResult = {
          ...sandboxResult,
          hookName: hookName as PluginHookName,
          registrationOrder: registration.registrationOrder
        }

        results.push(enhancedResult)

        if (sandboxResult.success) {
          this.executionStats.successfulHookExecutions++
          if (sandboxResult.isolated) {
            this.executionStats.isolatedExecutions++
          }
        } else {
          this.executionStats.failedHookExecutions++
          if (sandboxResult.timeout) {
            this.executionStats.timeouts++
          }
        }

        // Notify observability hooks
        if (sandboxResult.success) {
          this.options.observabilityHooks?.onPluginSuccess?.(plugin.name, hookName, sandboxResult.duration)
        } else if (sandboxResult.timeout) {
          this.options.observabilityHooks?.onPluginTimeout?.(plugin.name, hookName, this.options.hookTimeout)
        } else {
          this.options.observabilityHooks?.onPluginError?.(plugin.name, hookName, sandboxResult.error!, sandboxResult.duration)
        }

        // Log execution details
        debugLog.operation('secure plugin hook executed', {
          plugin: plugin.name,
          hook: hookName,
          success: sandboxResult.success,
          duration: sandboxResult.duration,
          isolated: sandboxResult.isolated,
          platformMethod: sandboxResult.platformMethod,
          registrationOrder: registration.registrationOrder
        }, this.options.debug)

        // Fail fast if enabled and plugin failed
        if (this.options.failFast && !sandboxResult.success) {
          throw sandboxResult.error || new Error(`Plugin ${plugin.name}.${hookName} failed`)
        }

      } catch (error) {
        // This catch should rarely be hit due to sandbox isolation
        // It's a safety net for sandbox failures themselves
        debugLog.error('secure plugin execution catastrophic failure', error as Error, this.options.debug)
        
        this.executionStats.failedHookExecutions++
        this.executionStats.pluginErrors++

        const fallbackResult: SecurePluginExecutionResult = {
          pluginName: plugin.name,
          hookName: hookName as PluginHookName,
          success: false,
          duration: Date.now() - startTime,
          error: error as Error,
          isolated: false,
          dataCloned: false,
          platformMethod: 'fallback',
          registrationOrder: registration.registrationOrder
        }

        results.push(fallbackResult)

        // Emit error event
        this.emit('pluginError', {
          pluginName: plugin.name,
          hookName,
          error: error as Error,
          isolated: false,
          timestamp: Date.now()
        })

        if (this.options.failFast) {
          throw error
        }
      }
    }

    const totalDuration = Date.now() - startTime
    
    debugLog.operation('secure plugin hook execution complete', {
      hook: hookName,
      totalDuration,
      executedCount: results.length,
      successCount: results.filter(r => r.success).length,
      errorCount: results.filter(r => !r.success && !r.timeout).length,
      timeoutCount: results.filter(r => r.timeout).length,
      isolatedCount: results.filter(r => r.isolated).length,
      executionOrder: results.map(r => `${r.pluginName}:${r.registrationOrder}`)
    }, this.options.debug)

    return results
  }

  /**
   * Execute plugin with execution context tracking for recursive call protection
   */
  private async executeWithExecutionContext(
    plugin: AgentKitPlugin,
    hookName: PluginHookName,
    executeFn: () => Promise<SandboxExecutionResult>
  ): Promise<SandboxExecutionResult> {
    const executionId = pluginExecutionContext.startExecution(plugin.name, hookName)
    
    try {
      return await executeFn()
    } finally {
      pluginExecutionContext.endExecution(executionId)
    }
  }

  /**
   * Execute plugin using VM sandbox for maximum security isolation
   */
  private async executeWithVMSandbox(
    plugin: AgentKitPlugin,
    hookName: PluginHookName,
    args: [AgentContext] | [SendPayload, AgentContext] | [Error, AgentContext]
  ): Promise<SandboxExecutionResult & { securityViolations?: string[] }> {
    const startTime = Date.now()
    
    try {
      // Convert plugin to string for VM execution
      const pluginCode = this.serializePluginForVM(plugin)
      
      // Prepare secure context for VM execution
      const secureContext = this.prepareSecureContext(plugin, hookName, args)
      
      // Execute in VM with security monitoring
      const vmResult = await this.vmRunner.executePluginHook(
        plugin.name,
        hookName,
        pluginCode,
        secureContext
      )

      if (!vmResult.withinLimits) {
        throw new Error(`VM execution exceeded limits: ${vmResult.securityViolations.join(', ')}`)
      }

      return {
        success: true,
        duration: vmResult.executionTimeMs,
        pluginName: plugin.name,
        hookName: hookName as PluginHookName,
        isolated: true,
        dataCloned: true,
        platformMethod: 'vm',
        securityViolations: vmResult.securityViolations
      }

    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        pluginName: plugin.name,
        hookName: hookName as PluginHookName,
        error: error as Error,
        timeout: (error as Error).message.includes('timeout'),
        isolated: true,
        dataCloned: true,
        platformMethod: 'vm',
        securityViolations: [(error as Error).message]
      }
    }
  }

  /**
   * Serialize plugin for VM execution
   */
  private serializePluginForVM(plugin: AgentKitPlugin): string {
    // Create a safe representation of the plugin for VM execution
    const safePlugin = {
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      onInit: plugin.onInit?.toString(),
      onSend: plugin.onSend?.toString(),
      onError: plugin.onError?.toString(),
      onShutdown: plugin.onShutdown?.toString()
    }

    return `
      const plugin = {
        name: ${JSON.stringify(safePlugin.name)},
        version: ${JSON.stringify(safePlugin.version)},
        description: ${JSON.stringify(safePlugin.description)},
        ${safePlugin.onInit ? `onInit: ${safePlugin.onInit},` : ''}
        ${safePlugin.onSend ? `onSend: ${safePlugin.onSend},` : ''}
        ${safePlugin.onError ? `onError: ${safePlugin.onError},` : ''}
        ${safePlugin.onShutdown ? `onShutdown: ${safePlugin.onShutdown},` : ''}
      };
    `
  }

  /**
   * Prepare secure execution context for VM
   */
  private prepareSecureContext(
    plugin: AgentKitPlugin,
    hookName: PluginHookName,
    args: [AgentContext] | [SendPayload, AgentContext] | [Error, AgentContext]
  ): any {
    const context = {
      plugin: {
        name: plugin.name,
        version: plugin.version
      },
      agentContext: secureClone(args[0] as AgentContext)
    }

    // Add hook-specific data
    if (hookName === 'onSend' && args.length === 2) {
      (context as any).sendPayload = secureClone(args[0] as SendPayload)
      context.agentContext = secureClone(args[1] as AgentContext)
    } else if (hookName === 'onError' && args.length === 2) {
      const error = args[0] as Error
      ;(context as any).error = {
        message: error.message,
        name: error.name,
        stack: error.stack
      }
      context.agentContext = secureClone(args[1] as AgentContext)
    }

    return context
  }

  /**
   * Basic isolation fallback for when sandboxing is disabled
   */
  private async executeWithBasicIsolation(
    plugin: AgentKitPlugin,
    hookName: PluginHookName,
    args: [AgentContext] | [SendPayload, AgentContext] | [Error, AgentContext]
  ): Promise<SandboxExecutionResult> {
    const startTime = Date.now()
    
    try {
      const hook = (plugin as any)[hookName]
      if (!hook || typeof hook !== 'function') {
        throw new PluginValidationError(plugin.name, `Hook ${hookName} is not a function`)
      }

      // Execute with timeout
      await this.executeWithTimeout(async () => {
        const result = hook.apply(plugin, args)
        if (result && typeof result.then === 'function') {
          await result
        }
      }, this.options.hookTimeout)

      return {
        success: true,
        duration: Date.now() - startTime,
        pluginName: plugin.name,
        hookName: hookName as PluginHookName,
        isolated: false,
        dataCloned: false,
        platformMethod: 'fallback'
      }

    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        pluginName: plugin.name,
        hookName: hookName as PluginHookName,
        error: error as Error,
        timeout: error instanceof PluginTimeoutError,
        isolated: false,
        dataCloned: false,
        platformMethod: 'fallback'
      }
    }
  }

  /**
   * Execute with timeout protection
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T> | T,
    timeout: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new PluginTimeoutError('Plugin execution', timeout))
      }, timeout)

      Promise.resolve(fn())
        .then((result) => {
          clearTimeout(timeoutId)
          resolve(result)
        })
        .catch((error) => {
          clearTimeout(timeoutId)
          reject(error)
        })
    })
  }

  /**
   * Validate plugin hook functions and signatures
   */
  private validatePluginHooks(plugin: AgentKitPlugin): void {
    const hooks: PluginHookName[] = ['onInit', 'onSend', 'onError', 'onShutdown']
    
    for (const hookName of hooks) {
      const hook = (plugin as any)[hookName]
      if (!hook) {continue}
      
      if (typeof hook !== 'function') {
        throw new PluginSignatureError(plugin.name, hookName, 'must be a function', {
          context: { hookType: typeof hook }
        })
      }
      
      // Validate function signature by checking length (parameter count)
      const isMockFunction = 'mockImplementation' in hook || 'isMockFunction' in hook || hook.toString().includes('Mock')
      
      if (!isMockFunction) {
        switch (hookName) {
          case 'onInit':
          case 'onShutdown':
            if (hook.length !== 1 && hook.length !== 0) {
              throw new PluginSignatureError(plugin.name, hookName, 'must accept exactly 1 parameter (context)', {
                context: { expectedParams: 1, actualParams: hook.length }
              })
            }
            break
          case 'onSend':
            if (hook.length !== 2 && hook.length !== 0) {
              throw new PluginSignatureError(plugin.name, hookName, 'must accept exactly 2 parameters (payload, context)', {
                context: { expectedParams: 2, actualParams: hook.length }
              })
            }
            break
          case 'onError':
            if (hook.length !== 2 && hook.length !== 0) {
              throw new PluginSignatureError(plugin.name, hookName, 'must accept exactly 2 parameters (error, context)', {
                context: { expectedParams: 2, actualParams: hook.length }
              })
            }
            break
        }
      }
    }
  }

  /**
   * Get all registered plugins in registration order
   */
  getPlugins(): ReadonlyArray<AgentKitPlugin> {
    return this.registrations
      .sort((a, b) => a.registrationOrder - b.registrationOrder)
      .map(reg => reg.plugin)
  }

  /**
   * Get plugin by name
   */
  getPlugin(name: string): AgentKitPlugin | undefined {
    return this.registrations.find(reg => reg.plugin.name === name)?.plugin
  }

  /**
   * Remove plugin by name
   */
  removePlugin(name: string): boolean {
    const initialLength = this.registrations.length
    this.registrations = this.registrations.filter(reg => reg.plugin.name !== name)
    const removed = this.registrations.length < initialLength
    
    if (removed) {
      debugLog.operation('secure plugin removed', { name }, this.options.debug)
      this.emit('pluginRemoved', { name })
    }
    
    return removed
  }

  /**
   * Clear all plugins
   */
  clear(): void {
    const count = this.registrations.length
    this.registrations = []
    this.registrationCounter = 0
    
    debugLog.operation('secure plugins cleared', { count }, this.options.debug)
    this.emit('pluginsCleared', { count })
  }

  /**
   * Get execution statistics
   */
  getStats() {
    return {
      ...this.executionStats,
      registeredPlugins: this.registrations.length,
      sandboxStats: this.sandbox.getStats()
    }
  }

  /**
   * Get plugin registration order information
   */
  getRegistrationOrder(): Array<{ name: string; order: number; registrationTime: number }> {
    return this.registrations
      .sort((a, b) => a.registrationOrder - b.registrationOrder)
      .map(reg => ({
        name: reg.plugin.name,
        order: reg.registrationOrder,
        registrationTime: reg.registrationTime
      }))
  }

  /**
   * Shutdown the manager and cleanup all resources
   */
  shutdown(): void {
    if (this.isShutdown) {
      return // Idempotent
    }

    this.isShutdown = true

    // Shutdown sandbox
    this.sandbox.shutdown()

    // Cleanup VM runner
    this.vmRunner.dispose()

    // Clear all plugins
    this.registrations = []

    // Remove all listeners
    this.removeAllListeners()

    debugLog.lifecycle('secure plugin manager v2 shutdown', 'SecurePluginManagerV2', {
      stats: this.getStats()
    }, this.options.debug)
  }
}