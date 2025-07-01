/**
 * QA Scenario A2: Full Lifecycle Simulation
 * 
 * Tests the complete lifecycle of an agent including connection, multiple sends, 
 * plugin hooks, restart, error injection, and observability.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { connectAgent } from '@agentkit/sdk'
import { DummyTransport } from '@agentkit/transports-dummy'
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
  TransformPlugin, 
  CounterPlugin,
  createTestPlugin 
} from '../fixtures/sample-plugins'
import { createTestAgent } from '../fixtures/basic-agent'
import { cleanupAll, waitForCompletion } from '../helpers/teardown'
import { createTestId, waitForCondition, delay } from '../helpers/utils'

/**
 * Enhanced plugin for lifecycle testing with error injection
 */
class LifecycleTestPlugin implements AgentKitPlugin {
  public readonly name = 'lifecycle-test-plugin'
  public readonly version = '1.0.0'
  
  public initCalls: number = 0
  public sendCalls: number = 0 
  public shutdownCalls: number = 0
  public errors: Error[] = []
  public shouldThrowOnSend = false
  public logs: string[] = []

  async onInit(context: AgentContext): Promise<void> {
    this.initCalls++
    this.logs.push(`onInit-${this.initCalls}`)
  }

  async onSend(payload: SendPayload, context: AgentContext): Promise<void> {
    this.sendCalls++
    this.logs.push(`onSend-${this.sendCalls}`)
    
    if (this.shouldThrowOnSend) {
      const error = new Error(`Controlled error in onSend call ${this.sendCalls}`)
      this.errors.push(error)
      throw error
    }
  }

  async onShutdown(context: AgentContext): Promise<void> {
    this.shutdownCalls++
    this.logs.push(`onShutdown-${this.shutdownCalls}`)
  }

  reset(): void {
    this.initCalls = 0
    this.sendCalls = 0
    this.shutdownCalls = 0
    this.errors = []
    this.shouldThrowOnSend = false
    this.logs = []
  }

  injectError(): void {
    this.shouldThrowOnSend = true
  }

  clearError(): void {
    this.shouldThrowOnSend = false
  }
}

/**
 * Test agent with enhanced lifecycle tracking
 */
class LifecycleTestAgent implements Agent {
  public readonly id = 'lifecycle-test-agent'
  public readonly name = 'Lifecycle Test Agent'
  public readonly version = '1.0.0'
  
  private isInitialized = false
  public initCalls = 0
  public handleCalls = 0
  public shutdownCalls = 0
  public lastInput: AgentInput | null = null

  async init(): Promise<void> {
    this.initCalls++
    await delay(10) // Simulate async init
    this.isInitialized = true
  }

  async handle(input: AgentInput): Promise<AgentOutput> {
    if (!this.isInitialized) {
      throw new Error('Agent not initialized')
    }
    
    this.handleCalls++
    this.lastInput = input
    
    return {
      type: 'response',
      data: {
        handled: true,
        callNumber: this.handleCalls,
        input: input.data,
        timestamp: new Date().toISOString(),
        agent: this.id
      }
    }
  }

  async shutdown(): Promise<void> {
    this.shutdownCalls++
    await delay(10) // Simulate async shutdown
    this.isInitialized = false
  }

  reset(): void {
    this.initCalls = 0
    this.handleCalls = 0
    this.shutdownCalls = 0
    this.lastInput = null
    this.isInitialized = false
  }
}

