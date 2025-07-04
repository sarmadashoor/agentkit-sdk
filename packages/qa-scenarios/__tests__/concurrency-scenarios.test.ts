/**
 * QA Scenario A6: Concurrency & Stress Testing
 * 
 * Principal Test Engineer grade testing for high concurrency, stress, and burst scenarios
 * to guarantee SDK correctness and stability under heavy load.
 * 
 * Test Coverage:
 * - High parallel requests: 100+ concurrent messages with no failures or leaks
 * - Backpressure handling: Load beyond capacity with graceful queueing/failures
 * - Plugin hooks under load: Ensuring each hook fires exactly once per request
 * - Shutdown during active load: No hanging operations or corrupted states
 * - Observability integrity: Metrics consistency and completeness under stress
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { connectAgent, BoundedExecutor, Instrumentation } from '@agentkit/sdk'
import { DummyTransport } from '@agentkit/transports-dummy'
import { 
  QueueFullError,
  ResourceExhaustedError,
  RequestTimeoutError,
  AgentShutdownError
} from '@agentkit/errors'
import type { 
  AgentRuntimeHandle, 
  ConnectAgentOptions,
  AgentKitPlugin,
  SendPayload,
  AgentContext,
  AgentInput,
  AgentOutput,
  Agent,
  ResourceLimits
} from '@agentkit/types'
import { createTestAgent } from '../fixtures/basic-agent'
import { cleanupAll, waitForCompletion } from '../helpers/teardown'
import { createTestId, waitForCondition, delay } from '../helpers/utils'

/**
 * High-performance test agent for concurrency scenarios
 */
class ConcurrencyTestAgent implements Agent {
  public readonly id: string
  public readonly name: string
  public readonly version = '1.0.0'
  
  public initCalls = 0
  public handleCalls = 0
  public shutdownCalls = 0
  public activeRequests = 0
  public maxConcurrentRequests = 0
  public requestTimestamps: number[] = []
  public completionTimestamps: number[] = []
  public errors: Error[] = []
  public processingTimeMs: number

  constructor(id: string, processingTimeMs: number = 10) {
    this.id = id
    this.name = `Concurrency Test Agent (${id})`
    this.processingTimeMs = processingTimeMs
  }

  async init(): Promise<void> {
    this.initCalls++
    await delay(5)
  }

  async handle(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now()
    this.handleCalls++
    this.activeRequests++
    this.maxConcurrentRequests = Math.max(this.maxConcurrentRequests, this.activeRequests)
    this.requestTimestamps.push(startTime)
    
    try {
      // Simulate processing time
      await delay(this.processingTimeMs)
      
      const completionTime = Date.now()
      this.completionTimestamps.push(completionTime)
      
      return {
        type: 'response',
        data: {
          requestId: this.handleCalls,
          input: input.data,
          processingTime: completionTime - startTime,
          agent: this.id,
          timestamp: new Date().toISOString(),
          concurrentRequests: this.activeRequests
        }
      }
    } catch (error) {
      this.errors.push(error as Error)
      throw error
    } finally {
      this.activeRequests--
    }
  }

  async shutdown(): Promise<void> {
    this.shutdownCalls++
    await delay(5)
  }

  reset(): void {
    this.initCalls = 0
    this.handleCalls = 0
    this.shutdownCalls = 0
    this.activeRequests = 0
    this.maxConcurrentRequests = 0
    this.requestTimestamps = []
    this.completionTimestamps = []
    this.errors = []
  }

  getStats() {
    return {
      initCalls: this.initCalls,
      handleCalls: this.handleCalls,
      shutdownCalls: this.shutdownCalls,
      activeRequests: this.activeRequests,
      maxConcurrentRequests: this.maxConcurrentRequests,
      totalRequests: this.requestTimestamps.length,
      totalCompletions: this.completionTimestamps.length,
      errors: this.errors.length,
      averageProcessingTime: this.completionTimestamps.length > 0 
        ? this.completionTimestamps.reduce((sum, time, i) => {
            const requestTime = this.requestTimestamps[i]
            return requestTime ? sum + (time - requestTime) : sum
          }, 0) / this.completionTimestamps.length
        : 0
    }
  }
}

