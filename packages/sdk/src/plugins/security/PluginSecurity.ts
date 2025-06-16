import type { AgentKitPlugin, PluginHookName, AgentContext, SendPayload } from '@agentkit/types'
import { AgentKitError } from '../../errors'
import { deepClone, isCloneable } from '../../utils/deepClone'
import { debugLog } from '../../log'

/**
 * Plugin Security Manager - Handles argument sanitization and security validation
 */
export class PluginSecurity {
  private debug: boolean

  constructor(debug: boolean = false) {
    this.debug = debug
  }

  /**
   * Create immutable copies of arguments to prevent plugin mutation
   * Uses secure deep cloning with circular reference protection
   */
  createImmutableArgs(
    hookName: PluginHookName, 
    args: [AgentContext] | [SendPayload, AgentContext] | [Error | AgentKitError, AgentContext]
  ): unknown[] {
    switch (hookName) {
      case 'onInit':
      case 'onShutdown':
        // Single context argument
        return [this.secureClone(args[0])]
        
      case 'onSend':
        // Payload and context arguments
        return [this.secureClone(args[0]), this.secureClone(args[1])]
        
      case 'onError':
        // Error and context arguments
        // Note: We don't deep clone the error to preserve stack trace and Error object integrity
        const error = args[0]
        const context = this.secureClone(args[1])
        return [error, context]
        
      default:
        // Type-safe fallback that shouldn't be reached with proper typing
        return args.map((arg: unknown) => this.secureClone(arg))
    }
  }

  /**
   * Securely clone data with validation and circular reference protection
   */
  secureClone<T>(obj: T): T {
    // Check if the object is cloneable first
    if (!isCloneable(obj)) {
      debugLog.warn('Attempted to clone non-cloneable object', {
        type: typeof obj,
        constructor: obj?.constructor?.name
      }, this.debug)
      
      // Return a safe fallback for non-cloneable objects
      if (obj === null || typeof obj !== 'object') {
        return obj
      }
      
      // For objects, return a shallow copy of enumerable properties
      return { ...obj } as T
    }
    
    try {
      return deepClone(obj)
    } catch (error) {
      debugLog.error('Deep clone failed, falling back to shallow copy', error as Error, this.debug)
      
      // Safe fallback
      if (obj === null || typeof obj !== 'object') {
        return obj
      }
      
      if (Array.isArray(obj)) {
        return [...obj] as T
      }
      
      return { ...obj } as T
    }
  }

  /**
   * Strip dangerous functions from arguments for security
   */
  stripFunctions(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }
    
    if (typeof obj === 'function') {
      return undefined // Remove functions entirely
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.stripFunctions(item))
    }
    
    const stripped: any = {}
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'function') {
        continue // Skip functions
      }
      stripped[key] = this.stripFunctions(value)
    }
    
    return stripped
  }

  /**
   * Sanitize arguments for sandbox execution
   */
  sanitizeArgumentsForSandbox(args: unknown[]): unknown[] {
    return args.map(arg => this.stripFunctions(this.secureClone(arg)))
  }

  /**
   * Validate plugin object for security violations
   */
  validatePluginSecurity(plugin: AgentKitPlugin): { valid: boolean; violations: string[] } {
    const violations: string[] = []

    // Check for suspicious properties
    const suspiciousProperties = [
      'constructor', '__proto__', 'prototype', 'eval', 'Function',
      'require', 'process', 'global', 'globalThis', 'module', 'exports'
    ]

    for (const prop of suspiciousProperties) {
      if (prop in plugin && (plugin as any)[prop] !== undefined) {
        violations.push(`Plugin contains suspicious property: ${prop}`)
      }
    }

    // Check hook functions for suspicious patterns
    const hooks: PluginHookName[] = ['onInit', 'onSend', 'onError', 'onShutdown']
    for (const hookName of hooks) {
      const hook = (plugin as any)[hookName]
      if (typeof hook === 'function') {
        const hookSource = hook.toString()
        
        // Check for dangerous patterns in function source
        const dangerousPatterns = [
          /\beval\s*\(/,
          /\bFunction\s*\(/,
          /\brequire\s*\(/,
          /\bprocess\./,
          /\bglobal\./,
          /\bglobalThis\./,
          /\b__proto__\./,
          /\bconstructor\./,
          /\bprototype\./
        ]

        for (const pattern of dangerousPatterns) {
          if (pattern.test(hookSource)) {
            violations.push(`Hook ${hookName} contains potentially dangerous pattern: ${pattern.source}`)
          }
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations
    }
  }

  /**
   * Check if error indicates sandbox escape attempt
   */
  isSandboxEscapeAttempt(error: Error, platform: 'node' | 'browser' = 'node'): boolean {
    if (platform === 'node') {
      // Node.js sandbox escape patterns
      const nodeEscapePattern = /(\bglobal\b|\bprocess\b|\brequire\b|\bmodule\b|\bexports\b|constructor|prototype|__proto__|Function)/i
      return nodeEscapePattern.test(error.message) || 
             error.message.includes('is not defined') ||
             error.message.includes('is not a function') ||
             error.message.includes('Cannot read properties of undefined') ||
             error.message.includes('Cannot set properties of undefined') ||
             error.message.includes('Cannot access before initialization')
    } else {
      // Browser sandbox escape patterns
      const browserEscapePattern = /(\bdocument\b|\bwindow\b|\blocation\b|\bnavigator\b|\bhistory\b|is not defined|is not a function)/i
      return browserEscapePattern.test(error.message)
    }
  }

  /**
   * Create security report for plugin
   */
  createSecurityReport(plugin: AgentKitPlugin): {
    pluginName: string
    securityLevel: 'safe' | 'warning' | 'dangerous'
    violations: string[]
    recommendations: string[]
  } {
    const validation = this.validatePluginSecurity(plugin)
    
    let securityLevel: 'safe' | 'warning' | 'dangerous' = 'safe'
    const recommendations: string[] = []

    if (validation.violations.length > 0) {
      // Categorize violations by severity
      const dangerousPatterns = validation.violations.filter(v => 
        v.includes('eval') || v.includes('Function') || v.includes('require') || v.includes('process')
      )
      
      if (dangerousPatterns.length > 0) {
        securityLevel = 'dangerous'
        recommendations.push('Remove dangerous code patterns from plugin')
        recommendations.push('Use only safe APIs provided by AgentKit')
      } else {
        securityLevel = 'warning'
        recommendations.push('Review suspicious patterns in plugin code')
      }
    }

    // Add general security recommendations
    if (securityLevel === 'safe') {
      recommendations.push('Plugin appears secure for sandboxed execution')
    }

    return {
      pluginName: plugin.name,
      securityLevel,
      violations: validation.violations,
      recommendations
    }
  }
}