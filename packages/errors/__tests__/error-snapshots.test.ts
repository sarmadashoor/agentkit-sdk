/**
 * Error snapshots test - Verifies the complete error hierarchy
 * and ensures all error properties are consistent and type-safe
 */

import { describe, test, expect } from 'vitest'
import {
  // Base error
  AgentKitError,
  isAgentKitError,
  ErrorFactory,
  ErrorTypeGuards,
  
  // SDK errors
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

  // Validation errors
  InvalidInputError,
  SchemaValidationError,
  TypeMismatchError,
  RequiredFieldMissingError,

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
  CircuitBreakerTimeoutError
} from '../src/index'

describe('Error System Snapshots', () => {
  describe('Error Hierarchy', () => {
    test('all errors extend AgentKitError', () => {
      const errors = [
        new AgentInitError('test'),
        new AgentAlreadyInitializedError('test-agent'),
        new AgentNotInitializedError('test-agent'),
        new AgentHandleError('test', new Error('cause')),
        new AgentShutdownError('test'),
        new LifecycleHookError('init', 'test'),
        new InvalidConfigurationError('test'),
        new MissingRequiredConfigError('test'),
        new ResourceExhaustedError('memory'),
        new QueueFullError('test-queue'),
        new MaxRetriesExceededError('test-operation', 3),
        new AgentNotFoundError('test-agent'),
        new TransportNotFoundError('test-transport'),
        new DuplicateAgentIdError('test-agent'),
        new DuplicateTransportIdError('test-transport'),
        new RegistryValidationError('test'),
        new RegistryCleanupError('test'),
        new AgentMetadataValidationError('test-agent', 'missing field'),
        new TransportMetadataValidationError('test-transport', 'invalid type'),
        new AgentCompatibilityError('test-agent', 'version mismatch'),
        new RegistryCapacityError(100),
        new TransportInitError('test-transport', 'connection failed'),
        new TransportSendError('test-transport', 'timeout'),
        new TransportReceiveError('test-transport', 'parse error'),
        new NetworkError('connection refused'),
        new RequestTimeoutError(5000),
        new ConnectionFailedError('localhost:8080'),
        new HttpError(404, 'Not Found'),
        new CorsError('http://localhost:3000'),
        new SerializationError('Invalid JSON'),
        new RateLimitError(100, 60),
        new PayloadTooLargeError(1024, 512),
        new AuthenticationError('Invalid token'),
        new AuthorizationError('Insufficient permissions'),
        new InvalidApiKeyError('test-key'),
        new TokenExpiredError('jwt'),
        new InvalidInputError('name', 'cannot be empty'),
        new SchemaValidationError('user', 'missing required field'),
        new TypeMismatchError('age', 'number', 'string'),
        new RequiredFieldMissingError('email'),
        new PluginValidationError('test-plugin', 'missing name'),
        new PluginHookError('test-plugin', 'onInit', 'exception thrown'),
        new PluginRegistrationError('test-plugin', 'duplicate name'),
        new PluginTimeoutError('test-plugin.onSend', 5000),
        new PluginSignatureError('test-plugin', 'onSend', 'wrong parameters'),
        new CircuitBreakerError('test-service'),
        new CircuitBreakerConfigError('threshold', 'must be positive'),
        new CircuitBreakerStateError('test-service', 'closed', 'open', 'manual override'),
        new CircuitBreakerTimeoutError('test-service', 30000)
      ]

      errors.forEach(error => {
        expect(error).toBeInstanceOf(AgentKitError)
        expect(error).toBeInstanceOf(Error)
        expect(isAgentKitError(error)).toBe(true)
      })
    })

    test('all errors have required properties', () => {
      const error = new NetworkError('Connection failed', {
        context: { host: 'localhost', port: 8080 },
        cause: new Error('ECONNREFUSED')
      })

      expect(error.code).toBe('NETWORK_ERROR')
      expect(error.category).toBe('network')
      expect(error.message).toBe('Connection failed')
      expect(error.context).toEqual({ host: 'localhost', port: 8080 })
      expect(error.cause).toBeInstanceOf(Error)
      expect(error.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(error.name).toBe('NetworkError')
    })

    test('error serialization and deserialization', () => {
      const original = new QueueFullError('request-queue', {
        context: { size: 100, maxSize: 50 }
      })

      const serialized = original.toJSON()
      expect(serialized).toMatchSnapshot({
        timestamp: expect.any(String)
      })

      expect(serialized.name).toBe('QueueFullError')
      expect(serialized.code).toBe('QUEUE_FULL')
      expect(serialized.category).toBe('resource')
      expect(serialized.context).toEqual({ size: 100, maxSize: 50 })
    })
  })

  describe('Error Categories', () => {
    test('client errors', () => {
      const errors = [
        new InvalidInputError('name', 'required'),
        new SchemaValidationError('user', 'invalid'),
        new TypeMismatchError('age', 'number', 'string'),
        new RequiredFieldMissingError('email'),
        new PayloadTooLargeError(1024, 512)
      ]

      // Validation errors have validation category
      const validationErrors = errors.slice(0, 4)
      validationErrors.forEach(error => {
        expect(error.category).toBe('validation')
        expect(error.isClientError()).toBe(true)
        expect(error.isRetryable()).toBe(false)
      })

      // PayloadTooLargeError has client category
      const payloadError = errors[4]
      expect(payloadError.category).toBe('client')
      expect(payloadError.isClientError()).toBe(true) // client category = isClientError()
      expect(payloadError.isRetryable()).toBe(false)
    })

    test('network errors', () => {
      const errors = [
        new NetworkError('connection failed'),
        new RequestTimeoutError(5000),
        new ConnectionFailedError('localhost')
      ]

      errors.forEach(error => {
        expect(error.category).toBe('network')
        expect(ErrorTypeGuards.isNetworkError(error)).toBe(true)
        expect(error.isRetryable()).toBe(true)
      })
    })

    test('resource errors', () => {
      const errors = [
        new ResourceExhaustedError('memory'),
        new QueueFullError('requests'),
        new RateLimitError(100, 60),
        new PluginTimeoutError('test-plugin.onSend', 5000)
      ]

      errors.forEach(error => {
        expect(error.category).toBe('resource')
        expect(ErrorTypeGuards.isResourceError(error)).toBe(true)
      })
    })

    test('authentication errors', () => {
      const errors = [
        new AuthenticationError('invalid token'),
        new AuthorizationError('insufficient permissions'),
        new InvalidApiKeyError('test-key'),
        new TokenExpiredError('jwt')
      ]

      errors.forEach(error => {
        expect(error.category).toBe('authentication')
        expect(ErrorTypeGuards.isAuthError(error)).toBe(true)
        expect(error.isClientError()).toBe(true)
      })
    })

    test('plugin errors', () => {
      const errors = [
        new PluginHookError('test-plugin', 'onInit', 'failed')
      ]

      errors.forEach(error => {
        expect(ErrorTypeGuards.isPluginError(error)).toBe(true)
      })
    })
  })

  describe('Error Chaining', () => {
    test('error cause chain is preserved', () => {
      const rootCause = new Error('Database connection failed')
      const networkError = new NetworkError('Connection timeout', { cause: rootCause })
      const agentError = new AgentHandleError('Failed to process request', { cause: networkError })

      expect(agentError.cause).toBe(networkError)
      expect(networkError.cause).toBe(rootCause)

      const serialized = agentError.toJSON()
      expect(serialized.cause).toBeDefined()
      expect(serialized.cause?.name).toBe('NetworkError')
      expect(serialized.cause?.cause).toBeDefined()
      expect(serialized.cause?.cause?.name).toBe('Error')
      expect(serialized.cause?.cause?.message).toBe('Database connection failed')
    })
  })

  describe('Error Factory', () => {
    test('creates well-structured errors', () => {
      const agentNotFound = ErrorFactory.agentNotFound('test-agent', 'local')
      expect(agentNotFound.code).toBe('AGENT_NOT_FOUND')
      expect(agentNotFound.context).toEqual({ agentId: 'test-agent', registryType: 'local' })

      const networkError = ErrorFactory.networkError('Connection failed', true)
      expect(networkError.code).toBe('NETWORK_ERROR')
      expect(networkError.context).toEqual({ isRetryable: true })

      const timeout = ErrorFactory.timeout('send-message', 5000)
      expect(timeout.code).toBe('REQUEST_TIMEOUT')
      expect(timeout.context).toEqual({ operation: 'send-message' })

      const validation = ErrorFactory.validation('name', null, 'cannot be null')
      expect(validation.code).toBe('INVALID_INPUT')
      expect(validation.context).toEqual({ value: null, valueType: 'object' })

      const config = ErrorFactory.config('Invalid port', 'port', 8080)
      expect(config.code).toBe('INVALID_CONFIGURATION')
      expect(config.context).toEqual({ configKey: 'port', suggestedValue: 8080 })
    })
  })

  describe('Error Type Guards', () => {
    test('type guards work correctly', () => {
      const networkError = new NetworkError('test')
      const validationError = new InvalidInputError('field', 'invalid')
      const configError = new InvalidConfigurationError('test')
      const authError = new AuthenticationError('test')
      const pluginError = new PluginHookError('test-plugin', 'onInit', 'failed')
      const resourceError = new ResourceExhaustedError('memory')
      const internalError = new AgentHandleError('test', { cause: new Error('cause') })

      expect(ErrorTypeGuards.isRetryable(networkError)).toBe(true)
      expect(ErrorTypeGuards.isRetryable(validationError)).toBe(false)

      expect(ErrorTypeGuards.isClientError(validationError)).toBe(true)
      expect(ErrorTypeGuards.isClientError(networkError)).toBe(false)

      expect(ErrorTypeGuards.isNetworkError(networkError)).toBe(true)
      expect(ErrorTypeGuards.isNetworkError(validationError)).toBe(false)

      expect(ErrorTypeGuards.isValidationError(validationError)).toBe(true)
      expect(ErrorTypeGuards.isValidationError(networkError)).toBe(false)

      expect(ErrorTypeGuards.isConfigError(configError)).toBe(true)
      expect(ErrorTypeGuards.isConfigError(networkError)).toBe(false)

      expect(ErrorTypeGuards.isAuthError(authError)).toBe(true)
      expect(ErrorTypeGuards.isAuthError(networkError)).toBe(false)

      expect(ErrorTypeGuards.isPluginError(pluginError)).toBe(true)
      expect(ErrorTypeGuards.isPluginError(networkError)).toBe(false)

      expect(ErrorTypeGuards.isResourceError(resourceError)).toBe(true)
      expect(ErrorTypeGuards.isResourceError(networkError)).toBe(false)

      expect(ErrorTypeGuards.isInternalError(internalError)).toBe(false) // AgentHandleError is server category
      expect(ErrorTypeGuards.isInternalError(networkError)).toBe(false)
    })
  })

  describe('Error Behavior', () => {
    test('error severity levels', () => {
      expect(new AgentShutdownError('test').getSeverity()).toBe('critical')
      expect(new NetworkError('test').getSeverity()).toBe('medium')
      expect(new ResourceExhaustedError('test').getSeverity()).toBe('high')
      expect(new InvalidInputError('field', 'invalid').getSeverity()).toBe('low')
      expect(new InvalidConfigurationError('test').getSeverity()).toBe('medium')
      expect(new AuthenticationError('test').getSeverity()).toBe('low')
    })

    test('error retryability', () => {
      // Retryable errors
      expect(new NetworkError('test').isRetryable()).toBe(true)
      expect(new RequestTimeoutError(5000).isRetryable()).toBe(true)
      expect(new ConnectionFailedError('localhost').isRetryable()).toBe(true)
      expect(new RateLimitError(100, 60).isRetryable()).toBe(true)

      // Non-retryable errors
      expect(new CorsError('localhost').isRetryable()).toBe(false)
      expect(new InvalidInputError('field', 'invalid').isRetryable()).toBe(false)
      expect(new AuthenticationError('invalid').isRetryable()).toBe(false)
    })

    test('error string representation', () => {
      const error = new NetworkError('Connection failed', {
        context: { host: 'localhost', port: 8080 },
        cause: new Error('ECONNREFUSED')
      })

      const str = error.toString()
      expect(str).toContain('NetworkError: Connection failed [NETWORK_ERROR]')
      expect(str).toContain('Context: {"host":"localhost","port":8080}')
      expect(str).toContain('Caused by: ECONNREFUSED')
    })
  })

  describe('Non-AgentKit Errors', () => {
    test('type guard returns false for regular errors', () => {
      const regularError = new Error('Regular error')
      const typeError = new TypeError('Type error')
      const rangeError = new RangeError('Range error')

      expect(isAgentKitError(regularError)).toBe(false)
      expect(isAgentKitError(typeError)).toBe(false)
      expect(isAgentKitError(rangeError)).toBe(false)
      expect(isAgentKitError(null)).toBe(false)
      expect(isAgentKitError(undefined)).toBe(false)
      expect(isAgentKitError('string')).toBe(false)
      expect(isAgentKitError(42)).toBe(false)

      expect(ErrorTypeGuards.isRetryable(regularError)).toBe(false)
      expect(ErrorTypeGuards.isClientError(typeError)).toBe(false)
    })
  })
})