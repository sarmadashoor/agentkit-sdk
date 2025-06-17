import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'

const helloWorldPlugin: AgentKitPlugin = {
  name: 'hello-world',
  version: '1.0.0',
  description: 'A simple hello world plugin that responds to ping with pong',
  
  // New hook requested by user
  async onStart(context: AgentContext): Promise<void> {
    console.log('Hello world plugin loaded', {
      agentId: context.agentId,
      transportId: context.transportId
    })
  },
  
  // Initialize plugin resources
  async onInit(context: AgentContext): Promise<void> {
    console.log(`Hello world plugin initialized for agent: ${context.agentId}`)
  },
  
  // Process outgoing messages - respond to "ping" with "pong"
  async onSend(payload: SendPayload, context: AgentContext): Promise<SendPayload> {
    // Check if input is "ping"
    if (payload.message === 'ping') {
      console.log('Ping received, responding with pong')
      return {
        ...payload,
        message: 'pong',
        metadata: {
          ...payload.metadata,
          processedBy: 'hello-world',
          timestamp: Date.now(),
          pingPongHandler: true
        }
      }
    }
    
    // For other messages, just pass through with metadata
    return {
      ...payload,
      metadata: {
        ...payload.metadata,
        processedBy: 'hello-world',
        timestamp: Date.now()
      }
    }
  },
  
  // Cleanup resources
  async onShutdown(context: AgentContext): Promise<void> {
    console.log('Hello world plugin shutting down')
  }
}

export default helloWorldPlugin