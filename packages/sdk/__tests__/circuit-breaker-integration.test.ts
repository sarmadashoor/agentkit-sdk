import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CircuitBreaker, CircuitState, CircuitBreakerError } from '../src/circuitBreaker'

describe('Circuit Breaker Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Basic Feature Flag Integration', () => {
    it('should create circuit breaker instances', () => {
      const breaker = new CircuitBreaker({
        enabled: false,
        failureThreshold: 1
      })
      
      expect(breaker.isEnabled()).toBe(false)
      breaker.shutdown()
    })

    it('should demonstrate circuit breaker functionality synchronously', () => {
      const disabledBreaker = new CircuitBreaker({
        enabled: false,
        failureThreshold: 1
      })
      
      expect(disabledBreaker.isEnabled()).toBe(false)
      expect(disabledBreaker.getStats().state).toBe(CircuitState.CLOSED)
      disabledBreaker.shutdown()

      const enabledBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 1,
        name: 'integration-test'
      })
      
      expect(enabledBreaker.isEnabled()).toBe(true)
      expect(enabledBreaker.getStats().state).toBe(CircuitState.CLOSED)
      enabledBreaker.shutdown()
    })

    it('should handle execution when disabled', async () => {
      const disabledBreaker = new CircuitBreaker({
        enabled: false,
        failureThreshold: 1
      })
      
      let callCount = 0
      const failingFn = async () => {
        callCount++
        throw new Error('Always fails')
      }
      
      // Should execute directly when disabled
      await expect(disabledBreaker.execute(failingFn)).rejects.toThrow('Always fails')
      await expect(disabledBreaker.execute(failingFn)).rejects.toThrow('Always fails')
      expect(callCount).toBe(2)
      
      disabledBreaker.shutdown()
    })

    it('should open circuit when enabled and threshold reached', async () => {
      const enabledBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 1,
        name: 'integration-test'
      })
      
      let callCount = 0
      const failingFn = async () => {
        callCount++
        throw new Error('Always fails')
      }
      
      // First call should fail normally
      await expect(enabledBreaker.execute(failingFn)).rejects.toThrow('Always fails')
      
      // Second call should be blocked by circuit breaker
      await expect(enabledBreaker.execute(failingFn)).rejects.toThrow(CircuitBreakerError)
      
      expect(callCount).toBe(1) // Only first call executed
      expect(enabledBreaker.getStats().state).toBe(CircuitState.OPEN)
      
      enabledBreaker.shutdown()
    })
  })
})