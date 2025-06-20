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
  private sandbox: boolean
  private sandboxTimeout: number
  private allowedGlobals: string[]
  private enableDebugMode: boolean

  constructor(options: {
    platformEnv: PlatformEnvironment
    security: PluginSecurity
    workerPool?: WorkerPool
    observabilityHooks?: PluginManagerObservabilityHooks
    debug?: boolean
    sandbox?: boolean
    sandboxTimeout?: number
    allowedGlobals?: string[]
    enableDebugMode?: boolean
  }) {
    this.platformEnv = options.platformEnv
    this.security = options.security
    this.workerPool = options.workerPool
    this.observabilityHooks = options.observabilityHooks
    this.debug = options.debug ?? false
    this.sandbox = options.sandbox ?? true
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
    // If sandboxing is disabled, always use direct execution
    if (!this.sandbox) {
      return 'direct'
    }
    
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
      
      // Handle vitest mock functions by extracting the actual implementation
      const actualFunction = this.extractActualFunction(hook)
      const hookSource = actualFunction.toString()
      
      if (actualFunction !== hook) {
        debugLog.operation('vitest mock detected, using actual implementation', {
          plugin: plugin.name,
          hook: hookName,
          originalSource: hook.toString().substring(0, 200) + '...',
          actualSource: hookSource.substring(0, 200) + '...'
        }, this.debug)
      }
      
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
        // Check for VM timeout specifically - handle both direct and wrapped timeout messages
        if (error.message.includes('Script execution timed out') || 
            error.message.includes('Sandbox execution error: Script execution timed out') ||
            (error.message.startsWith('Sandbox execution error: ') && error.message.includes('timed out'))) {
          throw new PluginTimeoutError(`${plugin.name}.${hookName}`, this.sandboxTimeout, {
            context: { operation: `${plugin.name}.${hookName}`, timeoutMs: this.sandboxTimeout, type: 'sandbox' }
          })
        }
        
        // Check for sandbox escape attempts
        const isSandboxEscape = this.security.isSandboxEscapeAttempt(error, 'node')
        if (isSandboxEscape) {
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
      // Handle vitest mock functions by extracting the actual implementation
      const actualFunction = this.extractActualFunction(hook)
      const hookSource = actualFunction.toString()
      
      if (actualFunction !== hook) {
        debugLog.operation('vitest mock detected in worker, using actual implementation', {
          plugin: plugin.name,
          hook: hookName,
          originalSource: hook.toString().substring(0, 100) + '...',
          actualSource: hookSource.substring(0, 100) + '...'
        }, this.debug)
      }
      
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
    
    // Handle method definitions like "onInit(params) { ... }"
    const methodMatch = hookSource.match(/^(\w+)\s*\(([^)]*)\)\s*:\s*\w+\s*\{([\s\S]*)\}$/)
    if (methodMatch) {
      // TypeScript method with type annotation: onInit(context: AgentContext): void { ... }
      const [, methodName, params, body] = methodMatch
      functionBody = `function(${params}) {${body}}`
    } else {
      // Check for simple method without type annotation: onInit(params) { ... }
      const simpleMethodMatch = hookSource.match(/^(\w+)\s*\(([^)]*)\)\s*\{([\s\S]*)\}$/)
      if (simpleMethodMatch) {
        const [, methodName, params, body] = simpleMethodMatch
        functionBody = `function(${params}) {${body}}`
      } else if (hookSource.includes('=>')) {
        // Handle arrow functions (including async arrow functions)
        const arrowIndex = hookSource.indexOf('=>')
        let paramsStr = hookSource.substring(0, arrowIndex).trim()
        const bodyStr = hookSource.substring(arrowIndex + 2).trim()
        
        // Handle async keyword
        const isAsync = paramsStr.startsWith('async')
        if (isAsync) {
          paramsStr = paramsStr.substring(5).trim() // Remove 'async' keyword
        }
        
        // Clean up parameter list (remove outer parentheses if present)
        const cleanParams = paramsStr.startsWith('(') && paramsStr.endsWith(')') 
          ? paramsStr.slice(1, -1) 
          : paramsStr
        
        if (bodyStr.startsWith('{')) {
          // Block arrow function: (async) args => { ... }
          functionBody = isAsync 
            ? `async function(${cleanParams}) ${bodyStr}`
            : `function(${cleanParams}) ${bodyStr}`
        } else {
          // Expression arrow function: (async) args => expr
          functionBody = isAsync 
            ? `async function(${cleanParams}) { return ${bodyStr}; }`
            : `function(${cleanParams}) { return ${bodyStr}; }`
        }
      }
    }
    
    return functionBody
  }

  /**
   * Extract the actual implementation from vitest mock functions
   */
  private extractActualFunction(hookFunction: Function): Function {
    // Check if this is a vitest mock function by looking for getMockImplementation method
    if (typeof hookFunction === 'function' && 'getMockImplementation' in hookFunction) {
      const mockImplementation = (hookFunction as any).getMockImplementation()
      if (typeof mockImplementation === 'function') {
        return mockImplementation
      }
    }
    
    // Check if function source contains vitest internal references that would fail in sandbox
    const hookSource = hookFunction.toString()
    
    // Common patterns in vitest mock functions that would cause "X is not defined" errors
    const vitestInternalPatterns = [
      /\b[A-Z]\.[a-zA-Z]/,  // Single capital letter followed by method call (e.g., A.getMockImplementation)
      /\b[a-z]\.[a-zA-Z].*getMockImplementation/,  // lowercase letter with getMockImplementation
      /return [A-Z]\./,  // return statement with capital letter reference
      /arguments\[0\]\?\.apply/  // vitest-style argument handling
    ]
    
    const hasVitestInternals = vitestInternalPatterns.some(pattern => pattern.test(hookSource))
    
    if (hasVitestInternals) {
      // Log warning that we found a mock but couldn't extract implementation
      debugLog.operation('detected vitest mock with internal references but no getMockImplementation', {
        source: hookSource.substring(0, 200) + '...'
      }, this.debug)
      
      // Try to find mockImplementation property
      if ('mockImplementation' in hookFunction) {
        const impl = (hookFunction as any).mockImplementation
        if (typeof impl === 'function') {
          return impl
        }
      }
      
      // Try to find _mockImplementation property (internal vitest property)
      if ('_mockImplementation' in hookFunction) {
        const impl = (hookFunction as any)._mockImplementation
        if (typeof impl === 'function') {
          return impl
        }
      }
    }
    
    // Return original function if no mock implementation found
    return hookFunction
  }
}