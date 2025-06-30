import { Transport, TransportConfig, TransportMessage, TransportStatus } from '@agentkit/types'
import { z } from 'zod'

// Configuration schema for DummyTransport
export const DummyTransportConfigSchema = z.object({
  debug: z.boolean().optional(),
  logMessages: z.boolean().optional().default(true),
  responseDelay: z.number().optional().default(5),
  fixedResponse: z.unknown().optional(),
  // Backpressure configuration
  maxQueueSize: z.number().min(1).optional().default(100),
  enableBackpressure: z.boolean().optional().default(true)
})

export type DummyTransportConfig = z.infer<typeof DummyTransportConfigSchema>

export class DummyTransport implements Transport {
  id = 'dummy'
  name = 'Dummy Transport'
  config: DummyTransportConfig
  private messageQueue: unknown[] = []
  private sentMessages: unknown[] = []
  private processingQueue: unknown[] = [] // Track messages being processed for backpressure
  private initialized = false
  private callbacks: ((msg: unknown) => void)[] = []
  private activeTimeouts = new Set<NodeJS.Timeout>()
  private messageChannels: MessageChannel[] = [] // Track MessageChannels for cleanup
  private messagePorts: { port1?: MessagePort; port2?: MessagePort }[] = [] // Track individual ports

  constructor(config?: DummyTransportConfig) {
    this.config = DummyTransportConfigSchema.parse(config || {})
  }

  async init(config?: unknown): Promise<void> {
    // If additional config is provided, merge it
    if (config) {
      // Create a new merged config since the existing one might be frozen
      const mergedConfig = { ...this.config, ...config }
      const validatedConfig = DummyTransportConfigSchema.parse(mergedConfig)
      
      // If config is frozen (from registry), we can't reassign it
      // So we'll just validate that the merged config is valid
      if (!Object.isFrozen(this)) {
        this.config = validatedConfig
      }
    }
    
    if (this.config.debug) {
      console.log('[DummyTransport] Initializing with config:', this.config)
    }
    
    this.initialized = true
    
    // Simulate async initialization
    await new Promise<void>(resolve => setTimeout(resolve, this.config.responseDelay ?? 5))
  }

  async send(message: unknown): Promise<void> {
    if (!this.initialized) {
      throw new Error('Transport not initialized. Call init() first.')
    }
    
    // Check backpressure before accepting the message
    if (this.config.enableBackpressure && !this.canAcceptMore()) {
      throw new Error(`Transport "${this.id}" queue is full (${this.processingQueue.length}/${this.config.maxQueueSize}). Cannot accept more messages.`)
    }
    
    if (this.config.debug) {
      console.log('[DummyTransport] Sending message:', message)
    }
    
    // Add to processing queue for backpressure tracking
    const messageId = Date.now() + '-' + Math.random().toString(36).substr(2, 9)
    let messageWithId: any = message
    if (this.config.enableBackpressure) {
      messageWithId = typeof message === 'object' && message !== null
        ? Object.assign({}, message, { __messageId: messageId })
        : { value: message, __messageId: messageId }
      this.processingQueue.push(messageWithId)
      if (this.config.debug) {
        console.log(`[${this.name}] Added to processing queue (id: ${messageId}, size: ${this.processingQueue.length})`)
      }
    }
    
    this.sentMessages.push(message)
    
    // Simulate async processing
    const timeoutId = setTimeout(() => {
      this.activeTimeouts.delete(timeoutId)
      // If fixedResponse is configured, add it to queue
      if (this.config.fixedResponse !== undefined) {
        this.messageQueue.push(this.config.fixedResponse)
      } else {
        // Default behavior: echo the message with transformation
        const response = {
          result: `echo:${JSON.stringify(message)}`,
          metadata: {
            agentId: 'dummy-agent',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            initData: { ready: true, timestamp: new Date().toISOString() }
          }
        }
        this.messageQueue.push(response)
      }
      
      // Log messages if enabled
      if (this.config.logMessages) {
        const responseToLog = this.config.fixedResponse !== undefined ? 
          this.config.fixedResponse : 
          { result: `echo:${JSON.stringify(message)}`, metadata: { agentId: 'dummy-agent', version: '1.0.0' } }
        console.log(`[${this.name}] Message sent:`, responseToLog)
      }
      
      // Remove from processing queue (message is now complete)
      if (this.config.enableBackpressure) {
        const index = this.processingQueue.findIndex(item => 
          (item as any).__messageId === (messageWithId as any).__messageId
        )
        if (index !== -1) {
          const removedItem = this.processingQueue.splice(index, 1)[0]
          if (this.config.debug) {
            console.log(`[${this.name}] Removed from processing queue (id: ${(removedItem as any).__messageId}, size: ${this.processingQueue.length})`)
          }
        } else if (this.config.debug) {
          console.log(`[${this.name}] Message not found in processing queue for removal (id: ${(messageWithId as any).__messageId})`)
        }
      }
      
      // Trigger callbacks for received messages
      if (this.callbacks.length > 0 && this.messageQueue.length > 0) {
        const msg = this.messageQueue.shift()
        this.callbacks.forEach(cb => cb(msg))
      }
    }, this.config.responseDelay ?? 5)
    this.activeTimeouts.add(timeoutId)
    
    // Simulate async send delay (but don't block - processing happens in background)
    await new Promise<void>(resolve => {
      const timeoutId = setTimeout(() => {
        this.activeTimeouts.delete(timeoutId)
        resolve()
      }, Math.min(this.config.responseDelay ?? 5, 1))
      this.activeTimeouts.add(timeoutId)
    })
  }

