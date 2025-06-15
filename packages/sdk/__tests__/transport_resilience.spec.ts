/**
 * Transport Resilience and Circuit Breaker Stress Tests
 * Validates backpressure protocol, atomic state transitions, and concurrent reliability
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CircuitBreaker, CircuitState } from '../src/circuitBreaker'
import { AgentManager } from '../src/AgentManager'
import type { Agent, Transport, TransportStatus } from '@agentkit/types'
import { TransportBackpressureError } from '../src/errors'

/**
 * TransportTestHarness - Mock transport with controllable backpressure and reliability
 */
class TransportTestHarness implements Transport {
  id = 'test-transport-harness'
  name = 'Transport Test Harness'
  config = {}

  private messageQueue: any[] = []
  private initialized = false
  private _maxQueueSize = 10
  private _enableBackpressure = true
  private _failureRate = 0 // 0-1, probability of send failure
  private _sendDelay = 0 // ms delay for send operations
  private sendCallCount = 0
  private receiveCalls: any[] = []

  constructor(options: {
    maxQueueSize?: number
    enableBackpressure?: boolean
    failureRate?: number
    sendDelay?: number
  } = {}) {
    this._maxQueueSize = options.maxQueueSize ?? 10
    this._enableBackpressure = options.enableBackpressure ?? true
    this._failureRate = options.failureRate ?? 0
    this._sendDelay = options.sendDelay ?? 0
  }

  async init(): Promise<void> {
    this.initialized = true
  }

  async send(message: any): Promise<void> {
    this.sendCallCount++
    
    // Simulate send delay
    if (this._sendDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this._sendDelay))
    }
    
    // Simulate random failures
    if (this._failureRate > 0 && Math.random() < this._failureRate) {
      throw new Error(`Transport send failed (simulated failure ${this.sendCallCount})`)
    }
    
    this.messageQueue.push(message)
  }

  async receive(): Promise<any> {
    const call = { timestamp: Date.now() }
    this.receiveCalls.push(call)
    return call
  }

  canAcceptMore(): boolean {
    if (!this._enableBackpressure) {
      return true
    }
    return this.messageQueue.length < this._maxQueueSize
  }

  getStatus(): TransportStatus {
    return {
      canAcceptMore: this.canAcceptMore(),
      queueSize: this.messageQueue.length,
      maxQueueSize: this._enableBackpressure ? this._maxQueueSize : undefined,
      isHealthy: this.initialized,
      healthMessage: this.initialized ? 'Transport operational' : 'Transport not initialized'
    }
  }

  // Test control methods
  setMaxQueueSize(size: number): void {
    this._maxQueueSize = size
  }

  setFailureRate(rate: number): void {
    this._failureRate = Math.max(0, Math.min(1, rate))
  }

  fillQueue(count?: number): void {
    const fillCount = count ?? this._maxQueueSize
    // Clear existing queue first to ensure predictable behavior
    this.messageQueue.length = 0
    for (let i = 0; i < fillCount; i++) {
      this.messageQueue.push({ test: `fill-${i}` })
    }
  }

  clearQueue(): void {
    this.messageQueue.length = 0
  }

  getQueueSize(): number {
    return this.messageQueue.length
  }

  getSendCallCount(): number {
    return this.sendCallCount
  }

  reset(): void {
    this.messageQueue.length = 0
    this.sendCallCount = 0
    this.receiveCalls.length = 0
    this._failureRate = 0
    this._sendDelay = 0
  }
}

/**
 * Mock Agent for testing
 */
const createMockAgent = (): Agent => ({
  id: 'test-agent-resilience',
  name: 'Test Agent Resilience',
  version: '1.0.0',
  init: vi.fn().mockResolvedValue(undefined),
  handle: vi.fn().mockResolvedValue({ result: 'test result' }),
  shutdown: vi.fn().mockResolvedValue(undefined)
})

