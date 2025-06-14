/**
 * Custom error classes for AgentKit SDK
 * All errors are serializable and provide clear developer-friendly messages
 */

export abstract class AgentKitError extends Error {
  readonly name: string
  readonly cause?: Error
  readonly context?: Record<string, unknown>

  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(message)
    this.name = this.constructor.name
    this.cause = options?.cause
    this.context = options?.context

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype)

    // Capture stack trace if available
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,
      cause: this.cause?.message,
      context: this.context
    }
  }
}

export class AgentInitError extends AgentKitError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(`Agent initialization failed: ${message}`, options)
  }
}

export class AgentHandleError extends AgentKitError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(`Agent handle operation failed: ${message}`, options)
  }
}

export class AgentShutdownError extends AgentKitError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(`Agent shutdown failed: ${message}`, options)
  }
}

export class TransportInitError extends AgentKitError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(`Transport initialization failed: ${message}`, options)
  }
}

export class TransportSendError extends AgentKitError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(`Transport send operation failed: ${message}`, options)
  }
}

export class RegistryError extends AgentKitError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(`Registry operation failed: ${message}`, options)
  }
}

export class ValidationError extends AgentKitError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(`Validation failed: ${message}`, options)
  }
}

export class CompatibilityError extends AgentKitError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(`Compatibility check failed: ${message}`, options)
  }
}

export class ScopeError extends AgentKitError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(`Scope validation failed: ${message}`, options)
  }
}

/**
 * Type guard to check if an error is an AgentKit error
 */
export function isAgentKitError(error: unknown): error is AgentKitError {
  return error instanceof AgentKitError
}

/**
 * Extract a developer-friendly error message from any error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Unknown error occurred'
}

/**
 * Create a safe error object for serialization
 */
export function createSafeError(error: unknown): Record<string, unknown> {
  if (isAgentKitError(error)) {
    return error.toJSON()
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
    message: getErrorMessage(error),
    error: String(error)
  }
}