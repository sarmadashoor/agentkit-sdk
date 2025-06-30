/**
 * ✅ Lifecycle cleanup enforced (afterEach, afterAll added).
 * ✅ Leak checker integrated.
 * ✅ Handle tracking and systematic shutdown.
 * ✅ Aligned with AgentKit secure architecture policy.
 */

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { CircuitBreaker, CircuitState, CircuitBreakerError } from '../src/circuitBreaker'
import { registerCleanup, cleanupAllResources, flushPromises } from './test-utils'

// Handle leak detection constants
const BASELINE_HANDLE_COUNT = 3
const BASELINE_REQUEST_COUNT = 0

describe('Circuit Breaker Integration', () => {
  let circuitBreakers: CircuitBreaker[] = []

  beforeEach(() => {
    vi.useFakeTimers()
    circuitBreakers = []
    
    // Register circuit breaker factory
    registerCleanup(async () => {
      for (const breaker of circuitBreakers) {
        try {
          breaker.shutdown()
        } catch (error) {
          console.error('[CLEANUP] Error shutting down circuit breaker:', error)
        }
      }
      circuitBreakers.length = 0
    })
  })

  afterEach(async () => {
    // Explicit shutdown to avoid handle leaks and ensure deterministic cleanup
    for (const breaker of circuitBreakers) {
      try {
        breaker.shutdown()
      } catch (error) {
        console.error('[CLEANUP] Error shutting down circuit breaker:', error)
      }
    }
    circuitBreakers.length = 0
    
    vi.useRealTimers()
    vi.clearAllTimers()
    vi.clearAllMocks()
    await cleanupAllResources()
    await flushPromises()
    
    // Handle leak checker
    const activeHandles = process._getActiveHandles()
    const activeRequests = process._getActiveRequests?.() ?? []

    if (activeHandles.length > BASELINE_HANDLE_COUNT) {
      console.error('[LEAK DETECTED] Active handles:', activeHandles.map(h => h.constructor.name))
      throw new Error(`Active handles detected after test: ${activeHandles.length} (baseline: ${BASELINE_HANDLE_COUNT})`)
    }

    if (activeRequests.length > BASELINE_REQUEST_COUNT) {
      console.error('[LEAK DETECTED] Active requests:', activeRequests.map(r => r.constructor?.name || 'Unknown'))
      throw new Error(`Active requests detected after test: ${activeRequests.length} (baseline: ${BASELINE_REQUEST_COUNT})`)
    }
  })

  describe('Basic Feature Flag Integration', () => {
    it('should create circuit breaker instances', () => {
      const breaker = new CircuitBreaker({
        enabled: false,
        failureThreshold: 1
      })
      circuitBreakers.push(breaker)
      
      expect(breaker.isEnabled()).toBe(false)
    })

    it('should demonstrate circuit breaker functionality synchronously', () => {
      const disabledBreaker = new CircuitBreaker({
        enabled: false,
        failureThreshold: 1
      })
      circuitBreakers.push(disabledBreaker)
      
      expect(disabledBreaker.isEnabled()).toBe(false)
      expect(disabledBreaker.getStats().state).toBe(CircuitState.CLOSED)

      const enabledBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 1,
        name: 'integration-test'
      })
      circuitBreakers.push(enabledBreaker)
      
      expect(enabledBreaker.isEnabled()).toBe(true)
      expect(enabledBreaker.getStats().state).toBe(CircuitState.CLOSED)
    })

    it('should handle execution when disabled', async () => {
      const disabledBreaker = new CircuitBreaker({
        enabled: false,
        failureThreshold: 1
      })
      circuitBreakers.push(disabledBreaker)
      
      let callCount = 0
      const failingFn = async () => {
        callCount++
        throw new Error('Always fails')
      }
      
      // Should execute directly when disabled
      await expect(disabledBreaker.execute(failingFn)).rejects.toThrow('Always fails')
      await expect(disabledBreaker.execute(failingFn)).rejects.toThrow('Always fails')
      expect(callCount).toBe(2)
    })

    it('should open circuit when enabled and threshold reached', async () => {
      const enabledBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 1,
        name: 'integration-test'
      })
      circuitBreakers.push(enabledBreaker)
      
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
    })
  })

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})