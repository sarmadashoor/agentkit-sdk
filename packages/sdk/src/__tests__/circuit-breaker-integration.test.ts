import { describe, it, expect } from 'vitest'
import { CircuitBreaker, CircuitState, CircuitBreakerError } from '../circuitBreaker'

describe('Circuit Breaker Integration', () => {
  describe('Basic Feature Flag Integration', () => {
    it('should demonstrate circuit breaker functionality with feature flags', async () => {
      // Test with circuit breaker disabled
      const disabledBreaker = new CircuitBreaker({
        enabled: false,
        failureThreshold: 1
      })
      
      // Should always execute when disabled
      let callCount = 0
      const failingFn = async () => {
        callCount++
        throw new Error('Always fails')
      }
      
      await expect(disabledBreaker.execute(failingFn)).rejects.toThrow('Always fails')
      await expect(disabledBreaker.execute(failingFn)).rejects.toThrow('Always fails')
      expect(callCount).toBe(2) // Both calls executed
      
      // Test with circuit breaker enabled
      const enabledBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 1,
        name: 'integration-test'
      })
      
      callCount = 0
      await expect(enabledBreaker.execute(failingFn)).rejects.toThrow('Always fails')
      await expect(enabledBreaker.execute(failingFn)).rejects.toThrow(CircuitBreakerError)
      expect(callCount).toBe(1) // Only first call executed, second blocked by circuit breaker
      
      // Verify circuit breaker error details
      try {
        await enabledBreaker.execute(failingFn)
        expect.fail('Should have thrown CircuitBreakerError')
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerError)
        const cbError = error as CircuitBreakerError
        expect(cbError.code).toBe('CIRCUIT_BREAKER_OPEN')
        expect(cbError.stats.state).toBe(CircuitState.OPEN)
        expect(cbError.message).toContain('integration-test')
      }
    })
  })
})