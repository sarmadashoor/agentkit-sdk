/**
 * Secure VM Runner for Plugin Execution
 * 
 * Provides hardened virtual machine isolation for plugin code execution using vm.runInContext().
 * Replaces the insecure plugin execution model with defense-in-depth security measures.
 * 
 * @security This module implements critical security boundaries - changes require security review
 * @author AgentKit Security Team
 */

import vm from 'vm'
import { performance } from 'perf_hooks'
import type { AgentContext, SendPayload } from '@agentkit/types'

/**
 * Security configuration for VM execution
 */
export interface VMSecurityConfig {
  /** Maximum execution timeout in milliseconds */
  timeoutMs: number
  /** Maximum memory limit in bytes */
  memoryLimitBytes: number
  /** Enable static analysis of plugin code */
  enableStaticAnalysis: boolean
  /** Allowed global APIs in VM context */
  allowedGlobals: string[]
  /** Maximum call stack depth */
  maxCallStackDepth: number
}

/**
 * VM execution result with security metadata
 */
export interface VMExecutionResult<T = any> {
  /** The execution result */
  result: T
  /** Execution time in milliseconds */
  executionTimeMs: number
  /** Memory usage delta in bytes */
  memoryUsageBytes: number
  /** Security violations detected */
  securityViolations: string[]
  /** Whether execution completed within limits */
  withinLimits: boolean
}

/**
 * Context for VM execution with security boundaries
 */
export interface SecureVMContext {
  /** Plugin metadata */
  plugin: {
    name: string
    version: string
  }
  /** Agent context (deep cloned) */
  agentContext: AgentContext
  /** Send payload (deep cloned) */
  sendPayload?: SendPayload
  /** Error information (if applicable) */
  error?: {
    message: string
    name: string
  }
}

/**
 * Forbidden keywords that indicate potential security violations
 */
const FORBIDDEN_KEYWORDS = [
  'process',
  'require',
  'global',
  '__dirname',
  '__filename',
  'Buffer',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'eval',
  'Function',
  'constructor',
  '__proto__',
  'prototype',
  'fs',
  'child_process',
  'os',
  'path',
  'crypto',
  'http',
  'https',
  'net',
  'dgram',
  'dns',
  'worker_threads'
]

/**
 * Default security configuration
 */
const DEFAULT_SECURITY_CONFIG: VMSecurityConfig = {
  timeoutMs: 5000,
  memoryLimitBytes: 32 * 1024 * 1024, // 32MB
  enableStaticAnalysis: true,
  allowedGlobals: ['console', 'Date', 'Math', 'JSON', 'Object', 'Array', 'Promise', 'setTimeout', 'clearTimeout'],
  maxCallStackDepth: 100
}

/**
 * Secure VM Runner for isolated plugin execution
 */
export class VMRunner {
  private readonly config: VMSecurityConfig
  private readonly contexts = new Map<string, vm.Context>()

  constructor(config: Partial<VMSecurityConfig> = {}) {
    this.config = { ...DEFAULT_SECURITY_CONFIG, ...config }
  }

  /**
   * Create a secure VM context for a plugin
   */
  createSecureContext(pluginId: string): vm.Context {
    // Remove existing context if present
    this.destroyContext(pluginId)

    // Create whitelisted globals object
    const whitelistedGlobals: Record<string, any> = {}
    
    for (const globalName of this.config.allowedGlobals) {
      switch (globalName) {
        case 'console':
          // Provide safe console implementation
          whitelistedGlobals.console = {
            log: (...args: any[]) => console.log(`[Plugin:${pluginId}]`, ...args),
            error: (...args: any[]) => console.error(`[Plugin:${pluginId}]`, ...args),
            warn: (...args: any[]) => console.warn(`[Plugin:${pluginId}]`, ...args),
            info: (...args: any[]) => console.info(`[Plugin:${pluginId}]`, ...args)
          }
          break
        case 'Date':
          whitelistedGlobals.Date = Date
          break
        case 'Math':
          whitelistedGlobals.Math = Math
          break
        case 'JSON':
          whitelistedGlobals.JSON = JSON
          break
        case 'Object':
          // Provide safe subset of Object methods
          whitelistedGlobals.Object = {
            keys: Object.keys,
            values: Object.values,
            entries: Object.entries,
            assign: Object.assign,
            freeze: Object.freeze,
            seal: Object.seal
          }
          break
        case 'Array':
          whitelistedGlobals.Array = Array
          break
        case 'Promise':
          whitelistedGlobals.Promise = Promise
          break
        case 'setTimeout':
          // Controlled setTimeout with limits
          whitelistedGlobals.setTimeout = (callback: Function, delay: number) => {
            if (delay > this.config.timeoutMs) {
              throw new Error(`setTimeout delay ${delay}ms exceeds maximum allowed ${this.config.timeoutMs}ms`)
            }
            return setTimeout(callback, delay)
          }
          break
        case 'clearTimeout':
          whitelistedGlobals.clearTimeout = clearTimeout
          break
      }
    }

    // Add security monitoring
    whitelistedGlobals.__SECURITY__ = {
      violations: [] as string[],
      recordViolation: (violation: string) => {
        whitelistedGlobals.__SECURITY__.violations.push(violation)
      }
    }

    // Create isolated context
    const context = vm.createContext(whitelistedGlobals, {
      name: `plugin-${pluginId}`,
      codeGeneration: {
        strings: false, // Disable eval
        wasm: false     // Disable WebAssembly
      }
    })

    this.contexts.set(pluginId, context)
    return context
  }