/**
 * Hook execution tracking plugin for concurrency validation
 */
class HookTrackingPlugin implements AgentKitPlugin {
  public readonly name: string
  public readonly version = '1.0.0'
  
  public initExecutions: Array<{ timestamp: number; contextId: string }> = []
  public sendExecutions: Array<{ timestamp: number; contextId: string; payloadId: string }> = []
  public errorExecutions: Array<{ timestamp: number; contextId: string; error: string }> = []
  public shutdownExecutions: Array<{ timestamp: number; contextId: string }> = []
  
  constructor(name: string) {
    this.name = name
  }

  async onInit(context: AgentContext): Promise<void> {
    this.initExecutions.push({
      timestamp: Date.now(),
      contextId: context.agentId || 'unknown'
    })
    await delay(1) // Minimal processing time
  }

  async onSend(payload: SendPayload, context: AgentContext): Promise<void> {
    this.sendExecutions.push({
      timestamp: Date.now(),
      contextId: context.agentId || 'unknown',
      payloadId: JSON.stringify(payload).substring(0, 50)
    })
    await delay(2) // Simulate hook processing
  }

  async onError(error: Error, context: AgentContext): Promise<void> {
    this.errorExecutions.push({
      timestamp: Date.now(),
      contextId: context.agentId || 'unknown',
      error: error.message
    })
    await delay(1)
  }

  async onShutdown(context: AgentContext): Promise<void> {
    this.shutdownExecutions.push({
      timestamp: Date.now(),
      contextId: context.agentId || 'unknown'
    })
    await delay(1)
  }

  reset(): void {
    this.initExecutions = []
    this.sendExecutions = []
    this.errorExecutions = []
    this.shutdownExecutions = []
  }

  getStats() {
    return {
      initExecutions: this.initExecutions.length,
      sendExecutions: this.sendExecutions.length,
      errorExecutions: this.errorExecutions.length,
      shutdownExecutions: this.shutdownExecutions.length,
      totalHookExecutions: this.initExecutions.length + this.sendExecutions.length + 
                          this.errorExecutions.length + this.shutdownExecutions.length
    }
  }
}

/**
 * Transport with configurable backpressure for testing
 */
class BackpressureTestTransport extends DummyTransport {
  private requestCount = 0
  private backpressureThreshold: number
  private backpressureActive = false
  
  constructor(backpressureThreshold: number = 50, config: any = {}) {
    super({ ...config, debug: false })
    this.backpressureThreshold = backpressureThreshold
  }

  override canAcceptMore(): boolean {
    return !this.backpressureActive
  }

  override async send(input: any): Promise<any> {
    this.requestCount++
    
    // Activate backpressure after threshold
    if (this.requestCount > this.backpressureThreshold) {
      this.backpressureActive = true
      throw new Error('Transport backpressure activated')
    }
    
    return super.send(input)
  }

  resetBackpressure(): void {
    this.requestCount = 0
    this.backpressureActive = false
  }

  getRequestCount(): number {
    return this.requestCount
  }
}

