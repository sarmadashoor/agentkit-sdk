/**
 * Performance helpers for registry tests
 * Provides utilities to create test objects efficiently
 */

import { DummyAgent } from '@agentkit/test-agent'

/**
 * Create a minimal agent metadata object for testing
 */
export function createMinimalAgent(id: string, config?: Record<string, unknown>) {
  return {
    id,
    name: `Agent ${id}`,
    version: '1.0.0',
    description: `Test agent ${id}`,
    factory: () => new DummyAgent(),
    ...(config && { config })
  }
}

/**
 * Create a simple nested config for testing deep freeze behavior
 */
export function createSimpleNestedConfig() {
  return {
    level1: {
      level2: {
        value: 'deep'
      }
    }
  }
}

/**
 * Create minimal array config for testing array freeze behavior
 */
export function createSimpleArrayConfig() {
  return {
    features: ['feature1'],
    nested: [{ setting: 'value1' }]
  }
}

/**
 * Create a minimal circular reference for testing
 */
export function createMinimalCircularConfig() {
  const config = { data: 'test' }
  config.self = config
  return config
}

/**
 * Timer utility for performance testing
 */
export function timeExecution<T>(fn: () => T): { result: T; duration: number } {
  const start = performance.now()
  const result = fn()
  const duration = performance.now() - start
  return { result, duration }
}

/**
 * Assert that an operation completes within a time limit
 */
export function expectWithinTimeLimit<T>(
  operation: () => T, 
  maxMs: number, 
  description?: string
): T {
  const { result, duration } = timeExecution(operation)
  
  if (duration > maxMs) {
    throw new Error(
      `Operation ${description || 'unknown'} took ${duration.toFixed(2)}ms, expected < ${maxMs}ms`
    )
  }
  
  return result
}