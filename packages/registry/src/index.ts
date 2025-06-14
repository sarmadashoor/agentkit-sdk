import { AgentMetadata, AgentMetadataSchema, Transport, TransportSchema } from '@agentkit/types'
import { z } from 'zod'

export class AgentRegistry {
  private static agents = new Map<string, AgentMetadata>()
  private static transports = new Map<string, Transport>()

  static register(metadata: AgentMetadata): void {
    // Validate structure but store original to preserve all fields
    AgentMetadataSchema.parse(metadata)
    this.agents.set(metadata.id, metadata)
  }

  static registerTransport(transport: Transport): void {
    // Validate structure but store original to preserve context
    TransportSchema.parse(transport)
    this.transports.set(transport.id, transport)
  }

  static lookup(agentId: string): AgentMetadata {
    const metadata = this.agents.get(agentId)
    if (!metadata) {
      throw new Error(`Agent with id "${agentId}" not found in registry`)
    }
    return metadata
  }

  static lookupTransport(transportId: string): Transport {
    const transport = this.transports.get(transportId)
    if (!transport) {
      throw new Error(`Transport with id "${transportId}" not found in registry`)
    }
    return transport
  }

  static clear(): void {
    this.agents.clear()
    this.transports.clear()
  }

  static listAgents(): string[] {
    return Array.from(this.agents.keys())
  }

  static listTransports(): string[] {
    return Array.from(this.transports.keys())
  }
}

// Static registrations for built-in test agents and transports
// This ensures they're always available for testing
export function initializeDefaultRegistry(): void {
  try {
    // Import here to avoid circular dependencies
    const { DummyAgent } = require('@agentkit/test-agent')
    const { DummyTransport } = require('@agentkit/transports-dummy')

    // Register dummy agent
    AgentRegistry.register({
      id: 'dummy-agent',
      name: 'Dummy Agent',
      version: '1.0.0',
      description: 'Echo Testing Agent for development and testing',
      factory: () => new DummyAgent()
    })

    // Register dummy transport
    AgentRegistry.registerTransport(new DummyTransport({
      debug: false,
      logMessages: false
    }))

  } catch (error) {
    // Silently fail if modules aren't available (e.g., in production)
    if (process.env.NODE_ENV !== 'test') {
      console.warn('Could not initialize default registry:', error)
    }
  }
}

// Auto-initialize in test environments
if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
  initializeDefaultRegistry()
}

// Export for convenience
export { AgentMetadata, AgentMetadataSchema } from '@agentkit/types'