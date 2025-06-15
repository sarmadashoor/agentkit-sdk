/**
 * MockTransport - Simulates a real-world transport with latency and potential failures
 * This demonstrates how external teams would create their own transports for AgentKit
 */

// IMPORTANT: Only importing from public SDK API
import type { Transport } from '@agentkit/sdk'

export interface MockTransportConfig {
  /** Base latency for message delivery (ms) */
  baseLatency?: number
  /** Random latency variance (ms) */
  latencyVariance?: number
  /** Probability of transport failure (0-1) */
  failureRate?: number
  /** Whether to log transport activity */
  enableLogging?: boolean
  /** Max retries for failed sends */
  maxRetries?: number
}

export class MockTransport implements Transport {
  readonly id = 'mock-transport'
  readonly name = 'Mock Transport'
  readonly config: Required<MockTransportConfig>
  
  private isInitialized = false
  private messageCount = 0
  private failureCount = 0

  constructor(config: MockTransportConfig = {}) {
    this.config = {
      baseLatency: config.baseLatency ?? 100,
      latencyVariance: config.latencyVariance ?? 50,
      failureRate: config.failureRate ?? 0.1,
      enableLogging: config.enableLogging ?? true,
      maxRetries: config.maxRetries ?? 2
    }
  }

  async init(transportConfig?: unknown): Promise<void> {
    if (this.isInitialized) {
      throw new Error('MockTransport is already initialized')
    }

    // Simulate initialization latency
    await this.simulateLatency(50)

    if (this.config.enableLogging) {
      console.log('[MockTransport] Initializing with config:', {
        ...this.config,
        transportConfig
      })
    }

    // Simulate potential initialization failure
    if (Math.random() < 0.05) { // 5% chance of init failure
      throw new Error('MockTransport initialization failed due to network issues')
    }

    this.isInitialized = true
    
    if (this.config.enableLogging) {
      console.log('[MockTransport] Successfully initialized')
    }
  }

  async send(data: unknown): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('MockTransport must be initialized before sending messages')
    }

    this.messageCount++
    const messageId = `msg-${this.messageCount}-${Date.now()}`

    if (this.config.enableLogging) {
      console.log(`[MockTransport] Sending message ${messageId}:`, {
        type: typeof data,
        preview: this.truncateData(data)
      })
    }

    // Simulate network latency
    await this.simulateLatency()

    // Simulate potential send failure
    if (Math.random() < this.config.failureRate) {
      this.failureCount++
      const error = new Error(`MockTransport send failed (failure #${this.failureCount}): Network timeout`)
      
      if (this.config.enableLogging) {
        console.error(`[MockTransport] Failed to send message ${messageId}:`, error.message)
      }
      
      throw error
    }

    // Simulate successful delivery
    if (this.config.enableLogging) {
      console.log(`[MockTransport] Successfully delivered message ${messageId}`)
    }
  }

  async receive(): Promise<unknown> {
    if (!this.isInitialized) {
      throw new Error('MockTransport must be initialized before receiving messages')
    }

    // For this example, we don't implement actual message receiving
    // This is just to satisfy the Transport interface
    if (this.config.enableLogging) {
      console.log('[MockTransport] Receive called (not implemented for this example)')
    }

    // Simulate some latency
    await this.simulateLatency(50)
    
    // Return a mock response
    return {
      type: 'mock-response',
      timestamp: Date.now(),
      message: 'Mock transport does not implement actual message receiving'
    }
  }

  /**
   * Get transport statistics
   */
  getStats() {
    return {
      isInitialized: this.isInitialized,
      messageCount: this.messageCount,
      failureCount: this.failureCount,
      successRate: this.messageCount > 0 ? (this.messageCount - this.failureCount) / this.messageCount : 0
    }
  }

  /**
   * Simulate network latency
   */
  private async simulateLatency(baseLatency?: number): Promise<void> {
    const base = baseLatency ?? this.config.baseLatency
    const variance = Math.random() * this.config.latencyVariance
    const totalLatency = base + variance
    
    if (totalLatency > 0) {
      await new Promise(resolve => setTimeout(resolve, totalLatency))
    }
  }

  /**
   * Truncate data for logging
   */
  private truncateData(data: unknown): string {
    const str = JSON.stringify(data)
    return str.length > 100 ? str.substring(0, 100) + '...' : str
  }

  /**
   * Simulate a transport that always fails (for testing error scenarios)
   */
  static createFailingTransport(): MockTransport {
    return new MockTransport({
      failureRate: 1.0, // Always fail
      enableLogging: true
    })
  }

  /**
   * Simulate a high-latency transport (for testing timeout scenarios)
   */
  static createSlowTransport(): MockTransport {
    return new MockTransport({
      baseLatency: 2000,
      latencyVariance: 1000,
      enableLogging: true
    })
  }

  /**
   * Simulate a reliable, fast transport (for testing happy path)
   */
  static createReliableTransport(): MockTransport {
    return new MockTransport({
      baseLatency: 10,
      latencyVariance: 5,
      failureRate: 0.0,
      enableLogging: true
    })
  }
}