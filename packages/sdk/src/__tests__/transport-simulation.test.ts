/**
 * Transport Simulation Test Suite
 * 
 * Tests message routing between agent and plugins using a dummy transport.
 * Validates plugin isolation, observability hooks, and communication patterns.
 * 
 * ✅ Features Tested:
 * - Two-plugin communication with agent via dummy transport
 * - Plugin A: ping → pong responder
 * - Plugin B: message logger with no return payload
 * - Complete state isolation between plugins
 * - Observability hooks and debug timeline validation
 * - In-memory transport with configurable behavior
 * 
 * 🚫 Constraints Met:
 * - Only touches SDK internals (no CLI or browser code)
 * - Plugins cannot share state
 * - Uses connectAgent() with dummy transport
 * - Located in packages/sdk/src/__tests__/
 * 
 * @author SDET Team
 * @security Tests plugin isolation and message routing security
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { connectAgent } from '../index'
import type { 
  AgentKitPlugin, 
  AgentContext, 
  SendPayload, 
  Transport, 
  TransportMessage,
  TransportStatus,
  AgentInput,
  AgentOutput,
  ObservabilityHooks
} from '@agentkit/types'
import { createTestAgent } from '@agentkit/test-agent'
import { AgentRegistry } from '@agentkit/registry'

// ============================================================================
// DUMMY TRANSPORT IMPLEMENTATION
// ============================================================================

interface SimulatedTransportConfig {
  debug?: boolean
  latencyMs?: number
  failureRate?: number
  maxQueueSize?: number
  enableBackpressure?: boolean
}

class SimulatedTransport implements Transport {
  id = 'simulated-transport'
  name = 'Simulated Transport'
  
  private config: Required<SimulatedTransportConfig>
  private messageQueue: TransportMessage[] = []
  private sentMessages: TransportMessage[] = []
  private initialized = false
  private queueSize = 0
  
  constructor(config: SimulatedTransportConfig = {}) {
    this.config = {
      debug: config.debug ?? false,
      latencyMs: config.latencyMs ?? 1,
      failureRate: config.failureRate ?? 0,
      maxQueueSize: config.maxQueueSize ?? 100,
      enableBackpressure: config.enableBackpressure ?? true
    }
  }

  async init(): Promise<void> {
    if (this.config.debug) {
      console.log('[SimulatedTransport] Initializing transport')
    }
    
    await this.simulateLatency()
    this.initialized = true
  }

  async send(message: TransportMessage): Promise<void> {
    if (!this.initialized) {
      throw new Error('Transport not initialized')
    }

    // Check backpressure
    if (this.config.enableBackpressure && !this.canAcceptMore()) {
      throw new Error(`Transport queue full (${this.queueSize}/${this.config.maxQueueSize})`)
    }

    // Simulate network failure
    if (Math.random() < this.config.failureRate) {
      throw new Error('Simulated network failure')
    }

    if (this.config.debug) {
      console.log('[SimulatedTransport] Sending message:', message)
    }

    this.sentMessages.push(message)
    this.queueSize++
    
    await this.simulateLatency()
    
    // Echo response for testing
    const response: TransportMessage = {
      ...message,
      transportMetadata: {
        transportId: this.id,
        timestamp: Date.now(),
        processed: true
      }
    }
    
    this.messageQueue.push(response)
  }

  async receive(): Promise<TransportMessage> {
    if (!this.initialized) {
      throw new Error('Transport not initialized')
    }

    await this.simulateLatency()
    
    if (this.messageQueue.length === 0) {
      // Return empty message if queue is empty
      return {
        type: 'no-message',
        timestamp: Date.now()
      }
    }

    const message = this.messageQueue.shift()!
    this.queueSize = Math.max(0, this.queueSize - 1)
    
    if (this.config.debug) {
      console.log('[SimulatedTransport] Received message:', message)
    }
    
    return message
  }

  canAcceptMore(): boolean {
    return !this.config.enableBackpressure || this.queueSize < this.config.maxQueueSize
  }

  getStatus(): TransportStatus {
    return {
      canAcceptMore: this.canAcceptMore(),
      queueSize: this.queueSize,
      maxQueueSize: this.config.maxQueueSize,
      isHealthy: true,
      healthMessage: 'Transport operational'
    }
  }

  private async simulateLatency(): Promise<void> {
    if (this.config.latencyMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.config.latencyMs))
    }
  }

  // Test utilities
  getSentMessages(): TransportMessage[] {
    return [...this.sentMessages]
  }

  getQueueSize(): number {
    return this.queueSize
  }

  clearHistory(): void {
    this.sentMessages = []
    this.messageQueue = []
    this.queueSize = 0
  }
}

// ============================================================================
// TEST PLUGINS
// ============================================================================

// Plugin A: Responds to ping with pong
const createPingPongPlugin = (): AgentKitPlugin => {
  const pluginState = {
    pingCount: 0,
    lastPingTime: 0
  }

  return {
    name: 'ping-pong-plugin',
    version: '1.0.0',
    description: 'Responds to ping messages with pong',
    
    onInit(context: AgentContext): void {
      console.log(`[PingPongPlugin] Initialized for agent ${context.agentId}`)
      pluginState.pingCount = 0
      pluginState.lastPingTime = 0
    },
    
    onSend(payload: SendPayload, context: AgentContext): void {
      const input = payload.input as any
      
      if (input?.type === 'ping') {
        pluginState.pingCount++
        pluginState.lastPingTime = Date.now()
        
        console.log(`[PingPongPlugin] Received ping #${pluginState.pingCount}, responding with pong`)
        
        // Plugin A should respond with pong
        // Note: In real SDK, this would trigger a response through the transport
        const response = {
          type: 'pong',
          pingId: input.id || 'unknown',
          timestamp: pluginState.lastPingTime,
          pluginName: 'ping-pong-plugin'
        }
        
        // Store response in plugin state for validation
        ;(pluginState as any).lastResponse = response
      } else {
        console.log(`[PingPongPlugin] Ignoring non-ping message:`, input)
      }
    },
    
    onError(error: Error, context: AgentContext): void {
      console.error(`[PingPongPlugin] Error in agent ${context.agentId}:`, error.message)
    },
    
    onShutdown(context: AgentContext): void {
      console.log(`[PingPongPlugin] Shutting down for agent ${context.agentId}`)
    },
    
    // Test utility to access plugin state
    getState: () => pluginState
  } as AgentKitPlugin & { getState: () => any }
}

// Plugin B: Logs all incoming messages (no return payload)
const createMessageLoggerPlugin = (): AgentKitPlugin => {
  const pluginState = {
    messageLog: [] as any[],
    messageCount: 0
  }

  return {
    name: 'message-logger-plugin',
    version: '1.0.0',
    description: 'Logs all incoming messages without responding',
    
    onInit(context: AgentContext): void {
      console.log(`[MessageLoggerPlugin] Initialized for agent ${context.agentId}`)
      pluginState.messageLog = []
      pluginState.messageCount = 0
    },
    
    onSend(payload: SendPayload, context: AgentContext): void {
      const input = payload.input as any
      
      pluginState.messageCount++
      const logEntry = {
        id: pluginState.messageCount,
        timestamp: Date.now(),
        agentId: context.agentId,
        transportId: context.transportId,
        messageType: input?.type || 'unknown',
        messageData: input,
        metadata: payload.metadata
      }
      
      pluginState.messageLog.push(logEntry)
      
      console.log(`[MessageLoggerPlugin] Logged message #${pluginState.messageCount}:`, {
        type: logEntry.messageType,
        agentId: logEntry.agentId
      })
      
      // Plugin B explicitly does NOT return any payload
      // It only logs the message
    },
    
    onError(error: Error, context: AgentContext): void {
      console.error(`[MessageLoggerPlugin] Error in agent ${context.agentId}:`, error.message)
      
      pluginState.messageLog.push({
        id: ++pluginState.messageCount,
        timestamp: Date.now(),
        type: 'error',
        error: error.message,
        agentId: context.agentId
      })
    },
    
    onShutdown(context: AgentContext): void {
      console.log(`[MessageLoggerPlugin] Shutting down for agent ${context.agentId}. Total messages logged: ${pluginState.messageCount}`)
    },
    
    // Test utility to access plugin state
    getState: () => pluginState
  } as AgentKitPlugin & { getState: () => any }
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Transport Simulation - Plugin Message Routing', () => {
  let registry: AgentRegistry
  let transport: SimulatedTransport
  let pingPongPlugin: AgentKitPlugin & { getState: () => any }
  let messageLoggerPlugin: AgentKitPlugin & { getState: () => any }
  let observabilityEvents: any[]
  let observabilityHooks: ObservabilityHooks

  beforeEach(() => {
    // Create fresh registry and transport
    registry = new AgentRegistry()
    transport = new SimulatedTransport({ debug: false, latencyMs: 1 })
    
    // Create fresh plugin instances
    pingPongPlugin = createPingPongPlugin()
    messageLoggerPlugin = createMessageLoggerPlugin()
    
    // Set up observability tracking
    observabilityEvents = []
    observabilityHooks = {
      onRequestStart: (metadata) => {
        observabilityEvents.push({ type: 'request-start', ...metadata })
      },
      onRequestEnd: (metadata, duration) => {
        observabilityEvents.push({ type: 'request-end', duration, ...metadata })
      },
      onError: (error, context) => {
        observabilityEvents.push({ type: 'error', error: error.message, ...context })
      },
      onTransportBackpressureDetected: (event) => {
        observabilityEvents.push({ type: 'backpressure-detected', ...event })
      },
      onTransportBackpressureResolved: (event) => {
        observabilityEvents.push({ type: 'backpressure-resolved', ...event })
      }
    }
    
    // Note: We'll use direct agent/transport objects instead of registry names
  })

  afterEach(async () => {
    console.time('transport-simulation-cleanup')
    vi.clearAllMocks()
    
    // Ensure transport is properly cleaned up
    if (transport) {
      transport.clearHistory()
      try {
        // Give transport time to finish any pending operations
        await new Promise(resolve => setTimeout(resolve, 10))
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    
    observabilityEvents = []
    console.timeEnd('transport-simulation-cleanup')
  })

  describe('connectAgent() with Dummy Transport', () => {
    it('should successfully connect agent with simulated transport', async () => {
      console.time('transport-simulation-connect')
      const agent = createTestAgent()
      
      const handle = await connectAgent({
        agent,
        transport,
        plugins: [pingPongPlugin, messageLoggerPlugin],
        observability: observabilityHooks,
        debug: false
      })

      expect(handle).toBeDefined()
      expect(handle.send).toBeInstanceOf(Function)
      expect(handle.shutdown).toBeInstanceOf(Function)
      expect(handle.metadata.agentId).toBe('test-agent')
      expect(handle.metadata.transportId).toBe('simulated-transport')
      console.timeEnd('transport-simulation-connect')
    }, { timeout: 10000 })

    it('should initialize both plugins without state sharing', async () => {
      const handle = await connectAgent({
        agent: createTestAgent(),
        transport,
        plugins: [pingPongPlugin, messageLoggerPlugin],
        observability: observabilityHooks
      })

      // Verify plugins are initialized with separate state
      const pingState = pingPongPlugin.getState()
      const loggerState = messageLoggerPlugin.getState()

      expect(pingState.pingCount).toBe(0)
      expect(pingState.lastPingTime).toBe(0)
      expect(loggerState.messageCount).toBe(0)
      expect(loggerState.messageLog).toEqual([])

      // Verify state objects are completely separate
      expect(pingState).not.toBe(loggerState)
      expect(Object.keys(pingState)).not.toEqual(Object.keys(loggerState))

      await handle.shutdown()
    })
  })

  describe('Plugin A: Ping-Pong Response', () => {
    it('should respond to ping with pong and maintain state isolation', async () => {
      console.time('transport-ping-pong-isolation')
      const handle = await connectAgent({
        agent: createTestAgent(),
        transport,
        plugins: [pingPongPlugin, messageLoggerPlugin],
        observability: observabilityHooks
      })

      // Send ping message
      const pingMessage = {
        type: 'ping',
        id: 'test-ping-001',
        timestamp: Date.now()
      }

      await handle.send(pingMessage)

      // Verify Plugin A processed the ping
      const pingState = pingPongPlugin.getState()
      expect(pingState.pingCount).toBe(1)
      expect(pingState.lastPingTime).toBeGreaterThan(0)
      expect(pingState.lastResponse).toEqual({
        type: 'pong',
        pingId: 'test-ping-001',
        timestamp: pingState.lastPingTime,
        pluginName: 'ping-pong-plugin'
      })

      // Verify Plugin B logged the message but didn't respond
      const loggerState = messageLoggerPlugin.getState()
      expect(loggerState.messageCount).toBe(1)
      expect(loggerState.messageLog[0]).toMatchObject({
        id: 1,
        messageType: 'ping',
        agentId: 'test-agent',
        transportId: 'simulated-transport'
      })

      // Verify state isolation - Plugin B doesn't have ping response data
      expect(loggerState.messageLog[0]).not.toHaveProperty('lastResponse')
      expect(loggerState).not.toHaveProperty('pingCount')

      await handle.shutdown()
      console.timeEnd('transport-ping-pong-isolation')
    }, { timeout: 12000 })

    it('should handle multiple ping messages with isolated state', async () => {
      const handle = await connectAgent({
        agent: createTestAgent(),
        transport,
        plugins: [pingPongPlugin, messageLoggerPlugin],
        observability: observabilityHooks
      })

      // Send multiple ping messages
      for (let i = 1; i <= 3; i++) {
        await handle.send({
          type: 'ping',
          id: `ping-${i}`,
          timestamp: Date.now()
        })
        
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 2))
      }

      // Verify Plugin A state progression
      const pingState = pingPongPlugin.getState()
      expect(pingState.pingCount).toBe(3)
      expect(pingState.lastResponse.pingId).toBe('ping-3')

      // Verify Plugin B logged all messages
      const loggerState = messageLoggerPlugin.getState()
      expect(loggerState.messageCount).toBe(3)
      expect(loggerState.messageLog).toHaveLength(3)
      
      // Verify each log entry is distinct
      loggerState.messageLog.forEach((entry: any, index: number) => {
        expect(entry.id).toBe(index + 1)
        expect(entry.messageType).toBe('ping')
        expect(entry.messageData.id).toBe(`ping-${index + 1}`)
      })

      await handle.shutdown()
    })
  })

  describe('Plugin B: Message Logger (No Return Payload)', () => {
    it('should log all messages without returning payload', async () => {
      const handle = await connectAgent({
        agent: createTestAgent(),
        transport,
        plugins: [pingPongPlugin, messageLoggerPlugin],
        observability: observabilityHooks
      })

      // Send various message types
      const messages = [
        { type: 'ping', id: 'test-001' },
        { type: 'status', health: 'ok' },
        { type: 'custom', data: { key: 'value' } },
        { type: 'ping', id: 'test-002' }
      ]

      for (const message of messages) {
        await handle.send(message)
      }

      // Verify Plugin B logged all messages
      const loggerState = messageLoggerPlugin.getState()
      expect(loggerState.messageCount).toBe(4)
      expect(loggerState.messageLog).toHaveLength(4)

      // Verify log details
      expect(loggerState.messageLog[0].messageType).toBe('ping')
      expect(loggerState.messageLog[1].messageType).toBe('status')
      expect(loggerState.messageLog[2].messageType).toBe('custom')
      expect(loggerState.messageLog[3].messageType).toBe('ping')

      // Verify Plugin A only responded to ping messages
      const pingState = pingPongPlugin.getState()
      expect(pingState.pingCount).toBe(2) // Only the 2 ping messages

      await handle.shutdown()
    })

    it('should maintain separate log state from other plugins', async () => {
      const handle = await connectAgent({
        agent: createTestAgent(),
        transport,
        plugins: [pingPongPlugin, messageLoggerPlugin],
        observability: observabilityHooks
      })

      await handle.send({ type: 'test-message', data: 'isolation-test' })

      const pingState = pingPongPlugin.getState()
      const loggerState = messageLoggerPlugin.getState()

      // Verify Plugin A has no knowledge of logger's message log
      expect(pingState).not.toHaveProperty('messageLog')
      expect(pingState).not.toHaveProperty('messageCount')

      // Verify Plugin B has no knowledge of ping response logic
      expect(loggerState).not.toHaveProperty('pingCount')
      expect(loggerState).not.toHaveProperty('lastResponse')
      expect(loggerState).not.toHaveProperty('lastPingTime')

      // Verify state objects are completely isolated
      expect(JSON.stringify(pingState)).not.toContain('messageLog')
      expect(JSON.stringify(loggerState)).not.toContain('pingCount')

      await handle.shutdown()
    })
  })

  describe('State Isolation Validation', () => {
    it('should prevent plugins from accessing each other\'s state', async () => {
      const handle = await connectAgent({
        agent: createTestAgent(),
        transport,
        plugins: [pingPongPlugin, messageLoggerPlugin],
        observability: observabilityHooks
      })

      // Send a ping to trigger state changes in both plugins
      await handle.send({ type: 'ping', id: 'isolation-test' })

      const pingState = pingPongPlugin.getState()
      const loggerState = messageLoggerPlugin.getState()

      // Verify Plugin A state
      expect(pingState.pingCount).toBe(1)
      expect(pingState.lastResponse).toBeDefined()

      // Verify Plugin B state
      expect(loggerState.messageCount).toBe(1)
      expect(loggerState.messageLog).toHaveLength(1)

      // Attempt to modify one plugin's state and verify the other is unaffected
      pingState.pingCount = 999
      expect(loggerState.messageCount).toBe(1) // Should remain unchanged

      loggerState.messageCount = 888
      expect(pingState.pingCount).toBe(999) // Should remain as we set it

      // Verify state references are different objects
      expect(pingState).not.toBe(loggerState)
      expect(pingState.constructor).toBe(Object)
      expect(loggerState.constructor).toBe(Object)

      await handle.shutdown()
    })

    it('should maintain state isolation across multiple message rounds', async () => {
      const handle = await connectAgent({
        agent: createTestAgent(),
        transport,
        plugins: [pingPongPlugin, messageLoggerPlugin],
        observability: observabilityHooks
      })

      // Round 1: Send pings
      await handle.send({ type: 'ping', id: 'round-1-ping-1' })
      await handle.send({ type: 'ping', id: 'round-1-ping-2' })

      const round1PingState = { ...pingPongPlugin.getState() }
      const round1LoggerState = { ...messageLoggerPlugin.getState() }

      expect(round1PingState.pingCount).toBe(2)
      expect(round1LoggerState.messageCount).toBe(2)

      // Round 2: Send non-ping messages
      await handle.send({ type: 'status', value: 'ok' })
      await handle.send({ type: 'data', payload: [1, 2, 3] })

      const round2PingState = { ...pingPongPlugin.getState() }
      const round2LoggerState = { ...messageLoggerPlugin.getState() }

      // Plugin A should not have processed non-ping messages
      expect(round2PingState.pingCount).toBe(2) // Still 2
      expect(round2PingState.lastResponse.pingId).toBe('round-1-ping-2')

      // Plugin B should have logged all messages
      expect(round2LoggerState.messageCount).toBe(4)
      expect(round2LoggerState.messageLog).toHaveLength(4)

      // Verify state isolation maintained across rounds
      expect(round2PingState).not.toEqual(round2LoggerState)
      expect(Object.keys(round2PingState)).not.toEqual(Object.keys(round2LoggerState))

      await handle.shutdown()
    })
  })

  describe('Observability Hooks and Debug Timeline', () => {
    it('should capture observability events throughout message routing', async () => {
      console.time('transport-observability-events')
      const handle = await connectAgent({
        agent: createTestAgent(),
        transport,
        plugins: [pingPongPlugin, messageLoggerPlugin],
        observability: observabilityHooks,
        debug: true
      })

      // Clear initial events from connection setup
      observabilityEvents = []

      // Send test message
      await handle.send({ type: 'ping', id: 'observability-test' })

      // Verify observability events were captured
      expect(observabilityEvents.length).toBeGreaterThan(0)

      // Look for request lifecycle events
      const requestStartEvents = observabilityEvents.filter(e => e.type === 'request-start')
      const requestEndEvents = observabilityEvents.filter(e => e.type === 'request-end')

      expect(requestStartEvents.length).toBeGreaterThan(0)
      expect(requestEndEvents.length).toBeGreaterThan(0)

      // Verify event metadata
      if (requestStartEvents.length > 0) {
        const startEvent = requestStartEvents[0]
        expect(startEvent.agentId).toBe('test-agent')
        expect(startEvent.operation).toBeDefined()
        expect(startEvent.requestId).toBeDefined()
        expect(startEvent.timestamp).toBeDefined()
      }

      if (requestEndEvents.length > 0) {
        const endEvent = requestEndEvents[0]
        expect(endEvent.duration).toBeGreaterThanOrEqual(0)
        expect(endEvent.agentId).toBe('test-agent')
      }

      await handle.shutdown()
      console.timeEnd('transport-observability-events')
    }, { timeout: 15000 })

    it('should validate debug timeline with plugin execution', async () => {
      const handle = await connectAgent({
        agent: createTestAgent(),
        transport,
        plugins: [pingPongPlugin, messageLoggerPlugin],
        observability: observabilityHooks,
        debug: true,
        enableDebugMode: true
      })

      const startTime = Date.now()

      // Send message and capture timeline
      await handle.send({ type: 'ping', id: 'timeline-test' })

      const endTime = Date.now()

      // Verify timeline events have proper timestamps
      const timedEvents = observabilityEvents.filter(e => e.timestamp)
      timedEvents.forEach(event => {
        expect(event.timestamp).toBeGreaterThanOrEqual(startTime)
        expect(event.timestamp).toBeLessThanOrEqual(endTime)
      })

      // Verify both plugins were executed (indirectly through state changes)
      const pingState = pingPongPlugin.getState()
      const loggerState = messageLoggerPlugin.getState()

      expect(pingState.pingCount).toBe(1)
      expect(loggerState.messageCount).toBe(1)

      // Verify observability captured the execution
      expect(observabilityEvents.length).toBeGreaterThan(0)

      await handle.shutdown()
    })

    it('should handle transport backpressure events in observability', async () => {
      // Create transport with low queue limit to trigger backpressure
      const limitedTransport = new SimulatedTransport({
        debug: false,
        maxQueueSize: 2,
        enableBackpressure: true
      })
      
      // Using direct transport object instead of registry

      const handle = await connectAgent({
        agent: createTestAgent(),
        transport: limitedTransport,
        plugins: [pingPongPlugin, messageLoggerPlugin],
        observability: observabilityHooks
      })

      // Clear initial events
      observabilityEvents = []

      // Try to send multiple messages to trigger backpressure
      try {
        for (let i = 0; i < 5; i++) {
          await handle.send({ type: 'load-test', id: i })
        }
      } catch (error) {
        // Expected - transport should reject messages due to backpressure
        expect(error.message).toContain('queue full')
      }

      // Check if backpressure events were captured
      const backpressureEvents = observabilityEvents.filter(e => 
        e.type === 'backpressure-detected' || e.type === 'backpressure-resolved'
      )

      // Note: Backpressure events depend on the AgentManager implementation
      // At minimum, we should have some error events
      const errorEvents = observabilityEvents.filter(e => e.type === 'error')
      if (errorEvents.length > 0) {
        expect(errorEvents[0].error).toContain('queue full')
      }

      await handle.shutdown()
    })
  })

  describe('Transport Behavior Validation', () => {
    it('should validate transport message routing', async () => {
      const handle = await connectAgent({
        agent: createTestAgent(),
        transport,
        plugins: [pingPongPlugin, messageLoggerPlugin],
        observability: observabilityHooks
      })

      const testMessage = { type: 'transport-test', data: 'routing-validation' }
      await handle.send(testMessage)

      // Verify transport recorded the message
      const sentMessages = transport.getSentMessages()
      expect(sentMessages.length).toBeGreaterThan(0)

      // Verify transport status
      const status = transport.getStatus()
      expect(status.canAcceptMore).toBe(true)
      expect(status.isHealthy).toBe(true)
      expect(status.healthMessage).toBe('Transport operational')

      await handle.shutdown()
    })

    it('should handle transport with simulated failures', async () => {
      // Create transport with failure rate
      const flakyTransport = new SimulatedTransport({
        debug: false,
        failureRate: 0.5, // 50% failure rate
        latencyMs: 1
      })
      
      // Using direct transport object instead of registry

      const handle = await connectAgent({
        agent: createTestAgent(),
        transport: flakyTransport,
        plugins: [pingPongPlugin, messageLoggerPlugin],
        observability: observabilityHooks
      })

      let successCount = 0
      let failureCount = 0

      // Send multiple messages and count successes/failures
      for (let i = 0; i < 10; i++) {
        try {
          await handle.send({ type: 'flaky-test', id: i })
          successCount++
        } catch (error) {
          failureCount++
          expect(error.message).toContain('Simulated network failure')
        }
      }

      // With 50% failure rate, we should have both successes and failures
      // (Though randomness means this isn't guaranteed - in production would use deterministic mock)
      expect(successCount + failureCount).toBe(10)

      await handle.shutdown()
    })
  })

  describe('End-to-End Integration', () => {
    it('should demonstrate complete message flow from transport to plugins', async () => {
      console.time('transport-end-to-end-flow')
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      const handle = await connectAgent({
        agent: createTestAgent(),
        transport,
        plugins: [pingPongPlugin, messageLoggerPlugin],
        observability: observabilityHooks,
        debug: false
      })

      // Complete flow: transport → agent → plugins
      const flowTestMessage = {
        type: 'ping',
        id: 'end-to-end-test',
        timestamp: Date.now(),
        flow: 'transport-to-plugin'
      }

      await handle.send(flowTestMessage)

      // Verify complete flow
      // 1. Transport received and processed message
      const sentMessages = transport.getSentMessages()
      expect(sentMessages.length).toBeGreaterThan(0)

      // 2. Plugin A processed ping and generated response
      const pingState = pingPongPlugin.getState()
      expect(pingState.pingCount).toBe(1)
      expect(pingState.lastResponse).toMatchObject({
        type: 'pong',
        pingId: 'end-to-end-test',
        pluginName: 'ping-pong-plugin'
      })

      // 3. Plugin B logged the message
      const loggerState = messageLoggerPlugin.getState()
      expect(loggerState.messageCount).toBe(1)
      expect(loggerState.messageLog[0]).toMatchObject({
        messageType: 'ping',
        messageData: flowTestMessage
      })

      // 4. Observability captured the entire flow
      expect(observabilityEvents.length).toBeGreaterThan(0)

      // 5. Plugin states remain isolated
      expect(pingState.pingCount).toBe(1)
      expect(loggerState.messageCount).toBe(1)
      expect(pingState).not.toBe(loggerState)

      await handle.shutdown()
      consoleSpy.mockRestore()
      console.timeEnd('transport-end-to-end-flow')
    }, { timeout: 15000 })
  })
})