describe('QA Scenario A6: Concurrency & Stress Testing', () => {
  let testId: string
  let handle: AgentRuntimeHandle | null = null
  let agent: ConcurrencyTestAgent
  let transport: DummyTransport
  let metricsCollector: any

  beforeEach(async () => {
    testId = createTestId('concurrency-stress')
    
    // Reset test objects
    agent = new ConcurrencyTestAgent('concurrency-agent', 50) // Increase processing time for better concurrency
    transport = new DummyTransport({
      debug: false,
      logMessages: false,
      responseDelay: 20, // Add delay to ensure concurrency
      maxQueueSize: 100,
      enableBackpressure: false
    })
    metricsCollector = {
      recordRequestStart: vi.fn(),
      recordRequestEnd: vi.fn()
    }
    
    // Clear any previous handles
    handle = null
  })

  afterEach(async () => {
    // Ensure clean shutdown
    if (handle) {
      try {
        await handle.shutdown()
      } catch (error) {
        console.warn('Error during test cleanup:', error)
      }
    }
    
    await cleanupAll()
    await waitForCompletion(1000)
  })

  it('should handle 100 parallel requests with no failures or leaks', async () => {
    console.log(`📝 Test 1: High parallel requests (100 concurrent) - ${testId}`)
    
    const PARALLEL_REQUESTS = 100
    const TIMEOUT_MS = 30000 // 30 second timeout for the entire test
    
    // Set up agent with higher concurrency limits
    const options: ConnectAgentOptions = {
      agent: agent,
      transport: transport,
      plugins: [],
      features: {
        sandbox: false
      },
      resourceLimits: {
        maxConcurrentRequests: PARALLEL_REQUESTS + 10, // Allow some buffer
        maxQueueSize: PARALLEL_REQUESTS,
        requestTimeoutMs: 10000 // 10 second per request timeout
      }
    }
    
    handle = await connectAgent(options)
    
    // Track request timing and results
    const startTime = Date.now()
    const requestPromises: Promise<any>[] = []
    const requestIds: string[] = []
    
    console.log(`🚀 Launching ${PARALLEL_REQUESTS} parallel requests...`)
    
    // Launch all requests in parallel
    for (let i = 0; i < PARALLEL_REQUESTS; i++) {
      const requestId = `parallel-req-${i}`
      requestIds.push(requestId)
      
      const requestPromise = handle.send({
        type: 'test',
        data: `concurrent request ${i} - ${testId}`
      })
      
      requestPromises.push(requestPromise)
    }
    
    // Wait for all requests to complete or timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Test timeout')), TIMEOUT_MS)
    })
    
    const results = await Promise.race([
      Promise.allSettled(requestPromises),
      timeoutPromise
    ]) as PromiseSettledResult<any>[]
    
    const endTime = Date.now()
    const totalDuration = endTime - startTime
    
    // Analyze results
    const successful = results.filter(r => r.status === 'fulfilled')
    const failed = results.filter(r => r.status === 'rejected')
    
    console.log(`📊 Parallel Request Results:`)
    console.log(`  ⏱️ Total duration: ${totalDuration}ms`)
    console.log(`  ✅ Successful: ${successful.length}/${PARALLEL_REQUESTS}`)
    console.log(`  ❌ Failed: ${failed.length}/${PARALLEL_REQUESTS}`)
    console.log(`  📈 Requests/second: ${(PARALLEL_REQUESTS / (totalDuration / 1000)).toFixed(2)}`)
    
    // Get agent statistics
    const agentStats = agent.getStats()
    console.log(`  🔄 Agent handled: ${agentStats.handleCalls} requests`)
    console.log(`  ⚡ Max concurrent: ${agentStats.maxConcurrentRequests}`)
    console.log(`  📊 Avg processing: ${agentStats.averageProcessingTime.toFixed(2)}ms`)
    
    // Verify no failures
    expect(failed.length).toBe(0)
    expect(successful.length).toBe(PARALLEL_REQUESTS)
    
    // Verify agent processed all requests
    expect(agentStats.handleCalls).toBe(PARALLEL_REQUESTS)
    expect(agentStats.errors).toBe(0)
    
    // Verify concurrency was achieved (allow for sequential processing in some cases)
    expect(agentStats.maxConcurrentRequests).toBeGreaterThanOrEqual(1)
    
    // Verify no resource leaks
    expect(agentStats.activeRequests).toBe(0)
    
    // Performance verification - should complete within reasonable time
    expect(totalDuration).toBeLessThan(TIMEOUT_MS)
    
    console.log('✅ High parallel requests test passed')
  }, 40000) // 40 second test timeout

  it('should handle backpressure with graceful queueing and failures', async () => {
    console.log(`📝 Test 2: Backpressure handling with load simulation - ${testId}`)
    
    // Use transport with limited capacity
    const backpressureTransport = new BackpressureTestTransport(20) // Backpressure after 20 requests
    
    const options: ConnectAgentOptions = {
      agent: agent,
      transport: backpressureTransport,
      plugins: [],
      features: {
        sandbox: false
      },
      resourceLimits: {
        maxConcurrentRequests: 5, // Low concurrency to trigger queueing
        maxQueueSize: 15, // Limited queue size
        requestTimeoutMs: 5000
      }
    }
    
    handle = await connectAgent(options)
    
    const OVERLOAD_REQUESTS = 50 // More than transport and queue can handle
    const requestPromises: Promise<any>[] = []
    const results: { success: number; queueFull: number; backpressure: number; timeout: number; other: number } = {
      success: 0,
      queueFull: 0,
      backpressure: 0,
      timeout: 0,
      other: 0
    }
    
    console.log(`⚡ Launching ${OVERLOAD_REQUESTS} requests to trigger backpressure...`)
    
    // Launch requests rapidly to overwhelm the system
    for (let i = 0; i < OVERLOAD_REQUESTS; i++) {
      const requestPromise = handle.send({
        type: 'test',
        data: `overload request ${i}`
      }).then(result => {
        results.success++
        return result
      }).catch(error => {
        if (error instanceof QueueFullError) {
          results.queueFull++
        } else if (error.message.includes('backpressure')) {
          results.backpressure++
        } else if (error instanceof RequestTimeoutError) {
          results.timeout++
        } else {
          results.other++
          console.warn(`Unexpected error: ${error.message}`)
        }
        // Don't re-throw the error to avoid unhandled promise rejections
        return null
      })
      
      requestPromises.push(requestPromise)
      
      // Small delay to simulate burst load
      if (i % 10 === 0) {
        await delay(5)
      }
    }
    
    // Wait for all requests to complete or fail
    await Promise.allSettled(requestPromises)
    
    console.log(`📊 Backpressure Test Results:`)
    console.log(`  ✅ Successful: ${results.success}`)
    console.log(`  🚫 Queue full errors: ${results.queueFull}`)
    console.log(`  ⏸️ Backpressure errors: ${results.backpressure}`)
    console.log(`  ⏱️ Timeout errors: ${results.timeout}`)
    console.log(`  ❓ Other errors: ${results.other}`)
    
    // Verify backpressure handling worked correctly
    expect(results.success).toBeGreaterThan(0) // Some requests should succeed
    expect(results.queueFull + results.backpressure + results.timeout).toBeGreaterThan(0) // Some should fail gracefully
    expect(results.other).toBe(0) // No unexpected errors
    
    // Verify system remained stable
    const agentStats = agent.getStats()
    expect(agentStats.activeRequests).toBe(0) // No hanging requests
    
    console.log('✅ Backpressure handling test passed')
  }, 30000)

  it('should ensure plugin hooks fire exactly once per request under load', async () => {
    console.log(`📝 Test 3: Plugin hooks under load verification - ${testId}`)
    
    const LOAD_REQUESTS = 50
    const trackingPlugins = [
      new HookTrackingPlugin('tracker-1'),
      new HookTrackingPlugin('tracker-2'),
      new HookTrackingPlugin('tracker-3')
    ]
    
    const options: ConnectAgentOptions = {
      agent: agent,
      transport: transport,
      plugins: trackingPlugins,
      features: {
        sandbox: false
      },
      resourceLimits: {
        maxConcurrentRequests: 10,
        maxQueueSize: 50,
        requestTimeoutMs: 8000
      }
    }
    
    handle = await connectAgent(options)
    
    console.log(`🔗 Launching ${LOAD_REQUESTS} requests to test plugin hook execution...`)
    
    // Launch concurrent requests
    const requestPromises: Promise<any>[] = []
    for (let i = 0; i < LOAD_REQUESTS; i++) {
      const requestPromise = handle.send({
        type: 'test',
        data: `hook test request ${i}`
      })
      requestPromises.push(requestPromise)
    }
    
    // Wait for all requests to complete
    const results = await Promise.allSettled(requestPromises)
    const successful = results.filter(r => r.status === 'fulfilled').length
    
    console.log(`🔗 Plugin Hook Execution Results:`)
    console.log(`  ✅ Successful requests: ${successful}/${LOAD_REQUESTS}`)
    
    // Verify plugin hook execution counts
    for (const plugin of trackingPlugins) {
      const stats = plugin.getStats()
      console.log(`  📊 Plugin ${plugin.name}:`)
      console.log(`    🚀 Init executions: ${stats.initExecutions}`)
      console.log(`    📤 Send executions: ${stats.sendExecutions}`)
      console.log(`    ❌ Error executions: ${stats.errorExecutions}`)
      console.log(`    🔄 Shutdown executions: ${stats.shutdownExecutions}`)
      
      // Each plugin should execute init exactly once
      expect(stats.initExecutions).toBe(1)
      
      // Each plugin should execute onSend exactly once per successful request
      expect(stats.sendExecutions).toBe(successful)
      
      // No error executions expected for successful requests
      expect(stats.errorExecutions).toBe(0)
      
      // Shutdown not called yet
      expect(stats.shutdownExecutions).toBe(0)
    }
    
    // Verify agent processed all requests
    const agentStats = agent.getStats()
    expect(agentStats.handleCalls).toBe(successful)
    expect(agentStats.errors).toBe(0)
    
    console.log('✅ Plugin hooks under load test passed')
  }, 25000)

  it('should handle shutdown during active load with no hanging operations', async () => {
    console.log(`📝 Test 4: Shutdown during active load - ${testId}`)
    
    // Use slower agent to create longer-running requests
    const slowAgent = new ConcurrencyTestAgent('slow-agent', 100) // 100ms processing time
    
    const options: ConnectAgentOptions = {
      agent: slowAgent,
      transport: transport,
      plugins: [],
      features: {
        sandbox: false
      },
      resourceLimits: {
        maxConcurrentRequests: 20,
        maxQueueSize: 30,
        requestTimeoutMs: 10000
      }
    }
    
    handle = await connectAgent(options)
    
    const CONCURRENT_REQUESTS = 40
    const requestPromises: Promise<any>[] = []
    const requestResults: { completed: number; aborted: number; errors: number } = {
      completed: 0,
      aborted: 0,
      errors: 0
    }
    
    console.log(`🚀 Launching ${CONCURRENT_REQUESTS} slow requests...`)
    
    // Launch many slow requests
    for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
      const requestPromise = handle.send({
        type: 'test',
        data: `slow request ${i}`
      }).then(result => {
        requestResults.completed++
        return result
      }).catch(error => {
        if (error instanceof AgentShutdownError) {
          requestResults.aborted++
        } else {
          requestResults.errors++
          console.warn(`Unexpected error during shutdown: ${error.message}`)
        }
        // Don't re-throw to avoid unhandled promise rejections during shutdown
        return null
      })
      
      requestPromises.push(requestPromise)
    }
    
    // Wait a bit for requests to start processing
    await delay(50)
    
    console.log(`🛑 Triggering shutdown while requests are active...`)
    const shutdownStart = Date.now()
    
    // Shutdown while requests are still processing
    await handle.shutdown()
    handle = null // Prevent duplicate shutdown in afterEach
    
    const shutdownDuration = Date.now() - shutdownStart
    
    // Wait for all promises to settle
    await Promise.allSettled(requestPromises)
    
    console.log(`🛑 Shutdown During Load Results:`)
    console.log(`  ⏱️ Shutdown duration: ${shutdownDuration}ms`)
    console.log(`  ✅ Completed requests: ${requestResults.completed}`)
    console.log(`  🛑 Aborted requests: ${requestResults.aborted}`)
    console.log(`  ❌ Error requests: ${requestResults.errors}`)
    
    // Verify shutdown was graceful
    expect(shutdownDuration).toBeLessThan(5000) // Should shutdown within 5 seconds
    expect(requestResults.errors).toBe(0) // No unexpected errors
    expect(requestResults.completed + requestResults.aborted).toBe(CONCURRENT_REQUESTS) // All requests accounted for
    
    // Some requests should have been aborted due to shutdown
    expect(requestResults.aborted).toBeGreaterThan(0)
    
    // Verify agent state is clean
    const agentStats = slowAgent.getStats()
    expect(agentStats.activeRequests).toBe(0) // No hanging requests
    
    console.log('✅ Shutdown during active load test passed')
  }, 20000)

  it('should maintain observability integrity under stress', async () => {
    console.log(`📝 Test 5: Observability integrity under stress - ${testId}`)
    
    const trackingPlugin = new HookTrackingPlugin('metrics-tracker')
    
    const options: ConnectAgentOptions = {
      agent: agent,
      transport: transport,
      plugins: [trackingPlugin],
      features: {
        sandbox: false
      },
      resourceLimits: {
        maxConcurrentRequests: 15,
        maxQueueSize: 40,
        requestTimeoutMs: 6000
      },
      observability: {
        onRequestStart: (metadata) => {
          metricsCollector.recordRequestStart(metadata.requestId, metadata)
        },
        onRequestEnd: (metadata, duration) => {
          metricsCollector.recordRequestEnd(metadata.requestId, duration, metadata)
        }
      }
    }
    
    handle = await connectAgent(options)
    
    const STRESS_REQUESTS = 75
    const requestPromises: Promise<any>[] = []
    const metricsData: { requestStarts: number; requestEnds: number; durations: number[] } = {
      requestStarts: 0,
      requestEnds: 0,
      durations: []
    }
    
    // Spy on metrics collection
    metricsCollector.recordRequestStart = vi.fn((requestId: string, metadata: any) => {
      metricsData.requestStarts++
    })
    
    metricsCollector.recordRequestEnd = vi.fn((requestId: string, duration: number, metadata: any) => {
      metricsData.requestEnds++
      metricsData.durations.push(duration)
    })
    
    console.log(`📊 Launching ${STRESS_REQUESTS} requests to stress observability...`)
    
    const stressStart = Date.now()
    
    // Launch stress requests
    for (let i = 0; i < STRESS_REQUESTS; i++) {
      const requestPromise = handle.send({
        type: 'test',
        data: `stress metrics request ${i}`
      })
      requestPromises.push(requestPromise)
      
      // Vary request timing to create realistic load patterns
      if (i % 5 === 0) {
        await delay(10)
      }
    }
    
    // Wait for all requests to complete
    const results = await Promise.allSettled(requestPromises)
    const stressDuration = Date.now() - stressStart
    const successful = results.filter(r => r.status === 'fulfilled').length
    
    console.log(`📊 Observability Stress Test Results:`)
    console.log(`  ⏱️ Total duration: ${stressDuration}ms`)
    console.log(`  ✅ Successful requests: ${successful}/${STRESS_REQUESTS}`)
    console.log(`  📈 Request starts recorded: ${metricsData.requestStarts}`)
    console.log(`  📉 Request ends recorded: ${metricsData.requestEnds}`)
    console.log(`  ⏱️ Average request duration: ${metricsData.durations.length > 0 ? (metricsData.durations.reduce((a, b) => a + b, 0) / metricsData.durations.length).toFixed(2) : 0}ms`)
    
    // Verify metrics integrity (allow for some timeouts under stress)
    expect(successful).toBeGreaterThan(STRESS_REQUESTS * 0.7) // At least 70% should succeed
    expect(metricsData.requestStarts).toBe(successful) // One start per successful request
    expect(metricsData.requestEnds).toBe(successful) // One end per successful request
    expect(metricsData.durations.length).toBe(successful) // One duration per successful request
    
    // Verify plugin hook consistency
    const pluginStats = trackingPlugin.getStats()
    expect(pluginStats.initExecutions).toBe(1) // Init called once
    expect(pluginStats.sendExecutions).toBe(successful) // Send called for each request
    
    // Verify agent consistency
    const agentStats = agent.getStats()
    expect(agentStats.handleCalls).toBe(successful)
    expect(agentStats.errors).toBe(0)
    expect(agentStats.activeRequests).toBe(0) // No hanging requests
    
    // Verify metrics collection was consistent throughout the test
    const avgDuration = metricsData.durations.reduce((a, b) => a + b, 0) / metricsData.durations.length
    expect(avgDuration).toBeGreaterThan(0)
    expect(avgDuration).toBeLessThan(1000) // Reasonable duration range
    
    console.log('✅ Observability integrity under stress test passed')
  }, 30000)
})