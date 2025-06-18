/**
 * Transport-specific error classes for AgentKit transport operations
 */

import { AgentKitError, AgentKitErrorOptions, ErrorCode, ErrorCategory } from './base'

/**
 * Base class for all transport-related errors
 */
abstract class TransportError extends AgentKitError {
  abstract readonly code: ErrorCode
  abstract readonly category: ErrorCategory
}

/**
 * Transport initialization errors
 */
export class TransportInitError extends TransportError {
  readonly code = 'TRANSPORT_INIT_FAILED' as const
  readonly category = 'config' as const

  constructor(message: string, options?: AgentKitErrorOptions) {
    super(message, options)
  }
}

/**
 * Transport send operation errors
 */
export class TransportSendError extends TransportError {
  readonly code = 'TRANSPORT_SEND_FAILED' as const
  readonly category = 'network' as const

  constructor(message: string, options?: AgentKitErrorOptions) {
    super(message, options)
  }
}

/**
 * Transport receive operation errors
 */
export class TransportReceiveError extends TransportError {
  readonly code = 'TRANSPORT_RECEIVE_FAILED' as const
  readonly category = 'network' as const

  constructor(message: string, options?: AgentKitErrorOptions) {
    super(message, options)
  }
}

/**
 * Network connection errors
 */
export class NetworkError extends TransportError {
  readonly code = 'NETWORK_ERROR' as const
  readonly category = 'network' as const

  constructor(message: string, options?: AgentKitErrorOptions) {
    super(message, options)
  }
}

/**
 * Request timeout errors
 */
export class RequestTimeoutError extends TransportError {
  readonly code = 'REQUEST_TIMEOUT' as const
  readonly category = 'network' as const

  constructor(timeoutMs: number, options?: AgentKitErrorOptions) {
    super(`Request timed out after ${timeoutMs}ms`, options)
  }
}

/**
 * Connection failure errors
 */
export class ConnectionFailedError extends TransportError {
  readonly code = 'CONNECTION_FAILED' as const
  readonly category = 'network' as const

  constructor(endpoint: string, options?: AgentKitErrorOptions) {
    super(`Failed to connect to ${endpoint}`, options)
  }
}

/**
 * HTTP-specific errors with status codes
 */
export class HttpError extends TransportError {
  readonly code = 'HTTP_ERROR' as const
  readonly category: ErrorCategory

  public readonly status: number
  public readonly statusText: string

  constructor(status: number, statusText: string, body?: string, options?: AgentKitErrorOptions) {
    const category: ErrorCategory = status >= 500 ? 'server' : 'client'
    const message = body 
      ? `HTTP ${status}: ${statusText} - ${body}`
      : `HTTP ${status}: ${statusText}`
    
    super(message, options)
    this.category = category
    this.status = status
    this.statusText = statusText
  }

  /**
   * Check if this is a client error (4xx)
   */
  isClientError(): boolean {
    return this.status >= 400 && this.status < 500
  }

  /**
   * Check if this is a server error (5xx)
   */
  isServerError(): boolean {
    return this.status >= 500
  }

  /**
   * Check if this specific status code is retryable
   */
  isRetryable(): boolean {
    // Retry on server errors and specific client errors
    if (this.isServerError()) {
      return true
    }
    
    // Retry on specific 4xx codes
    const retryable4xx = [408, 429] // Request Timeout, Too Many Requests
    return retryable4xx.includes(this.status)
  }
}

/**
 * CORS (Cross-Origin Resource Sharing) errors
 */
export class CorsError extends TransportError {
  readonly code = 'CORS_ERROR' as const
  readonly category = 'client' as const

  constructor(origin: string, options?: AgentKitErrorOptions) {
    super(`CORS error: Origin ${origin} is not allowed by the server`, options)
  }
}

/**
 * Serialization/deserialization errors
 */
export class SerializationError extends TransportError {
  readonly code = 'SERIALIZATION_FAILED' as const
  readonly category = 'client' as const

  constructor(operation: 'serialize' | 'deserialize', dataType: string, options?: AgentKitErrorOptions) {
    super(`Failed to ${operation} ${dataType}`, options)
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends TransportError {
  readonly code = 'RATE_LIMIT_EXCEEDED' as const
  readonly category = 'resource' as const

  public readonly retryAfter?: number

  constructor(message: string, retryAfter?: number, options?: AgentKitErrorOptions) {
    super(message, options)
    this.retryAfter = retryAfter
  }
}

/**
 * Payload size errors
 */
export class PayloadTooLargeError extends TransportError {
  readonly code = 'PAYLOAD_TOO_LARGE' as const
  readonly category = 'client' as const

  public readonly size: number
  public readonly maxSize: number

  constructor(size: number, maxSize: number, options?: AgentKitErrorOptions) {
    super(`Payload size ${size} bytes exceeds maximum allowed size of ${maxSize} bytes`, options)
    this.size = size
    this.maxSize = maxSize
  }
}

/**
 * Authentication errors
 */
export class AuthenticationError extends TransportError {
  readonly code = 'AUTHENTICATION_FAILED' as const
  readonly category = 'authentication' as const

  constructor(message: string = 'Authentication failed', options?: AgentKitErrorOptions) {
    super(message, options)
  }
}

/**
 * Authorization errors
 */
export class AuthorizationError extends TransportError {
  readonly code = 'AUTHORIZATION_FAILED' as const
  readonly category = 'authentication' as const

  constructor(resource: string, action: string, options?: AgentKitErrorOptions) {
    super(`Not authorized to perform ${action} on ${resource}`, options)
  }
}

/**
 * Invalid API key errors
 */
export class InvalidApiKeyError extends TransportError {
  readonly code = 'INVALID_API_KEY' as const
  readonly category = 'authentication' as const

  constructor(options?: AgentKitErrorOptions) {
    super('Invalid API key provided', options)
  }
}

/**
 * Token expired errors
 */
export class TokenExpiredError extends TransportError {
  readonly code = 'TOKEN_EXPIRED' as const
  readonly category = 'authentication' as const

  constructor(tokenType: string = 'access token', options?: AgentKitErrorOptions) {
    super(`${tokenType} has expired`, options)
  }
}

/**
 * Transport backpressure errors
 */
export class TransportBackpressureError extends TransportError {
  readonly code = 'TRANSPORT_BACKPRESSURE' as const
  readonly category = 'resource' as const

  public readonly currentLoad?: number
  public readonly maxCapacity?: number

  constructor(
    transportId: string, 
    message?: string, 
    currentLoad?: number, 
    maxCapacity?: number, 
    options?: AgentKitErrorOptions
  ) {
    const defaultMessage = `Transport ${transportId} is under backpressure and cannot accept more messages`
    super(message || defaultMessage, options)
    this.currentLoad = currentLoad
    this.maxCapacity = maxCapacity
  }
}