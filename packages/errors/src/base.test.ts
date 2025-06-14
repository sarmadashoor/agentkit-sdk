import { describe, it, expect } from 'vitest'
import { 
  AgentKitError, 
  fromJSON, 
  isAgentKitError, 
  getErrorMessage, 
  wrapError,
  type ErrorCode,
  type ErrorCategory 
} from './base'

// Test error class for testing
class TestError extends AgentKitError {
  readonly code = 'INTERNAL_ERROR' as const
  readonly category = 'internal' as const
}

class TestClientError extends AgentKitError {
  readonly code = 'INVALID_INPUT' as const
  readonly category = 'client' as const
}

class TestNetworkError extends AgentKitError {
  readonly code = 'NETWORK_ERROR' as const
  readonly category = 'network' as const
}

describe('AgentKitError Base System', () => {
  describe('Error Creation and Properties', () => {
    it('should create error with required properties', () => {
      const error = new TestError('Test message')
      
      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(AgentKitError)
      expect(error.name).toBe('TestError')
      expect(error.message).toBe('Test message')
      expect(error.code).toBe('INTERNAL_ERROR')
      expect(error.category).toBe('internal')
      expect(error.timestamp).toBeDefined()
      expect(error.context).toEqual({})
      expect(error.cause).toBeUndefined()
    })

    it('should create error with context', () => {
      const context = { userId: '123', operation: 'test' }
      const error = new TestError('Test message', { context })
      
      expect(error.context).toEqual(context)
    })

    it('should create error with cause', () => {
      const originalError = new Error('Original error')
      const error = new TestError('Test message', { cause: originalError })
      
      expect(error.cause).toBe(originalError)
    })

    it('should create error with both context and cause', () => {
      const originalError = new Error('Original error')
      const context = { operation: 'test' }
      const error = new TestError('Test message', { context, cause: originalError })
      
      expect(error.context).toEqual(context)
      expect(error.cause).toBe(originalError)
    })

    it('should have proper prototype chain for instanceof checks', () => {
      const error = new TestError('Test message')
      
      expect(error instanceof Error).toBe(true)
      expect(error instanceof AgentKitError).toBe(true)
      expect(error instanceof TestError).toBe(true)
    })
  })

  describe('Error Methods', () => {
    it('should provide toString with full information', () => {
      const context = { userId: '123' }
      const cause = new Error('Original error')
      const error = new TestError('Test message', { context, cause })
      
      const str = error.toString()
      expect(str).toContain('TestError: Test message [INTERNAL_ERROR]')
      expect(str).toContain('Context: {"userId":"123"}')
      expect(str).toContain('Caused by: Original error')
    })

    it('should determine retryability correctly', () => {
      const networkError = new TestNetworkError('Network failed')
      const clientError = new TestClientError('Invalid input')
      
      expect(networkError.isRetryable()).toBe(true)
      expect(clientError.isRetryable()).toBe(false)
    })

    it('should identify client errors correctly', () => {
      const networkError = new TestNetworkError('Network failed')
      const clientError = new TestClientError('Invalid input')
      
      expect(networkError.isClientError()).toBe(false)
      expect(clientError.isClientError()).toBe(true)
    })

    it('should provide correct severity levels', () => {
      expect(new TestError('Internal error').getSeverity()).toBe('critical')
      expect(new TestNetworkError('Network error').getSeverity()).toBe('medium')
      expect(new TestClientError('Client error').getSeverity()).toBe('low')
    })
  })

  describe('Error Serialization', () => {
    it('should serialize to JSON correctly', () => {
      const context = { userId: '123', operation: 'test' }
      const error = new TestError('Test message', { context })
      
      const serialized = error.toJSON()
      
      expect(serialized).toMatchObject({
        name: 'TestError',
        message: 'Test message',
        code: 'INTERNAL_ERROR',
        category: 'internal',
        context: context,
        timestamp: error.timestamp
      })
      expect(serialized.stack).toBeDefined()
    })

    it('should serialize error with cause recursively', () => {
      const originalError = new TestClientError('Original error', {
        context: { field: 'input' }
      })
      const wrappedError = new TestError('Wrapped error', { cause: originalError })
      
      const serialized = wrappedError.toJSON()
      
      expect(serialized.cause).toBeDefined()
      expect(serialized.cause!.name).toBe('TestClientError')
      expect(serialized.cause!.message).toBe('Original error')
      expect(serialized.cause!.code).toBe('INVALID_INPUT')
      expect(serialized.cause!.category).toBe('client')
      expect(serialized.cause!.context).toEqual({ field: 'input' })
    })

    it('should serialize error with non-AgentKit cause', () => {
      const originalError = new Error('Regular error')
      const wrappedError = new TestError('Wrapped error', { cause: originalError })
      
      const serialized = wrappedError.toJSON()
      
      expect(serialized.cause).toBeDefined()
      expect(serialized.cause!.name).toBe('Error')
      expect(serialized.cause!.message).toBe('Regular error')
      expect(serialized.cause!.code).toBe('INTERNAL_ERROR')
      expect(serialized.cause!.category).toBe('internal')
    })
  })

  describe('Error Deserialization', () => {
    it('should deserialize from JSON correctly', () => {
      const serialized = {
        name: 'TestError',
        message: 'Test message',
        code: 'INTERNAL_ERROR' as ErrorCode,
        category: 'internal' as ErrorCategory,
        context: { userId: '123' },
        timestamp: '2023-01-01T00:00:00.000Z'
      }
      
      const error = fromJSON(serialized)
      
      expect(error.message).toBe('Test message')
      expect(error.code).toBe('INTERNAL_ERROR')
      expect(error.category).toBe('internal')
      expect(error.context).toEqual({ userId: '123' })
      expect(error.timestamp).toBe('2023-01-01T00:00:00.000Z')
    })
  })

  describe('Utility Functions', () => {
    it('should identify AgentKit errors correctly', () => {
      const agentKitError = new TestError('Test')
      const regularError = new Error('Regular')
      const notError = { message: 'Not an error' }
      
      expect(isAgentKitError(agentKitError)).toBe(true)
      expect(isAgentKitError(regularError)).toBe(false)
      expect(isAgentKitError(notError)).toBe(false)
      expect(isAgentKitError(null)).toBe(false)
      expect(isAgentKitError(undefined)).toBe(false)
    })

    it('should extract error messages correctly', () => {
      const error = new Error('Error message')
      const agentKitError = new TestError('AgentKit error')
      const stringError = 'String error'
      const objectError = { toString: () => 'Object error' }
      
      expect(getErrorMessage(error)).toBe('Error message')
      expect(getErrorMessage(agentKitError)).toBe('AgentKit error')
      expect(getErrorMessage(stringError)).toBe('String error')
      expect(getErrorMessage(objectError)).toBe('Object error')
      expect(getErrorMessage(123)).toBe('123')
    })

    it('should wrap unknown errors correctly', () => {
      const originalError = new Error('Original error')
      const wrapped = wrapError(originalError, 'NETWORK_ERROR', 'network', 'Custom message')
      
      expect(wrapped).toBeInstanceOf(AgentKitError)
      expect(wrapped.message).toBe('Custom message')
      expect(wrapped.code).toBe('NETWORK_ERROR')
      expect(wrapped.category).toBe('network')
      expect(wrapped.cause).toBe(originalError)
    })

    it('should wrap non-error values', () => {
      const wrapped = wrapError('String error', 'INTERNAL_ERROR', 'internal')
      
      expect(wrapped).toBeInstanceOf(AgentKitError)
      expect(wrapped.message).toBe('String error')
      expect(wrapped.code).toBe('INTERNAL_ERROR')
      expect(wrapped.category).toBe('internal')
      expect(wrapped.cause).toBeUndefined()
    })
  })

  describe('Error Categories and Codes', () => {
    it('should have all required error categories', () => {
      const categories: ErrorCategory[] = [
        'client', 'server', 'network', 'config', 'validation',
        'authentication', 'resource', 'internal'
      ]
      
      // This test ensures TypeScript compilation succeeds with all categories
      categories.forEach(category => {
        expect(typeof category).toBe('string')
      })
    })

    it('should have comprehensive error codes', () => {
      const codes: ErrorCode[] = [
        'AGENT_INIT_FAILED',
        'NETWORK_ERROR',
        'INVALID_INPUT',
        'AUTHENTICATION_FAILED',
        'RESOURCE_EXHAUSTED'
      ]
      
      // This test ensures TypeScript compilation succeeds with all codes
      codes.forEach(code => {
        expect(typeof code).toBe('string')
      })
    })
  })

  describe('Error Inheritance and Polymorphism', () => {
    it('should support error inheritance chains', () => {
      class CustomError extends TestError {
        readonly customProperty = 'custom'
      }
      
      const error = new CustomError('Custom error')
      
      expect(error instanceof Error).toBe(true)
      expect(error instanceof AgentKitError).toBe(true)
      expect(error instanceof TestError).toBe(true)
      expect(error instanceof CustomError).toBe(true)
      expect(error.customProperty).toBe('custom')
    })

    it('should handle polymorphic error arrays', () => {
      const errors: AgentKitError[] = [
        new TestError('Error 1'),
        new TestClientError('Error 2'),
        new TestNetworkError('Error 3')
      ]
      
      expect(errors.every(e => e instanceof AgentKitError)).toBe(true)
      expect(errors.map(e => e.category)).toEqual(['internal', 'client', 'network'])
      expect(errors.map(e => e.isRetryable())).toEqual([false, false, true])
    })
  })
})