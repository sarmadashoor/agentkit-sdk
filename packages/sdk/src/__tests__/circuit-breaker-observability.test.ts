/**
 * Comprehensive tests for CircuitBreaker state transitions and observability
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { CircuitBreaker, CircuitState, CircuitBreakerObservabilityHooks, StateTransitionEvent } from '../circuitBreaker'
import { CircuitBreakerError } from '../errors'

describe('CircuitBreaker Observability and State Transitions', () => {
  let circuitBreaker: CircuitBreaker
  let mockObservabilityHooks: CircuitBreakerObservabilityHooks
  let mockSuccessFunction: vi.MockedFunction<() => Promise<string>>
  let mockFailureFunction: vi.MockedFunction<() => Promise<string>>

  beforeEach(() => {
    vi.clearAllTimers()
    vi.useFakeTimers()
    
    mockObservabilityHooks = {
      onCircuitOpen: vi.fn(),
      onCircuitClose: vi.fn(),
      onCircuitHalfOpen: vi.fn(),
      onRequestRejected: vi.fn(),
      onRequestSuccess: vi.fn(),
      onRequestFailure: vi.fn()
    }

    mockSuccessFunction = vi.fn().mockResolvedValue('success')
    mockFailureFunction = vi.fn().mockRejectedValue(new Error('test failure'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('State Transition Tracking', () => {
    test('tracks state transitions from CLOSED to OPEN to HALF_OPEN to CLOSED', async () => {
      circuitBreaker = new CircuitBreaker({
        name: 'test-circuit',
        failureThreshold: 2,
        timeout: 1000,
        enabled: true,
        observabilityHooks: mockObservabilityHooks
      })

      expect(circuitBreaker.getCurrentState().state).toBe(CircuitState.CLOSED)

      // Cause failures to open circuit
      await expect(circuitBreaker.execute(mockFailureFunction)).rejects.toThrow()
      await expect(circuitBreaker.execute(mockFailureFunction)).rejects.toThrow()

      // Circuit should be open
      expect(circuitBreaker.getCurrentState().state).toBe(CircuitState.OPEN)
      expect(mockObservabilityHooks.onCircuitOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          circuitName: 'test-circuit',
          fromState: CircuitState.CLOSED,
          toState: CircuitState.OPEN,
          reason: 'failure threshold exceeded (2/2)'
        })
      )

      // Fast-forward past timeout to trigger half-open
      vi.advanceTimersByTime(1000)

      // Next request should transition to half-open
      const successPromise = circuitBreaker.execute(mockSuccessFunction)
      await successPromise

      expect(circuitBreaker.getCurrentState().state).toBe(CircuitState.CLOSED)
      expect(mockObservabilityHooks.onCircuitHalfOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          fromState: CircuitState.OPEN,
          toState: CircuitState.HALF_OPEN,
          reason: 'timeout expired, attempting recovery'
        })
      )
      expect(mockObservabilityHooks.onCircuitClose).toHaveBeenCalledWith(
        expect.objectContaining({
          fromState: CircuitState.HALF_OPEN,
          toState: CircuitState.CLOSED,
          reason: 'recovery threshold reached (1/1)'
        })
      )
    })

    test('tracks multiple recovery attempts with custom recovery threshold', async () => {
      circuitBreaker = new CircuitBreaker({
        name: 'recovery-circuit',
        failureThreshold: 1,
        timeout: 500,
        recoveryThreshold: 3,
        enabled: true,
        observabilityHooks: mockObservabilityHooks
      })

      // Open the circuit
      await expect(circuitBreaker.execute(mockFailureFunction)).rejects.toThrow()
      expect(circuitBreaker.getCurrentState().state).toBe(CircuitState.OPEN)

      // Wait for timeout and try recovery
      vi.advanceTimersByTime(500)

      // First success - should stay in half-open
      await circuitBreaker.execute(mockSuccessFunction)
      expect(circuitBreaker.getCurrentState().state).toBe(CircuitState.HALF_OPEN)

      // Second success - should stay in half-open
      await circuitBreaker.execute(mockSuccessFunction)
      expect(circuitBreaker.getCurrentState().state).toBe(CircuitState.HALF_OPEN)

      // Third success - should close the circuit
      await circuitBreaker.execute(mockSuccessFunction)
      expect(circuitBreaker.getCurrentState().state).toBe(CircuitState.CLOSED)

      expect(mockObservabilityHooks.onCircuitClose).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'recovery threshold reached (3/3)'
        })
      )
    })

    test('handles failure during recovery attempt', async () => {
      circuitBreaker = new CircuitBreaker({
        name: 'retry-circuit',
        failureThreshold: 1,
        timeout: 300,
        enabled: true,
        observabilityHooks: mockObservabilityHooks
      })

      // Open the circuit
      await expect(circuitBreaker.execute(mockFailureFunction)).rejects.toThrow()
      
      // Wait and attempt recovery
      vi.advanceTimersByTime(300)

      // Failure during recovery should re-open circuit
      await expect(circuitBreaker.execute(mockFailureFunction)).rejects.toThrow()

      expect(circuitBreaker.getCurrentState().state).toBe(CircuitState.OPEN)
      
      // Should have been called twice - once for initial failure, once for recovery failure
      expect(mockObservabilityHooks.onCircuitOpen).toHaveBeenCalledTimes(2)
      expect(mockObservabilityHooks.onCircuitOpen).toHaveBeenLastCalledWith(
        expect.objectContaining({
          fromState: CircuitState.HALF_OPEN,
          toState: CircuitState.OPEN,
          reason: 'failure during recovery attempt'
        })
      )
    })
  })

  describe('Request Observability', () => {
    test('tracks successful requests with timing', async () => {
      circuitBreaker = new CircuitBreaker({
        name: 'timing-circuit',
        enabled: true,
        observabilityHooks: mockObservabilityHooks
      })

      const slowSuccess = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return 'slow success'
      })

      const executePromise = circuitBreaker.execute(slowSuccess)
      vi.advanceTimersByTime(100)
      await executePromise

      expect(mockObservabilityHooks.onRequestSuccess).toHaveBeenCalledWith(
        'timing-circuit',
        expect.any(Number)
      )

      const successCall = (mockObservabilityHooks.onRequestSuccess as any).mock.calls[0]
      expect(successCall[1]).toBeGreaterThanOrEqual(99) // Response time
    })

    test('tracks failed requests with error details', async () => {
      circuitBreaker = new CircuitBreaker({
        name: 'error-circuit',
        enabled: true,
        observabilityHooks: mockObservabilityHooks
      })

      const customError = new Error('Custom error message')
      const failingFunction = vi.fn().mockRejectedValue(customError)

      await expect(circuitBreaker.execute(failingFunction)).rejects.toThrow()

      expect(mockObservabilityHooks.onRequestFailure).toHaveBeenCalledWith(
        'error-circuit',
        customError,
        expect.any(Number)
      )
    })

    test('tracks rejected requests when circuit is open', async () => {
      circuitBreaker = new CircuitBreaker({
        name: 'rejection-circuit',
        failureThreshold: 1,
        enabled: true,
        observabilityHooks: mockObservabilityHooks
      })

      // Open the circuit
      await expect(circuitBreaker.execute(mockFailureFunction)).rejects.toThrow()

      // Multiple rejections
      await expect(circuitBreaker.execute(mockSuccessFunction)).rejects.toThrow(CircuitBreakerError)
      await expect(circuitBreaker.execute(mockSuccessFunction)).rejects.toThrow(CircuitBreakerError)

      expect(mockObservabilityHooks.onRequestRejected).toHaveBeenCalledTimes(2)
      expect(mockObservabilityHooks.onRequestRejected).toHaveBeenNthCalledWith(1, 'rejection-circuit', 1)
      expect(mockObservabilityHooks.onRequestRejected).toHaveBeenNthCalledWith(2, 'rejection-circuit', 2)
    })
  })

  describe('State Transition History', () => {
    test('maintains detailed transition history', async () => {
      circuitBreaker = new CircuitBreaker({
        name: 'history-circuit',
        failureThreshold: 2,
        timeout: 500,
        enabled: true,
        observabilityHooks: mockObservabilityHooks
      })

      const startTime = Date.now()

      // Cause transition to OPEN
      await expect(circuitBreaker.execute(mockFailureFunction)).rejects.toThrow()
      await expect(circuitBreaker.execute(mockFailureFunction)).rejects.toThrow()

      vi.advanceTimersByTime(500)

      // Cause transition to HALF_OPEN and then CLOSED
      await circuitBreaker.execute(mockSuccessFunction)

      const history = circuitBreaker.getStateTransitionHistory()
      
      expect(history).toHaveLength(3)
      
      // Check CLOSED -> OPEN transition
      expect(history[0]).toMatchObject({
        circuitName: 'history-circuit',
        fromState: CircuitState.CLOSED,
        toState: CircuitState.OPEN,
        reason: 'failure threshold exceeded (2/2)',
        metadata: {
          failureCount: 2,
          threshold: 2
        }
      })

      // Check OPEN -> HALF_OPEN transition
      expect(history[1]).toMatchObject({
        fromState: CircuitState.OPEN,
        toState: CircuitState.HALF_OPEN,
        reason: 'timeout expired, attempting recovery'
      })

      // Check HALF_OPEN -> CLOSED transition
      expect(history[2]).toMatchObject({
        fromState: CircuitState.HALF_OPEN,
        toState: CircuitState.CLOSED,
        reason: 'recovery threshold reached (1/1)'
      })

      // Verify timestamps are in order
      expect(history[0].timestamp).toBeLessThanOrEqual(history[1].timestamp)
      expect(history[1].timestamp).toBeLessThanOrEqual(history[2].timestamp)
    })

    test('provides current state information with timing', async () => {
      circuitBreaker = new CircuitBreaker({
        name: 'state-info-circuit',
        failureThreshold: 1,
        timeout: 1000,
        enabled: true
      })

      const initialState = circuitBreaker.getCurrentState()
      expect(initialState.state).toBe(CircuitState.CLOSED)
      expect(initialState.canExecute).toBe(true)
      expect(initialState.nextAttemptIn).toBeUndefined()

      // Open the circuit
      await expect(circuitBreaker.execute(mockFailureFunction)).rejects.toThrow()

      vi.advanceTimersByTime(200)

      const openState = circuitBreaker.getCurrentState()
      expect(openState.state).toBe(CircuitState.OPEN)
      expect(openState.canExecute).toBe(false)
      expect(openState.timeInCurrentState).toBeGreaterThanOrEqual(199)
      expect(openState.nextAttemptIn).toBeGreaterThan(0)
      expect(openState.nextAttemptIn).toBeLessThanOrEqual(800)
    })
  })

  describe('Circuit Reset and Manual Control', () => {
    test('handles manual circuit reset with proper transitions', async () => {
      circuitBreaker = new CircuitBreaker({
        name: 'manual-circuit',
        failureThreshold: 1,
        enabled: true,
        observabilityHooks: mockObservabilityHooks
      })

      // Open the circuit
      await expect(circuitBreaker.execute(mockFailureFunction)).rejects.toThrow()
      expect(circuitBreaker.getCurrentState().state).toBe(CircuitState.OPEN)

      // Manual reset
      circuitBreaker.reset()
      
      expect(circuitBreaker.getCurrentState().state).toBe(CircuitState.CLOSED)
      expect(mockObservabilityHooks.onCircuitClose).toHaveBeenCalledWith(
        expect.objectContaining({
          fromState: CircuitState.OPEN,
          toState: CircuitState.CLOSED,
          reason: 'recovery successful'
        })
      )

      // Should be able to execute again
      const result = await circuitBreaker.execute(mockSuccessFunction)
      expect(result).toBe('success')
    })

    test('handles forced circuit opening', () => {
      circuitBreaker = new CircuitBreaker({
        name: 'force-open-circuit',
        enabled: true,
        observabilityHooks: mockObservabilityHooks
      })

      expect(circuitBreaker.getCurrentState().state).toBe(CircuitState.CLOSED)

      circuitBreaker.forceOpen()

      expect(circuitBreaker.getCurrentState().state).toBe(CircuitState.OPEN)
      expect(mockObservabilityHooks.onCircuitOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          fromState: CircuitState.CLOSED,
          toState: CircuitState.OPEN
        })
      )
    })
  })

  describe('Advanced Scenarios', () => {
    test('handles rapid state transitions correctly', async () => {
      circuitBreaker = new CircuitBreaker({
        name: 'rapid-circuit',
        failureThreshold: 1,
        timeout: 100,
        recoveryThreshold: 1,
        enabled: true,
        observabilityHooks: mockObservabilityHooks
      })

      // Quick failure -> open
      await expect(circuitBreaker.execute(mockFailureFunction)).rejects.toThrow()
      
      // Quick recovery attempt
      vi.advanceTimersByTime(100)
      await circuitBreaker.execute(mockSuccessFunction)
      
      // Another failure -> open again
      await expect(circuitBreaker.execute(mockFailureFunction)).rejects.toThrow()
      
      // Another recovery
      vi.advanceTimersByTime(100)
      await circuitBreaker.execute(mockSuccessFunction)

      const history = circuitBreaker.getStateTransitionHistory()
      
      // Should have 6 transitions: CLOSED->OPEN, OPEN->HALF_OPEN, HALF_OPEN->CLOSED, CLOSED->OPEN, OPEN->HALF_OPEN, HALF_OPEN->CLOSED
      expect(history).toHaveLength(6)
      
      expect(mockObservabilityHooks.onCircuitOpen).toHaveBeenCalledTimes(2)
      expect(mockObservabilityHooks.onCircuitHalfOpen).toHaveBeenCalledTimes(2)
      expect(mockObservabilityHooks.onCircuitClose).toHaveBeenCalledTimes(2)
    })

    test('provides accurate statistics during complex scenarios', async () => {
      circuitBreaker = new CircuitBreaker({
        name: 'stats-circuit',
        failureThreshold: 3,
        timeout: 200,
        enabled: true,
        observabilityHooks: mockObservabilityHooks
      })

      // Execute mixed operations
      await circuitBreaker.execute(mockSuccessFunction) // Success
      await expect(circuitBreaker.execute(mockFailureFunction)).rejects.toThrow() // Failure
      await circuitBreaker.execute(mockSuccessFunction) // Success
      await expect(circuitBreaker.execute(mockFailureFunction)).rejects.toThrow() // Failure
      await expect(circuitBreaker.execute(mockFailureFunction)).rejects.toThrow() // Failure - circuit opens

      const stats = circuitBreaker.getStats()
      
      expect(stats.state).toBe(CircuitState.OPEN)
      expect(stats.successCount).toBe(2)
      expect(stats.failureCount).toBe(3)
      expect(stats.stateTransitions).toBe(1) // CLOSED -> OPEN
      expect(stats.recoverySuccessCount).toBe(0)

      const metrics = circuitBreaker.getMetrics()
      expect(metrics.totalRequests).toBe(5)
      expect(metrics.successfulRequests).toBe(2)
      expect(metrics.failedRequests).toBe(3)
      expect(metrics.rejectedRequests).toBe(0)
    })

    test('handles disabled circuit breaker correctly', async () => {
      circuitBreaker = new CircuitBreaker({
        name: 'disabled-circuit',
        enabled: false,
        observabilityHooks: mockObservabilityHooks
      })

      // Should execute directly without circuit breaker logic
      const result = await circuitBreaker.execute(mockSuccessFunction)
      expect(result).toBe('success')

      // Even failures should not trigger circuit breaker
      await expect(circuitBreaker.execute(mockFailureFunction)).rejects.toThrow()
      
      expect(circuitBreaker.getCurrentState().state).toBe(CircuitState.CLOSED)
      expect(circuitBreaker.getStats().stateTransitions).toBe(0)

      // No observability hooks should be called for disabled circuit
      expect(mockObservabilityHooks.onCircuitOpen).not.toHaveBeenCalled()
      expect(mockObservabilityHooks.onRequestSuccess).not.toHaveBeenCalled()
      expect(mockObservabilityHooks.onRequestFailure).not.toHaveBeenCalled()
    })
  })

  describe('Error Scenarios', () => {
    test('provides detailed error context when circuit is open', async () => {
      circuitBreaker = new CircuitBreaker({
        name: 'error-context-circuit',
        failureThreshold: 1,
        timeout: 5000,
        enabled: true
      })

      // Open the circuit
      await expect(circuitBreaker.execute(mockFailureFunction)).rejects.toThrow()

      try {
        await circuitBreaker.execute(mockSuccessFunction)
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerError)
        const cbError = error as CircuitBreakerError
        expect(cbError.context.stats).toBeDefined()
        expect(cbError.context.nextAttemptAt).toBeDefined()
      }
    })

    test('maintains state consistency during concurrent operations', async () => {
      circuitBreaker = new CircuitBreaker({
        name: 'concurrent-circuit',
        failureThreshold: 2,
        enabled: true,
        observabilityHooks: mockObservabilityHooks
      })

      // Simulate concurrent operations
      const operations = [
        circuitBreaker.execute(mockSuccessFunction),
        circuitBreaker.execute(mockFailureFunction).catch(() => 'failed'),
        circuitBreaker.execute(mockSuccessFunction),
        circuitBreaker.execute(mockFailureFunction).catch(() => 'failed')
      ]

      await Promise.all(operations)

      const stats = circuitBreaker.getStats()
      expect(stats.successCount + stats.failureCount).toBe(4)
      
      // State should be consistent
      expect([CircuitState.CLOSED, CircuitState.OPEN]).toContain(stats.state)
    })
  })
})