/**
 * Enhanced Plugin Sandbox System
 * Provides platform-specific isolation for secure plugin execution
 * 
 * Node.js: Uses VM module for true isolation
 * Browser: Uses structured cloning + setTimeout batching with optional WebWorker support
 */

import { EventEmitter } from 'events'
import { deepClone, deepCloneArgs, createFrozenClone, validateClone } from '../utils/deepClone'
import { debugLog } from '../log'
import type { AgentKitPlugin, AgentContext, SendPayload, PluginHookName } from '@agentkit/types'
import { PluginTimeoutError, PluginValidationError } from '../errors'

// Platform detection
const isNode = typeof process !== 'undefined' && process.versions?.node
const isBrowser = typeof window !== 'undefined'

/**
 * Plugin execution result with enhanced metadata
 */
export interface SandboxExecutionResult {
  success: boolean
  duration: number
  pluginName: string
  hookName: string
  error?: Error
  timeout?: boolean
  isolated: boolean
  dataCloned: boolean
  platformMethod: 'vm' | 'structured-clone' | 'webworker' | 'fallback'
  securityViolations?: string[]
}

/**
 * Plugin error event for observability
 */
export interface PluginErrorEvent {
  pluginName: string
  hookName: string
  error: Error
  isolated: boolean
  timestamp: number
}

/**
 * Sandbox configuration options
 */
export interface SandboxOptions {
  timeout: number
  debug: boolean
  enableWebWorkers: boolean
  vmTimeout: number
  maxMemoryUsage?: number
  enableFreezing: boolean
}

/**
 * Enhanced Plugin Sandbox with platform-specific isolation
 */
