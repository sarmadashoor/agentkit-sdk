import type { PluginHookName } from '@agentkit/types'

/**
 * Shared utilities for plugin template generation
 */
export class PluginTemplateUtils {
  /**
   * Convert string to PascalCase
   */
  static toPascalCase(str: string): string {
    return str
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('')
  }

  /**
   * Get description for a plugin hook
   */
  static getHookDescription(hook: PluginHookName): string {
    const descriptions: Record<PluginHookName, string> = {
      onInit: 'Called when the agent is initialized',
      onSend: 'Called before sending data to the agent',
      onError: 'Called when an error occurs',
      onShutdown: 'Called when the agent is shutting down'
    }
    return descriptions[hook] || 'Unknown hook'
  }

  /**
   * Get usage example for a plugin hook
   */
  static getHookUsageExample(hook: PluginHookName): string {
    const examples: Record<PluginHookName, string> = {
      onInit: `\`\`\`typescript
// Use for setting up resources, connections, or initial state
async onInit(context: AgentContext): Promise<void> {
  // Initialize database connections, setup monitoring, etc.
}
\`\`\``,
      onSend: `\`\`\`typescript
// Use for validating, modifying, or logging outgoing data
async onSend(payload: SendPayload, context: AgentContext): Promise<void> {
  // Validate input, add metadata, log interactions, etc.
}
\`\`\``,
      onError: `\`\`\`typescript
// Use for error handling, reporting, and recovery
async onError(error: Error, context: AgentContext): Promise<void> {
  // Log errors, send notifications, attempt recovery, etc.
}
\`\`\``,
      onShutdown: `\`\`\`typescript
// Use for cleanup, saving state, and resource disposal
async onShutdown(context: AgentContext): Promise<void> {
  // Close connections, save state, cleanup resources, etc.
}
\`\`\``
    }
    return examples[hook] || ''
  }

  /**
   * Generate hook implementation template
   */
  static generateHookTemplate(hook: PluginHookName): string {
    const templates: Record<PluginHookName, string> = {
      onInit: `
  /**
   * Called when the agent is initialized
   * Use this hook to set up any required resources or connections
   */
  async onInit(context: AgentContext): Promise<void> {
    if (!this.pluginConfig.enabled) {
      return
    }
    
    if (this.pluginConfig.logLevel !== 'error') {
      console.log(\`[\${this.name}] Initializing with agent \${context.agentId}\`)
    }
    
    try {
      // Add your initialization logic here
      // Example: await this.setupResources(context)
      
    } catch (error) {
      console.error(\`[\${this.name}] Initialization failed:\`, error)
      throw error // Re-throw to signal initialization failure
    }
  }`,
      onSend: `
  /**
   * Called before sending data to the agent
   * Use this hook to modify, validate, or log outgoing data
   */
  async onSend(payload: SendPayload, context: AgentContext): Promise<void> {
    if (!this.pluginConfig.enabled) {
      return
    }
    
    if (this.pluginConfig.logLevel === 'debug') {
      console.log(\`[\${this.name}] Processing send for agent \${context.agentId}\`, {
        payloadSize: JSON.stringify(payload.input).length,
        timestamp: context.timestamp
      })
    }
    
    try {
      // Add your send processing logic here
      // Example: await this.validatePayload(payload)
      // Example: this.logInteraction(payload, context)
      
    } catch (error) {
      console.error(\`[\${this.name}] Send processing failed:\`, error)
      throw error // Re-throw to prevent send operation
    }
  }`,
      onError: `
  /**
   * Called when an error occurs in the agent system
   * Use this hook to handle, log, or report errors
   */
  async onError(error: Error, context: AgentContext): Promise<void> {
    if (!this.pluginConfig.enabled) {
      return
    }
    
    console.error(\`[\${this.name}] Error in agent \${context.agentId}:\`, {
      error: error.message,
      stack: error.stack,
      context: {
        requestId: context.requestId,
        timestamp: context.timestamp
      }
    })
    
    try {
      // Add your error handling logic here
      // Example: await this.reportError(error, context)
      // Example: await this.notifyAdmins(error, context)
      
    } catch (handlingError) {
      // Don't throw from error handlers to avoid infinite loops
      console.error(\`[\${this.name}] Error handling failed:\`, handlingError)
    }
  }`,
      onShutdown: `
  /**
   * Called when the agent is shutting down
   * Use this hook to clean up resources and save state
   */
  async onShutdown(context: AgentContext): Promise<void> {
    if (this.pluginConfig.logLevel !== 'error') {
      console.log(\`[\${this.name}] Shutting down for agent \${context.agentId}\`)
    }
    
    try {
      // Add your cleanup logic here
      // Example: await this.closeConnections()
      // Example: await this.saveState(context)
      
    } catch (error) {
      // Log but don't throw during shutdown to avoid blocking other cleanup
      console.error(\`[\${this.name}] Shutdown cleanup failed:\`, error)
    }
  }`
    }
    return templates[hook] || ''
  }
}