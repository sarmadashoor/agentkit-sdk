import { describe, it, expect, beforeEach, vi } from 'vitest'
import { connectAgent } from '../src/index'
import { AgentRegistry } from '@agentkit/registry'
import { DummyTransport } from '@agentkit/transports-dummy'
import { CircuitBreakerError } from '../src/circuitBreaker'

describe('CircuitBreaker Transport Integration', () => {
  let registry: AgentRegistry
  let unreliableAgent: any
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    registry = new AgentRegistry()
    
    // Mock console to capture circuit breaker logs
    consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})

    let callCount = 0
    unreliableAgent = {
      id: 'unreliable-agent',
      name: 'Unreliable Agent',
      version: '1.0.0',
      init: async () => {},
      handle: async (input: any) => {
        callCount++
        
        // Fail every 3rd request to test circuit breaker
        if (callCount % 3 === 0) {
          throw new Error(`Agent failure ${callCount}`)
        }
        
        return { 
          processed: input, 
          timestamp: Date.now(),
          callCount 
        }
      },
      shutdown: async () => {}
    }

    // Register unreliable agent
    registry.register({
      id: 'unreliable-agent',
      name: 'Unreliable Agent',
      version: '1.0.0',
      factory: () => unreliableAgent
    })

    registry.registerTransport(new DummyTransport({ debug: false }))
  })

  afterEach(async () => {
    console.time('circuit-breaker-transport-integration-cleanup')
    vi.useRealTimers()
    consoleSpy.mockRestore()
    vi.restoreAllMocks()
    
    // Ensure any pending async operations complete
    await new Promise(resolve => setTimeout(resolve, 50))
    console.timeEnd('circuit-breaker-transport-integration-cleanup')
  })

  describe('Transport Message Send Wrapping', () => {
    it('should wrap transport operations with circuit breaker when enabled', async () => {
      console.time('circuit-breaker-transport-integration')
      const handle = await connectAgent({
        agent: 'unreliable-agent',
        transport: 'dummy',
        registry,
        features: {
          enableCircuitBreaker: true
        },
        circuitBreaker: {
          failureThreshold: 2,
          timeout: 1000,
          name: 'transport-test'
        },
        debug: true
      })

      // First two requests should succeed
      await expect(handle.send({ id: 1 })).resolves.not.toThrow()
      await expect(handle.send({ id: 2 })).resolves.not.toThrow()
      
      // Third request should fail (agent throws error)
      await expect(handle.send({ id: 3 })).rejects.toThrow('Agent failure 3')
      
      // Fourth request should succeed
      await expect(handle.send({ id: 4 })).resolves.not.toThrow()
      
      // Fifth request should succeed  
      await expect(handle.send({ id: 5 })).resolves.not.toThrow()
      
      // Sixth request should fail (agent throws error)
      await expect(handle.send({ id: 6 })).rejects.toThrow('Agent failure 6')
      
      // Seventh request should be blocked by circuit breaker (threshold reached)
      await expect(handle.send({ id: 7 })).rejects.toThrow(CircuitBreakerError)

      // Should have logged circuit opening
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Circuit opened after 2 failures')
      )

      await handle.shutdown()
      console.timeEnd('circuit-breaker-transport-integration')
    }, { timeout: 15000 })

    it('should not use circuit breaker when feature flag is disabled', async () => {
      const handle = await connectAgent({
        agent: 'unreliable-agent',
        transport: 'dummy',
        registry,
        features: {
          enableCircuitBreaker: false // Disabled
        },
        circuitBreaker: {
          failureThreshold: 1, // Very low threshold, but should be ignored
          timeout: 1000
        }
      })

      // All requests should be processed normally, even failures
      await expect(handle.send({ id: 1 })).resolves.not.toThrow()
      await expect(handle.send({ id: 2 })).resolves.not.toThrow()
      await expect(handle.send({ id: 3 })).rejects.toThrow('Agent failure 3') // Agent failure, not circuit breaker
      await expect(handle.send({ id: 4 })).resolves.not.toThrow()
      await expect(handle.send({ id: 5 })).resolves.not.toThrow()
      await expect(handle.send({ id: 6 })).rejects.toThrow('Agent failure 6') // Agent failure, not circuit breaker
      
      // Should not have any circuit breaker logs
      expect(console.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Circuit opened')
      )

      await handle.shutdown()
    })

    it('should recover circuit breaker after timeout period', async () => {
      console.time('circuit-breaker-recovery')
      const handle = await connectAgent({
        agent: 'unreliable-agent',
        transport: 'dummy',
        registry,
        features: {
          enableCircuitBreaker: true
        },
        circuitBreaker: {
          failureThreshold: 2,
          timeout: 500, // 500ms timeout
          name: 'recovery-test'
        }
      })

      // Generate failures to open circuit
      await expect(handle.send({ id: 1 })).resolves.not.toThrow()
      await expect(handle.send({ id: 2 })).resolves.not.toThrow()
      await expect(handle.send({ id: 3 })).rejects.toThrow('Agent failure 3')
      await expect(handle.send({ id: 4 })).resolves.not.toThrow()
      await expect(handle.send({ id: 5 })).resolves.not.toThrow()
      await expect(handle.send({ id: 6 })).rejects.toThrow('Agent failure 6')
      
      // Circuit should be open now
      await expect(handle.send({ id: 7 })).rejects.toThrow(CircuitBreakerError)

      // Advance time past timeout
      vi.advanceTimersByTime(600)
      
      // Next request should succeed (circuit in half-open, then closes on success)
      await expect(handle.send({ id: 8 })).resolves.not.toThrow()
      
      // Should have logged recovery
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Circuit transitioned to half-open')
      )
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Circuit recovered and closed successfully')
      )

      await handle.shutdown()
      console.timeEnd('circuit-breaker-recovery')
    }, { timeout: 12000 })

    it('should handle rapid concurrent requests correctly', async () => {
      console.time('circuit-breaker-concurrent-requests')
      const handle = await connectAgent({
        agent: 'unreliable-agent',
        transport: 'dummy',
        registry,
        features: {
          enableCircuitBreaker: true
        },
        circuitBreaker: {
          failureThreshold: 3,
          timeout: 1000,
          name: 'concurrent-test'
        },
        resourceLimits: {
          maxConcurrentRequests: 2,
          maxQueueSize: 5
        }
      })

      // Send many concurrent requests
      const requests = Array.from({ length: 10 }, (_, i) => 
        handle.send({ id: i + 1 }).catch(error => ({ error: error.message }))
      )

      const results = await Promise.all(requests)
      
      // Should have mix of successes, agent failures, circuit breaker blocks, and queue rejections
      const successes = results.filter(r => !('error' in r))
      const agentFailures = results.filter(r => 'error' in r && r.error.includes('Agent failure'))
      const circuitBreakerBlocks = results.filter(r => 'error' in r && r.error.includes('circuit breaker'))
      const queueRejections = results.filter(r => 'error' in r && r.error.includes('queue'))
      
      expect(successes.length + agentFailures.length + circuitBreakerBlocks.length + queueRejections.length).toBe(10)
      expect(successes.length).toBeGreaterThan(0) // Some should succeed
      
      await handle.shutdown()
      console.timeEnd('circuit-breaker-concurrent-requests')
    }, { timeout: 15000 })
  })

  describe('Circuit Breaker with Resource Limits', () => {
    it('should work together with bounded executor', async () => {
      const handle = await connectAgent({
        agent: 'unreliable-agent',
        transport: 'dummy',
        registry,
        features: {
          enableCircuitBreaker: true
        },
        circuitBreaker: {
          failureThreshold: 2,
          timeout: 500,
          name: 'bounded-executor-test'
        },
        resourceLimits: {
          maxConcurrentRequests: 1,
          maxQueueSize: 2
        }
      })

      // Fill up the bounded executor and trigger circuit breaker
      const requests = Array.from({ length: 8 }, (_, i) => 
        handle.send({ id: i + 1, delay: 50 }).catch(error => error.constructor.name)
      )

      const results = await Promise.all(requests)
      
      // Should have different types of errors
      const hasResourceErrors = results.some(r => r === 'QueueFullError')
      const hasCircuitBreakerErrors = results.some(r => r === 'CircuitBreakerError') 
      const hasAgentErrors = results.some(r => r === 'AgentHandleError')
      
      // At least one type of resource management should have kicked in
      expect(hasResourceErrors || hasCircuitBreakerErrors || hasAgentErrors).toBe(true)

      await handle.shutdown()
    })
  })

  describe('Metrics and Monitoring Integration', () => {
    it('should provide transport-level metrics through circuit breaker', async () => {
      // Create a custom agent that tracks calls for verification
      let agentCallCount = 0
      const metricAgent = {
        id: 'metric-agent',
        name: 'Metric Agent', 
        version: '1.0.0',
        init: async () => {},
        handle: async (input: any) => {
          agentCallCount++
          if (agentCallCount === 3 || agentCallCount === 7) {
            throw new Error(`Metric failure ${agentCallCount}`)
          }
          return { result: `processed-${agentCallCount}` }
        },
        shutdown: async () => {}
      }

      registry.register({
        id: 'metric-agent',
        name: 'Metric Agent',
        version: '1.0.0', 
        factory: () => metricAgent
      })

      const handle = await connectAgent({
        agent: 'metric-agent',
        transport: 'dummy',
        registry,
        features: {
          enableCircuitBreaker: true
        },
        circuitBreaker: {
          failureThreshold: 2,
          timeout: 1000,
          name: 'metrics-integration-test'
        },
        debug: true
      })

      // Execute various operations to generate metrics
      const operations = [
        () => handle.send({ op: 1 }), // Success (agentCallCount = 1)
        () => handle.send({ op: 2 }), // Success (agentCallCount = 2) 
        () => handle.send({ op: 3 }), // Failure (agentCallCount = 3)
        () => handle.send({ op: 4 }), // Success (agentCallCount = 4)
        () => handle.send({ op: 5 }), // Success (agentCallCount = 5)
        () => handle.send({ op: 6 }), // Success (agentCallCount = 6)
        () => handle.send({ op: 7 }), // Failure (agentCallCount = 7) - should open circuit
        () => handle.send({ op: 8 }), // Should be rejected by circuit breaker
      ]

      for (const operation of operations) {
        try {
          await operation()
        } catch (error) {
          // Expected for some operations
        }
      }

      // Verify agent was called expected number of times (not called for circuit breaker rejection)
      expect(agentCallCount).toBe(7) // Operations 1-7, operation 8 was blocked

      await handle.shutdown()
    })
  })
})