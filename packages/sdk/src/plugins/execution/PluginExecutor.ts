import type { AgentKitPlugin, PluginHookName } from '@agentkit/types'
import { PluginTimeoutError, PluginSandboxError } from '../../errors'
import { debugLog } from '../../log'
import { PlatformEnvironment } from '../environment/PlatformEnvironment'
import { PluginSecurity } from '../security/PluginSecurity'
import type { PluginManagerObservabilityHooks } from '../types'
import { WorkerPool, type WorkerExecutionOptions } from '../worker-utils'

/**
 * Plugin Executor - Handles plugin execution in different environments
 */
export class PluginExecutor {
  private platformEnv: PlatformEnvironment
  private security: PluginSecurity
  private workerPool?: WorkerPool
  private observabilityHooks?: PluginManagerObservabilityHooks
  private debug: boolean
  private sandboxTimeout: number
  private allowedGlobals: string[]
  private enableDebugMode: boolean

  constructor(options: {
    platformEnv: PlatformEnvironment
    security: PluginSecurity
    workerPool?: WorkerPool
    observabilityHooks?: PluginManagerObservabilityHooks
    debug?: boolean
    sandboxTimeout?: number
    allowedGlobals?: string[]
    enableDebugMode?: boolean
  }) {
    this.platformEnv = options.platformEnv
    this.security = options.security
    this.workerPool = options.workerPool
    this.observabilityHooks = options.observabilityHooks
    this.debug = options.debug ?? false
    this.sandboxTimeout = options.sandboxTimeout ?? 500
    this.allowedGlobals = options.allowedGlobals ?? ['Math', 'Date', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean']
    this.enableDebugMode = options.enableDebugMode ?? false
  }

  /**
   * Execute a plugin hook using appropriate strategy
   */
  async executePluginHook(
    plugin: AgentKitPlugin,
    hookName: PluginHookName,
    hook: Function,
    args: unknown[]
  ): Promise<any> {
    debugLog.operation('plugin hook executing', {
      plugin: plugin.name,
      hook: hookName,
      platform: this.platformEnv.getPlatformName(),
      strategy: this.getExecutionStrategy()
    }, this.debug)

    const strategy = this.getExecutionStrategy()
    
    switch (strategy) {
      case 'vm':
        return this.executePluginInSandbox(plugin, hookName, hook, args)
      case 'worker':
        return this.executePluginInWorker(plugin, hookName, hook, args)
      default:
        return this.executePluginHookDirect(plugin, hookName, hook, args)
    }
  }

  /**
   * Get execution strategy based on platform capabilities
   */
  private getExecutionStrategy(): 'vm' | 'worker' | 'direct' {
    const capabilities = this.platformEnv.getCapabilities()
    
    if (capabilities.isNodeJS && capabilities.supportsVM) {
      return 'vm'
    }
    if (capabilities.isBrowser && capabilities.supportsWebWorkers && this.workerPool) {
      return 'worker'
    }
    return 'direct'
  }

  /**
   * Execute plugin hook in Node.js VM sandbox
   */
  private async executePluginInSandbox(
    plugin: AgentKitPlugin,
    hookName: PluginHookName,
    hook: Function,
    args: unknown[]
  ): Promise<any> {
    const capabilities = this.platformEnv.getCapabilities()
    if (!capabilities.supportsVM || !capabilities.vm) {
      return this.executePluginHookDirect(plugin, hookName, hook, args)
    }
    
    this.observabilityHooks?.onPluginSandboxStart?.(plugin.name, hookName)
    const sandboxStart = Date.now()
    
    try {
      // Create secure context
      const context = this.platformEnv.createSandboxContext(this.allowedGlobals, this.enableDebugMode)
      const vmContext = capabilities.vm.createContext(context)
      
      // Strip functions from arguments for security
      const sanitizedArgs = this.security.sanitizeArgumentsForSandbox(args)
      
      debugLog.operation('sandbox executing plugin', {
        plugin: plugin.name,
        hook: hookName,
        argsCount: sanitizedArgs.length,
        contextKeys: Object.keys(context).length
      }, this.debug)
      
      // Get the function source and create a completely isolated execution
      const timeoutMs = this.sandboxTimeout
      const hookSource = hook.toString()
      
      // Extract the function body to avoid issues with function declarations
      let functionBody = this.prepareFunctionSource(hookSource)
      
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
        () => capabilities.vm.runInContext(executionScript, vmContext, {
          timeout: timeoutMs,
          displayErrors: true,
          filename: `plugin-${plugin.name}-${hookName}.js`
        }),
        timeoutMs,
        `${plugin.name}.${hookName}`
      )
      
      const duration = Date.now() - sandboxStart
      this.observabilityHooks?.onPluginSandboxEnd?.(plugin.name, hookName, duration)
      
      debugLog.operation('sandbox execution completed', {
        plugin: plugin.name,
        hook: hookName,
        duration,
        hasResult: result !== undefined
      }, this.debug)
      
      return result
      
    } catch (error) {
      const duration = Date.now() - sandboxStart
      this.observabilityHooks?.onPluginSandboxEnd?.(plugin.name, hookName, duration)
      
      // Re-throw PluginTimeoutError as-is to maintain timeout semantics
      if (error instanceof PluginTimeoutError) {
        throw error
      }
      
      if (error instanceof Error) {
        // Check for VM timeout specifically
        if (error.message.includes('Script execution timed out')) {
          throw new PluginTimeoutError(`${plugin.name}.${hookName}`, this.sandboxTimeout, {
            context: { operation: `${plugin.name}.${hookName}`, timeoutMs: this.sandboxTimeout, type: 'sandbox' }
          })
        }
        
        // Check for sandbox escape attempts
        if (this.security.isSandboxEscapeAttempt(error, 'node')) {
          this.observabilityHooks?.onPluginSandboxEscape?.(plugin.name, hookName, error.message)
          throw new PluginSandboxError(plugin.name, hookName, error.message, {
            context: { originalError: error.message, duration }
          })
        }
        
        // Handle wrapped sandbox errors
        if (error.message.startsWith('Sandbox execution error: ')) {
          const originalMessage = error.message.replace('Sandbox execution error: ', '')
          const pluginError = new Error(originalMessage)
          pluginError.stack = error.stack
          throw pluginError
        }
        
        throw error
      }
      
      throw new PluginSandboxError(plugin.name, hookName, String(error), {
        context: { originalError: String(error), duration }
      })
    }
  }

