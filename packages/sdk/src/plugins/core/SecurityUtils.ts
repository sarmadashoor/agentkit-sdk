/**
 * Security Utils - Data Security and Cloning
 * 
 * Provides utilities for secure data handling, cloning, and sanitization
 * for plugin execution environments.
 */

import { debugLog } from '../../log'
import { deepClone, isCloneable } from '../../utils/deepClone'

export interface SecurityOptions {
  maxDepth?: number
  maxSize?: number
  allowCircularRefs?: boolean
  debug?: boolean
}

export interface CloneResult {
  success: boolean
  data?: any
  error?: string
  warnings?: string[]
}

/**
 * Security utilities for safe data handling in plugin contexts
 */
export class SecurityUtils {
  private options: Required<SecurityOptions>

  constructor(options: SecurityOptions = {}) {
    this.options = {
      maxDepth: options.maxDepth ?? 10,
      maxSize: options.maxSize ?? 1024 * 1024, // 1MB
      allowCircularRefs: options.allowCircularRefs ?? false,
      debug: options.debug ?? false
    }
  }

  /**
   * Create immutable arguments for plugin execution
   */
  createImmutableArgs(...args: any[]): CloneResult {
    try {
      const clonedArgs = args.map(arg => this.safeClone(arg))
      const immutableArgs = clonedArgs.map(arg => this.deepFreeze(arg.data))

      return {
        success: true,
        data: immutableArgs,
        warnings: clonedArgs.flatMap(result => result.warnings || [])
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Safely clone data with security constraints
   */
  safeClone(data: any): CloneResult {
    const warnings: string[] = []

    try {
      // Check if data is cloneable
      if (!isCloneable(data)) {
        return {
          success: false,
          error: 'Data is not cloneable (contains functions, symbols, or other non-serializable types)'
        }
      }

      // Check data size
      const dataSize = this.estimateSize(data)
      if (dataSize > this.options.maxSize) {
        return {
          success: false,
          error: `Data size (${dataSize} bytes) exceeds maximum allowed size (${this.options.maxSize} bytes)`
        }
      }

      // Perform safe deep clone
      const cloned = this.performSafeClone(data, 0, new WeakMap())

      return {
        success: true,
        data: cloned,
        warnings
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Perform safe deep clone with circular reference detection
   */
  private performSafeClone(obj: any, depth: number = 0, seen: WeakMap<object, any>): any {
    // Check maximum depth
    if (depth > this.options.maxDepth) {
      throw new Error(`Maximum cloning depth (${this.options.maxDepth}) exceeded`)
    }

    // Handle primitives
    if (obj === null || typeof obj !== 'object') {
      return obj
    }

    // Handle circular references
    if (seen.has(obj)) {
      if (this.options.allowCircularRefs) {
        return seen.get(obj)
      } else {
        throw new Error('Circular reference detected')
      }
    }

    // Handle built-in types
    if (obj instanceof Date) {
      return new Date(obj.getTime())
    }

    if (obj instanceof RegExp) {
      return new RegExp(obj.source, obj.flags)
    }

    if (obj instanceof Map) {
      const clonedMap = new Map()
      seen.set(obj, clonedMap)
      for (const [key, value] of obj) {
        clonedMap.set(
          this.performSafeClone(key, depth + 1, seen),
          this.performSafeClone(value, depth + 1, seen)
        )
      }
      return clonedMap
    }

    if (obj instanceof Set) {
      const clonedSet = new Set()
      seen.set(obj, clonedSet)
      for (const value of obj) {
        clonedSet.add(this.performSafeClone(value, depth + 1, seen))
      }
      return clonedSet
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      const clonedArray: any[] = []
      seen.set(obj, clonedArray)
      for (let i = 0; i < obj.length; i++) {
        clonedArray[i] = this.performSafeClone(obj[i], depth + 1, seen)
      }
      return clonedArray
    }

    // Handle plain objects
    if (obj.constructor === Object || obj.constructor === undefined) {
      const clonedObj: any = {}
      seen.set(obj, clonedObj)
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          clonedObj[key] = this.performSafeClone(obj[key], depth + 1, seen)
        }
      }
      return clonedObj
    }

    // For other object types, try to use structured cloning if available
    if (typeof structuredClone !== 'undefined') {
      try {
        return structuredClone(obj)
      } catch (error) {
        // Fall back to JSON cloning
      }
    }

    // Fall back to JSON cloning (lossy but safe)
    try {
      return JSON.parse(JSON.stringify(obj))
    } catch (error) {
      throw new Error(`Unable to clone object of type ${obj.constructor?.name || 'unknown'}`)
    }
  }

  /**
   * Deep freeze an object to make it immutable
   */
  deepFreeze(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }

    try {
      // Freeze the object itself
      Object.freeze(obj)

      // Recursively freeze all properties
      Object.getOwnPropertyNames(obj).forEach(prop => {
        try {
          const value = obj[prop]
          if (value && typeof value === 'object') {
            this.deepFreeze(value)
          }
        } catch (error) {
          // Continue with other properties if one fails
          if (this.options.debug) {
            debugLog.warn('property freeze failed', error as Error, this.options.debug)
          }
        }
      })

      return obj
    } catch (error) {
      if (this.options.debug) {
        debugLog.warn('object freeze failed', error as Error, this.options.debug)
      }
      return obj
    }
  }

  /**
   * Estimate the size of an object in bytes
   */
  private estimateSize(obj: any, visited = new WeakSet()): number {
    if (obj === null || obj === undefined) {
      return 8 // Approximate size for null/undefined
    }

    if (typeof obj === 'boolean') {
      return 4
    }

    if (typeof obj === 'number') {
      return 8
    }

    if (typeof obj === 'string') {
      return obj.length * 2 // Approximate for UTF-16
    }

    if (typeof obj === 'function') {
      return obj.toString().length * 2
    }

    if (typeof obj !== 'object') {
      return 8 // Default size for other primitives
    }

    // Handle circular references
    if (visited.has(obj)) {
      return 0
    }
    visited.add(obj)

    let size = 0

    if (Array.isArray(obj)) {
      size += 8 // Array overhead
      for (const item of obj) {
        size += this.estimateSize(item, visited)
      }
    } else {
      size += 8 // Object overhead
      for (const [key, value] of Object.entries(obj)) {
        size += key.length * 2 // Key size
        size += this.estimateSize(value, visited)
      }
    }

    return size
  }

  /**
   * Sanitize data for plugin execution
   */
  sanitizeData(data: any): CloneResult {
    try {
      const sanitized = this.performSanitization(data)
      return {
        success: true,
        data: sanitized
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Perform data sanitization
   */
  private performSanitization(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }

    // Remove dangerous properties
    const dangerous = ['__proto__', 'constructor', 'prototype']
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.performSanitization(item))
    }

    const sanitized: any = {}
    for (const [key, value] of Object.entries(obj)) {
      if (!dangerous.includes(key)) {
        sanitized[key] = this.performSanitization(value)
      }
    }

    return sanitized
  }

  /**
   * Validate data security
   */
  validateDataSecurity(data: any): { secure: boolean; issues: string[] } {
    const issues: string[] = []

    try {
      this.checkForSecurityIssues(data, issues, new WeakSet())
    } catch (error) {
      issues.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`)
    }

    return {
      secure: issues.length === 0,
      issues
    }
  }

  /**
   * Check for security issues in data
   */
  private checkForSecurityIssues(obj: any, issues: string[], visited: WeakSet<object>): void {
    if (obj === null || typeof obj !== 'object') {
      return
    }

    // Handle circular references
    if (visited.has(obj)) {
      issues.push('Circular reference detected')
      return
    }
    visited.add(obj)

    // Check for dangerous properties
    const dangerous = ['__proto__', 'constructor', 'prototype']
    for (const prop of dangerous) {
      if (prop in obj) {
        issues.push(`Dangerous property detected: ${prop}`)
      }
    }

    // Check for functions
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'function') {
        issues.push(`Function property detected: ${key}`)
      } else if (value && typeof value === 'object') {
        this.checkForSecurityIssues(value, issues, visited)
      }
    }
  }

  /**
   * Get security configuration
   */
  getConfiguration(): Required<SecurityOptions> {
    return { ...this.options }
  }

  /**
   * Update security configuration
   */
  updateConfiguration(options: Partial<SecurityOptions>): void {
    this.options = { ...this.options, ...options }
    
    debugLog.lifecycle('security configuration updated', 'SecurityUtils', {
      newOptions: options
    }, this.options.debug)
  }
}