  async receive(): Promise<TransportMessage> {
    if (!this.initialized) {
      throw new Error('Transport not initialized. Call init() first.')
    }
    
    if (this.config.debug) {
      console.log('[DummyTransport] Receiving message')
    }
    
    // Simulate async receive
    await new Promise<void>(resolve => {
      const timeoutId = setTimeout(() => {
        this.activeTimeouts.delete(timeoutId)
        resolve()
      }, this.config.responseDelay ?? 5)
      this.activeTimeouts.add(timeoutId)
    })
    
    const message = this.messageQueue.shift()
    if (!message) {
      return { content: null, metadata: { transportId: this.id, timestamp: new Date().toISOString() } }
    }
    
    if (this.config.logMessages) {
      console.log(`[${this.name}] Message received:`, message)
    }
    
    return { content: message, metadata: { transportId: this.id, timestamp: new Date().toISOString() } }
  }

  // Method to register callback for messages (useful for testing)
  onMessage(callback: (msg: unknown) => void): void {
    this.callbacks.push(callback)
  }

  // Helper methods for testing
  getQueueSize(): number {
    return this.messageQueue.length
  }

  getProcessingQueueSize(): number {
    return this.processingQueue.length
  }

  getSentMessages(): unknown[] {
    return [...this.sentMessages]
  }

  clearMessages(): void {
    this.messageQueue = []
    this.sentMessages = []
    this.processingQueue = []
  }

  isInitialized(): boolean {
    return this.initialized
  }

  // Backpressure API implementation
  canAcceptMore(): boolean {
    if (!this.config.enableBackpressure) {
      return true // Backpressure disabled
    }
    
    const canAccept = this.processingQueue.length < (this.config.maxQueueSize ?? 100)
    if (this.config.debug) {
      console.log(`[${this.name}] canAcceptMore: ${canAccept} (processingQueue: ${this.processingQueue.length}/${this.config.maxQueueSize})`)
    }
    return canAccept
  }

  getStatus(): TransportStatus {
    const queueSize = this.config.enableBackpressure ? this.processingQueue.length : this.messageQueue.length
    const maxQueueSize = this.config.maxQueueSize ?? 100
    const canAcceptMore = this.config.enableBackpressure ? 
      this.processingQueue.length < maxQueueSize : true

    return {
      canAcceptMore,
      queueSize,
      maxQueueSize: this.config.enableBackpressure ? maxQueueSize : undefined,
      isHealthy: this.initialized,
      healthMessage: this.initialized ? 
        'Transport operational' : 
        'Transport not initialized'
    }
  }

