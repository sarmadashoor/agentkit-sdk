// test-plugin plugin for AgentKit
export class TestPlugin {
  readonly name = 'test-plugin'
  readonly version = '1.0.0'
  
  /**
   * Called when the agent starts
   */
  async onStart(context: { agentId: string; timestamp: number }) {
    console.log(`[test-plugin] Plugin started for agent ${context.agentId}`)
  }
  
  /**
   * Called when a message is sent
   */
  async onSend(payload: { input: any }, context: { agentId: string }) {
    console.log(`[test-plugin] Processing send for agent ${context.agentId}`)
    return payload
  }
  
  /**
   * Called when the agent shuts down
   */
  async onShutdown(context: { agentId: string }) {
    console.log(`[test-plugin] Plugin shutting down for agent ${context.agentId}`)
  }
}

// Default export for convenience
export default TestPlugin
