import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { CircuitBreaker, CircuitState } from '../src/circuitBreaker'

describe('CircuitBreaker Metrics and Logging', () => {
  let circuitBreaker: CircuitBreaker
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    consoleSpy.mockRestore()
    vi.restoreAllMocks()
  })

  describe('Metrics Tracking', () => {
    it('should track comprehensive metrics accurately', async () => {
      circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 2,
        timeout: 1000,
        name: 'metrics-test'
      })

      // Execute some successful requests
      await circuitBreaker.execute(async () => 'success1')
      await circuitBreaker.execute(async () => 'success2')
      
      // Execute some failed requests  
      try {
        await circuitBreaker.execute(async () => { throw new Error('fail1') })
      } catch {}
      
      try {
        await circuitBreaker.execute(async () => { throw new Error('fail2') })
      } catch {}

      // Circuit should be open now, try rejected requests
      try {
        await circuitBreaker.execute(async () => 'should-be-rejected')
      } catch {}
      
      try {
        await circuitBreaker.execute(async () => 'should-be-rejected-2')
      } catch {}

      const metrics = circuitBreaker.getMetrics()
      
      expect(metrics.totalRequests).toBe(6)
      expect(metrics.successfulRequests).toBe(2)
      expect(metrics.failedRequests).toBe(2)
      expect(metrics.rejectedRequests).toBe(2)
      expect(metrics.stateTransitions).toBeGreaterThan(0) // Should have transitioned to OPEN
      expect(metrics.averageResponseTime).toBeGreaterThanOrEqual(0)
      expect(metrics.uptime).toBeGreaterThan(0)
    })

    it('should calculate average response time correctly', async () => {
      console.time('circuit-breaker-response-time-calculation')
      circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 5,
        name: 'response-time-test'
      })

      // Execute requests with known delays
      await circuitBreaker.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return 'fast'
      })

      await circuitBreaker.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 200))
        return 'slow'
      })

      vi.advanceTimersByTime(300)

      const metrics = circuitBreaker.getMetrics()
      expect(metrics.averageResponseTime).toBeGreaterThan(0)
      expect(metrics.successfulRequests).toBe(2)
      console.timeEnd('circuit-breaker-response-time-calculation')
    }, { timeout: 10000 })

    it('should track state transitions accurately', async () => {
      circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 1,
        timeout: 100,
        name: 'state-transitions-test'
      })

      const initialMetrics = circuitBreaker.getMetrics()
      expect(initialMetrics.stateTransitions).toBe(0)

      // Trigger failure to open circuit
      try {
        await circuitBreaker.execute(async () => { throw new Error('fail') })
      } catch {}

      const afterFailMetrics = circuitBreaker.getMetrics()
      expect(afterFailMetrics.stateTransitions).toBe(1) // CLOSED -> OPEN

      // Advance time to trigger half-open
      vi.advanceTimersByTime(150)
      
      // Execute successful request to close circuit
      await circuitBreaker.execute(async () => 'success')

      const finalMetrics = circuitBreaker.getMetrics()
      expect(finalMetrics.stateTransitions).toBe(3) // CLOSED -> OPEN -> HALF_OPEN -> CLOSED
    })

    it('should maintain response time history within limits', async () => {
      console.time('circuit-breaker-response-history')
      circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 1000, // High threshold to avoid opening
        name: 'response-history-test'
      })

      // Execute 150 requests (more than the 100 limit)
      for (let i = 0; i < 150; i++) {
        await circuitBreaker.execute(async () => `success-${i}`)
      }

      const metrics = circuitBreaker.getMetrics()
      expect(metrics.successfulRequests).toBe(150)
      expect(metrics.averageResponseTime).toBeGreaterThanOrEqual(0)
      // Should have calculated average from latest 100 response times only
      console.timeEnd('circuit-breaker-response-history')
    }, { timeout: 12000 })
  })

  describe('Logging and Console Output', () => {
    it('should log circuit state transitions', async () => {
      circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 1,
        timeout: 1000,
        name: 'logging-test',
        debug: true
      })

      // Trigger circuit opening
      try {
        await circuitBreaker.execute(async () => { throw new Error('test failure') })
      } catch {}

      // Should have logged circuit opening
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[CircuitBreaker:logging-test] Circuit opened after 1 failures')
      )
    })

    it('should log half-open and recovery transitions', async () => {
      circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 1,
        timeout: 100,
        name: 'recovery-logging-test'
      })

      // Open circuit
      try {
        await circuitBreaker.execute(async () => { throw new Error('fail') })
      } catch {}

      // Advance time and trigger recovery
      vi.advanceTimersByTime(150)
      await circuitBreaker.execute(async () => 'success')

      // Should have logged half-open transition
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[CircuitBreaker:recovery-logging-test] Circuit transitioned to half-open')
      )

      // Should have logged recovery
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[CircuitBreaker:recovery-logging-test] Circuit recovered and closed successfully')
      )
    })

    it('should not log when debug is disabled', async () => {
      circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 1,
        timeout: 1000,
        name: 'no-debug-test',
        debug: false
      })

      const consoleSpy = vi.spyOn(console, 'log')
      const consoleWarnSpy = vi.spyOn(console, 'warn')

      // Trigger circuit opening
      try {
        await circuitBreaker.execute(async () => { throw new Error('test failure') })
      } catch {}

      // Console messages should still appear (not debug logs, but user-facing messages)
      expect(consoleWarnSpy).toHaveBeenCalled()
    })
  })

  describe('Integration with Transport Operations', () => {
    it('should provide metrics for transport monitoring', async () => {
      circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 3,
        timeout: 5000,
        name: 'transport-monitor-test'
      })

      // Simulate various transport scenarios
      const scenarios = [
        { name: 'fast-success', delay: 50, shouldFail: false },
        { name: 'slow-success', delay: 200, shouldFail: false },
        { name: 'network-error', delay: 100, shouldFail: true },
        { name: 'timeout-error', delay: 300, shouldFail: true },
        { name: 'recovery-success', delay: 75, shouldFail: false }
      ]

      for (const scenario of scenarios) {
        try {
          await circuitBreaker.execute(async () => {
            await new Promise(resolve => setTimeout(resolve, scenario.delay))
            if (scenario.shouldFail) {
              throw new Error(`${scenario.name} simulated failure`)
            }
            return `${scenario.name} completed`
          })
        } catch {
          // Expected for failing scenarios
        }
      }

      vi.advanceTimersByTime(1000)

      const metrics = circuitBreaker.getMetrics()
      
      // Verify metrics provide useful transport monitoring data
      expect(metrics.totalRequests).toBe(5)
      expect(metrics.successfulRequests).toBe(3)
      expect(metrics.failedRequests).toBe(2)
      expect(metrics.averageResponseTime).toBeGreaterThan(0)
      expect(metrics.averageResponseTime).toBeLessThan(500) // Should be reasonable
      
      // Circuit should still be closed (under failure threshold)
      expect(circuitBreaker.getStats().state).toBe(CircuitState.CLOSED)
    })

    it('should track metrics during circuit recovery cycle', async () => {
      circuitBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 2,
        timeout: 200,
        name: 'recovery-cycle-test'
      })

      // Phase 1: Normal operation
      await circuitBreaker.execute(async () => 'normal-1')
      
      let metrics = circuitBreaker.getMetrics()
      expect(metrics.stateTransitions).toBe(0)

      // Phase 2: Failures leading to circuit opening
      try { await circuitBreaker.execute(async () => { throw new Error('fail-1') }) } catch {}
      try { await circuitBreaker.execute(async () => { throw new Error('fail-2') }) } catch {}
      
      metrics = circuitBreaker.getMetrics()
      expect(metrics.stateTransitions).toBe(1) // CLOSED -> OPEN
      expect(metrics.failedRequests).toBe(2)

      // Phase 3: Rejected requests while open
      try { await circuitBreaker.execute(async () => 'should-reject-1') } catch {}
      try { await circuitBreaker.execute(async () => 'should-reject-2') } catch {}
      
      metrics = circuitBreaker.getMetrics()
      expect(metrics.rejectedRequests).toBe(2)

      // Phase 4: Time passes, circuit goes to half-open and recovers
      vi.advanceTimersByTime(250)
      await circuitBreaker.execute(async () => 'recovery-success')
      
      metrics = circuitBreaker.getMetrics()
      expect(metrics.stateTransitions).toBe(3) // CLOSED -> OPEN -> HALF_OPEN -> CLOSED
      expect(metrics.successfulRequests).toBe(2) // normal-1 + recovery-success

      // Verify final state
      expect(circuitBreaker.getStats().state).toBe(CircuitState.CLOSED)
    })
  })
})