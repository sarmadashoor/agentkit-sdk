/**
 * AgentKit SDK Unified Error System
 * 
 * Inspired by Stripe's error handling patterns, this provides a comprehensive,
 * type-safe error hierarchy for the AgentKit SDK.
 */

/**
 * Error categories for classification and handling
 */
export type ErrorCategory = 
  | 'client'        // Client-side errors (invalid input, configuration)
  | 'server'        // Server-side errors (API errors, service unavailable) 
  | 'network'       // Network-related errors (timeout, connection failed)
  | 'config'        // Configuration and initialization errors
  | 'validation'    // Input validation and schema errors
  | 'authentication' // Auth and permission errors
  | 'resource'      // Resource management errors (quota, limits)
  | 'plugin'        // Plugin-related errors (hooks, validation)
  | 'security'      // Security-related errors (recursive calls, sandboxing)
  | 'internal'      // Internal SDK errors (bugs, unexpected states)

/**
 * Typed error codes for programmatic error handling
 */
export type ErrorCode = 
  // Configuration & Initialization
  | 'AGENT_INIT_FAILED'
  | 'AGENT_ALREADY_INITIALIZED'
  | 'AGENT_NOT_INITIALIZED'
  | 'TRANSPORT_INIT_FAILED'
  | 'INVALID_CONFIGURATION'
  | 'MISSING_REQUIRED_CONFIG'
  
  // Registry Errors
  | 'AGENT_NOT_FOUND'
  | 'TRANSPORT_NOT_FOUND'
  | 'DUPLICATE_AGENT_ID'
  | 'DUPLICATE_TRANSPORT_ID'
  | 'REGISTRY_VALIDATION_FAILED'
  | 'REGISTRY_CLEANUP_FAILED'
  
  // Runtime Errors  
  | 'AGENT_HANDLE_FAILED'
  | 'AGENT_SHUTDOWN_FAILED'
  | 'TRANSPORT_SEND_FAILED'
  | 'TRANSPORT_RECEIVE_FAILED'
  | 'LIFECYCLE_HOOK_FAILED'
  
  // Network & Transport
  | 'NETWORK_ERROR'
  | 'REQUEST_TIMEOUT'
  | 'CONNECTION_FAILED'
  | 'HTTP_ERROR'
  | 'CORS_ERROR'
  | 'SERIALIZATION_FAILED'
  | 'TRANSPORT_BACKPRESSURE'
  
  // Resource Management
  | 'RESOURCE_EXHAUSTED'
  | 'QUEUE_FULL'
  | 'MAX_RETRIES_EXCEEDED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'PAYLOAD_TOO_LARGE'
  
  // Validation
  | 'INVALID_INPUT'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'TYPE_MISMATCH'
  | 'REQUIRED_FIELD_MISSING'
  
  // Authentication & Authorization
  | 'AUTHENTICATION_FAILED'
  | 'AUTHORIZATION_FAILED' 
  | 'INVALID_API_KEY'
  | 'TOKEN_EXPIRED'
  
  // Plugin System
  | 'PLUGIN_VALIDATION_FAILED'
  | 'PLUGIN_COMPATIBILITY_FAILED'
  | 'PLUGIN_HOOK_FAILED'
  | 'PLUGIN_REGISTRATION_FAILED'
  | 'PLUGIN_TIMEOUT'
  | 'PLUGIN_INVALID_SIGNATURE'
  | 'PLUGIN_SIGNATURE_VERIFICATION_FAILED'
  | 'PLUGIN_RECURSIVE_CALL'
  | 'PLUGIN_SANDBOX_VIOLATION'
  | 'PLUGIN_VERIFICATION_FAILED'
  | 'PLUGIN_UNTRUSTED_KEY'
  | 'PLUGIN_SIGNATURE_EXPIRED'
  | 'PLUGIN_SIGNATURE_MISSING'
  
  // Circuit Breaker
  | 'CIRCUIT_BREAKER_OPEN'
  | 'CIRCUIT_BREAKER_CONFIG_INVALID'
  | 'CIRCUIT_BREAKER_STATE_ERROR'
  | 'CIRCUIT_BREAKER_TIMEOUT'
  
  // Internal
  | 'INTERNAL_ERROR'
  | 'UNEXPECTED_STATE'
  | 'NOT_IMPLEMENTED'

/**
 * Serializable error context for debugging and logging
 */
export interface ErrorContext {
  [key: string]: unknown
}

/**
 * Serialized error format for JSON transport
 */
export interface SerializedError {
  name: string
  message: string
  code: ErrorCode
  category: ErrorCategory
  context?: ErrorContext
  stack?: string
  timestamp: string
  cause?: SerializedError
}

/**
 * Options for creating AgentKit errors
 */
