import { 
  ConnectAgentOptions, 
  ConnectAgentOptionsSchema,
  AgentRuntimeHandle,
  Agent,
  Transport
} from '@agentkit/types'
import { AgentRegistry, defaultRegistry } from '@agentkit/registry'
import { AgentManager } from './AgentManager'
import { 
  AgentNotFoundError,
  TransportNotFoundError, 
  AgentCompatibilityError,
  InvalidInputError,
  getErrorMessage
} from './errors'
import { debugLog } from './log'
import { validateSchema, validateScope } from './validation'

export async function connectAgent(options: ConnectAgentOptions): Promise<AgentRuntimeHandle> {
  debugLog.operation('connectAgent start', { 
    agentType: typeof options.agent, 
    transportType: typeof options.transport,
    hasScope: !!options.scope,
    hasRegistry: !!options.registry
  }, options.debug)

  // Use provided registry or fall back to default registry for backwards compatibility
  const registry = options.registry || defaultRegistry

  // Validate options with enhanced error messages
  try {
    validateSchema(ConnectAgentOptionsSchema, options, 'ConnectAgentOptions', options.debug)
  } catch (error) {
    debugLog.error('options validation', error as Error, options.debug)
    throw error
  }

  // Validate scope if provided
  if (options.scope) {
    try {
      validateScope(options.scope, options.debug)
    } catch (error) {
      debugLog.error('scope validation', error as Error, options.debug)
      throw new InvalidInputError(
        'scope',
        `Invalid scope configuration: ${getErrorMessage(error)}`,
        { cause: error instanceof Error ? error : new Error(String(error)) }
      )
    }
  }

  // Resolve agent with better error handling
  let agent: Agent
  let registeredScopes: string[] = []
  let agentId: string // The authoritative agent ID to use throughout the system
  
  if (typeof options.agent === 'string') {
    try {
      debugLog.operation('agent lookup', { agentId: options.agent }, options.debug)
      const metadata = registry.lookup(options.agent)
      debugLog.agentResolution(options.agent, metadata, options.debug || false)
      agent = metadata.factory()
      // Use metadata ID as the authoritative agent ID, not the factory-created agent's ID
      agentId = metadata.id
      // Extract registered scopes from metadata
      registeredScopes = metadata.supportedScopes || []
      debugLog.operation('extracted scopes', { 
        registryId: metadata.id,
        factoryAgentId: agent.id,
        authoritativeId: agentId,
        registeredScopes 
      }, options.debug)
    } catch (error) {
      debugLog.error('agent lookup', error as Error, options.debug)
      const availableAgents = registry.listAgents()
      throw new AgentNotFoundError(options.agent, {
        cause: error instanceof Error ? error : new Error(String(error)),
        context: { 
          requestedAgent: options.agent, 
          availableAgents,
          totalAgents: availableAgents.length
        }
      })
    }
  } else {
    debugLog.operation('agent direct', { agentId: options.agent.id }, options.debug)
    agent = options.agent
    agentId = agent.id // For direct agents, use their ID
    // When using direct agent, we don't have metadata, so registeredScopes stays empty
  }

  // Resolve transport with better error handling
  let transport: Transport
  if (typeof options.transport === 'string') {
    try {
      debugLog.operation('transport lookup', { transportId: options.transport }, options.debug)
      transport = registry.lookupTransport(options.transport)
      debugLog.transportResolution(options.transport, transport, options.debug || false)
    } catch (error) {
      debugLog.error('transport lookup', error as Error, options.debug)
      const availableTransports = registry.listTransports()
      throw new TransportNotFoundError(options.transport, {
        cause: error instanceof Error ? error : new Error(String(error)),
        context: { 
          requestedTransport: options.transport, 
          availableTransports,
          totalTransports: availableTransports.length
        }
      })
    }
  } else {
    debugLog.operation('transport direct', { transportId: options.transport.id }, options.debug)
    transport = options.transport
  }

  // Perform compatibility checks
  try {
    validateCompatibility(agent, transport, options)
    debugLog.operation('compatibility check', { 
      agentId: agentId, 
      transportId: transport.id,
      status: 'passed'
    }, options.debug)
  } catch (error) {
    debugLog.error('compatibility check', error as Error, options.debug)
    throw error
  }

  // Create agent manager with validated components
  debugLog.operation('manager creation', { 
    agentId: agentId, 
    transportId: transport.id,
    registeredScopes,
    requestedScopes: options.scope || []
  }, options.debug)
  
  const manager = new AgentManager(agent, transport, options, registeredScopes, agentId)

  // Initialize with comprehensive error handling
  try {
    debugLog.operation('manager initialization', { 
      agentId: agentId, 
      transportId: transport.id 
    }, options.debug)
    
    await manager.initialize()
    
    debugLog.operation('connectAgent complete', { 
      agentId: agentId, 
      transportId: transport.id 
    }, options.debug)
    
  } catch (error) {
    debugLog.error('manager initialization', error as Error, options.debug)
    // Re-throw initialization errors as-is since they're already well-formatted
    throw error
  }

  // Return runtime handle
  return manager.createRuntimeHandle()
}

