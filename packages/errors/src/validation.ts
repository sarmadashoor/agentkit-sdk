/**
 * Validation-specific error classes for AgentKit input validation
 */

import { AgentKitError, AgentKitErrorOptions, ErrorCode, ErrorCategory } from './base'

/**
 * Base class for all validation-related errors
 */
abstract class ValidationError extends AgentKitError {
  abstract readonly code: ErrorCode
  readonly category = 'validation' as const
}

/**
 * General input validation errors
 */
export class InvalidInputError extends ValidationError {
  readonly code = 'INVALID_INPUT' as const

  constructor(input: string, reason: string, options?: AgentKitErrorOptions) {
    super(`Invalid input for ${input}: ${reason}`, options)
  }
}

/**
 * Schema validation errors (e.g., Zod validation failures)
 */
export class SchemaValidationError extends ValidationError {
  readonly code = 'SCHEMA_VALIDATION_FAILED' as const

  public readonly field?: string
  public readonly expectedType?: string
  public readonly receivedType?: string

  constructor(
    message: string, 
    field?: string, 
    expectedType?: string, 
    receivedType?: string,
    options?: AgentKitErrorOptions
  ) {
    super(message, options)
    this.field = field
    this.expectedType = expectedType
    this.receivedType = receivedType
  }

  /**
   * Create from Zod error-like object
   */
  static fromZodError(zodError: { issues?: Array<{ path?: string[]; message?: string; expected?: string; received?: string }>; message?: string }, options?: AgentKitErrorOptions): SchemaValidationError {
    // Handle Zod error structure
    if (zodError.issues && zodError.issues.length > 0) {
      const issue = zodError.issues[0]
      const field = issue.path?.join('.') || 'unknown'
      const message = issue.message || 'Schema validation failed'
      
      return new SchemaValidationError(
        `Schema validation failed at ${field}: ${message}`,
        field,
        issue.expected,
        issue.received,
        options
      )
    }
    
    return new SchemaValidationError(
      zodError.message || 'Schema validation failed',
      undefined,
      undefined,
      undefined,
      options
    )
  }
}

/**
 * Type mismatch errors
 */
export class TypeMismatchError extends ValidationError {
  readonly code = 'TYPE_MISMATCH' as const

  public readonly field: string
  public readonly expectedType: string
  public readonly receivedType: string

  constructor(
    field: string, 
    expectedType: string, 
    receivedType: string, 
    options?: AgentKitErrorOptions
  ) {
    super(`Type mismatch for field '${field}': expected ${expectedType}, received ${receivedType}`, options)
    this.field = field
    this.expectedType = expectedType
    this.receivedType = receivedType
  }
}

/**
 * Required field missing errors
 */
export class RequiredFieldMissingError extends ValidationError {
  readonly code = 'REQUIRED_FIELD_MISSING' as const

  public readonly field: string

  constructor(field: string, options?: AgentKitErrorOptions) {
    super(`Required field missing: ${field}`, options)
    this.field = field
  }
}

/**
 * Validation helper functions
 */
export class ValidationHelpers {
  /**
   * Validate that a value is not null or undefined
   */
  static required(value: unknown, fieldName: string): void {
    if (value === null || value === undefined) {
      throw new RequiredFieldMissingError(fieldName)
    }
  }

  /**
   * Validate that a value is of expected type
   */
  static typeCheck(value: unknown, expectedType: string, fieldName: string): void {
    const actualType = typeof value
    if (actualType !== expectedType) {
      throw new TypeMismatchError(fieldName, expectedType, actualType)
    }
  }

  /**
   * Validate string is not empty
   */
  static nonEmpty(value: string, fieldName: string): void {
    if (typeof value !== 'string') {
      throw new TypeMismatchError(fieldName, 'string', typeof value)
    }
    if (value.trim().length === 0) {
      throw new InvalidInputError(fieldName, 'cannot be empty')
    }
  }

  /**
   * Validate URL format
   */
  static validUrl(value: string, fieldName: string): void {
    try {
      new URL(value)
    } catch {
      throw new InvalidInputError(fieldName, 'must be a valid URL')
    }
  }

  /**
   * Validate email format
   */
  static validEmail(value: string, fieldName: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(value)) {
      throw new InvalidInputError(fieldName, 'must be a valid email address')
    }
  }

  /**
   * Validate number range
   */
  static numberRange(value: number, min: number, max: number, fieldName: string): void {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new TypeMismatchError(fieldName, 'number', typeof value)
    }
    if (value < min || value > max) {
      throw new InvalidInputError(fieldName, `must be between ${min} and ${max}`)
    }
  }

  /**
   * Validate array length
   */
  static arrayLength(value: unknown[], min: number, max: number, fieldName: string): void {
    if (!Array.isArray(value)) {
      throw new TypeMismatchError(fieldName, 'array', typeof value)
    }
    if (value.length < min || value.length > max) {
      throw new InvalidInputError(fieldName, `must have between ${min} and ${max} items`)
    }
  }
}