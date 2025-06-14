import { Transport } from '@agentkit/types'
import { z } from 'zod'

// Configuration schema for DummyTransport
export const DummyTransportConfigSchema = z.object({
  debug: z.boolean().optional(),
  logMessages: z.boolean().optional().default(true),
  responseDelay: z.number().optional().default(5),
  fixedResponse: z.unknown().optional()
})

export type DummyTransportConfig = z.infer<typeof DummyTransportConfigSchema>

export class DummyTransport implements Transport {
  id = 'dummy'
  name = 'Dummy Transport'
  config: DummyTransportConfig
  private messageQueue: unknown[] = []
  private sentMessages: unknown[] = []
  private initialized = false
  private callbacks: ((msg: unknown) => void)[] = []

  constructor(config?: DummyTransportConfig) {
    this.config = DummyTransportConfigSchema.parse(config || {})
  }

  async init(config?: unknown): Promise<void> {
    // Merge provided config with constructor config
    const mergedConfig = config ? { ...this.config, ...config } : this.config
    this.config = DummyTransportConfigSchema.parse(mergedConfig)
    
    if (this.config.debug) {
      console.log('[DummyTransport] Initializing with config:', this.config)
    }
    
    this.initialized = true
    
    // Simulate async initialization
    await new Promise(resolve => setTimeout(resolve, this.config.responseDelay || 5))
  }

  async send(message: unknown): Promise<void> {
    if (!this.initialized) {
      throw new Error('Transport not initialized. Call init() first.')
    }
    
    if (this.config.debug) {
      console.log('[DummyTransport] Sending message:', message)
    }
    
    this.sentMessages.push(message)
    
    // If fixedResponse is configured, add it to queue
    if (this.config.fixedResponse !== undefined) {
      this.messageQueue.push(this.config.fixedResponse)
    } else {
      // Default behavior: echo the message with transformation
      const response = {
        echoed: message,
        transportId: this.id,
        timestamp: new Date().toISOString()
      }
      this.messageQueue.push(response)
    }
    
    // Log messages if enabled
    if (this.config.logMessages) {
      console.log(`[${this.name}] Message sent:`, message)
    }
    
    // Simulate async send
    await new Promise(resolve => setTimeout(resolve, this.config.responseDelay || 5))
    
    // Trigger callbacks for received messages
    if (this.callbacks.length > 0 && this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift()
      this.callbacks.forEach(cb => cb(msg))
    }
  }

  async receive(): Promise<unknown> {
    if (!this.initialized) {
      throw new Error('Transport not initialized. Call init() first.')
    }
    
    if (this.config.debug) {
      console.log('[DummyTransport] Receiving message')
    }
    
    // Simulate async receive
    await new Promise(resolve => setTimeout(resolve, this.config.responseDelay || 5))
    
    const message = this.messageQueue.shift() || null
    
    if (this.config.logMessages && message) {
      console.log(`[${this.name}] Message received:`, message)
    }
    
    return message
  }

  // Method to register callback for messages (useful for testing)
  onMessage(callback: (msg: unknown) => void): void {
    this.callbacks.push(callback)
  }

  // Helper methods for testing
  getQueueSize(): number {
    return this.messageQueue.length
  }

  getSentMessages(): unknown[] {
    return [...this.sentMessages]
  }

  clearMessages(): void {
    this.messageQueue = []
    this.sentMessages = []
  }

  isInitialized(): boolean {
    return this.initialized
  }
}

// Keep the original for backward compatibility
export class LegacyDummyTransport implements Transport {
  id = 'dummy-transport'
  name = 'Dummy Transport'
  config?: unknown
  private messageQueue: unknown[] = []
  private debug: boolean = false

  constructor(config?: { debug?: boolean }) {
    this.config = config
    this.debug = config?.debug ?? false
  }

  async init(config?: unknown): Promise<void> {
    if (this.debug) {
      console.log('[DummyTransport] Initializing with config:', config)
    }
    // Simulate async initialization
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  async send(message: unknown): Promise<void> {
    if (this.debug) {
      console.log('[DummyTransport] Sending message:', message)
    }
    this.messageQueue.push(message)
    // Simulate async send
    await new Promise(resolve => setTimeout(resolve, 5))
  }

  async receive(): Promise<unknown> {
    if (this.debug) {
      console.log('[DummyTransport] Receiving message')
    }
    // Simulate async receive
    await new Promise(resolve => setTimeout(resolve, 5))
    return this.messageQueue.shift() || null
  }

  // Helper method for testing
  getQueueSize(): number {
    return this.messageQueue.length
  }
}

export const createDummyTransport = (config?: DummyTransportConfig): Transport => {
  return new DummyTransport(config)
}

export const createLegacyDummyTransport = (config?: { debug?: boolean }): Transport => {
  return new LegacyDummyTransport(config)
}