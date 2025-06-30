import { describe, it, expect, beforeEach, vi, afterEach, afterAll } from 'vitest'
import { CircuitBreaker, CircuitState, CircuitBreakerError } from '../src/circuitBreaker'
import { cleanupAllResources, registerCircuitBreaker, unregisterCircuitBreaker } from './test-utils'

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker
  let mockFn: ReturnType<typeof vi.fn>

  beforeEach(() => {
    console.time('circuit-breaker-setup')
    vi.useFakeTimers()
    mockFn = vi.fn()
    console.timeEnd('circuit-breaker-setup')
  })

  afterEach(async () => {
    console.time('circuit-breaker-cleanup')
    try {
      // Unregister any circuit breakers created in this test
      if (circuitBreaker) {
        unregisterCircuitBreaker(circuitBreaker)
      }
      vi.useRealTimers()
      // Allow any pending timers to be cleaned up
      await new Promise(resolve => setImmediate(resolve))
    } catch (error) {
      // Ignore cleanup errors
    }
    console.timeEnd('circuit-breaker-cleanup')
  })

  afterAll(async () => {
    await cleanupAllResources()
  })

  describe('Configuration and Validation', () => {
    it('should use default options when none provided', () => {
      circuitBreaker = new CircuitBreaker()
      registerCircuitBreaker(circuitBreaker)
      const stats = circuitBreaker.getStats()
      
      expect(stats.state).toBe(CircuitState.CLOSED)
      expect(stats.failureCount).toBe(0)
      expect(stats.successCount).toBe(0)
    })

    it('should accept custom options', () => {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 3,
        timeout: 30000,
        enabled: true,
        name: 'test-breaker'
      })

      expect(circuitBreaker.isEnabled()).toBe(true)
    })

    it('should validate failureThreshold option', () => {
      expect(() => new CircuitBreaker({ failureThreshold: 0 })).toThrow('failureThreshold must be >= 1')
      expect(() => new CircuitBreaker({ failureThreshold: -1 })).toThrow('failureThreshold must be >= 1')
    })

    it('should validate timeout option', () => {
      expect(() => new CircuitBreaker({ timeout: 0 })).toThrow('timeout must be >= 1')
      expect(() => new CircuitBreaker({ timeout: -1 })).toThrow('timeout must be >= 1')
    })

    it('should be disabled by default', () => {
      circuitBreaker = new CircuitBreaker()
      expect(circuitBreaker.isEnabled()).toBe(false)
    })
  })

  describe('Disabled Circuit Breaker', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({ enabled: false })
    })

    it('should execute function directly when disabled', async () => {
      mockFn.mockResolvedValue('success')
      
      const result = await circuitBreaker.execute(mockFn)
      
      expect(result).toBe('success')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('should allow errors to propagate when disabled', async () => {
      const error = new Error('test error')
      mockFn.mockRejectedValue(error)
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('test error')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('should always return true for canExecute when disabled', () => {
      expect(circuitBreaker.canExecute()).toBe(true)
    })
  })

  describe('Enabled Circuit Breaker - Closed State', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 3,
        timeout: 30000,
        name: 'test-breaker'
      })
    })

    it('should execute successfully and record success', async () => {
      mockFn.mockResolvedValue('success')
      
      const result = await circuitBreaker.execute(mockFn)
      const stats = circuitBreaker.getStats()
      
      expect(result).toBe('success')
      expect(stats.state).toBe(CircuitState.CLOSED)
      expect(stats.successCount).toBe(1)
      expect(stats.failureCount).toBe(0)
      expect(stats.lastSuccessTime).toBeDefined()
    })

    it('should record failures without opening circuit if under threshold', async () => {
      const error = new Error('test error')
      mockFn.mockRejectedValue(error)
      
      // Two failures (under threshold of 3)
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('test error')
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('test error')
      
      const stats = circuitBreaker.getStats()
      expect(stats.state).toBe(CircuitState.CLOSED)
      expect(stats.failureCount).toBe(2)
      expect(stats.lastFailureTime).toBeDefined()
    })

    it('should open circuit when failure threshold is reached', async () => {
      const error = new Error('test error')
      mockFn.mockRejectedValue(error)
      
      // Three failures (meets threshold)
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('test error')
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('test error')
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('test error')
      
      const stats = circuitBreaker.getStats()
      expect(stats.state).toBe(CircuitState.OPEN)
      expect(stats.failureCount).toBe(3)
      expect(stats.openedAt).toBeDefined()
    }, { timeout: 8000 })
  })

  describe('Enabled Circuit Breaker - Open State', () => {
    beforeEach(async () => {
      circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 2,
        timeout: 30000,
        name: 'test-breaker'
      })
      
      // Force circuit to open state
      const error = new Error('test error')
      mockFn.mockRejectedValue(error)
      
      // Execute twice to open circuit
      try {
        await circuitBreaker.execute(mockFn)
      } catch {
        // Expected failure
      }
      try {
        await circuitBreaker.execute(mockFn)
      } catch {
        // Expected failure that should open circuit
      }
      
      // Clear the mock call history after setup
      mockFn.mockClear()
    })

    it('should reject requests immediately when open', async () => {
      mockFn.mockResolvedValue('success')
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(CircuitBreakerError)
      expect(mockFn).not.toHaveBeenCalled()
    })

    it('should provide proper error information when open', async () => {
      try {
        await circuitBreaker.execute(mockFn)
        expect.fail('Should have thrown CircuitBreakerError')
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerError)
        const cbError = error as CircuitBreakerError
        expect(cbError.code).toBe('CIRCUIT_BREAKER_OPEN')
        expect(cbError.category).toBe('resource')
        expect(cbError.context?.stats?.state).toBe(CircuitState.OPEN)
        expect(cbError.context?.nextAttemptAt).toBeDefined()
      }
    })

    it('should return false for canExecute when open', () => {
      expect(circuitBreaker.canExecute()).toBe(false)
    })

    it('should transition to half-open after timeout', async () => {
      console.time('circuit-breaker-half-open-transition')
      // Advance time past timeout
      vi.advanceTimersByTime(31000)
      
      expect(circuitBreaker.canExecute()).toBe(true)
      
      // First call should transition to half-open
      mockFn.mockResolvedValue('success')
      await circuitBreaker.execute(mockFn)
      
      const stats = circuitBreaker.getStats()
      expect(stats.state).toBe(CircuitState.CLOSED) // Success in half-open closes circuit
      console.timeEnd('circuit-breaker-half-open-transition')
    }, { timeout: 10000 })
  })

  describe('Enabled Circuit Breaker - Half-Open State', () => {
    beforeEach(async () => {
      circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 2,
        timeout: 30000,
        name: 'test-breaker'
      })
      
      // Open the circuit
      const error = new Error('test error')
      mockFn.mockRejectedValue(error)
      try {
        await circuitBreaker.execute(mockFn)
      } catch {
        // Expected failure
      }
      try {
        await circuitBreaker.execute(mockFn)
      } catch {
        // Expected failure that should open circuit
      }
      
      // Advance time to trigger half-open transition
      vi.advanceTimersByTime(31000)
      mockFn.mockClear()
    })

    it('should close circuit on successful execution in half-open state', async () => {
      mockFn.mockResolvedValue('success')
      
      const result = await circuitBreaker.execute(mockFn)
      const stats = circuitBreaker.getStats()
      
      expect(result).toBe('success')
      expect(stats.state).toBe(CircuitState.CLOSED)
      expect(stats.failureCount).toBe(0) // Reset on close
    })

    it('should open circuit again on failure in half-open state', async () => {
      const error = new Error('half-open failure')
      mockFn.mockRejectedValue(error)
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('half-open failure')
      
      const stats = circuitBreaker.getStats()
      expect(stats.state).toBe(CircuitState.OPEN)
      expect(stats.openedAt).toBeDefined()
    })
  })

  describe('Manual Control', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 2,
        timeout: 30000,
        name: 'test-breaker'
      })
    })

    it('should allow manual reset to closed state', async () => {
      // Open the circuit
      const error = new Error('test error')
      mockFn.mockRejectedValue(error)
      try {
        await circuitBreaker.execute(mockFn)
      } catch {
        // Expected failure
      }
      try {
        await circuitBreaker.execute(mockFn)
      } catch {
        // Expected failure that should open circuit
      }
      
      expect(circuitBreaker.getStats().state).toBe(CircuitState.OPEN)
      
      // Manual reset
      await circuitBreaker.reset()
      
      const stats = circuitBreaker.getStats()
      expect(stats.state).toBe(CircuitState.CLOSED)
      expect(stats.failureCount).toBe(0)
      expect(stats.successCount).toBe(0)
      expect(stats.openedAt).toBeUndefined()
    })

    it('should allow manual force open', async () => {
      expect(circuitBreaker.getStats().state).toBe(CircuitState.CLOSED)
      
      await circuitBreaker.forceOpen()
      
      const stats = circuitBreaker.getStats()
      expect(stats.state).toBe(CircuitState.OPEN)
      expect(stats.openedAt).toBeDefined()
    })
  })

  describe('Statistics and Monitoring', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 3,
        timeout: 60000,
        name: 'test-breaker'
      })
    })

    it('should track success and failure counts accurately', async () => {
      mockFn.mockResolvedValueOnce('success1')
      mockFn.mockRejectedValueOnce(new Error('error1'))
      mockFn.mockResolvedValueOnce('success2')
      
      await circuitBreaker.execute(mockFn)
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('error1')
      await circuitBreaker.execute(mockFn)
      
      const stats = circuitBreaker.getStats()
      expect(stats.successCount).toBe(2)
      expect(stats.failureCount).toBe(1)
      expect(stats.state).toBe(CircuitState.CLOSED)
    })

    it('should track timing information', async () => {
      const beforeTime = Date.now()
      
      mockFn.mockResolvedValue('success')
      await circuitBreaker.execute(mockFn)
      
      vi.advanceTimersByTime(1000)
      
      const error = new Error('test error')
      mockFn.mockRejectedValue(error)
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('test error')
      
      const stats = circuitBreaker.getStats()
      expect(stats.lastSuccessTime).toBeGreaterThanOrEqual(beforeTime)
      expect(stats.lastFailureTime).toBeGreaterThan(stats.lastSuccessTime!)
    })

    it('should calculate next attempt time correctly when open', async () => {
      // Open the circuit
      const error = new Error('test error')
      mockFn.mockRejectedValue(error)
      try {
        await circuitBreaker.execute(mockFn)
      } catch {
        // Expected failure
      }
      try {
        await circuitBreaker.execute(mockFn)
      } catch {
        // Expected failure
      }
      try {
        await circuitBreaker.execute(mockFn)
      } catch {
        // Expected failure that should open circuit
      }
      
      const stats = circuitBreaker.getStats()
      expect(stats.state).toBe(CircuitState.OPEN)
      expect(stats.nextAttemptAt).toBe(stats.openedAt! + 60000)
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle function that throws synchronously', async () => {
      circuitBreaker = new CircuitBreaker({ enabled: true, failureThreshold: 1 })
      
      const syncError = () => {
        throw new Error('sync error')
      }
      
      await expect(circuitBreaker.execute(syncError)).rejects.toThrow('sync error')
      
      const stats = circuitBreaker.getStats()
      expect(stats.state).toBe(CircuitState.OPEN)
      expect(stats.failureCount).toBe(1)
    })

    it('should handle function that returns rejected promise', async () => {
      circuitBreaker = new CircuitBreaker({ enabled: true, failureThreshold: 1 })
      
      const rejectedPromise = async () => {
        return Promise.reject(new Error('async error'))
      }
      
      await expect(circuitBreaker.execute(rejectedPromise)).rejects.toThrow('async error')
      
      const stats = circuitBreaker.getStats()
      expect(stats.state).toBe(CircuitState.OPEN)
      expect(stats.failureCount).toBe(1)
    })

    it('should handle multiple rapid failures correctly', async () => {
      console.time('circuit-breaker-rapid-failures')
      circuitBreaker = new CircuitBreaker({ enabled: true, failureThreshold: 3 })
      const error = new Error('rapid failure')
      
      // Execute failures sequentially to ensure proper counting
      const results = []
      for (let i = 0; i < 10; i++) {
        try {
          await circuitBreaker.execute(() => Promise.reject(error))
          results.push({ status: 'fulfilled' })
        } catch (err) {
          results.push({ status: 'rejected', reason: err })
        }
      }
      
      // Some should fail with original error, some with circuit breaker error
      const originalErrors = results.filter(r => 
        r.status === 'rejected' && r.reason.message === 'rapid failure'
      )
      const circuitErrors = results.filter(r => 
        r.status === 'rejected' && r.reason instanceof CircuitBreakerError
      )
      
      expect(originalErrors.length).toBeGreaterThanOrEqual(3) // At least threshold reached
      expect(circuitErrors.length).toBeGreaterThan(0) // Some blocked by circuit
      expect(originalErrors.length + circuitErrors.length).toBe(10) // All failed
      console.timeEnd('circuit-breaker-rapid-failures')
    }, { timeout: 10000 })
  })

  describe('Feature Flag Integration', () => {
    it('should respect enabled flag at runtime', () => {
      circuitBreaker = new CircuitBreaker({ enabled: false })
      expect(circuitBreaker.isEnabled()).toBe(false)
      
      circuitBreaker = new CircuitBreaker({ enabled: true })
      expect(circuitBreaker.isEnabled()).toBe(true)
    })

    it('should work correctly when toggling enabled state is not supported', async () => {
      // Test that once created with enabled=false, it behaves consistently
      circuitBreaker = new CircuitBreaker({ enabled: false, failureThreshold: 1 })
      
      const error = new Error('test error')
      mockFn.mockRejectedValue(error)
      
      // Should allow error to propagate without circuit breaker logic
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('test error')
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('test error')
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('test error')
      
      // Circuit should still be considered closed (no state changes when disabled)
      const stats = circuitBreaker.getStats()
      expect(stats.state).toBe(CircuitState.CLOSED)
      expect(stats.failureCount).toBe(0) // No tracking when disabled
    })
  })

  describe('Full Lifecycle Simulation', () => {
    it('should complete full fail-recover cycle correctly', async () => {
      console.time('circuit-breaker-full-lifecycle')
      circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 2,
        timeout: 1000,
        name: 'lifecycle-test'
      })
      
      // Phase 1: Closed - successful operations
      mockFn.mockResolvedValue('success')
      await circuitBreaker.execute(mockFn)
      expect(circuitBreaker.getStats().state).toBe(CircuitState.CLOSED)
      expect(circuitBreaker.getStats().successCount).toBe(1)
      
      // Phase 2: Closed - failures leading to open
      const error = new Error('service down')
      mockFn.mockRejectedValue(error)
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('service down')
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('service down')
      
      expect(circuitBreaker.getStats().state).toBe(CircuitState.OPEN)
      expect(circuitBreaker.getStats().failureCount).toBe(2)
      
      // Phase 3: Open - rejected requests
      mockFn.mockResolvedValue('should not execute')
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(CircuitBreakerError)
      expect(mockFn).toHaveBeenCalledTimes(3) // 1 success + 2 failures (no calls during open)
      
      // Phase 4: Time passes, transition to half-open
      vi.advanceTimersByTime(1500)
      expect(circuitBreaker.canExecute()).toBe(true)
      
      // Phase 5: Half-open - successful recovery
      mockFn.mockResolvedValue('recovered')
      const result = await circuitBreaker.execute(mockFn)
      
      expect(result).toBe('recovered')
      expect(circuitBreaker.getStats().state).toBe(CircuitState.CLOSED)
      expect(circuitBreaker.getStats().failureCount).toBe(0) // Reset on recovery
      
      // Phase 6: Normal operation resumed
      mockFn.mockResolvedValue('normal operation')
      await circuitBreaker.execute(mockFn)
      expect(circuitBreaker.getStats().successCount).toBe(3) // 1 initial + 1 from recovery + 1 from normal
      console.timeEnd('circuit-breaker-full-lifecycle')
    }, { timeout: 15000 })
  })

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})