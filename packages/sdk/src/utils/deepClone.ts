/**
 * Deep clone utility with circular reference handling
 * Uses structuredClone when available (modern browsers/Node 17+)
 * Falls back to JSON parse/stringify with circular reference detection
 */

/**
 * Check if structuredClone is available
 */
function hasStructuredClone(): boolean {
  return typeof globalThis !== 'undefined' && 
         typeof globalThis.structuredClone === 'function'
}

/**
 * Deep clone with circular reference handling
 */
function jsonCloneWithCircularHandling<T>(obj: T): T {
  const seen = new WeakSet()
  
  const stringify = (value: any): string => {
    return JSON.stringify(value, (key, val) => {
      if (val !== null && typeof val === 'object') {
        if (seen.has(val)) {
          return '[Circular Reference]'
        }
        seen.add(val)
      }
      return val
    })
  }
  
  const json = stringify(obj)
  return JSON.parse(json)
}

/**
 * Deep clone an object, handling circular references
 * Uses the most performant method available in the environment
 */
export function deepClone<T>(obj: T): T {
  // Handle primitives and null
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  
  // Use structuredClone if available (most performant)
  if (hasStructuredClone()) {
    try {
      return globalThis.structuredClone(obj)
    } catch (e) {
      // Fall back if structuredClone fails (e.g., functions, symbols)
      // This can happen with certain non-cloneable values
    }
  }
  
  // Fallback to JSON with circular handling
  try {
    return jsonCloneWithCircularHandling(obj)
  } catch (e) {
    // Last resort: return a defensive copy of enumerable properties
    if (Array.isArray(obj)) {
      return [...obj] as T
    }
    return { ...obj } as T
  }
}

/**
 * Check if a value can be safely cloned
 */
export function isCloneable(value: unknown): boolean {
  if (value === null || value === undefined) return true
  
  const type = typeof value
  if (type === 'boolean' || type === 'number' || type === 'string') return true
  
  if (type === 'object') {
    // Check for non-cloneable types
    if (value instanceof Promise) return false
    if (value instanceof WeakMap || value instanceof WeakSet) return false
    if (typeof (value as any).then === 'function') return false // Thenable
    
    return true
  }
  
  return false
}

/**
 * Deep freeze an object to make it immutable
 */
export function deepFreeze<T extends object>(obj: T): Readonly<T> {
  // Retrieve the property names defined on obj
  Object.getOwnPropertyNames(obj).forEach(prop => {
    const value = (obj as any)[prop]
    
    // Freeze properties that are objects, 
    // unless they're already frozen
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value)
    }
  })
  
  // Freeze self
  return Object.freeze(obj)
}