/**
 * Validate compatibility between agent and transport
 */
function validateCompatibility(agent: Agent, transport: Transport, options: ConnectAgentOptions): void {
  // Check that both components have required IDs
  if (!agent.id || typeof agent.id !== 'string') {
    throw new AgentCompatibilityError(
      agent.id || 'unknown',
      'validation',
      'Agent must have a valid string ID',
      { context: { agent: agent.name || 'unnamed', agentId: agent.id } }
    )
  }

  if (!transport.id || typeof transport.id !== 'string') {
    throw new AgentCompatibilityError(
      'unknown',
      transport.id || 'unknown',
      'Transport must have a valid string ID',
      { context: { transport: transport.name || 'unnamed', transportId: transport.id } }
    )
  }

  // Check that agent has required lifecycle methods
  if (typeof agent.init !== 'function') {
    throw new AgentCompatibilityError(
      agent.id,
      'validation',
      `Agent "${agent.id}" is missing required init() method`,
      { context: { agentId: agent.id, agentName: agent.name } }
    )
  }

  if (typeof agent.handle !== 'function') {
    throw new AgentCompatibilityError(
      agent.id,
      'validation',
      `Agent "${agent.id}" is missing required handle() method`,
      { context: { agentId: agent.id, agentName: agent.name } }
    )
  }

  if (typeof agent.shutdown !== 'function') {
    throw new AgentCompatibilityError(
      agent.id,
      'validation',
      `Agent "${agent.id}" is missing required shutdown() method`,
      { context: { agentId: agent.id, agentName: agent.name } }
    )
  }

  // Check that transport has required methods
  if (typeof transport.init !== 'function') {
    throw new AgentCompatibilityError(
      'unknown',
      transport.id,
      `Transport "${transport.id}" is missing required init() method`,
      { context: { transportId: transport.id, transportName: transport.name } }
    )
  }

  if (typeof transport.send !== 'function') {
    throw new AgentCompatibilityError(
      'unknown',
      transport.id,
      `Transport "${transport.id}" is missing required send() method`,
      { context: { transportId: transport.id, transportName: transport.name } }
    )
  }

  // Scope compatibility validation (future-proofing for when we add scope support)
  if (options.scope && options.scope.length > 0) {
    // For now, we'll just validate that scope is a non-empty array
    // In the future, we could check agent.supportedScopes vs options.scope
    debugLog.operation('scope compatibility', { 
      scope: options.scope, 
      agentId: agent.id,
      note: 'Basic validation only - scope matching not yet implemented'
    }, options.debug)
  }
}

// Re-export types for convenience
export { 
  ConnectAgentOptions, 
  AgentRuntimeHandle,
  Agent,
  Transport,
  AgentMetadata
} from '@agentkit/types'

export { 
  AgentRegistry, 
  defaultRegistry, 
  initializeDefaultRegistry,
  LegacyAgentRegistry 
} from '@agentkit/registry'

// Backwards compatibility - export static methods that delegate to default registry
// These can be removed in a future major version
export const AgentRegistryLegacy = {
  register: (metadata: any) => defaultRegistry.register(metadata),
  registerTransport: (transport: any) => defaultRegistry.registerTransport(transport),
  lookup: (agentId: string) => defaultRegistry.lookup(agentId),
  lookupTransport: (transportId: string) => defaultRegistry.lookupTransport(transportId),
  clear: () => defaultRegistry.clear(),
  listAgents: () => defaultRegistry.listAgents(),
  listTransports: () => defaultRegistry.listTransports()
}
export { AgentManager } from './AgentManager'
export { BoundedExecutor } from './boundedExecutor'
export { CircuitBreaker, CircuitState, CircuitBreakerError } from './circuitBreaker'
export {
  PluginManager,
  LoggingPlugin,
  createLoggingPlugin,
  AgentKitPlugin,
  AgentContext,
  SendPayload,
  PluginManagerOptions,
  PluginHookName,
  AgentContextSchema,
  SendPayloadSchema,
  AgentKitPluginSchema,
  isAgentKitPlugin
} from './plugins'