  async shutdown(): Promise<void> {
    if (this.config.debug) {
      console.log('[DummyTransport] Shutting down')
    }
    
    // Clear all active timeouts
    for (const timeout of this.activeTimeouts) {
      clearTimeout(timeout)
    }
    this.activeTimeouts.clear()
    
    // Close all MessageChannels and their ports explicitly
    for (const channel of this.messageChannels) {
      try {
        // Close both ports of the channel
        if (channel.port1) {
          channel.port1.close()
          if (this.config.debug) {
            console.log('[DummyTransport] Closed MessageChannel port1')
          }
        }
        if (channel.port2) {
          channel.port2.close()
          if (this.config.debug) {
            console.log('[DummyTransport] Closed MessageChannel port2')
          }
        }
      } catch (error) {
        if (this.config.debug) {
          console.warn('[DummyTransport] Error closing MessageChannel ports:', error)
        }
      }
    }
    this.messageChannels.length = 0
    
    // Close any individually tracked ports
    for (const portPair of this.messagePorts) {
      try {
        if (portPair.port1 && typeof portPair.port1.close === 'function') {
          portPair.port1.close()
          ;(portPair as any).port1 = undefined
          if (this.config.debug) {
            console.log('[DummyTransport] Closed individual port1')
          }
        }
        if (portPair.port2 && typeof portPair.port2.close === 'function') {
          portPair.port2.close()
          ;(portPair as any).port2 = undefined
          if (this.config.debug) {
            console.log('[DummyTransport] Closed individual port2')
          }
        }
      } catch (error) {
        if (this.config.debug) {
          console.warn('[DummyTransport] Error closing individual ports:', error)
        }
      }
    }
    this.messagePorts.length = 0
    
    this.initialized = false
    this.messageQueue.length = 0
    this.sentMessages.length = 0
    this.processingQueue.length = 0
    this.callbacks.length = 0
    
    // Simulate async shutdown
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  
  /**
   * Register MessagePorts for tracking and cleanup
   */
  private registerMessagePorts(port1: MessagePort, port2: MessagePort): void {
    const portPair = { port1, port2 }
    this.messagePorts.push(portPair)
    
    // Auto-remove when ports are closed externally
    port1.addEventListener('close', () => {
      (portPair as any).port1 = undefined
    })
    port2.addEventListener('close', () => {
      (portPair as any).port2 = undefined
    })
  }
  
  /**
   * Create a MessageChannel and register for cleanup
   * Use this method instead of creating MessageChannel directly
   */
  createMessageChannel(): { port1: MessagePort; port2: MessagePort; close: () => void } {
    const channel = new MessageChannel()
    
    // Track the channel itself
    this.messageChannels.push(channel)
    
    // Also register individual ports for cleanup
    this.registerMessagePorts(channel.port1, channel.port2)
    
    return {
      port1: channel.port1,
      port2: channel.port2,
      close: () => {
        try {
          channel.port1.close()
          channel.port2.close()
          
          // Remove from tracking
          const channelIndex = this.messageChannels.indexOf(channel)
          if (channelIndex > -1) {
            this.messageChannels.splice(channelIndex, 1)
          }
        } catch (error) {
          if (this.config.debug) {
            console.warn('[DummyTransport] Error in manual close:', error)
          }
        }
      }
    }
  }
  
  // Add idempotent dispose method for backward compatibility
  async dispose(): Promise<void> {
    await this.shutdown()
  }
}

// Keep the original for backward compatibility
export class LegacyDummyTransport implements Transport {
  id = 'dummy-transport'
  name = 'Dummy Transport'
  config?: TransportConfig
  private messageQueue: unknown[] = []
  private debug: boolean = false
  private activeTimeouts = new Set<NodeJS.Timeout>()
  private messageChannels: MessageChannel[] = [] // Track MessageChannels for cleanup
  private messagePorts: { port1?: MessagePort; port2?: MessagePort }[] = [] // Track individual ports

  constructor(config?: { debug?: boolean }) {
    this.config = config
    this.debug = config?.debug ?? false
  }

  async init(config?: unknown): Promise<void> {
    if (this.debug) {
      console.log('[DummyTransport] Initializing with config:', config)
    }
    // Simulate async initialization
    await new Promise(resolve => {
      const timeoutId = setTimeout(() => {
        this.activeTimeouts.delete(timeoutId)
        resolve(undefined)
      }, 10)
      this.activeTimeouts.add(timeoutId)
    })
  }

  async send(message: unknown): Promise<void> {
    if (this.debug) {
      console.log('[DummyTransport] Sending message:', message)
    }
    this.messageQueue.push(message)
    // Simulate async send
    await new Promise(resolve => {
      const timeoutId = setTimeout(() => {
        this.activeTimeouts.delete(timeoutId)
        resolve(undefined)
      }, 5)
      this.activeTimeouts.add(timeoutId)
    })
  }

