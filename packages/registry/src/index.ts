import { AgentMetadata, AgentMetadataSchema, Transport, TransportSchema } from '@agentkit/types'
import { z } from 'zod'

export class AgentRegistry {
  private agents = new Map<string, AgentMetadata>()
  private transports = new Map<string, Transport>()

  register(metadata: AgentMetadata): void {
    // Validate structure but store original to preserve all fields
    AgentMetadataSchema.parse(metadata)
    
    // Check for duplicate IDs
    if (this.agents.has(metadata.id)) {
      throw new Error(`Agent with id "${metadata.id}" is already registered in this registry`)
    }
    
    this.agents.set(metadata.id, metadata)
  }

  registerTransport(transport: Transport): void {
    // Validate structure but store original to preserve context
    TransportSchema.parse(transport)
    
    // Check for duplicate IDs
    if (this.transports.has(transport.id)) {
      throw new Error(`Transport with id "${transport.id}" is already registered in this registry`)
    }
    
    this.transports.set(transport.id, transport)
  }

  lookup(agentId: string): AgentMetadata {
    const metadata = this.agents.get(agentId)
    if (!metadata) {
      throw new Error(`Agent with id "${agentId}" not found in registry`)
    }
    return metadata
  }

  lookupTransport(transportId: string): Transport {
    const transport = this.transports.get(transportId)
    if (!transport) {
      throw new Error(`Transport with id "${transportId}" not found in registry`)
    }
    return transport
  }

  // New methods for better API design
  getAgent(agentId: string): AgentMetadata | undefined {
    return this.agents.get(agentId)
  }

  getTransport(transportId: string): Transport | undefined {
    return this.transports.get(transportId)
  }

  // Cleanup and disposal methods
  clear(): void {
    this.agents.clear()
    this.transports.clear()
  }

  removeAgent(agentId: string): boolean {
    return this.agents.delete(agentId)
  }

  removeTransport(transportId: string): boolean {
    return this.transports.delete(transportId)
  }

  // Introspection methods
  listAgents(): string[] {
    return Array.from(this.agents.keys())
  }

  listTransports(): string[] {
    return Array.from(this.transports.keys())
  }

  hasAgent(agentId: string): boolean {
    return this.agents.has(agentId)
  }

  hasTransport(transportId: string): boolean {
    return this.transports.has(transportId)
  }

  // Get count information
  get agentCount(): number {
    return this.agents.size
  }

  get transportCount(): number {
    return this.transports.size
  }
}

// Create a default registry instance for backwards compatibility
export const defaultRegistry = new AgentRegistry()

// Function to initialize the default registry with built-in agents and transports
export function initializeDefaultRegistry(registry: AgentRegistry = defaultRegistry): void {
  try {
    // Import here to avoid circular dependencies
    const { DummyAgent } = require('@agentkit/test-agent')
    const { DummyTransport } = require('@agentkit/transports-dummy')

    // Register dummy agent
    registry.register({
      id: 'dummy-agent',
      name: 'Dummy Agent',
      version: '1.0.0',
      description: 'Echo Testing Agent for development and testing',
      factory: () => new DummyAgent()
    })

    // Register dummy transport
    registry.registerTransport(new DummyTransport({
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

// Backwards compatibility static methods - delegate to default registry
// These can be removed in a future major version
export class LegacyAgentRegistry {
  static register(metadata: AgentMetadata): void {
    defaultRegistry.register(metadata)
  }

  static registerTransport(transport: Transport): void {
    defaultRegistry.registerTransport(transport)
  }

  static lookup(agentId: string): AgentMetadata {
    return defaultRegistry.lookup(agentId)
  }

  static lookupTransport(transportId: string): Transport {
    return defaultRegistry.lookupTransport(transportId)
  }

  static clear(): void {
    defaultRegistry.clear()
  }

  static listAgents(): string[] {
    return defaultRegistry.listAgents()
  }

  static listTransports(): string[] {
    return defaultRegistry.listTransports()
  }
}

// Export for convenience
export { AgentMetadata, AgentMetadataSchema } from '@agentkit/types'