  /**
   * Execute plugin hook in Web Worker
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

    this.observabilityHooks?.onPluginSandboxStart?.(plugin.name, hookName)
    const workerStart = Date.now()

    try {
      // Strip functions from arguments for security  
      const sanitizedArgs = this.security.sanitizeArgumentsForSandbox(args)

      debugLog.operation('worker executing plugin', {
        plugin: plugin.name,
        hook: hookName,
        argsCount: sanitizedArgs.length,
        workerPoolStats: this.workerPool.getStats()
      }, this.debug)

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
        timeout: this.sandboxTimeout,
        allowedGlobals: this.allowedGlobals,
        debug: this.debug
      }

      const result = await this.workerPool.execute(options)

      const duration = Date.now() - workerStart
      this.observabilityHooks?.onPluginSandboxEnd?.(plugin.name, hookName, duration)

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
        }, this.debug)
      }

      debugLog.operation('worker execution completed', {
        plugin: plugin.name,
        hook: hookName,
        duration,
        hasResult: result !== undefined,
        workerPoolStats: this.workerPool.getStats()
      }, this.debug)

      return result

    } catch (error) {
      const duration = Date.now() - workerStart
      this.observabilityHooks?.onPluginSandboxEnd?.(plugin.name, hookName, duration)

      // Re-throw timeout errors as-is
      if (error instanceof PluginTimeoutError) {
        throw error
      }

      // Check for sandbox violations and escape attempts
      if (error instanceof Error) {
        if (this.security.isSandboxEscapeAttempt(error, 'browser')) {
          this.observabilityHooks?.onPluginSandboxEscape?.(plugin.name, hookName, error.message)
        }
      }

      throw error
    }
  }

  /**
   * Execute plugin hook directly (no sandbox)
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
    }, this.debug)

    // Execute the hook (can be sync or async)
    const result = hook.apply(plugin, args)
    
    // If result is a promise, await it
    if (result && typeof result.then === 'function') {
      return await result
    }
    
    return result
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
      timeoutId = setTimeout(() => {
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
      }
    }
  }

  /**
   * Prepare function source for sandbox execution
   */
  private prepareFunctionSource(hookSource: string): string {
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
    
    return functionBody
  }
}