export interface AgentKitErrorOptions {
  cause?: Error | AgentKitError
  context?: ErrorContext
}

/**
 * Base class for all AgentKit SDK errors
 * 
 * Provides:
 * - Typed error codes and categories
 * - Structured error context
 * - JSON serialization/deserialization
 * - Error chaining with cause
 * - Debugging information
 */
export abstract class AgentKitError extends Error {
  /**
   * Typed error code for programmatic handling
   */
  abstract readonly code: ErrorCode

  /**
   * Error category for classification
   */
  abstract readonly category: ErrorCategory

  /**
   * Structured context for debugging
   */
  public readonly context: ErrorContext

  /**
   * Timestamp when error was created
   */
  public readonly timestamp: string

  /**
   * Original error that caused this error (if any)
   */
  public readonly cause?: Error | AgentKitError

  constructor(message: string, options: AgentKitErrorOptions = {}) {
    super(message)
    
    // Set the prototype explicitly for proper instanceof checks
    Object.setPrototypeOf(this, new.target.prototype)
    
    // Set error name to the class name
    this.name = this.constructor.name
    
    // Capture context and metadata
    this.context = options.context || {}
    this.timestamp = new Date().toISOString()
    this.cause = options.cause

    // Ensure stack trace is captured
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  /**
   * Serialize error to JSON for transport/logging
   */
  toJSON(): SerializedError {
    const serialized: SerializedError = {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      context: this.context,
      timestamp: this.timestamp
    }

    // Include stack trace in development
    if (this.stack) {
      serialized.stack = this.stack
    }

    // Serialize cause recursively
    if (this.cause) {
      if (this.cause instanceof AgentKitError) {
        serialized.cause = this.cause.toJSON()
      } else {
        serialized.cause = {
          name: this.cause.name,
          message: this.cause.message,
          code: 'INTERNAL_ERROR',
          category: 'internal',
          timestamp: this.timestamp
        }
      }
    }

    return serialized
  }

  /**
   * Create human-readable error summary
   */
  toString(): string {
    let summary = `${this.name}: ${this.message} [${this.code}]`
    
    if (Object.keys(this.context).length > 0) {
      summary += ` Context: ${JSON.stringify(this.context)}`
    }
    
    if (this.cause) {
      summary += ` Caused by: ${this.cause.message}`
    }
    
    return summary
  }

  /**
   * Check if error is retryable based on category and code
   */
  isRetryable(): boolean {
    // Network errors are generally retryable
    if (this.category === 'network') {
      return !['CORS_ERROR'].includes(this.code)
    }
    
    // Server errors (5xx) are retryable
    if (this.category === 'server') {
      return true
    }
    
    // Specific retryable codes
    const retryableCodes: ErrorCode[] = [
      'REQUEST_TIMEOUT',
      'CONNECTION_FAILED',
      'RATE_LIMIT_EXCEEDED'
    ]
    
    return retryableCodes.includes(this.code)
  }

  /**
   * Check if error indicates a client mistake (non-retryable)
   */
  isClientError(): boolean {
    return this.category === 'client' || 
           this.category === 'validation' ||
           this.category === 'authentication'
  }

  /**
   * Get error severity level
   */
  getSeverity(): 'low' | 'medium' | 'high' | 'critical' {
    switch (this.category) {
      case 'internal':
        return 'critical'
      case 'server':
      case 'resource':
        return 'high'
      case 'network':
      case 'config':
        return 'medium'
      case 'client':
      case 'validation':
      case 'authentication':
        return 'low'
      default:
        return 'medium'
    }
  }
}

/**
 * Deserialize error from JSON
 */
export function fromJSON(serialized: SerializedError): AgentKitError {
  // This is a factory function that would create the appropriate error subclass
  // For now, we'll create a generic error and enhance it later
  class DeserializedError extends AgentKitError {
    readonly code = serialized.code
    readonly category = serialized.category
  }
  
  const error = new DeserializedError(serialized.message, {
    context: serialized.context
  })
  
  // Restore timestamp
  Object.defineProperty(error, 'timestamp', {
    value: serialized.timestamp,
    writable: false
  })
  
  return error
}

/**
 * Type guard to check if error is an AgentKit error
 */
export function isAgentKitError(error: unknown): error is AgentKitError {
  return error instanceof AgentKitError
}

/**
 * Helper to extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

/**
 * Helper to wrap unknown errors in AgentKit error
 */
export function wrapError(error: unknown, code: ErrorCode, category: ErrorCategory, message?: string): AgentKitError {
  class WrappedError extends AgentKitError {
    readonly code = code
    readonly category = category
  }
  
  const wrappedMessage = message || getErrorMessage(error)
  const cause = error instanceof Error ? error : undefined
  
  return new WrappedError(wrappedMessage, { cause })
}