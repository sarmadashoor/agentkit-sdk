/**
 * AgentKit SDK Error System
 * Re-exports from the unified @agentkit/errors package while maintaining
 * backward compatibility for existing SDK consumers.
 */

// Re-export the unified error system
export {
  // Base error classes and utilities
  AgentKitError,
  isAgentKitError,
  getErrorMessage,
  wrapError,
  type ErrorCategory,
  type ErrorCode,
  type ErrorContext,
  type SerializedError,
  
  // SDK-specific errors
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
  MaxRetriesExceededError,

  // Transport errors
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

  // Registry errors
  AgentNotFoundError,
  TransportNotFoundError,
  DuplicateAgentIdError,
  DuplicateTransportIdError,
  RegistryValidationError,
  RegistryCleanupError,
  AgentMetadataValidationError,
  TransportMetadataValidationError,
  AgentCompatibilityError,
  RegistryCapacityError,

  // Validation errors
  InvalidInputError,
  SchemaValidationError,
  TypeMismatchError,
  RequiredFieldMissingError,
  ValidationHelpers,

  // Plugin errors
  PluginValidationError,
  PluginHookError,
  PluginRegistrationError,
  PluginTimeoutError,
  PluginSignatureError,

  // Circuit breaker errors
  CircuitBreakerError,
  CircuitBreakerConfigError,
  CircuitBreakerStateError,
  CircuitBreakerTimeoutError,

  // Utility classes
  ErrorFactory,
  ErrorTypeGuards
} from '@agentkit/errors'

// Legacy error classes for backward compatibility
// These aliases will be deprecated in a future version
import { 
  InvalidInputError as _ValidationError,
  AgentCompatibilityError as _CompatibilityError,
  InvalidInputError as _ScopeError
} from '@agentkit/errors'

/**
 * @deprecated Use InvalidInputError from @agentkit/errors instead
 */
export const ValidationError = _ValidationError

/**
 * @deprecated Use AgentCompatibilityError from @agentkit/errors instead
 */
export const CompatibilityError = _CompatibilityError

/**
 * @deprecated Use InvalidInputError from @agentkit/errors instead
 */
export const ScopeError = _ScopeError

/**
 * @deprecated Use the unified error serialization from @agentkit/errors instead
 */
export function createSafeError(error: unknown): Record<string, unknown> {
  if (error && typeof error === 'object' && 'toJSON' in error) {
    const toJSONMethod = (error as Record<string, unknown>).toJSON
    if (typeof toJSONMethod === 'function') {
      try {
        const result = toJSONMethod.call(error)
        return typeof result === 'object' && result !== null ? result as Record<string, unknown> : {}
      } catch {
        // Fall through to error handling below
      }
    }
  }
  
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    }
  }

  return {
    name: 'UnknownError',
    message: error ? String(error) : 'Unknown error occurred',
    error: String(error)
  }
}