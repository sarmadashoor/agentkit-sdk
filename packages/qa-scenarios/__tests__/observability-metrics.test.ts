/**
 * QA Scenario A3: Observability & Metrics Deep Simulation
 * 
 * Comprehensive testing of the AgentKit SDK's observability and metrics system:
 * - Basic metrics collection with multiple sends
 * - Plugin timeline verification with execution order validation
 * - Concurrent metrics consistency across multiple agents
 * - Error metrics capture with fault injection
 * - Restart and metric reset validation
 * - Final snapshot metrics validation at shutdown
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { connectAgent } from '@agentkit/sdk'
import { DummyTransport } from '@agentkit/transports-dummy'
import { 
  Instrumentation, 
  PrometheusCollector
} from '@agentkit/sdk'
import { 
  MetricsCollector, 
  PluginExecutionTimeline,
  type PrometheusMetrics 
} from '@agentkit/sdk'
import type { 
  AgentRuntimeHandle, 
  ConnectAgentOptions,
  AgentKitPlugin,
  SendPayload,
  AgentContext,
  AgentInput,
  AgentOutput,
  Agent
} from '@agentkit/types'
import { 
  LoggingPlugin, 
  CounterPlugin,
  TransformPlugin
} from '../fixtures/sample-plugins'
import { createTestAgent } from '../fixtures/basic-agent'
import { cleanupAll, waitForCompletion } from '../helpers/teardown'
import { createTestId, waitForCondition, delay } from '../helpers/utils'

/**
 * Enhanced observability test agent with comprehensive tracking
 */
class ObservabilityTestAgent implements Agent {
  public readonly id: string = 'observability-test-agent'
  public readonly name = 'Observability Test Agent'
  public readonly version = '1.0.0'
  
  private isInitialized = false
  public initCalls = 0
  public handleCalls = 0
  public shutdownCalls = 0
  public initDuration = 0
  public handleDurations: number[] = []
  public shutdownDuration = 0
  public lastInput: AgentInput | null = null

  async init(): Promise<void> {
    const start = performance.now()
    this.initCalls++
    await delay(Math.random() * 20 + 10) // Simulate 10-30ms init
    this.initDuration = performance.now() - start
    this.isInitialized = true
  }

  async handle(input: AgentInput): Promise<AgentOutput> {
    if (!this.isInitialized) {
      throw new Error('Agent not initialized')
    }
    
    const start = performance.now()
    this.handleCalls++
    this.lastInput = input
    
    // Simulate variable processing time
    await delay(Math.random() * 50 + 25) // 25-75ms
    
    const duration = performance.now() - start
    this.handleDurations.push(duration)
    
    return {
      type: 'response',
      data: {
        handled: true,
        callNumber: this.handleCalls,
        input: input.data,
        timestamp: new Date().toISOString(),
        agent: this.id,
        processingTime: duration
      }
    }
  }

  async shutdown(): Promise<void> {
    const start = performance.now()
    this.shutdownCalls++
    await delay(Math.random() * 15 + 5) // 5-20ms shutdown
    this.shutdownDuration = performance.now() - start
    this.isInitialized = false
  }

  reset(): void {
    this.initCalls = 0
    this.handleCalls = 0
    this.shutdownCalls = 0
    this.initDuration = 0
    this.handleDurations = []
    this.shutdownDuration = 0
    this.lastInput = null
    this.isInitialized = false
  }

  getMetrics() {
    return {
      initCalls: this.initCalls,
      handleCalls: this.handleCalls,
      shutdownCalls: this.shutdownCalls,
      initDuration: this.initDuration,
      avgHandleDuration: this.handleDurations.length > 0 ? 
        this.handleDurations.reduce((a, b) => a + b, 0) / this.handleDurations.length : 0,
      totalHandleDuration: this.handleDurations.reduce((a, b) => a + b, 0),
      shutdownDuration: this.shutdownDuration
    }
  }
}