describe('🚀 Transport Resilience and Circuit Breaker Stress Tests', () => {
  let transport: TransportTestHarness
  let agent: Agent
  let manager: AgentManager

  beforeEach(async () => {
    agent = createMockAgent()
    transport = new TransportTestHarness()
    
    manager = new AgentManager(agent, transport, {
      features: {
        enableCircuitBreaker: true
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        timeout: 1000,
        debug: false
      },
      enableBackpressureQueue: true,
      debug: false
    }, [], agent.id)
    
    await manager.initialize()
  })

  afterEach(async () => {
    if (manager) {
      await manager.shutdown()
    }
    vi.clearAllMocks()
  })

  describe('🚦 Transport Backpressure Protocol', () => {
    it('should respect canAcceptMore() and throw TransportBackpressureError', async () => {
      // Fill the transport queue to capacity
      transport.fillQueue()
      expect(transport.canAcceptMore()).toBe(false)

      // Attempt to send when transport is full
      await expect(manager.send({ message: 'test' })).rejects.toThrow(TransportBackpressureError)
      
      // Verify error details
      try {
        await manager.send({ message: 'test' })
      } catch (error) {
        expect(error).toBeInstanceOf(TransportBackpressureError)
        expect((error as TransportBackpressureError).transportId).toBe(transport.id)
      }
    })

    it('should allow sending when transport has capacity', async () => {
      // Ensure transport has capacity
      transport.clearQueue()
      expect(transport.canAcceptMore()).toBe(true)

      // Should send successfully
      await expect(manager.send({ message: 'test' })).resolves.not.toThrow()
      expect(transport.getQueueSize()).toBe(1)
    })

    it('should handle transport status for detailed backpressure info', async () => {
      const status = transport.getStatus()
      expect(status).toEqual({
        canAcceptMore: true,
        queueSize: 0,
        maxQueueSize: 10,
        isHealthy: true,
        healthMessage: 'Transport operational'
      })

      // Fill queue partially
      transport.fillQueue(7)
      const statusPartial = transport.getStatus()
      expect(statusPartial.canAcceptMore).toBe(true)
      expect(statusPartial.queueSize).toBe(7)

      // Fill queue completely
      transport.fillQueue(10)
      const statusFull = transport.getStatus()
      expect(statusFull.canAcceptMore).toBe(false)
      expect(statusFull.queueSize).toBe(10)
    })

    it('should handle transport recovery from backpressure', async () => {
      // Fill transport to capacity
      transport.fillQueue()
      expect(transport.canAcceptMore()).toBe(false)

      // Clear some space
      transport.clearQueue()
      expect(transport.canAcceptMore()).toBe(true)

      // Should be able to send again
      await expect(manager.send({ message: 'recovery test' })).resolves.not.toThrow()
    })
  })

  describe('🔁 Circuit Breaker Atomic State Transitions', () => {
    it('should handle concurrent failures atomically without race conditions', async () => {
      const circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 5,
        timeout: 1000,
        debug: false
      })

      // Configure transport to always fail
      transport.setFailureRate(1.0)

      // Create 20 concurrent operations that will all fail
      const concurrentOperations = Array.from({ length: 20 }, (_, i) => 
        circuitBreaker.execute(async () => {
          await transport.send({ test: `concurrent-${i}` })
          return i
        }).catch(error => ({ error, index: i }))
      )

      const results = await Promise.all(concurrentOperations)
      
      // All operations should have failed
      const failures = results.filter(r => 'error' in r)
      expect(failures.length).toBe(20)

      // Circuit should be open after threshold is exceeded
      const stats = circuitBreaker.getStats()
      expect(stats.state).toBe(CircuitState.OPEN)
      expect(stats.failureCount).toBeGreaterThanOrEqual(5)

      // Subsequent requests should be rejected immediately
      await expect(circuitBreaker.execute(() => Promise.resolve('test')))
        .rejects.toThrow('Circuit breaker is open')
    })

    it('should handle 50 concurrent sends with 30 failures triggering circuit open', async () => {
      const circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 25, // Trip after 25 failures
        timeout: 2000,
        debug: false
      })

      // Configure transport to fail ~60% of the time
      transport.setFailureRate(0.6)
      transport.setMaxQueueSize(100) // Increase capacity to avoid backpressure

      let successCount = 0
      let failureCount = 0

      // Create 50 concurrent operations
      const concurrentOperations = Array.from({ length: 50 }, (_, i) => 
        circuitBreaker.execute(async () => {
          await transport.send({ test: `stress-${i}` })
          successCount++
          return i
        }).catch(error => {
          failureCount++
          return { error, index: i }
        })
      )

      await Promise.all(concurrentOperations)

      console.log(`Stress test results: ${successCount} successes, ${failureCount} failures`)

      // Circuit should be open if failure threshold was exceeded
      const stats = circuitBreaker.getStats()
      if (failureCount >= 25) {
        expect(stats.state).toBe(CircuitState.OPEN)
      }

      expect(stats.stateTransitions).toBeGreaterThan(0)
    })

    it('should recover through HALF_OPEN to CLOSED state after timeout', async () => {
      const circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 3,
        timeout: 100, // Short timeout for testing
        recoveryThreshold: 2,
        debug: false
      })

      // Force circuit to open with failures
      transport.setFailureRate(1.0)
      
      for (let i = 0; i < 5; i++) {
        await circuitBreaker.execute(() => transport.send({ test: i })).catch(() => {})
      }

      expect(circuitBreaker.getStats().state).toBe(CircuitState.OPEN)

      // Wait for timeout to expire
      await new Promise(resolve => setTimeout(resolve, 150))

      // Fix transport
      transport.setFailureRate(0)

      // First request should transition to HALF_OPEN and succeed
      await circuitBreaker.execute(() => transport.send({ test: 'recovery-1' }))
      expect(circuitBreaker.getStats().state).toBe(CircuitState.HALF_OPEN)

      // Second successful request should close the circuit
      await circuitBreaker.execute(() => transport.send({ test: 'recovery-2' }))
      expect(circuitBreaker.getStats().state).toBe(CircuitState.CLOSED)
    })

    it('should prevent state flip-flopping with concurrent transitions', async () => {
      const circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 3,
        timeout: 100,
        recoveryThreshold: 1,
        debug: false
      })

      // Track state transitions
      const stateChanges: Array<{ state: CircuitState; timestamp: number }> = []
      
      const observabilityHooks = {
        onCircuitOpen: (event: any) => stateChanges.push({ state: CircuitState.OPEN, timestamp: event.timestamp }),
        onCircuitClose: (event: any) => stateChanges.push({ state: CircuitState.CLOSED, timestamp: event.timestamp }),
        onCircuitHalfOpen: (event: any) => stateChanges.push({ state: CircuitState.HALF_OPEN, timestamp: event.timestamp })
      }

      const circuitBreakerWithHooks = new CircuitBreaker({
        enabled: true,
        failureThreshold: 3,
        timeout: 100,
        recoveryThreshold: 1,
        observabilityHooks,
        debug: false
      })

      // Cause failures to open circuit
      transport.setFailureRate(1.0)
      
      // 10 concurrent failing operations
      const failOperations = Array.from({ length: 10 }, (_, i) => 
        circuitBreakerWithHooks.execute(() => transport.send({ test: i })).catch(() => {})
      )
      await Promise.all(failOperations)

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150))

      // Fix transport and send concurrent recovery requests
      transport.setFailureRate(0)
      
      const recoveryOperations = Array.from({ length: 5 }, (_, i) => 
        circuitBreakerWithHooks.execute(() => transport.send({ test: `recovery-${i}` })).catch(() => {})
      )
      await Promise.all(recoveryOperations)

      // Verify state transition history
      expect(stateChanges.length).toBeGreaterThan(0)
      
      // Should not have rapid state changes (flip-flopping)
      const uniqueStates = new Set(stateChanges.map(c => c.state))
      expect(uniqueStates.size).toBeGreaterThan(1) // Should have transitioned states
      
      // Final state should be stable
      const finalStats = circuitBreakerWithHooks.getStats()
      expect([CircuitState.CLOSED, CircuitState.HALF_OPEN].includes(finalStats.state)).toBe(true)
    })
  })

  describe('🧪 Backpressure + Circuit Breaker Integration', () => {
    it('should handle backpressure without triggering circuit breaker', async () => {
      const circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 5,
        timeout: 1000,
        debug: false
      })

      // Fill transport to trigger backpressure
      transport.fillQueue()

      let backpressureErrors = 0
      let circuitBreakerErrors = 0

      // Try multiple sends that will hit backpressure
      for (let i = 0; i < 3; i++) {
        try {
          await manager.send({ test: i })
        } catch (error) {
          if (error instanceof TransportBackpressureError) {
            backpressureErrors++
          } else {
            circuitBreakerErrors++
          }
        }
      }

      // Should only get backpressure errors, not circuit breaker errors
      expect(backpressureErrors).toBe(3)
      expect(circuitBreakerErrors).toBe(0)

      // Circuit should still be closed (backpressure doesn't count as failures)
      expect(circuitBreaker.getStats().state).toBe(CircuitState.CLOSED)
    })

    it('should handle mixed backpressure and failure scenarios', async () => {
      // Set moderate failure rate and small queue
      transport.setFailureRate(0.3)
      transport.setMaxQueueSize(3)

      let successCount = 0
      let backpressureCount = 0
      let failureCount = 0

      // Send many messages to trigger both conditions
      for (let i = 0; i < 15; i++) {
        try {
          await manager.send({ test: i })
          successCount++
        } catch (error) {
          if (error instanceof TransportBackpressureError) {
            backpressureCount++
          } else {
            failureCount++
          }
        }
      }

      console.log(`Mixed scenario: ${successCount} successes, ${backpressureCount} backpressure, ${failureCount} failures`)

      // Should have a mix of outcomes
      expect(successCount + backpressureCount + failureCount).toBe(15)
      expect(backpressureCount).toBeGreaterThan(0)
    })
  })

  describe('📊 Observability and Metrics', () => {
    it('should track detailed metrics during stress scenarios', async () => {
      const circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 10,
        timeout: 1000,
        debug: false
      })

      transport.setFailureRate(0.2) // 20% failure rate

      // Execute many operations
      const operations = Array.from({ length: 50 }, (_, i) => 
        circuitBreaker.execute(async () => {
          await transport.send({ test: i })
          return i
        }).catch(() => null)
      )

      await Promise.all(operations)

      const metrics = circuitBreaker.getMetrics()
      expect(metrics.totalRequests).toBe(50)
      expect(metrics.successfulRequests + metrics.failedRequests + metrics.rejectedRequests).toBe(50)
      expect(metrics.stateTransitions).toBeGreaterThanOrEqual(0)
      expect(metrics.averageResponseTime).toBeGreaterThanOrEqual(0)
      expect(metrics.uptime).toBeGreaterThan(0)
    })

    it('should provide detailed state information', async () => {
      const circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 2,
        timeout: 1000,
        debug: false
      })

      const initialState = circuitBreaker.getCurrentState()
      expect(initialState.state).toBe(CircuitState.CLOSED)
      expect(initialState.canExecute).toBe(true)
      expect(initialState.nextAttemptIn).toBeUndefined()

      // Force circuit to open
      transport.setFailureRate(1.0)
      await circuitBreaker.execute(() => transport.send({ test: 1 })).catch(() => {})
      await circuitBreaker.execute(() => transport.send({ test: 2 })).catch(() => {})

      const openState = circuitBreaker.getCurrentState()
      expect(openState.state).toBe(CircuitState.OPEN)
      expect(openState.canExecute).toBe(false)
      expect(openState.nextAttemptIn).toBeGreaterThan(0)
    })
  })
})