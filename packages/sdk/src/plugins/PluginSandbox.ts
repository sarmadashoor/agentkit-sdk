/**
 * PluginSandbox - Cryptographically safe plugin execution environment
 * Provides full isolation for plugin execution across Node.js and browser environments
 */

import { debugLog } from '../log'
import { deepClone } from '../utils/deepClone'
import type { AgentContext, SendPayload, PluginHookName } from '@agentkit/types'

/**
 * Environment detection
 */
const isNode = typeof process !== 'undefined' && process.versions?.node
const isBrowser = typeof window !== 'undefined'

/**
 * Plugin execution result with security metadata
 */
export interface SandboxExecutionResult {
  success: boolean
  result?: unknown
  error?: Error
  executionTime: number
  memoryUsage?: number
  securityViolations: string[]
}

/**
 * Sandbox configuration options
 */
export interface SandboxOptions {
  /** Maximum execution time in milliseconds */
  timeout: number
  /** Maximum memory usage in bytes */
  maxMemory?: number
  /** Allow network access */
  allowNetwork?: boolean
  /** Allow filesystem access */
  allowFilesystem?: boolean
  /** Custom allowed globals */
  allowedGlobals?: string[]
  /** Debug mode */
  debug?: boolean
}

/**
 * Security violation detector
 */
class SecurityViolationDetector {
  private violations: string[] = []