  async receive(): Promise<TransportMessage> {
    if (this.debug) {
      console.log('[DummyTransport] Receiving message')
    }
    // Simulate async receive
    await new Promise<void>(resolve => {
      const timeoutId = setTimeout(() => {
        this.activeTimeouts.delete(timeoutId)
        resolve()
      }, 5)
      this.activeTimeouts.add(timeoutId)
    })
    const message = this.messageQueue.shift()
    return { content: message || null, metadata: { transportId: this.id, timestamp: new Date().toISOString() } }
  }

  // Helper method for testing
  getQueueSize(): number {
    return this.messageQueue.length
  }

  // Required by Transport interface - legacy transport always accepts messages
  canAcceptMore(): boolean {
    return true
  }

  async shutdown(): Promise<void> {
    if (this.debug) {
      console.log('[LegacyDummyTransport] Shutting down')
    }
    
    // Clear all active timeouts
    for (const timeout of this.activeTimeouts) {
      clearTimeout(timeout)
    }
    this.activeTimeouts.clear()
    
    // Close all MessageChannels and their ports explicitly
    for (const channel of this.messageChannels) {
      try {
        // Close both ports of the channel
        if (channel.port1) {
          channel.port1.close()
          if (this.debug) {
            console.log('[LegacyDummyTransport] Closed MessageChannel port1')
          }
        }
        if (channel.port2) {
          channel.port2.close()
          if (this.debug) {
            console.log('[LegacyDummyTransport] Closed MessageChannel port2')
          }
        }
      } catch (error) {
        if (this.debug) {
          console.warn('[LegacyDummyTransport] Error closing MessageChannel ports:', error)
        }
      }
    }
    this.messageChannels.length = 0
    
    // Close any individually tracked ports
    for (const portPair of this.messagePorts) {
      try {
        if (portPair.port1 && typeof portPair.port1.close === 'function') {
          portPair.port1.close()
          ;(portPair as any).port1 = undefined
          if (this.debug) {
            console.log('[LegacyDummyTransport] Closed individual port1')
          }
        }
        if (portPair.port2 && typeof portPair.port2.close === 'function') {
          portPair.port2.close()
          ;(portPair as any).port2 = undefined
          if (this.debug) {
            console.log('[LegacyDummyTransport] Closed individual port2')
          }
        }
      } catch (error) {
        if (this.debug) {
          console.warn('[LegacyDummyTransport] Error closing individual ports:', error)
        }
      }
    }
    this.messagePorts.length = 0
    
    this.messageQueue.length = 0
    
    // Simulate async shutdown
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  
  /**
   * Register MessagePorts for tracking and cleanup
   */
  private registerMessagePorts(port1: MessagePort, port2: MessagePort): void {
    const portPair = { port1, port2 }
    this.messagePorts.push(portPair)
    
    // Auto-remove when ports are closed externally
    port1.addEventListener('close', () => {
      (portPair as any).port1 = undefined
    })
    port2.addEventListener('close', () => {
      (portPair as any).port2 = undefined
    })
  }
  
  /**
   * Create a MessageChannel and register for cleanup
   * Use this method instead of creating MessageChannel directly
   */
  createMessageChannel(): { port1: MessagePort; port2: MessagePort; close: () => void } {
    const channel = new MessageChannel()
    
    // Track the channel itself
    this.messageChannels.push(channel)
    
    // Also register individual ports for cleanup
    this.registerMessagePorts(channel.port1, channel.port2)
    
    return {
      port1: channel.port1,
      port2: channel.port2,
      close: () => {
        try {
          channel.port1.close()
          channel.port2.close()
          
          // Remove from tracking
          const channelIndex = this.messageChannels.indexOf(channel)
          if (channelIndex > -1) {
            this.messageChannels.splice(channelIndex, 1)
          }
        } catch (error) {
          if (this.debug) {
            console.warn('[LegacyDummyTransport] Error in manual close:', error)
          }
        }
      }
    }
  }
  
  // Add idempotent dispose method for backward compatibility
  async dispose(): Promise<void> {
    await this.shutdown()
  }
}

export const createDummyTransport = (config?: DummyTransportConfig): Transport => {
  return new DummyTransport(config)
}

export const createLegacyDummyTransport = (config?: { debug?: boolean }): Transport => {
  return new LegacyDummyTransport(config)
}