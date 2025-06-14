/**
 * SDK-specific error classes for AgentKit core functionality
 */

import { AgentKitError, AgentKitErrorOptions, ErrorCode, ErrorCategory } from './base'

/**
 * Base class for all SDK-related errors
 */
abstract class SDKError extends AgentKitError {
  abstract readonly code: ErrorCode
  abstract readonly category: ErrorCategory
}

/**
 * Agent initialization errors
 */
export class AgentInitError extends SDKError {
  readonly code = 'AGENT_INIT_FAILED' as const
  readonly category = 'config' as const

  constructor(message: string, options?: AgentKitErrorOptions) {
    super(message, options)
  }
}

/**
 * Agent already initialized error
 */
export class AgentAlreadyInitializedError extends SDKError {
  readonly code = 'AGENT_ALREADY_INITIALIZED' as const
  readonly category = 'client' as const

  constructor(message: string = 'Agent is already initialized', options?: AgentKitErrorOptions) {
    super(message, options)
  }
}

/**
 * Agent not initialized error
 */
export class AgentNotInitializedError extends SDKError {
  readonly code = 'AGENT_NOT_INITIALIZED' as const
  readonly category = 'client' as const

  constructor(message: string = 'Agent is not initialized. Call initialize() first.', options?: AgentKitErrorOptions) {
    super(message, options)
  }
}

/**
 * Agent handle operation errors
 */
export class AgentHandleError extends SDKError {
  readonly code = 'AGENT_HANDLE_FAILED' as const
  readonly category = 'server' as const

  constructor(message: string, options?: AgentKitErrorOptions) {
    super(message, options)
  }
}

/**
 * Agent shutdown errors
 */
export class AgentShutdownError extends SDKError {
  readonly code = 'AGENT_SHUTDOWN_FAILED' as const
  readonly category = 'internal' as const

  constructor(message: string, options?: AgentKitErrorOptions) {
    super(message, options)
  }
}

/**
 * Lifecycle hook execution errors
 */
export class LifecycleHookError extends SDKError {
  readonly code = 'LIFECYCLE_HOOK_FAILED' as const
  readonly category = 'client' as const

  constructor(hookName: string, message: string, options?: AgentKitErrorOptions) {
    super(`Lifecycle hook '${hookName}' failed: ${message}`, options)
  }
}

/**
 * Invalid configuration errors
 */
export class InvalidConfigurationError extends SDKError {
  readonly code = 'INVALID_CONFIGURATION' as const
  readonly category = 'config' as const

  constructor(message: string, options?: AgentKitErrorOptions) {
    super(message, options)
  }
}

/**
 * Missing required configuration errors
 */
export class MissingRequiredConfigError extends SDKError {
  readonly code = 'MISSING_REQUIRED_CONFIG' as const
  readonly category = 'config' as const

  constructor(configKey: string, options?: AgentKitErrorOptions) {
    super(`Required configuration missing: ${configKey}`, options)
  }
}

/**
 * Resource exhaustion errors
 */
export class ResourceExhaustedError extends SDKError {
  readonly code = 'RESOURCE_EXHAUSTED' as const
  readonly category = 'resource' as const

  constructor(resource: string, options?: AgentKitErrorOptions) {
    super(`Resource exhausted: ${resource}`, options)
  }
}

/**
 * Queue full errors
 */
export class QueueFullError extends SDKError {
  readonly code = 'QUEUE_FULL' as const
  readonly category = 'resource' as const

  constructor(queueName: string = 'operation queue', options?: AgentKitErrorOptions) {
    super(`Queue is full: ${queueName}`, options)
  }
}

/**
 * Max retries exceeded errors
 */
export class MaxRetriesExceededError extends SDKError {
  readonly code = 'MAX_RETRIES_EXCEEDED' as const
  readonly category = 'resource' as const

  constructor(maxRetries: number, operation: string, options?: AgentKitErrorOptions) {
    super(`Maximum retries (${maxRetries}) exceeded for operation: ${operation}`, options)
  }
}