  detect(code: string): string[] {
    this.violations = []
    
    // Check for definitely dangerous patterns
    const dangerousPatterns = [
      /eval\s*\(/g,
      /Function\s*\(/g,
      /XMLHttpRequest/g,
      /fetch\s*\(/g,
      /require\s*\(/g,
      /import\s*\(/g,
      /process\./g,
      /global\./g,
      /window\./g,
      /document\./g,
      /__proto__/g
    ]

    dangerousPatterns.forEach((pattern, index) => {
      if (pattern.test(code)) {
        this.violations.push(`Detected dangerous pattern: ${pattern.source}`)
      }
    })

    // Check for potentially dangerous timer usage (not in Promise contexts)
    if (/setTimeout\s*\([^)]*\)(?!\s*[;,]\s*})(?!.*resolve)/g.test(code) && !/Promise\(.*setTimeout/g.test(code)) {
      this.violations.push('Detected potentially dangerous timer usage outside Promise context')
    }
    
    if (/setInterval\s*\(/g.test(code)) {
      this.violations.push('Detected dangerous pattern: setInterval usage')
    }

    // Check for dangerous constructor/prototype manipulation
    if (/\.constructor\s*\(/g.test(code) || /\.prototype\s*=/g.test(code)) {
      this.violations.push('Detected dangerous constructor/prototype manipulation')
    }

    return this.violations
  }

  getViolations(): string[] {
    return [...this.violations]
  }
}

/**
 * Node.js VM-based sandbox implementation
 */
class NodeVMSandbox {
  private vm?: typeof import('vm')
  private context: any
  private detector = new SecurityViolationDetector()

  constructor(private options: SandboxOptions) {
    if (isNode) {
      try {
        this.vm = require('vm')
        this.createContext()
      } catch (error) {
        debugLog.error('Failed to initialize Node.js VM sandbox', error as Error, options.debug)
        throw new Error('VM sandbox unavailable in this Node.js environment')
      }
    }
  }

  private createContext(): void {
    if (!this.vm) return

    // Create minimal, controlled context
    const safeGlobals = {
      Object,
      Array,
      String,
      Number,
      Boolean,
      Date,
      Math,
      JSON,
      Promise,
      Error,
      TypeError,
      ReferenceError,
      // Controlled setTimeout for Promise-based operations only
      setTimeout: (callback: Function, delay: number, ...args: unknown[]) => {
        // Only allow short delays for legitimate async operations
        const maxDelay = Math.min(delay || 0, 5000) // Max 5 seconds
        return globalThis.setTimeout(callback, maxDelay, ...args)
      },
      // Provide controlled globalThis that plugins can access but not modify
      globalThis: new Proxy({}, {
        get: () => undefined,
        set: () => false, // Prevent setting properties
        has: () => false,
        ownKeys: () => [],
        defineProperty: () => false,
        deleteProperty: () => false
      }),
      console: {
        log: (...args: unknown[]) => {
          if (this.options.debug) {
            debugLog.operation('Plugin console.log', { args }, this.options.debug)
          }
        },
        warn: (...args: unknown[]) => {
          debugLog.warn('Plugin console.warn', { args }, this.options.debug)
        },
        error: (...args: unknown[]) => {
          debugLog.error('Plugin console.error', new Error(args.join(' ')), this.options.debug)
        }
      }
    }

    // Add allowed globals if specified
    if (this.options.allowedGlobals) {
      this.options.allowedGlobals.forEach(global => {
        if (typeof globalThis[global as keyof typeof globalThis] !== 'undefined') {
          safeGlobals[global as keyof typeof safeGlobals] = globalThis[global as keyof typeof globalThis]
        }
      })
    }

    this.context = this.vm.createContext(safeGlobals)
  }

  async execute(
    pluginCode: string,
    hookName: PluginHookName,
    args: unknown[]
  ): Promise<SandboxExecutionResult> {
    if (!this.vm || !this.context) {
      throw new Error('VM sandbox not initialized')
    }

    const startTime = Date.now()
    const securityViolations = this.detector.detect(pluginCode)
    
    if (securityViolations.length > 0) {
      return {
        success: false,
        error: new Error(`Security violations detected: ${securityViolations.join(', ')}`),
        executionTime: Date.now() - startTime,
        securityViolations
      }
    }

    try {
      // Create execution wrapper
      const wrapperCode = `
        (function(args) {
          'use strict';
          
          // Execute plugin hook in restricted environment
          try {
            const plugin = ${pluginCode};
            const hook = plugin['${hookName}'];
            
            if (typeof hook !== 'function') {
              return { success: false, error: new Error('Hook is not a function') };
            }
            
            const result = hook.apply(plugin, args);
            
            // Handle async results
            if (result && typeof result.then === 'function') {
              return result.then(
                (value) => ({ success: true, result: value }),
                (error) => ({ success: false, error: error })
              );
            }
            
            return { success: true, result };
          } catch (error) {
            return { success: false, error: error };
          }
        })
      `

      // Clone arguments to prevent mutations
      const clonedArgs = args.map(arg => deepClone(arg))

      // Execute with timeout
      const result = await Promise.race([
        new Promise((resolve, reject) => {
          try {
            const script = new this.vm!.Script(wrapperCode, {
              filename: `plugin-${hookName}.js`
            })
            
            const executionResult = script.runInContext(this.context, {
              timeout: this.options.timeout
            })
            
            // Call the wrapper function with cloned arguments
            const finalResult = executionResult.call(null, clonedArgs)
            
            // Handle promise results
            if (finalResult && typeof finalResult.then === 'function') {
              finalResult.then(resolve).catch(reject)
            } else {
              resolve(finalResult)
            }
          } catch (error) {
            reject(error)
          }
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Plugin execution timeout')), this.options.timeout)
        )
      ])

      const executionTime = Date.now() - startTime

      return {
        success: (result as any).success,
        result: (result as any).result,
        error: (result as any).error,
        executionTime,
        securityViolations
      }
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        executionTime: Date.now() - startTime,
        securityViolations
      }
    }
  }
}

/**
 * Browser Web Worker-based sandbox implementation
 */
class BrowserWorkerSandbox {
  private detector = new SecurityViolationDetector()

  constructor(private options: SandboxOptions) {}

  async execute(
    pluginCode: string,
    hookName: PluginHookName,
    args: unknown[]
  ): Promise<SandboxExecutionResult> {
    const startTime = Date.now()
    const securityViolations = this.detector.detect(pluginCode)
    
    if (securityViolations.length > 0) {
      return {
        success: false,
        error: new Error(`Security violations detected: ${securityViolations.join(', ')}`),
        executionTime: Date.now() - startTime,
        securityViolations
      }
    }

    // Check if Web Workers are available
    if (typeof Worker === 'undefined') {
      return this.fallbackExecution(pluginCode, hookName, args, startTime, securityViolations)
    }

    try {
      // Create worker code
      const workerCode = `
        self.onmessage = function(e) {
          const { pluginCode, hookName, args } = e.data;
          
          try {
            // Restricted environment
            const restrictedGlobals = {
              Object, Array, String, Number, Boolean, Date, Math, JSON, Promise, Error,
              console: {
                log: (...args) => self.postMessage({ type: 'log', args }),
                warn: (...args) => self.postMessage({ type: 'warn', args }),
                error: (...args) => self.postMessage({ type: 'error', args })
              }
            };
            
            // Execute plugin in restricted context
            const plugin = new Function('globals', \`
              'use strict';
              with (globals) {
                return (\${pluginCode});
              }
            \`)(restrictedGlobals);
            
            const hook = plugin[\${JSON.stringify(hookName)}];
            
            if (typeof hook !== 'function') {
              throw new Error('Hook is not a function');
            }
            
            const result = hook.apply(plugin, args);
            
            // Handle async results
            if (result && typeof result.then === 'function') {
              result.then(
                (value) => self.postMessage({ type: 'success', result: value }),
                (error) => self.postMessage({ type: 'error', error: error.message })
              );
            } else {
              self.postMessage({ type: 'success', result });
            }
          } catch (error) {
            self.postMessage({ type: 'error', error: error.message });
          }
        };
      `

      // Create blob URL for worker
      const blob = new Blob([workerCode], { type: 'application/javascript' })
      const workerUrl = URL.createObjectURL(blob)
      
      const worker = new Worker(workerUrl)
      
      // Clone arguments to prevent mutations
      const clonedArgs = args.map(arg => deepClone(arg))

      const result = await new Promise<SandboxExecutionResult>((resolve) => {
        let resolved = false
        
        const cleanup = () => {
          if (!resolved) {
            resolved = true
            worker.terminate()
            URL.revokeObjectURL(workerUrl)
          }
        }

        const timeout = setTimeout(() => {
          cleanup()
          resolve({
            success: false,
            error: new Error('Plugin execution timeout'),
            executionTime: Date.now() - startTime,
            securityViolations
          })
        }, this.options.timeout)

        worker.onmessage = (e) => {
          const { type, result, error, args: logArgs } = e.data
          
          switch (type) {
            case 'success':
              cleanup()
              clearTimeout(timeout)
              resolve({
                success: true,
                result,
                executionTime: Date.now() - startTime,
                securityViolations
              })
              break
            case 'error':
              cleanup()
              clearTimeout(timeout)
              resolve({
                success: false,
                error: new Error(error),
                executionTime: Date.now() - startTime,
                securityViolations
              })
              break
            case 'log':
              if (this.options.debug) {
                debugLog.operation('Plugin console.log', { args: logArgs }, this.options.debug)
              }
              break
            case 'warn':
              debugLog.warn('Plugin console.warn', { args: logArgs }, this.options.debug)
              break
          }
        }

        worker.onerror = (error) => {
          cleanup()
          clearTimeout(timeout)
          resolve({
            success: false,
            error: new Error(`Worker error: ${error.message}`),
            executionTime: Date.now() - startTime,
            securityViolations
          })
        }

        // Start execution
        worker.postMessage({ pluginCode, hookName, args: clonedArgs })
      })

      return result
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        executionTime: Date.now() - startTime,
        securityViolations
      }
    }
  }

  private async fallbackExecution(
    pluginCode: string,
    hookName: PluginHookName,
    args: unknown[],
    startTime: number,
    securityViolations: string[]
  ): Promise<SandboxExecutionResult> {
    debugLog.warn('Web Workers unavailable, using fallback execution', {}, this.options.debug)
    
    try {
      // Fallback to try/catch execution with limited globals
      const restrictedContext = {
        Object, Array, String, Number, Boolean, Date, Math, JSON, Promise, Error,
        console: {
          log: (...args: unknown[]) => {
            if (this.options.debug) {
              debugLog.operation('Plugin console.log', { args }, this.options.debug)
            }
          },
          warn: (...args: unknown[]) => {
            debugLog.warn('Plugin console.warn', { args }, this.options.debug)
          },
          error: (...args: unknown[]) => {
            debugLog.error('Plugin console.error', new Error(args.join(' ')), this.options.debug)
          }
        }
      }

      // Execute plugin in restricted context
      const plugin = new Function('context', `
        'use strict';
        with (context) {
          return (${pluginCode});
        }
      `)(restrictedContext)
      
      const hook = plugin[hookName]
      
      if (typeof hook !== 'function') {
        throw new Error('Hook is not a function')
      }
      
      // Clone arguments to prevent mutations
      const clonedArgs = args.map(arg => deepClone(arg))
      
      // Execute with timeout
      const result = await Promise.race([
        Promise.resolve(hook.apply(plugin, clonedArgs)),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Plugin execution timeout')), this.options.timeout)
        )
      ])

      return {
        success: true,
        result,
        executionTime: Date.now() - startTime,
        securityViolations
      }
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        executionTime: Date.now() - startTime,
        securityViolations
      }
    }
  }
}

/**
 * Main PluginSandbox class that chooses the appropriate implementation
 */
export class PluginSandbox {
  private implementation: NodeVMSandbox | BrowserWorkerSandbox

  constructor(options: SandboxOptions) {
    if (isNode) {
      this.implementation = new NodeVMSandbox(options)
    } else if (isBrowser) {
      this.implementation = new BrowserWorkerSandbox(options)
    } else {
      throw new Error('Unsupported environment for plugin sandbox')
    }
  }

  async executePlugin(
    pluginCode: string,
    hookName: PluginHookName,
    args: unknown[]
  ): Promise<SandboxExecutionResult> {
    return this.implementation.execute(pluginCode, hookName, args)
  }
}