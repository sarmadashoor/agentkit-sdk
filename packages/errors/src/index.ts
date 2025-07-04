/**
 * AgentKit SDK Unified Error System
 * 
 * Provides a comprehensive, structured error hierarchy for consistent error handling
 * across the AgentKit SDK ecosystem. All errors extend the base AgentKitError class
 * and include contextual information for debugging and error recovery.
 * 
 * @example Basic error handling:
 * ```typescript
 * import { connectAgent, AgentNotFoundError, TransportError } from '@agentkit/sdk'
 * 
 * try {
 *   const handle = await connectAgent({
 *     agent: 'nonexistent-agent',
 *     transport: 'dummy'
 *   })
 * } catch (error) {
 *   if (error instanceof AgentNotFoundError) {
 *     console.log('Agent not found:', error.agentId)
 *     console.log('Available agents:', error.context?.availableAgents)
 *   } else if (error instanceof TransportError) {
 *     console.log('Transport error:', error.message)
 *   }
 * }
 * ```
 * 
 * @example Error serialization for logging:
 * ```typescript
 * import { isAgentKitError } from '@agentkit/errors'
 * 
 * try {
 *   // SDK operation
 * } catch (error) {
 *   if (isAgentKitError(error)) {
 *     console.log('Structured error:', JSON.stringify(error.toJSON(), null, 2))
 *   }
 * }
 * ```
 * 
 * @packageDocumentation
 * @category Errors
 */

// Base error system
export {
  AgentKitError,
  fromJSON,
  isAgentKitError,
  getErrorMessage,
  wrapError,
  type ErrorCategory,
  type ErrorCode,
  type ErrorContext,
  type SerializedError,
  type AgentKitErrorOptions
} from './base'

// Import for internal use
import { AgentKitError, isAgentKitError } from './base'
import { AgentNotFoundError as _AgentNotFoundError } from './registry'
import { NetworkError as _NetworkError, RequestTimeoutError as _RequestTimeoutError } from './transport'
import { InvalidInputError as _InvalidInputError } from './validation'
import { InvalidConfigurationError as _InvalidConfigurationError } from './sdk'

// SDK errors
export {
  AgentInitError,
  AgentAlreadyInitializedError,
  AgentNotInitializedError,
  AgentHandleError,
  AgentShutdownError,
  LifecycleHookError,
  InvalidConfigurationError,
  MissingRequiredConfigError,
  ResourceExhaustedError,
  QueueFullError,
  MaxRetriesExceededError
} from './sdk'

// Registry errors
export {
  AgentNotFoundError,
  TransportNotFoundError,
  DuplicateAgentIdError,
  DuplicateTransportIdError,
  RegistryValidationError,
  RegistryCleanupError,
  AgentMetadataValidationError,
  TransportMetadataValidationError,
  AgentCompatibilityError,
  RegistryCapacityError
} from './registry'

// Transport errors
export {
  TransportInitError,
  TransportSendError,
  TransportReceiveError,
  NetworkError,
  RequestTimeoutError,
  ConnectionFailedError,
  HttpError,
  CorsError,
  SerializationError,
  RateLimitError,
  PayloadTooLargeError,
  AuthenticationError,
  AuthorizationError,
  InvalidApiKeyError,
  TokenExpiredError,
  TransportBackpressureError
} from './transport'

// Validation errors and helpers
export {
  InvalidInputError,
  SchemaValidationError,
  TypeMismatchError,
  RequiredFieldMissingError,
  ValidationHelpers
} from './validation'

// Plugin errors
export {
  PluginValidationError,
  PluginCompatibilityError,
  PluginHookError,
  PluginRegistrationError,
  PluginTimeoutError,
  PluginSignatureError,
  PluginSignatureVerificationError,
  RecursivePluginCallError,
  PluginSandboxError,
  PluginVerificationError,
  UntrustedPluginError,
  ExpiredSignatureError,
  MissingSignatureError
} from './plugin'