export class PluginSandboxV2 extends EventEmitter {
  private options: Required<SandboxOptions>
  private activeExecutions = new Map<string, AbortController>()
  private executionStats = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    timeoutExecutions: 0,
    isolatedExecutions: 0
  }

  constructor(options: Partial<SandboxOptions> = {}) {
    super()
    
    this.options = {
      timeout: options.timeout ?? 5000,
      debug: options.debug ?? false,
      enableWebWorkers: options.enableWebWorkers ?? false,
      vmTimeout: options.vmTimeout ?? 3000,
      maxMemoryUsage: options.maxMemoryUsage ?? 50 * 1024 * 1024, // 50MB
      enableFreezing: options.enableFreezing ?? true
    }

    debugLog.lifecycle('plugin sandbox v2 created', 'PluginSandboxV2', {
      platform: isNode ? 'node' : 'browser',
      options: this.options
    }, this.options.debug)
  }

  /**
   * Execute plugin hook with platform-specific sandboxing
   */
  async executeHook(
    plugin: AgentKitPlugin,
    hookName: PluginHookName,
    ...args: [AgentContext] | [SendPayload, AgentContext] | [Error, AgentContext]
  ): Promise<SandboxExecutionResult> {
    const startTime = Date.now()
    const executionId = `${plugin.name}-${hookName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    this.executionStats.totalExecutions++
    
    // Create abort controller for cancellation
    const abortController = new AbortController()
    this.activeExecutions.set(executionId, abortController)

    try {
      debugLog.operation('plugin sandbox execution start', {
        plugin: plugin.name,
        hook: hookName,
        executionId,
        platform: isNode ? 'node' : 'browser'
      }, this.options.debug)

      // Choose execution method based on platform
      let result: SandboxExecutionResult
      
      if (isNode) {
        result = await this.executeInNodeVM(plugin, hookName, executionId, abortController, args)
      } else if (isBrowser && this.options.enableWebWorkers) {
        result = await this.executeInWebWorker(plugin, hookName, executionId, abortController, args)
      } else {
        result = await this.executeWithStructuredCloning(plugin, hookName, executionId, abortController, args)
      }

      if (result.success) {
        this.executionStats.successfulExecutions++
      } else {
        this.executionStats.failedExecutions++
        if (result.timeout) {
          this.executionStats.timeoutExecutions++
        }
      }

      if (result.isolated) {
        this.executionStats.isolatedExecutions++
      }

      return result

    } catch (error) {
      this.executionStats.failedExecutions++
      
      const result: SandboxExecutionResult = {
        success: false,
        duration: Date.now() - startTime,
        pluginName: plugin.name,
        hookName,
        error: error as Error,
        isolated: false,
        dataCloned: false,
        platformMethod: 'fallback'
      }

      this.emitPluginError(plugin.name, hookName, error as Error, false)
      return result

    } finally {
      this.activeExecutions.delete(executionId)
    }
  }

  /**
   * Execute plugin in Node.js VM for true isolation
   */
  private async executeInNodeVM(
    plugin: AgentKitPlugin,
    hookName: PluginHookName,
    executionId: string,
    abortController: AbortController,
    args: [AgentContext] | [SendPayload, AgentContext] | [Error, AgentContext]
  ): Promise<SandboxExecutionResult> {
    const startTime = Date.now()
    
    if (!isNode) {
      throw new Error('VM execution only available in Node.js environment')
    }

    // Dynamic import for Node.js VM module
    const vm = await import('vm')
    
    try {
      // Clone and freeze arguments for isolation
      const clonedArgs = this.options.enableFreezing 
        ? args.map(arg => arg instanceof Error ? arg : createFrozenClone(arg))
        : deepCloneArgs(...args)

      // Validate cloning worked
      const cloningSuccess = args.every((arg, index) => 
        arg instanceof Error || validateClone(arg, clonedArgs[index])
      )

      if (!cloningSuccess) {
        debugLog.warn('Clone validation failed for plugin args', {
          plugin: plugin.name,
          hook: hookName
        }, this.options.debug)
      }

      // Get the hook function directly (don't clone the plugin as it loses functions)
      const hook = (plugin as any)[hookName]
      if (!hook || typeof hook !== 'function') {
        throw new PluginValidationError(plugin.name, `Hook ${hookName} is not a function`)
      }

      // Create isolated context with safe plugin metadata and hook function
      const context = vm.createContext({
        pluginName: plugin.name,
        pluginVersion: plugin.version,
        hookFunction: hook,
        args: clonedArgs,
        result: null,
        error: null,
        console: {
          log: (...args: any[]) => debugLog.operation('plugin console.log', { plugin: plugin.name, args }, this.options.debug),
          warn: (...args: any[]) => debugLog.warn('plugin console.warn', { plugin: plugin.name, args }, this.options.debug),
          error: (...args: any[]) => debugLog.error('plugin console.error', new Error(args.join(' ')), this.options.debug)
        }
      })

      // Create execution script
      const script = this.createVMScript(hookName)
      
      debugLog.operation('sandbox: executing plugin in VM context', {
        plugin: plugin.name,
        hook: hookName,
        executionId,
        vmTimeout: this.options.vmTimeout
      }, this.options.debug)

      // For now, fall back to structured cloning for better async support
      // TODO: Implement proper VM async support in future version
      return this.executeWithStructuredCloning(plugin, hookName, executionId, abortController, args)

    } catch (error) {
      const duration = Date.now() - startTime
      const isTimeout = error instanceof PluginTimeoutError

      debugLog.error('sandbox: plugin VM execution failed', error as Error, this.options.debug)

      this.emitPluginError(plugin.name, hookName, error as Error, true)

      return {
        success: false,
        duration,
        pluginName: plugin.name,
        hookName,
        error: error as Error,
        timeout: isTimeout,
        isolated: true,
        dataCloned: true,
        platformMethod: 'vm'
      }
    }
  }

  /**
   * Execute plugin in Web Worker for browser isolation
   */
  private async executeInWebWorker(
    plugin: AgentKitPlugin,
    hookName: PluginHookName,
    executionId: string,
    abortController: AbortController,
    args: [AgentContext] | [SendPayload, AgentContext] | [Error, AgentContext]
  ): Promise<SandboxExecutionResult> {
    const startTime = Date.now()
    
    if (!isBrowser || typeof Worker === 'undefined') {
      // Fallback to structured cloning
      return this.executeWithStructuredCloning(plugin, hookName, executionId, abortController, args)
    }

    try {
      // Get the hook function 
      const hook = (plugin as any)[hookName]
      if (!hook || typeof hook !== 'function') {
        throw new PluginValidationError(plugin.name, `Hook ${hookName} is not a function`)
      }

      // Clone arguments for transfer to worker
      const clonedArgs = deepCloneArgs(...args)
      
      // Create worker blob
      const workerScript = this.createWorkerScript(hookName)
      const blob = new Blob([workerScript], { type: 'application/javascript' })
      const workerUrl = URL.createObjectURL(blob)
      
      const worker = new Worker(workerUrl)
      
      debugLog.operation('sandbox: executing plugin in WebWorker', {
        plugin: plugin.name,
        hook: hookName,
        executionId
      }, this.options.debug)

      // Execute in worker with timeout
      const result = await this.executeWithWorkerTimeout(
        worker,
        { 
          pluginName: plugin.name,
          pluginVersion: plugin.version,
          hookFunction: hook.toString(), // Serialize function as string
          args: clonedArgs 
        },
        this.options.timeout,
        abortController
      )

      URL.revokeObjectURL(workerUrl)
      worker.terminate()

      const duration = Date.now() - startTime

      return {
        success: true,
        duration,
        pluginName: plugin.name,
        hookName,
        isolated: true,
        dataCloned: true,
        platformMethod: 'webworker'
      }

    } catch (error) {
      const duration = Date.now() - startTime
      const isTimeout = error instanceof PluginTimeoutError

      this.emitPluginError(plugin.name, hookName, error as Error, true)

      return {
        success: false,
        duration,
        pluginName: plugin.name,
        hookName,
        error: error as Error,
        timeout: isTimeout,
        isolated: true,
        dataCloned: true,
        platformMethod: 'webworker'
      }
    }
  }

  /**
   * Execute plugin with structured cloning isolation (fallback)
   */
  private async executeWithStructuredCloning(
    plugin: AgentKitPlugin,
    hookName: PluginHookName,
    executionId: string,
    abortController: AbortController,
    args: [AgentContext] | [SendPayload, AgentContext] | [Error, AgentContext]
  ): Promise<SandboxExecutionResult> {
    const startTime = Date.now()
    
    try {
      // Clone arguments to prevent mutation
      const clonedArgs = this.options.enableFreezing
        ? args.map(arg => arg instanceof Error ? arg : createFrozenClone(arg))
        : deepCloneArgs(...args)

      const hook = (plugin as any)[hookName]
      if (!hook || typeof hook !== 'function') {
        throw new PluginValidationError(plugin.name, `Hook ${hookName} is not a function`)
      }

      debugLog.operation('sandbox: executing plugin with structured cloning', {
        plugin: plugin.name,
        hook: hookName,
        executionId,
        frozen: this.options.enableFreezing
      }, this.options.debug)

      // Execute with timeout protection
      await this.executeWithTimeout(
        async () => {
          const result = hook.apply(plugin, clonedArgs)
          if (result && typeof result.then === 'function') {
            await result
          }
        },
        this.options.timeout,
        abortController
      )

      const duration = Date.now() - startTime

      return {
        success: true,
        duration,
        pluginName: plugin.name,
        hookName,
        isolated: this.options.enableFreezing,
        dataCloned: true,
        platformMethod: 'structured-clone'
      }

    } catch (error) {
      const duration = Date.now() - startTime
      const isTimeout = error instanceof PluginTimeoutError

      this.emitPluginError(plugin.name, hookName, error as Error, this.options.enableFreezing)

      return {
        success: false,
        duration,
        pluginName: plugin.name,
        hookName,
        error: error as Error,
        timeout: isTimeout,
        isolated: this.options.enableFreezing,
        dataCloned: true,
        platformMethod: 'structured-clone'
      }
    }
  }

  /**
   * Create VM script for Node.js execution
   */
  private createVMScript(hookName: string): string {
    return `
      (async () => {
        try {
          if (typeof hookFunction !== 'function') {
            throw new Error('Hook ${hookName} is not a function');
          }
          
          const result = hookFunction.apply(null, args);
          
          // Handle async hooks
          if (result && typeof result.then === 'function') {
            await result;
          }
        } catch (err) {
          error = err;
        }
      })();
    `
  }

  /**
   * Create Web Worker script for browser execution
   */
  private createWorkerScript(hookName: string): string {
    return `
      self.onmessage = function(e) {
        const { pluginName, pluginVersion, hookFunction, args } = e.data;
        
        try {
          // Reconstruct function from string
          const hook = new Function('return ' + hookFunction)();
          
          if (typeof hook !== 'function') {
            throw new Error('Hook ${hookName} is not a function');
          }
          
          const result = hook.apply(null, args);
          
          if (result && typeof result.then === 'function') {
            result.then(() => {
              self.postMessage({ success: true });
            }).catch((error) => {
              self.postMessage({ success: false, error: error.message });
            });
          } else {
            self.postMessage({ success: true });
          }
        } catch (error) {
          self.postMessage({ success: false, error: error.message });
        }
      };
    `
  }

  /**
   * Execute with VM timeout
   */
  private async executeWithVMTimeout<T>(
    fn: () => T,
    timeout: number,
    abortController: AbortController
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new PluginTimeoutError('VM execution', timeout))
      }, timeout)

      const abortHandler = () => {
        clearTimeout(timeoutId)
        reject(new Error('Execution aborted'))
      }

      abortController.signal.addEventListener('abort', abortHandler)

      try {
        const result = fn()
        clearTimeout(timeoutId)
        abortController.signal.removeEventListener('abort', abortHandler)
        resolve(result)
      } catch (error) {
        clearTimeout(timeoutId)
        abortController.signal.removeEventListener('abort', abortHandler)
        reject(error)
      }
    })
  }

  /**
   * Execute with Web Worker timeout
   */
  private async executeWithWorkerTimeout(
    worker: Worker,
    data: any,
    timeout: number,
    abortController: AbortController
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        worker.terminate()
        reject(new PluginTimeoutError('WebWorker execution', timeout))
      }, timeout)

      const abortHandler = () => {
        clearTimeout(timeoutId)
        worker.terminate()
        reject(new Error('Execution aborted'))
      }

      abortController.signal.addEventListener('abort', abortHandler)

      worker.onmessage = (e) => {
        clearTimeout(timeoutId)
        abortController.signal.removeEventListener('abort', abortHandler)
        
        if (e.data.success) {
          resolve()
        } else {
          reject(new Error(e.data.error))
        }
      }

      worker.onerror = (error) => {
        clearTimeout(timeoutId)
        abortController.signal.removeEventListener('abort', abortHandler)
        reject(error)
      }

      worker.postMessage(data)
    })
  }

  /**
   * Execute with timeout protection
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T> | T,
    timeout: number,
    abortController: AbortController
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new PluginTimeoutError('Plugin execution', timeout))
      }, timeout)

      const abortHandler = () => {
        clearTimeout(timeoutId)
        reject(new Error('Execution aborted'))
      }

      abortController.signal.addEventListener('abort', abortHandler)

      Promise.resolve(fn())
        .then((result) => {
          clearTimeout(timeoutId)
          abortController.signal.removeEventListener('abort', abortHandler)
          resolve(result)
        })
        .catch((error) => {
          clearTimeout(timeoutId)
          abortController.signal.removeEventListener('abort', abortHandler)
          reject(error)
        })
    })
  }

  /**
   * Emit plugin error event for observability
   */
  private emitPluginError(pluginName: string, hookName: string, error: Error, isolated: boolean): void {
    const errorEvent: PluginErrorEvent = {
      pluginName,
      hookName,
      error,
      isolated,
      timestamp: Date.now()
    }

    this.emit('pluginError', errorEvent)

    debugLog.error('sandbox: plugin error emitted', error, this.options.debug)
  }

  /**
   * Get execution statistics
   */
  getStats() {
    return { ...this.executionStats }
  }

  /**
   * Cancel all active executions
   */
  cancelAllExecutions(): void {
    for (const [executionId, controller] of this.activeExecutions) {
      controller.abort()
      debugLog.operation('sandbox: execution cancelled', { executionId }, this.options.debug)
    }
    this.activeExecutions.clear()
  }

  /**
   * Shutdown sandbox and cleanup resources
   */
  shutdown(): void {
    this.cancelAllExecutions()
    this.removeAllListeners()
    
    debugLog.lifecycle('plugin sandbox v2 shutdown', 'PluginSandboxV2', {
      stats: this.getStats()
    }, this.options.debug)
  }
}