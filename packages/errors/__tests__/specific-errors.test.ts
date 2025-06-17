import { describe, it, expect } from 'vitest'

// Import all error classes
import {
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
  ValidationHelpers,
  
  // Base and utilities
  AgentKitError,
  ErrorFactory,
  ErrorTypeGuards
} from '../src/index'

describe('Specific Error Classes', () => {
  describe('SDK Errors', () => {
    it('should create AgentInitError correctly', () => {
      const error = new AgentInitError('Failed to initialize agent', {
        context: { agentId: 'test-agent' }
      })
      
      expect(error.code).toBe('AGENT_INIT_FAILED')
      expect(error.category).toBe('config')
      expect(error.message).toBe('Failed to initialize agent')
      expect(error.context).toEqual({ agentId: 'test-agent' })
      expect(error.isRetryable()).toBe(false)
    })

    it('should create AgentAlreadyInitializedError with default message', () => {
      const error = new AgentAlreadyInitializedError()
      
      expect(error.code).toBe('AGENT_ALREADY_INITIALIZED')
      expect(error.category).toBe('client')
      expect(error.message).toBe('Agent is already initialized')
      expect(error.isClientError()).toBe(true)
    })

    it('should create QueueFullError with custom queue name', () => {
      const error = new QueueFullError('send-queue')
      
      expect(error.code).toBe('QUEUE_FULL')
      expect(error.category).toBe('resource')
      expect(error.message).toBe('Queue is full: send-queue')
    })

    it('should create MaxRetriesExceededError with details', () => {
      const error = new MaxRetriesExceededError(3, 'send message')
      
      expect(error.code).toBe('MAX_RETRIES_EXCEEDED')
      expect(error.category).toBe('resource')
      expect(error.message).toBe('Maximum retries (3) exceeded for operation: send message')
    })

    it('should create LifecycleHookError with hook name', () => {
      const error = new LifecycleHookError('onInit', 'Hook threw exception')
      
      expect(error.code).toBe('LIFECYCLE_HOOK_FAILED')
      expect(error.category).toBe('client')
      expect(error.message).toBe("Lifecycle hook 'onInit' failed: Hook threw exception")
    })
  })

  describe('Registry Errors', () => {
    it('should create AgentNotFoundError with agent ID', () => {
      const error = new AgentNotFoundError('missing-agent')
      
      expect(error.code).toBe('AGENT_NOT_FOUND')
      expect(error.category).toBe('client')
      expect(error.message).toBe('Agent not found in registry: missing-agent')
    })

    it('should create DuplicateAgentIdError with agent ID', () => {
      const error = new DuplicateAgentIdError('duplicate-agent')
      
      expect(error.code).toBe('DUPLICATE_AGENT_ID')
      expect(error.category).toBe('client')
      expect(error.message).toBe('Agent with id "duplicate-agent" is already registered in this registry')
    })

    it('should create RegistryCapacityError with details', () => {
      const error = new RegistryCapacityError('agents', 100)
      
      expect(error.code).toBe('RESOURCE_EXHAUSTED')
      expect(error.category).toBe('resource')
      expect(error.message).toBe('Registry capacity exceeded: maximum 100 agents allowed')
    })

    it('should create AgentCompatibilityError with full details', () => {
      const error = new AgentCompatibilityError('agent-1', 'transport-1', 'version mismatch')
      
      expect(error.code).toBe('INVALID_CONFIGURATION')
      expect(error.category).toBe('config')
      expect(error.message).toBe('Agent "agent-1" is not compatible with transport "transport-1": version mismatch')
    })
  })

  describe('Transport Errors', () => {
    it('should create HttpError with status details', () => {
      const error = new HttpError(404, 'Not Found', 'Resource not found')
      
      expect(error.code).toBe('HTTP_ERROR')
      expect(error.category).toBe('client') // 4xx
      expect(error.message).toBe('HTTP 404: Not Found - Resource not found')
      expect(error.status).toBe(404)
      expect(error.statusText).toBe('Not Found')
      expect(error.isClientError()).toBe(true)
      expect(error.isServerError()).toBe(false)
      expect(error.isRetryable()).toBe(false)
    })

    it('should create HttpError for server errors', () => {
      const error = new HttpError(500, 'Internal Server Error')
      
      expect(error.category).toBe('server') // 5xx
      expect(error.isClientError()).toBe(false)
      expect(error.isServerError()).toBe(true)
      expect(error.isRetryable()).toBe(true)
    })

    it('should create HttpError for retryable client errors', () => {
      const error = new HttpError(429, 'Too Many Requests')
      
      expect(error.category).toBe('client') // 4xx
      expect(error.isRetryable()).toBe(true) // 429 is retryable
    })

    it('should create RequestTimeoutError with timeout value', () => {
      const error = new RequestTimeoutError(5000)
      
      expect(error.code).toBe('REQUEST_TIMEOUT')
      expect(error.category).toBe('network')
      expect(error.message).toBe('Request timed out after 5000ms')
      expect(error.isRetryable()).toBe(true)
    })

    it('should create PayloadTooLargeError with size details', () => {
      const error = new PayloadTooLargeError(1024000, 512000)
      
      expect(error.code).toBe('PAYLOAD_TOO_LARGE')
      expect(error.category).toBe('client')
      expect(error.size).toBe(1024000)
      expect(error.maxSize).toBe(512000)
      expect(error.message).toBe('Payload size 1024000 bytes exceeds maximum allowed size of 512000 bytes')
    })

    it('should create RateLimitError with retry information', () => {
      const error = new RateLimitError('Rate limit exceeded', 60)
      
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED')
      expect(error.category).toBe('resource')
      expect(error.retryAfter).toBe(60)
      expect(error.isRetryable()).toBe(true)
    })

    it('should create AuthorizationError with resource details', () => {
      const error = new AuthorizationError('user-data', 'read')
      
      expect(error.code).toBe('AUTHORIZATION_FAILED')
      expect(error.category).toBe('authentication')
      expect(error.message).toBe('Not authorized to perform read on user-data')
    })

    it('should create TokenExpiredError with token type', () => {
      const error = new TokenExpiredError('refresh token')
      
      expect(error.code).toBe('TOKEN_EXPIRED')
      expect(error.category).toBe('authentication')
      expect(error.message).toBe('refresh token has expired')
    })
  })

  describe('Validation Errors', () => {
    it('should create InvalidInputError with field and reason', () => {
      const error = new InvalidInputError('email', 'invalid format')
      
      expect(error.code).toBe('INVALID_INPUT')
      expect(error.category).toBe('validation')
      expect(error.message).toBe('Invalid input for email: invalid format')
    })

    it('should create TypeMismatchError with type details', () => {
      const error = new TypeMismatchError('age', 'number', 'string')
      
      expect(error.code).toBe('TYPE_MISMATCH')
      expect(error.category).toBe('validation')
      expect(error.field).toBe('age')
      expect(error.expectedType).toBe('number')
      expect(error.receivedType).toBe('string')
      expect(error.message).toBe("Type mismatch for field 'age': expected number, received string")
    })

    it('should create RequiredFieldMissingError with field name', () => {
      const error = new RequiredFieldMissingError('username')
      
      expect(error.code).toBe('REQUIRED_FIELD_MISSING')
      expect(error.category).toBe('validation')
      expect(error.field).toBe('username')
      expect(error.message).toBe('Required field missing: username')
    })

    it('should create SchemaValidationError from Zod-like error', () => {
      const zodError = {
        issues: [{
          path: ['user', 'email'],
          message: 'Invalid email format',
          expected: 'string',
          received: 'number'
        }]
      }
      
      const error = SchemaValidationError.fromZodError(zodError)
      
      expect(error.code).toBe('SCHEMA_VALIDATION_FAILED')
      expect(error.category).toBe('validation')
      expect(error.field).toBe('user.email')
      expect(error.expectedType).toBe('string')
      expect(error.receivedType).toBe('number')
      expect(error.message).toBe('Schema validation failed at user.email: Invalid email format')
    })
  })

  describe('Error Factories', () => {
    it('should create agent not found error via factory', () => {
      const error = ErrorFactory.agentNotFound('test-agent', 'global')
      
      expect(error).toBeInstanceOf(AgentNotFoundError)
      expect(error.context).toEqual({ agentId: 'test-agent', registryType: 'global' })
    })

    it('should create network error via factory', () => {
      const error = ErrorFactory.networkError('Connection failed', false)
      
      expect(error).toBeInstanceOf(NetworkError)
      expect(error.context).toEqual({ isRetryable: false })
    })

    it('should create timeout error via factory', () => {
      const error = ErrorFactory.timeout('send message', 5000)
      
      expect(error).toBeInstanceOf(RequestTimeoutError)
      expect(error.context).toEqual({ operation: 'send message' })
    })

    it('should create validation error via factory', () => {
      const error = ErrorFactory.validation('email', 'invalid@', 'invalid format')
      
      expect(error).toBeInstanceOf(InvalidInputError)
      expect(error.context).toEqual({ value: 'invalid@', valueType: 'string' })
    })

    it('should create config error via factory', () => {
      const error = ErrorFactory.config('Invalid timeout', 'timeout', 5000)
      
      expect(error).toBeInstanceOf(InvalidConfigurationError)
      expect(error.context).toEqual({ configKey: 'timeout', suggestedValue: 5000 })
    })
  })

  describe('Error Type Guards', () => {
    it('should identify retryable errors', () => {
      const retryable = new NetworkError('Connection failed')
      const nonRetryable = new InvalidInputError('email', 'invalid format')
      const regularError = new Error('Regular error')
      
      expect(ErrorTypeGuards.isRetryable(retryable)).toBe(true)
      expect(ErrorTypeGuards.isRetryable(nonRetryable)).toBe(false)
      expect(ErrorTypeGuards.isRetryable(regularError)).toBe(false)
    })

    it('should identify client errors', () => {
      const clientError = new InvalidInputError('field', 'reason')
      const serverError = new AgentHandleError('Server failed')
      
      expect(ErrorTypeGuards.isClientError(clientError)).toBe(true)
      expect(ErrorTypeGuards.isClientError(serverError)).toBe(false)
    })

    it('should identify network errors', () => {
      const networkError = new NetworkError('Connection failed')
      const configError = new InvalidConfigurationError('Bad config')
      
      expect(ErrorTypeGuards.isNetworkError(networkError)).toBe(true)
      expect(ErrorTypeGuards.isNetworkError(configError)).toBe(false)
    })

    it('should identify validation errors', () => {
      const validationError = new TypeMismatchError('field', 'string', 'number')
      const networkError = new NetworkError('Failed')
      
      expect(ErrorTypeGuards.isValidationError(validationError)).toBe(true)
      expect(ErrorTypeGuards.isValidationError(networkError)).toBe(false)
    })

    it('should identify config errors', () => {
      const configError = new InvalidConfigurationError('Bad config')
      const validationError = new InvalidInputError('field', 'reason')
      
      expect(ErrorTypeGuards.isConfigError(configError)).toBe(true)
      expect(ErrorTypeGuards.isConfigError(validationError)).toBe(false)
    })

    it('should identify auth errors', () => {
      const authError = new AuthenticationError('Invalid credentials')
      const networkError = new NetworkError('Failed')
      
      expect(ErrorTypeGuards.isAuthError(authError)).toBe(true)
      expect(ErrorTypeGuards.isAuthError(networkError)).toBe(false)
    })
  })

  describe('Validation Helpers', () => {
    it('should validate required fields', () => {
      expect(() => ValidationHelpers.required('value', 'field')).not.toThrow()
      expect(() => ValidationHelpers.required(null, 'field')).toThrow(RequiredFieldMissingError)
      expect(() => ValidationHelpers.required(undefined, 'field')).toThrow(RequiredFieldMissingError)
    })

    it('should validate types', () => {
      expect(() => ValidationHelpers.typeCheck('string', 'string', 'field')).not.toThrow()
      expect(() => ValidationHelpers.typeCheck(123, 'number', 'field')).not.toThrow()
      expect(() => ValidationHelpers.typeCheck('string', 'number', 'field')).toThrow(TypeMismatchError)
    })

    it('should validate non-empty strings', () => {
      expect(() => ValidationHelpers.nonEmpty('valid', 'field')).not.toThrow()
      expect(() => ValidationHelpers.nonEmpty('', 'field')).toThrow(InvalidInputError)
      expect(() => ValidationHelpers.nonEmpty('   ', 'field')).toThrow(InvalidInputError)
      expect(() => ValidationHelpers.nonEmpty(123 as any, 'field')).toThrow(TypeMismatchError)
    })

    it('should validate URLs', () => {
      expect(() => ValidationHelpers.validUrl('https://example.com', 'field')).not.toThrow()
      expect(() => ValidationHelpers.validUrl('invalid-url', 'field')).toThrow(InvalidInputError)
    })

    it('should validate emails', () => {
      expect(() => ValidationHelpers.validEmail('test@example.com', 'field')).not.toThrow()
      expect(() => ValidationHelpers.validEmail('invalid-email', 'field')).toThrow(InvalidInputError)
    })

    it('should validate number ranges', () => {
      expect(() => ValidationHelpers.numberRange(5, 1, 10, 'field')).not.toThrow()
      expect(() => ValidationHelpers.numberRange(15, 1, 10, 'field')).toThrow(InvalidInputError)
      expect(() => ValidationHelpers.numberRange('5' as any, 1, 10, 'field')).toThrow(TypeMismatchError)
    })

    it('should validate array lengths', () => {
      expect(() => ValidationHelpers.arrayLength([1, 2, 3], 1, 5, 'field')).not.toThrow()
      expect(() => ValidationHelpers.arrayLength([1], 2, 5, 'field')).toThrow(InvalidInputError)
      expect(() => ValidationHelpers.arrayLength('not-array' as any, 1, 5, 'field')).toThrow(TypeMismatchError)
    })
  })

  describe('Error Serialization Round-trip', () => {
    it('should serialize and deserialize complex error chains', () => {
      const cause = new NetworkError('Network failed', {
        context: { endpoint: 'https://api.example.com' }
      })
      
      const error = new AgentHandleError('Agent processing failed', {
        cause,
        context: { agentId: 'test-agent', operation: 'handle' }
      })
      
      const serialized = error.toJSON()
      expect(serialized.cause).toBeDefined()
      expect(serialized.cause!.context).toEqual({ endpoint: 'https://api.example.com' })
      
      // Test JSON stringification
      const jsonString = JSON.stringify(serialized)
      const parsed = JSON.parse(jsonString)
      
      expect(parsed.message).toBe('Agent processing failed')
      expect(parsed.cause.message).toBe('Network failed')
      expect(parsed.cause.context.endpoint).toBe('https://api.example.com')
    })
  })
})