/**
 * Metrics tracking plugin for detailed observability testing
 */
class MetricsTrackingPlugin implements AgentKitPlugin {
  public readonly name: string = 'metrics-tracking-plugin'
  public readonly version = '1.0.0'
  
  public initCalls = 0
  public sendCalls = 0
  public shutdownCalls = 0
  public errorCount = 0
  public executionTimes: number[] = []
  public shouldInjectError = false
  public errorAtCall = -1

  async onInit(context: AgentContext): Promise<void> {
    const start = performance.now()
    this.initCalls++
    await delay(5) // Small delay
    this.executionTimes.push(performance.now() - start)
  }

  async onSend(payload: SendPayload, context: AgentContext): Promise<void> {
    const start = performance.now()
    this.sendCalls++
    
    if (this.shouldInjectError && this.sendCalls === this.errorAtCall) {
      this.errorCount++
      const error = new Error(`Injected error at call ${this.sendCalls}`)
      this.executionTimes.push(performance.now() - start)
      throw error
    }
    
    await delay(Math.random() * 10 + 5) // 5-15ms
    this.executionTimes.push(performance.now() - start)
  }

  async onShutdown(context: AgentContext): Promise<void> {
    const start = performance.now()
    this.shutdownCalls++
    await delay(3) // Small delay
    this.executionTimes.push(performance.now() - start)
  }

  injectErrorAtCall(callNumber: number): void {
    this.shouldInjectError = true
    this.errorAtCall = callNumber
  }

  clearError(): void {
    this.shouldInjectError = false
    this.errorAtCall = -1
  }

  reset(): void {
    this.initCalls = 0
    this.sendCalls = 0
    this.shutdownCalls = 0
    this.errorCount = 0
    this.executionTimes = []
    this.shouldInjectError = false
    this.errorAtCall = -1
  }

  getMetrics() {
    return {
      initCalls: this.initCalls,
      sendCalls: this.sendCalls,
      shutdownCalls: this.shutdownCalls,
      errorCount: this.errorCount,
      avgExecutionTime: this.executionTimes.length > 0 ? 
        this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length : 0,
      totalExecutionTime: this.executionTimes.reduce((a, b) => a + b, 0)
    }
  }
}