// Circuit breaker errors
export {
  CircuitBreakerError,
  CircuitBreakerConfigError,
  CircuitBreakerStateError,
  CircuitBreakerTimeoutError
} from './circuit-breaker'

/**
 * Error factory functions for common scenarios
 */
export class ErrorFactory {
  /**
   * Create an agent not found error with context
   */
  static agentNotFound(agentId: string, registryType?: string) {
    return new _AgentNotFoundError(agentId, {
      context: { agentId, registryType }
    })
  }

  /**
   * Create a network error with retry information
   */
  static networkError(message: string, isRetryable: boolean = true) {
    return new _NetworkError(message, {
      context: { isRetryable }
    })
  }

  /**
   * Create a timeout error with duration context
   */
  static timeout(operation: string, timeoutMs: number) {
    return new _RequestTimeoutError(timeoutMs, {
      context: { operation }
    })
  }

  /**
   * Create a validation error from unknown input
   */
  static validation(field: string, value: unknown, reason: string) {
    return new _InvalidInputError(field, reason, {
      context: { value, valueType: typeof value }
    })
  }

  /**
   * Create a configuration error with helpful context
   */
  static config(message: string, configKey?: string, suggestedValue?: unknown) {
    return new _InvalidConfigurationError(message, {
      context: { configKey, suggestedValue }
    })
  }
}

/**
 * Error type guards for specific error categories
 */
export class ErrorTypeGuards {
  /**
   * Check if error is retryable
   */
  static isRetryable(error: unknown): boolean {
    if (isAgentKitError(error)) {
      return error.isRetryable()
    }
    return false
  }

  /**
   * Check if error is a client error
   */
  static isClientError(error: unknown): boolean {
    if (isAgentKitError(error)) {
      return error.isClientError()
    }
    return false
  }

  /**
   * Check if error is a network error
   */
  static isNetworkError(error: unknown): boolean {
    return isAgentKitError(error) && (error as AgentKitError).category === 'network'
  }

  /**
   * Check if error is a validation error
   */
  static isValidationError(error: unknown): boolean {
    return isAgentKitError(error) && (error as AgentKitError).category === 'validation'
  }

  /**
   * Check if error is a configuration error
   */
  static isConfigError(error: unknown): boolean {
    return isAgentKitError(error) && (error as AgentKitError).category === 'config'
  }

  /**
   * Check if error indicates authentication failure
   */
  static isAuthError(error: unknown): boolean {
    return isAgentKitError(error) && (error as AgentKitError).category === 'authentication'
  }

  /**
   * Check if error is a plugin error
   */
  static isPluginError(error: unknown): boolean {
    return isAgentKitError(error) && (error as AgentKitError).category === 'plugin'
  }

  /**
   * Check if error is a resource exhaustion error
   */
  static isResourceError(error: unknown): boolean {
    return isAgentKitError(error) && (error as AgentKitError).category === 'resource'
  }

  /**
   * Check if error is an internal SDK error
   */
  static isInternalError(error: unknown): boolean {
    return isAgentKitError(error) && (error as AgentKitError).category === 'internal'
  }
}

/**
 * Import specific error classes for re-export
 */
import {
  AgentNotFoundError,
  TransportNotFoundError,
  DuplicateAgentIdError,
  DuplicateTransportIdError,
  RegistryValidationError,
  RegistryCleanupError,
  AgentMetadataValidationError,
  TransportMetadataValidationError,
  AgentCompatibilityError,
  RegistryCapacityError
} from './registry'

import {
  TransportInitError,
  TransportSendError,
  TransportReceiveError,
  NetworkError,
  RequestTimeoutError,
  ConnectionFailedError,
  HttpError,
  CorsError,
  SerializationError,
  RateLimitError,
  PayloadTooLargeError,
  AuthenticationError,
  AuthorizationError,
  InvalidApiKeyError,
  TokenExpiredError
} from './transport'

import {
  InvalidInputError,
  SchemaValidationError,
  TypeMismatchError,
  RequiredFieldMissingError,
  ValidationHelpers
} from './validation'