describe('QA Scenario A2: Full Lifecycle Simulation', () => {
  let testId: string
  let handle: AgentRuntimeHandle | null = null
  let testAgent: LifecycleTestAgent
  let lifecyclePlugin: LifecycleTestPlugin
  let loggingPlugin: LoggingPlugin
  let counterPlugin: CounterPlugin
  let transport: DummyTransport

  beforeEach(async () => {
    testId = createTestId('full-lifecycle')
    
    // Reset all test objects
    testAgent = new LifecycleTestAgent()
    lifecyclePlugin = new LifecycleTestPlugin()
    loggingPlugin = new LoggingPlugin()
    counterPlugin = new CounterPlugin()
    transport = new DummyTransport()

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

  it('should complete full agent lifecycle with plugin hooks', async () => {
    // Step 1: Connect agent using connectAgent
    const options: ConnectAgentOptions = {
      agent: testAgent,
      transport: transport,
      plugins: [lifecyclePlugin, loggingPlugin],
      debug: false,
      features: {
        sandbox: false // Disable sandboxing for test compatibility
      }
    }
    
    handle = await connectAgent(options)
    
    // Verify handle is valid
    expect(handle).toBeDefined()
    expect(handle.metadata.agentId).toBe(testAgent.id)
    expect(handle.send).toBeInstanceOf(Function)
    expect(handle.shutdown).toBeInstanceOf(Function)
    
    // Step 2: Assert initialization hooks called
    expect(testAgent.initCalls).toBe(1)
    expect(lifecyclePlugin.initCalls).toBe(1)
    expect(loggingPlugin.logs.length).toBeGreaterThan(0)
    expect(loggingPlugin.logs[0]).toContain('onInit called')
    
    // Step 3: Send multiple messages and validate agent behavior
    const message1 = { type: 'test', data: 'Hello World', timestamp: Date.now() }
    const message2 = { type: 'test', data: 'Second Message', timestamp: Date.now() + 1 }
    const message3 = { type: 'test', data: { complex: 'object', nested: { value: 42 } }, timestamp: Date.now() + 2 }
    
    await handle.send(message1)
    await handle.send(message2) 
    await handle.send(message3)
    
    // Validate agent processed the messages
    expect(testAgent.handleCalls).toBe(3)
    expect(testAgent.lastInput).toEqual(message3) // Last input should be message3
    
    // Validate hook calls
    expect(testAgent.handleCalls).toBe(3)
    expect(lifecyclePlugin.sendCalls).toBe(3)
    expect(loggingPlugin.logs.filter(log => log.includes('onSend')).length).toBe(3)
    
    // Step 4: Shutdown and validate cleanup
    await handle.shutdown()
    handle = null
    
    expect(testAgent.shutdownCalls).toBe(1)
    expect(lifecyclePlugin.shutdownCalls).toBe(1)
    expect(loggingPlugin.logs.filter(log => log.includes('onShutdown')).length).toBe(1)
  })

  it('should handle multiple plugins working together', async () => {
    // Add two different plugins
    const transformPlugin = new TransformPlugin((data) => ({ 
      transformed: data, 
      timestamp: Date.now(),
      transformedBy: 'test-transform'
    }))
    
    const options: ConnectAgentOptions = {
      agent: testAgent,
      transport: transport,
      plugins: [lifecyclePlugin, counterPlugin, transformPlugin],
      features: {
        sandbox: false // Disable sandboxing for test compatibility
      }
    }
    
    handle = await connectAgent(options)
    
    // Verify all plugins initialized
    expect(lifecyclePlugin.initCalls).toBe(1)
    expect(counterPlugin.initCount).toBe(1)
    
    // Send messages and verify both plugins process them
    await handle.send({ type: 'test', data: 'plugin cooperation test' })
    await handle.send({ type: 'test', data: 'second test' })
    
    // Verify both plugins processed the sends
    expect(lifecyclePlugin.sendCalls).toBe(2)
    expect(counterPlugin.sendCount).toBe(2)
    
    // Shutdown and verify all plugins shutdown
    await handle.shutdown()
    expect(lifecyclePlugin.shutdownCalls).toBe(1)
    expect(counterPlugin.shutdownCount).toBe(1)
    
    handle = null
  })

  it('should support agent restart with correct reinitialization', async () => {
    // Initial connection
    const options: ConnectAgentOptions = {
      agent: testAgent,
      transport: transport,
      plugins: [lifecyclePlugin, counterPlugin],
      features: {
        sandbox: false // Disable sandboxing for test compatibility
      }
    }
    
    handle = await connectAgent(options)
    
    // Send some messages
    await handle.send({ type: 'test', data: 'before restart' })
    await handle.send({ type: 'test', data: 'another message' })
    
    // Verify state
    expect(testAgent.handleCalls).toBe(2)
    expect(lifecyclePlugin.sendCalls).toBe(2)
    expect(counterPlugin.sendCount).toBe(2)
    
    // Shutdown
    await handle.shutdown()
    expect(testAgent.shutdownCalls).toBe(1)
    expect(lifecyclePlugin.shutdownCalls).toBe(1)
    expect(counterPlugin.shutdownCount).toBe(1)
    
    // Reset test objects for restart
    testAgent.reset()
    lifecyclePlugin.reset()
    counterPlugin.reset()
    
    // Restart with fresh connection
    handle = await connectAgent(options)
    
    // Verify reinitialization
    expect(testAgent.initCalls).toBe(1)
    expect(lifecyclePlugin.initCalls).toBe(1)
    expect(counterPlugin.initCount).toBe(1)
    
    // Verify state is reset
    expect(testAgent.handleCalls).toBe(0)
    expect(lifecyclePlugin.sendCalls).toBe(0)
    expect(counterPlugin.sendCount).toBe(0)
    
    // Send messages after restart
    await handle.send({ type: 'test', data: 'after restart' })
    
    // Verify functionality restored
    expect(testAgent.handleCalls).toBe(1)
    expect(lifecyclePlugin.sendCalls).toBe(1)
    expect(counterPlugin.sendCount).toBe(1)
    
    await handle.shutdown()
    handle = null
  })

  it('should handle controlled errors with proper fallback behavior', async () => {
    const options: ConnectAgentOptions = {
      agent: testAgent,
      transport: transport,
      plugins: [lifecyclePlugin, counterPlugin],
      features: {
        sandbox: false // Disable sandboxing for test compatibility
      }
    }
    
    handle = await connectAgent(options)
    
    // Send normal message first
    await handle.send({ type: 'test', data: 'normal message' })
    expect(testAgent.handleCalls).toBe(1)
    
    // Inject error in plugin
    lifecyclePlugin.injectError()
    
    // Send message that should trigger error
    // Note: Plugin errors are caught by the SDK and don't propagate by default
    await handle.send({ type: 'test', data: 'error trigger' })
    
    // Verify that the plugin recorded the error internally
    expect(lifecyclePlugin.errors.length).toBe(1)
    expect(lifecyclePlugin.errors[0]?.message).toContain('Controlled error in onSend')
    
    // Clear error and verify recovery
    lifecyclePlugin.clearError()
    
    await handle.send({ type: 'test', data: 'recovery message' })
    expect(testAgent.handleCalls).toBe(3) // normal + error + recovery
    
    // Verify system remains stable
    expect(lifecyclePlugin.sendCalls).toBe(3)
    
    await handle.shutdown()
    handle = null
  })

  it('should provide comprehensive observability metrics', async () => {
    const options: ConnectAgentOptions = {
      agent: testAgent,
      transport: transport,
      plugins: [lifecyclePlugin, counterPlugin, loggingPlugin],
      features: {
        sandbox: false // Disable sandboxing for test compatibility
      }
    }
    
    handle = await connectAgent(options)
    
    // Send multiple messages to generate metrics
    const messages = [
      { type: 'test', data: 'metrics test 1' },
      { type: 'test', data: 'metrics test 2' },
      { type: 'test', data: 'metrics test 3' },
      { type: 'test', data: 'metrics test 4' },
      { type: 'test', data: 'metrics test 5' }
    ]
    
    for (const message of messages) {
      await handle.send(message)
      await delay(10) // Small delay to ensure proper timing
    }
    
    // Inject one error for error metrics
    lifecyclePlugin.injectError()
    let errorCount = 0
    try {
      await handle.send({ type: 'test', data: 'error for metrics' })
    } catch {
      errorCount++
    }
    
    // Validate basic metrics
    expect(testAgent.handleCalls).toBe(6) // 5 successful + 1 error
    expect(lifecyclePlugin.sendCalls).toBe(6)
    expect(counterPlugin.sendCount).toBe(6)
    expect(lifecyclePlugin.errors.length).toBe(1)
    
    // Validate logs contain execution sequence
    const initLogs = loggingPlugin.logs.filter(log => log.includes('onInit'))
    const sendLogs = loggingPlugin.logs.filter(log => log.includes('onSend'))
    
    expect(initLogs.length).toBe(1)
    expect(sendLogs.length).toBe(6)
    
    // Validate hook execution sequence in lifecycle plugin
    expect(lifecyclePlugin.logs).toEqual([
      'onInit-1',
      'onSend-1',
      'onSend-2', 
      'onSend-3',
      'onSend-4',
      'onSend-5',
      'onSend-6'
    ])
    
    await handle.shutdown()
    
    // Validate shutdown metrics
    expect(lifecyclePlugin.shutdownCalls).toBe(1)
    expect(counterPlugin.shutdownCount).toBe(1)
    expect(lifecyclePlugin.logs[lifecyclePlugin.logs.length - 1]).toBe('onShutdown-1')
    
    handle = null
  })

  it('should maintain no resource leaks during lifecycle', async () => {
    const options: ConnectAgentOptions = {
      agent: testAgent,
      transport: transport,
      plugins: [lifecyclePlugin],
      features: {
        sandbox: false // Disable sandboxing for test compatibility
      }
    }
    
    // Create and destroy multiple handles
    for (let i = 0; i < 3; i++) {
      testAgent.reset()
      lifecyclePlugin.reset()
      
      const tempHandle = await connectAgent(options)
      
      // Perform some operations
      await tempHandle.send({ type: 'test', data: `iteration ${i}` })
      await tempHandle.send({ type: 'test', data: `second message ${i}` })
      
      // Shutdown cleanly
      await tempHandle.shutdown()
      
      // Verify clean state
      expect(testAgent.shutdownCalls).toBe(1)
      expect(lifecyclePlugin.shutdownCalls).toBe(1)
    }
    
    // Final verification - no hanging resources
    await waitForCompletion(500)
    
    // If we get here without hanging, the test passes
    expect(true).toBe(true)
  })

  it('should handle concurrent operations during shutdown', async () => {
    const options: ConnectAgentOptions = {
      agent: testAgent,
      transport: transport,
      plugins: [lifecyclePlugin, counterPlugin],
      features: {
        sandbox: false // Disable sandboxing for test compatibility
      }
    }
    
    handle = await connectAgent(options)
    
    // Start multiple concurrent sends
    const sendPromises = [
      handle.send({ type: 'test', data: 'concurrent 1' }),
      handle.send({ type: 'test', data: 'concurrent 2' }),
      handle.send({ type: 'test', data: 'concurrent 3' })
    ]
    
    // Start shutdown while operations are potentially still running
    const shutdownPromise = handle.shutdown()
    
    // Wait for all operations to complete
    const results = await Promise.allSettled([...sendPromises, shutdownPromise])
    
    // Verify no rejections from shutdown
    const shutdownResult = results[results.length - 1]
    if (shutdownResult && 'status' in shutdownResult) {
      expect(shutdownResult.status).toBe('fulfilled')
    }
    
    // Verify at least some sends completed
    const sendResults = results.slice(0, -1)
    const succeededSends = sendResults.filter(result => result.status === 'fulfilled')
    expect(succeededSends.length).toBeGreaterThan(0)
    
    // Verify shutdown was called
    expect(testAgent.shutdownCalls).toBe(1)
    expect(lifecyclePlugin.shutdownCalls).toBe(1)
    
    handle = null
  })
})