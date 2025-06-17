/**
 * Deep freeze utility for registry immutability
 * Recursively freezes objects to prevent runtime mutations
 */

/**
 * Deep freeze an object to make it immutable
 * Recursively freezes all properties to prevent mutations
 * Handles circular references by tracking visited objects
 */
export function deepFreeze<T extends object>(obj: T, visited = new WeakSet()): Readonly<T> {
  // Avoid infinite recursion with circular references
  if (visited.has(obj)) {
    return obj as Readonly<T>
  }
  visited.add(obj)
  
  // Retrieve the property names defined on obj
  Object.getOwnPropertyNames(obj).forEach(prop => {
    const value = (obj as Record<string, unknown>)[prop]
    
    // Freeze properties that are objects, 
    // unless they're already frozen
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value, visited)
    }
  })
  
  // Freeze self
  return Object.freeze(obj)
}

/**
 * Create a deep copy of an object with circular reference handling
 */
function deepCopy<T>(obj: T, visited = new WeakMap()): T {
  // Handle primitives
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  
  // Handle circular references
  if (visited.has(obj as object)) {
    return visited.get(obj as object)
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    const copy: unknown[] = []
    visited.set(obj as object, copy)
    for (let i = 0; i < obj.length; i++) {
      copy[i] = deepCopy(obj[i], visited)
    }
    return copy as T
  }
  
  // Handle objects
  const copy: Record<string, unknown> = {}
  visited.set(obj as object, copy)
  
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      copy[key] = deepCopy((obj as Record<string, unknown>)[key], visited)
    }
  }
  
  return copy as T
}

/**
 * Create a deeply frozen copy of an object
 * Useful when you want to preserve the original object
 */
export function createFrozenCopy<T extends object>(obj: T): Readonly<T> {
  // Create a deep copy first to avoid mutating the original
  const copy = deepCopy(obj)
  return deepFreeze(copy)
}

/**
 * Check if an object is deeply frozen
 */
export function isDeeplyFrozen(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null || !Object.isFrozen(obj)) {
    return false
  }
  
  // Check all properties recursively
  for (const prop of Object.getOwnPropertyNames(obj)) {
    const value = (obj as Record<string, unknown>)[prop]
    if (value && typeof value === 'object' && !isDeeplyFrozen(value)) {
      return false
    }
  }
  
  return true
}