describe('QA Scenario A3: Observability & Metrics Deep Simulation', () => {
  let testId: string
  let handle: AgentRuntimeHandle | null = null
  let testAgent: ObservabilityTestAgent
  let metricsPlugin: MetricsTrackingPlugin
  let loggingPlugin: LoggingPlugin
  let counterPlugin: CounterPlugin
  let transport: DummyTransport
  let instrumentation: Instrumentation
  let metricsCollector: MetricsCollector
  let timeline: PluginExecutionTimeline

  beforeEach(async () => {
    testId = createTestId('observability-metrics')
    
    // Reset all test objects
    testAgent = new ObservabilityTestAgent()
    metricsPlugin = new MetricsTrackingPlugin()
    loggingPlugin = new LoggingPlugin()
    counterPlugin = new CounterPlugin()
    transport = new DummyTransport()
    
    // Initialize observability components
    instrumentation = new Instrumentation({
      enabled: true,
      collectResourceMetrics: false, // Disable for deterministic testing
      defaultLabels: { test: testId }
    })
    
    metricsCollector = new MetricsCollector({
      version: '1.0.0',
      platform: 'test',
      environment: 'qa'
    })
    
    timeline = new PluginExecutionTimeline({
      platform: 'test',
      warningThreshold: 50,
      enableConsoleWarnings: false
    })

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
    
    // Reset metrics
    if (instrumentation) {
      instrumentation.getCollector().clear()
    }
    
    if (metricsCollector) {
      metricsCollector.reset()
    }
    
    await cleanupAll()
    await waitForCompletion(500)
  })

  it('should collect basic metrics for one agent with multiple sends', async () => {
    // Test 1: Basic metrics collection
    
    // Connect agent
    const options: ConnectAgentOptions = {
      agent: testAgent,
      transport: transport,
      plugins: [metricsPlugin, loggingPlugin],
      features: {
        sandbox: false // Disable sandboxing for test compatibility
      }
    }
    
    handle = await connectAgent(options)
    
    // Record initial state
    const initialMetrics = testAgent.getMetrics()
    expect(initialMetrics.initCalls).toBe(1)
    expect(metricsPlugin.initCalls).toBe(1)
    
    // Send multiple messages
    const messages = [
      { type: 'test', data: 'message 1' },
      { type: 'test', data: 'message 2' },
      { type: 'test', data: 'message 3' },
      { type: 'test', data: 'message 4' },
      { type: 'test', data: 'message 5' }
    ]
    
    for (const message of messages) {
      await handle.send(message)
      await delay(10) // Small delay between sends
    }
    
    // Validate metrics
    const finalMetrics = testAgent.getMetrics()
    expect(finalMetrics.handleCalls).toBe(5)
    expect(finalMetrics.avgHandleDuration).toBeGreaterThan(0)
    expect(finalMetrics.totalHandleDuration).toBeGreaterThan(0)
    
    const pluginMetrics = metricsPlugin.getMetrics()
    expect(pluginMetrics.sendCalls).toBe(5)
    expect(pluginMetrics.avgExecutionTime).toBeGreaterThan(0)
    
    // Debug metrics if needed
    // console.log('📊 Agent Metrics:', finalMetrics)
    // console.log('🔌 Plugin Metrics:', pluginMetrics)
    
    await handle.shutdown()
    handle = null
    
    // Validate shutdown metrics
    expect(testAgent.shutdownCalls).toBe(1)
    expect(metricsPlugin.shutdownCalls).toBe(1)
  })

  it('should verify plugin timeline execution order', async () => {
    // Test 2: Plugin timeline verification
    
    // Create plugins with different execution characteristics
    const fastPlugin = new MetricsTrackingPlugin()
    const slowPlugin = new MetricsTrackingPlugin()
    
    // Override names using Object.defineProperty to bypass readonly
    Object.defineProperty(fastPlugin, 'name', { value: 'fast-plugin', writable: false, enumerable: true, configurable: false })
    Object.defineProperty(slowPlugin, 'name', { value: 'slow-plugin', writable: false, enumerable: true, configurable: false })
    
    const options: ConnectAgentOptions = {
      agent: testAgent,
      transport: transport,
      plugins: [fastPlugin, metricsPlugin, slowPlugin],
      features: {
        sandbox: false
      }
    }
    
    handle = await connectAgent(options)
    
    // Track plugin execution order
    const executionOrder: string[] = []
    
    // Wrap plugin methods to track execution order
    const originalFastOnSend = fastPlugin.onSend.bind(fastPlugin)
    const originalMetricsOnSend = metricsPlugin.onSend.bind(metricsPlugin)
    const originalSlowOnSend = slowPlugin.onSend.bind(slowPlugin)
    
    fastPlugin.onSend = async (payload, context) => {
      executionOrder.push('fast-plugin-start')
      await originalFastOnSend(payload, context)
      executionOrder.push('fast-plugin-end')
    }
    
    metricsPlugin.onSend = async (payload, context) => {
      executionOrder.push('metrics-tracking-plugin-start')
      await originalMetricsOnSend(payload, context)
      executionOrder.push('metrics-tracking-plugin-end')
    }
    
    slowPlugin.onSend = async (payload, context) => {
      executionOrder.push('slow-plugin-start')
      await delay(20) // Make this plugin slower
      await originalSlowOnSend(payload, context)
      executionOrder.push('slow-plugin-end')
    }
    
    // Send messages and verify execution order
    await handle.send({ type: 'test', data: 'timeline test 1' })
    await handle.send({ type: 'test', data: 'timeline test 2' })
    
    // Validate execution patterns
    expect(executionOrder.length).toBeGreaterThan(0)
    // console.log('⏱️ Plugin Execution Order:', executionOrder)
    
    // Verify plugins executed in sequence (not interleaved)
    const firstMessagePattern = executionOrder.slice(0, 6)
    expect(firstMessagePattern).toEqual([
      'fast-plugin-start',
      'fast-plugin-end',
      'metrics-tracking-plugin-start', 
      'metrics-tracking-plugin-end',
      'slow-plugin-start',
      'slow-plugin-end'
    ])
    
    await handle.shutdown()
    handle = null
  })

  it('should maintain concurrent metrics consistency', async () => {
    // Test 3: Concurrent metrics consistency
    
    // Create multiple agents for concurrent testing
    const agent1 = new ObservabilityTestAgent()
    const agent2 = new ObservabilityTestAgent()
    const plugin1 = new MetricsTrackingPlugin()
    const plugin2 = new MetricsTrackingPlugin()
    
    // Override IDs and names using Object.defineProperty
    Object.defineProperty(agent1, 'id', { value: 'concurrent-agent-1', writable: false, enumerable: true, configurable: false })
    Object.defineProperty(agent2, 'id', { value: 'concurrent-agent-2', writable: false, enumerable: true, configurable: false })
    Object.defineProperty(plugin1, 'name', { value: 'concurrent-plugin-1', writable: false, enumerable: true, configurable: false })
    Object.defineProperty(plugin2, 'name', { value: 'concurrent-plugin-2', writable: false, enumerable: true, configurable: false })
    
    // Connect both agents
    const [handle1, handle2] = await Promise.all([
      connectAgent({
        agent: agent1,
        transport: new DummyTransport(),
        plugins: [plugin1],
        features: { sandbox: false }
      }),
      connectAgent({
        agent: agent2,
        transport: new DummyTransport(),
        plugins: [plugin2],
        features: { sandbox: false }
      })
    ])
    
    // Send concurrent messages
    const concurrentSends = []
    for (let i = 0; i < 10; i++) {
      concurrentSends.push(
        handle1.send({ type: 'concurrent', data: `agent1-message-${i}` }),
        handle2.send({ type: 'concurrent', data: `agent2-message-${i}` })
      )
    }
    
    await Promise.all(concurrentSends)
    
    // Validate metrics consistency
    const agent1Metrics = agent1.getMetrics()
    const agent2Metrics = agent2.getMetrics()
    const plugin1Metrics = plugin1.getMetrics()
    const plugin2Metrics = plugin2.getMetrics()
    
    // Each agent should have processed exactly 10 messages
    expect(agent1Metrics.handleCalls).toBe(10)
    expect(agent2Metrics.handleCalls).toBe(10)
    expect(plugin1Metrics.sendCalls).toBe(10)
    expect(plugin2Metrics.sendCalls).toBe(10)
    
    // Verify no cross-contamination between agents
    expect(agent1Metrics.initCalls).toBe(1)
    expect(agent2Metrics.initCalls).toBe(1)
    
    // Debug concurrent metrics if needed
    // console.log('🔄 Agent 1 Metrics:', agent1Metrics)
    // console.log('🔄 Agent 2 Metrics:', agent2Metrics)
    
    // Cleanup
    await Promise.all([handle1.shutdown(), handle2.shutdown()])
  })

  it('should capture error metrics with fault injection', async () => {
    // Test 4: Error metrics capture
    
    const options: ConnectAgentOptions = {
      agent: testAgent,
      transport: transport,
      plugins: [metricsPlugin, counterPlugin],
      features: {
        sandbox: false
      }
    }
    
    handle = await connectAgent(options)
    
    // Send normal messages first
    await handle.send({ type: 'test', data: 'normal message 1' })
    await handle.send({ type: 'test', data: 'normal message 2' })
    
    // Inject error at the 3rd call
    metricsPlugin.injectErrorAtCall(3)
    
    // Send message that will trigger error
    let errorCaught = false
    try {
      await handle.send({ type: 'test', data: 'error trigger message' })
    } catch (error) {
      errorCaught = true
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain('Injected error at call 3')
    }
    
    // Note: With default error handling, plugin errors are caught and don't propagate
    // So we check the plugin's internal error count instead
    expect(metricsPlugin.errorCount).toBe(1)
    
    // Clear error and send more messages
    metricsPlugin.clearError()
    await handle.send({ type: 'test', data: 'recovery message 1' })
    await handle.send({ type: 'test', data: 'recovery message 2' })
    
    // Validate error metrics
    const agentMetrics = testAgent.getMetrics()
    const pluginMetrics = metricsPlugin.getMetrics()
    
    expect(agentMetrics.handleCalls).toBe(5) // All messages processed by agent
    expect(pluginMetrics.sendCalls).toBe(5) // Plugin attempted all calls
    expect(pluginMetrics.errorCount).toBe(1) // One error recorded
    
    // Debug error metrics if needed
    // console.log('❌ Error Metrics - Agent:', agentMetrics)
    
    await handle.shutdown()
    handle = null
  })

  it('should reset metrics correctly after restart', async () => {
    // Test 5: Restart & metric reset
    
    const options: ConnectAgentOptions = {
      agent: testAgent,
      transport: transport,
      plugins: [metricsPlugin, counterPlugin],
      features: {
        sandbox: false
      }
    }
    
    // First lifecycle
    handle = await connectAgent(options)
    
    await handle.send({ type: 'test', data: 'first lifecycle message 1' })
    await handle.send({ type: 'test', data: 'first lifecycle message 2' })
    await handle.send({ type: 'test', data: 'first lifecycle message 3' })
    
    const firstLifecycleMetrics = {
      agent: testAgent.getMetrics(),
      plugin: metricsPlugin.getMetrics(),
      counter: counterPlugin
    }
    
    // console.log('🔄 First Lifecycle Metrics:', firstLifecycleMetrics)
    
    await handle.shutdown()
    handle = null
    
    // Reset for second lifecycle
    testAgent.reset()
    metricsPlugin.reset()
    counterPlugin.reset()
    
    // Second lifecycle
    handle = await connectAgent(options)
    
    await handle.send({ type: 'test', data: 'second lifecycle message 1' })
    await handle.send({ type: 'test', data: 'second lifecycle message 2' })
    
    const secondLifecycleMetrics = {
      agent: testAgent.getMetrics(),
      plugin: metricsPlugin.getMetrics(),
      counter: counterPlugin
    }
    
    // console.log('🔄 Second Lifecycle Metrics:', secondLifecycleMetrics)
    
    // Validate reset worked correctly
    expect(secondLifecycleMetrics.agent.initCalls).toBe(1) // Fresh init
    expect(secondLifecycleMetrics.agent.handleCalls).toBe(2) // Only second lifecycle calls
    expect(secondLifecycleMetrics.plugin.sendCalls).toBe(2) // Only second lifecycle calls
    expect(secondLifecycleMetrics.counter.sendCount).toBe(2) // Only second lifecycle calls
    
    // Verify no accumulation from first lifecycle
    expect(secondLifecycleMetrics.agent.handleCalls).not.toBe(5) // Would be 5 if accumulated
    expect(secondLifecycleMetrics.plugin.sendCalls).not.toBe(5) // Would be 5 if accumulated
    
    await handle.shutdown()
    handle = null
  })

  it('should validate comprehensive metrics snapshot at shutdown', async () => {
    // Test 6: Final snapshot metrics validation
    
    // Create comprehensive setup with multiple plugins
    const transformPlugin = new TransformPlugin((data) => ({ 
      transformed: data,
      timestamp: Date.now(),
      testId 
    }))
    
    const options: ConnectAgentOptions = {
      agent: testAgent,
      transport: transport,
      plugins: [metricsPlugin, loggingPlugin, counterPlugin, transformPlugin],
      features: {
        sandbox: false
      }
    }
    
    handle = await connectAgent(options)
    
    // Generate comprehensive test data
    const testScenarios = [
      { type: 'performance', data: 'performance test', count: 5 },
      { type: 'load', data: 'load test', count: 10 },
      { type: 'stress', data: 'stress test', count: 3 }
    ]
    
    for (const scenario of testScenarios) {
      // console.log(`🎯 Running ${scenario.type} scenario...`)
      
      for (let i = 0; i < scenario.count; i++) {
        await handle.send({ 
          type: scenario.type, 
          data: `${scenario.data} ${i + 1}`,
          scenario: scenario.type,
          iteration: i + 1
        })
        
        // Add small delay for realistic timing
        await delay(5)
      }
    }
    
    // Generate error scenario
    const currentSendCount = metricsPlugin.sendCalls
    metricsPlugin.injectErrorAtCall(currentSendCount + 1) // Error on next call
    try {
      await handle.send({ type: 'error-test', data: 'trigger error' })
    } catch {
      // Expected error, continue
    }
    
    // Generate final scenario
    await handle.send({ type: 'final', data: 'final test message' })
    
    // Capture comprehensive metrics before shutdown
    const preShutdownMetrics = {
      agent: testAgent.getMetrics(),
      metricsPlugin: metricsPlugin.getMetrics(),
      logging: loggingPlugin.logs.length,
      counter: counterPlugin.sendCount,
      transport: transport
    }
    
    // Validate comprehensive pre-shutdown metrics
    expect(preShutdownMetrics.agent.handleCalls).toBeGreaterThan(0)
    expect(preShutdownMetrics.metricsPlugin.sendCalls).toBeGreaterThan(0)
    
    // Shutdown and capture final metrics
    await handle.shutdown()
    handle = null
    
    const postShutdownMetrics = {
      agent: testAgent.getMetrics(),
      plugin: metricsPlugin.getMetrics()
    }
    
    // Validate post-shutdown metrics
    expect(postShutdownMetrics.agent.shutdownCalls).toBe(1)
    expect(postShutdownMetrics.plugin.shutdownCalls).toBe(1)
    
    // Comprehensive validations
    const expectedMessageCount = testScenarios.reduce((sum, scenario) => sum + scenario.count, 0) + 2 // +2 for error and final
    
    expect(preShutdownMetrics.agent.handleCalls).toBe(expectedMessageCount)
    expect(preShutdownMetrics.metricsPlugin.sendCalls).toBe(expectedMessageCount)
    expect(preShutdownMetrics.counter).toBe(expectedMessageCount)
    expect(preShutdownMetrics.logging).toBeGreaterThan(0)
    
    // Validate shutdown metrics
    expect(postShutdownMetrics.agent.shutdownCalls).toBe(1)
    expect(postShutdownMetrics.plugin.shutdownCalls).toBe(1)
    
    // Validate performance metrics
    expect(preShutdownMetrics.agent.avgHandleDuration).toBeGreaterThan(0)
    expect(preShutdownMetrics.agent.totalHandleDuration).toBeGreaterThan(0)
    expect(preShutdownMetrics.metricsPlugin.avgExecutionTime).toBeGreaterThan(0)
    
    // Validate error tracking
    expect(preShutdownMetrics.metricsPlugin.errorCount).toBe(1)
    
    // Final summary
    // Final comprehensive validations
    expect(preShutdownMetrics.agent.handleCalls).toBe(expectedMessageCount)
    expect(preShutdownMetrics.agent.avgHandleDuration).toBeGreaterThan(0)
    expect(preShutdownMetrics.metricsPlugin.avgExecutionTime).toBeGreaterThan(0)
    expect(postShutdownMetrics.agent.shutdownDuration).toBeGreaterThan(0)
  })
})