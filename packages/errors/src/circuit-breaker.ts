/**
 * Circuit breaker related error classes
 */

import { AgentKitError, type AgentKitErrorOptions } from './base'

/**
 * Error thrown when circuit breaker is in open state
 */
export class CircuitBreakerError extends AgentKitError {
  readonly code = 'CIRCUIT_BREAKER_OPEN' as const
  readonly category = 'resource' as const

  constructor(circuitName: string, options?: AgentKitErrorOptions) {
    super(`Circuit breaker "${circuitName}" is open - requests are being blocked`, options)
  }
}

/**
 * Error thrown when circuit breaker configuration is invalid
 */
export class CircuitBreakerConfigError extends AgentKitError {
  readonly code = 'CIRCUIT_BREAKER_CONFIG_INVALID' as const
  readonly category = 'config' as const

  constructor(parameter: string, reason: string, options?: AgentKitErrorOptions) {
    super(`Circuit breaker configuration error: ${parameter} ${reason}`, options)
  }
}

/**
 * Error thrown when circuit breaker state transition fails
 */
export class CircuitBreakerStateError extends AgentKitError {
  readonly code = 'CIRCUIT_BREAKER_STATE_ERROR' as const
  readonly category = 'internal' as const

  constructor(circuitName: string, fromState: string, toState: string, reason: string, options?: AgentKitErrorOptions) {
    super(`Circuit breaker "${circuitName}" failed to transition from ${fromState} to ${toState}: ${reason}`, options)
  }
}

/**
 * Error thrown when circuit breaker operation times out
 */
export class CircuitBreakerTimeoutError extends AgentKitError {
  readonly code = 'CIRCUIT_BREAKER_TIMEOUT' as const
  readonly category = 'resource' as const

  constructor(circuitName: string, timeoutMs: number, options?: AgentKitErrorOptions) {
    super(`Circuit breaker "${circuitName}" operation timed out after ${timeoutMs}ms`, options)
  }
}