  /**
   * Perform static analysis on plugin code
   */
  private performStaticAnalysis(code: string): string[] {
    const violations: string[] = []

    // Check for forbidden keywords
    for (const keyword of FORBIDDEN_KEYWORDS) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g')
      if (regex.test(code)) {
        violations.push(`Forbidden keyword detected: ${keyword}`)
      }
    }

    // Check for eval-like patterns
    const evalPatterns = [
      /eval\s*\(/,
      /Function\s*\(/,
      /new\s+Function/,
      /\[\s*["']constructor["']\s*\]/,
      /\.\s*constructor\s*\(/
    ]

    for (const pattern of evalPatterns) {
      if (pattern.test(code)) {
        violations.push(`Potentially dangerous eval-like pattern detected: ${pattern.source}`)
      }
    }

    // Check for prototype pollution attempts
    const prototypePatterns = [
      /__proto__/,
      /\.prototype\s*\[/,
      /\[\s*["']prototype["']\s*\]/,
      /constructor\s*\.\s*prototype/
    ]

    for (const pattern of prototypePatterns) {
      if (pattern.test(code)) {
        violations.push(`Potential prototype pollution detected: ${pattern.source}`)
      }
    }

    return violations
  }

  /**
   * Execute plugin hook in secure VM context
   */
  async executePluginHook<T = any>(
    pluginId: string,
    hookName: 'onInit' | 'onSend' | 'onError' | 'onShutdown',
    pluginCode: string,
    context: SecureVMContext
  ): Promise<VMExecutionResult<T>> {
    const startTime = performance.now()
    const memoryBefore = process.memoryUsage().heapUsed
    
    let securityViolations: string[] = []
    let result: T
    let withinLimits = true

    try {
      // Static analysis
      if (this.config.enableStaticAnalysis) {
        securityViolations = this.performStaticAnalysis(pluginCode)
        if (securityViolations.length > 0) {
          throw new Error(`Security violations detected: ${securityViolations.join(', ')}`)
        }
      }

      // Get or create secure context
      let vmContext = this.contexts.get(pluginId)
      if (!vmContext) {
        vmContext = this.createSecureContext(pluginId)
      }

      // Prepare execution script with deep cloning for security
      const executionScript = `
        (async function() {
          try {
            ${pluginCode}
            
            // Verify plugin structure
            if (typeof plugin !== 'object' || !plugin) {
              throw new Error('Plugin must be an object');
            }
            
            if (typeof plugin.${hookName} !== 'function') {
              throw new Error('Plugin hook ${hookName} must be a function');
            }
            
            // Execute the hook with cloned context
            const contextClone = JSON.parse(JSON.stringify(context));
            
            ${hookName === 'onInit' || hookName === 'onShutdown' 
              ? 'return await plugin.' + hookName + '(contextClone.agentContext);'
              : hookName === 'onSend' 
                ? 'return await plugin.' + hookName + '(contextClone.sendPayload, contextClone.agentContext);'
                : 'return await plugin.' + hookName + '(new Error(contextClone.error.message), contextClone.agentContext);'
            }
          } catch (error) {
            __SECURITY__.recordViolation('Execution error: ' + error.message);
            throw error;
          }
        })()
      `

      // Inject context data safely
      vmContext.context = JSON.parse(JSON.stringify(context))
      vmContext.plugin = null // Will be set by plugin code

      // Execute with timeout and memory monitoring
      result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          withinLimits = false
          reject(new Error(`Execution timeout: ${this.config.timeoutMs}ms exceeded`))
        }, this.config.timeoutMs)
        
        // Use unref() to prevent timeout from keeping process alive
        if (timeout.unref) {
          timeout.unref()
        }

        try {
          const vmResult = vm.runInContext(executionScript, vmContext, {
            timeout: this.config.timeoutMs,
            displayErrors: false
          })

          clearTimeout(timeout)

          // Handle promise result
          if (vmResult && typeof vmResult.then === 'function') {
            vmResult.then(resolve).catch(reject)
          } else {
            resolve(vmResult)
          }
        } catch (error) {
          clearTimeout(timeout)
          reject(error)
        }
      })

      // Check for security violations recorded during execution
      const contextViolations = (vmContext as any).__SECURITY__?.violations || []
      securityViolations.push(...contextViolations)

    } catch (error) {
      securityViolations.push(`Execution failed: ${(error as Error).message}`)
      throw error
    }

    const executionTimeMs = performance.now() - startTime
    const memoryAfter = process.memoryUsage().heapUsed
    const memoryUsageBytes = Math.max(0, memoryAfter - memoryBefore)

    // Check memory limits
    if (memoryUsageBytes > this.config.memoryLimitBytes) {
      withinLimits = false
      securityViolations.push(`Memory limit exceeded: ${memoryUsageBytes} bytes > ${this.config.memoryLimitBytes} bytes`)
    }

    return {
      result,
      executionTimeMs,
      memoryUsageBytes,
      securityViolations,
      withinLimits
    }
  }

  /**
   * Destroy VM context for a plugin
   */
  destroyContext(pluginId: string): void {
    const context = this.contexts.get(pluginId)
    if (context) {
      // For Node 22+, explicitly clear context properties to aid garbage collection
      try {
        const contextObj = context as any
        // Clear all enumerable properties
        Object.keys(contextObj).forEach(key => {
          try {
            delete contextObj[key]
          } catch (err) {
            // Ignore property deletion errors
          }
        })
        
        // Clear any security metadata
        if (contextObj.__SECURITY__) {
          delete contextObj.__SECURITY__
        }
      } catch (err) {
        // Ignore cleanup errors - context will still be removed from map
      }
      
      // Remove from map
      this.contexts.delete(pluginId)
    }
  }

  /**
   * Shutdown the VM runner and clean up all contexts
   */
  shutdown(): void {
    // Get all plugin IDs before clearing
    const pluginIds = Array.from(this.contexts.keys())
    
    // Destroy all contexts
    for (const pluginId of pluginIds) {
      this.destroyContext(pluginId)
    }
    
    // Ensure map is completely clear
    this.contexts.clear()
  }

  /**
   * Get security statistics for all contexts
   */
  getSecurityStats(): {
    activeContexts: number
    totalViolations: number
    memoryUsage: number
  } {
    let totalViolations = 0
    
    // Count violations across all contexts
    for (const [, context] of this.contexts) {
      const violations = (context as any).__SECURITY__?.violations || []
      totalViolations += violations.length
    }

    return {
      activeContexts: this.contexts.size,
      totalViolations,
      memoryUsage: process.memoryUsage().heapUsed
    }
  }

  /**
   * Clean up all contexts
   */
  dispose(): void {
    for (const pluginId of this.contexts.keys()) {
      this.destroyContext(pluginId)
    }
  }
}

/**
 * Singleton VM runner instance
 */
let vmRunnerInstance: VMRunner | null = null

/**
 * Get the global VM runner instance
 */
export function getVMRunner(config?: Partial<VMSecurityConfig>): VMRunner {
  if (!vmRunnerInstance) {
    vmRunnerInstance = new VMRunner(config)
  }
  return vmRunnerInstance
}

/**
 * Create a new isolated VM runner
 */
export function createVMRunner(config?: Partial<VMSecurityConfig>): VMRunner {
  return new VMRunner(config)
}

/**
 * Utility to create deep clone for security isolation
 */
export function secureClone<T>(obj: T): T {
  try {
    return JSON.parse(JSON.stringify(obj))
  } catch (error) {
    throw new Error(`Failed to clone object for security isolation: ${(error as Error).message}`)
  }
}