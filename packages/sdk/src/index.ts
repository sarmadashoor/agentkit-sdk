import { 
  ConnectAgentOptions, 
  ConnectAgentOptionsSchema,
  AgentRuntimeHandle,
  Agent,
  Transport,
  AgentMetadata,
  AgentInput,
  AgentOutput,
  AgentConfig,
  TransportConfig,
  TransportMessage
} from '@agentkit/types'
import { defaultRegistry } from '@agentkit/registry'
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
import { guardAgainstRecursivePluginCalls } from './plugins/PluginExecutionContext'

/**
 * Connects to an AI agent through a transport layer, providing a unified interface for agent interaction.
 * 
 * This is the primary entry point for the AgentKit SDK. It handles agent and transport resolution,
 * initialization, compatibility validation, and returns a runtime handle for interaction.
 * 
 * @example
 * ```typescript
 * import { connectAgent, AgentRegistry } from '@agentkit/sdk'
 * import { DummyAgent } from '@agentkit/test-agent'
 * import { DummyTransport } from '@agentkit/transports-dummy'
 * 
 * // Register components
 * AgentRegistry.register({
 *   id: 'my-agent',
 *   name: 'My Agent',
 *   version: '1.0.0',
 *   factory: () => new DummyAgent()
 * })
 * AgentRegistry.registerTransport(new DummyTransport())
 * 
 * // Connect and use
 * const handle = await connectAgent({
 *   agent: 'my-agent',
 *   transport: 'dummy',
 *   onOutput: (msg) => console.log('Response:', msg)
 * })
 * 
 * await handle.send({ message: 'Hello!' })
 * await handle.shutdown()
 * ```
 * 
 * @example Production usage with observability:
 * ```typescript
 * const handle = await connectAgent({
 *   agent: 'production-agent',
 *   transport: 'http',
 *   resourceLimits: {
 *     maxConcurrentRequests: 10,
 *     maxQueueSize: 50,
 *     requestTimeoutMs: 30000
 *   },
 *   circuitBreaker: {
 *     failureThreshold: 5,
 *     timeout: 60000
 *   },
 *   observability: {
 *     onRequestStart: (metadata) => console.log('Request started:', metadata.requestId),
 *     onRequestEnd: (metadata, duration) => console.log('Request completed in', duration, 'ms'),
 *     onCircuitBreakerStateChange: (event) => console.log('Circuit breaker:', event.toState)
 *   }
 * })
 * ```
 * 
 * @param options - Configuration options for the agent connection
 * @param options.agent - Agent ID (string) or Agent instance to connect to
 * @param options.transport - Transport ID (string) or Transport instance for communication
 * @param options.scope - Optional array of capability scopes to request from the agent
 * @param options.debug - Enable detailed debug logging throughout the connection lifecycle
 * @param options.onOutput - Callback function invoked when the agent produces output
 * @param options.onInit - Lifecycle hook called after successful agent initialization
 * @param options.onShutdown - Lifecycle hook called after agent shutdown completes
 * @param options.onError - Error handler for agent and transport errors
 * @param options.resourceLimits - Concurrency and resource constraints for the connection
 * @param options.circuitBreaker - Fault tolerance configuration to prevent cascade failures
 * @param options.observability - Advanced monitoring and metrics collection hooks
 * @param options.plugins - Array of plugins to extend agent functionality
 * @param options.features - Feature flags to enable/disable experimental functionality
 * @param options.registry - Custom registry instance (defaults to global registry)
 * 
 * @returns Promise resolving to an AgentRuntimeHandle for interacting with the connected agent
 * 
 * @throws {@link AgentNotFoundError} When the specified agent ID is not found in the registry
 * @throws {@link TransportNotFoundError} When the specified transport ID is not found in the registry  
 * @throws {@link AgentCompatibilityError} When agent and transport are incompatible
 * @throws {@link InvalidInputError} When the provided options fail validation
 * 
 * @public
 * @category Core
 */
export async function connectAgent(options: ConnectAgentOptions): Promise<AgentRuntimeHandle> {
  // Guard against recursive plugin calls
  guardAgainstRecursivePluginCalls('connectAgent')
  
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
 * Validates compatibility between an agent and transport to ensure they can work together.
 * 
 * Performs comprehensive validation including:
 * - Agent and transport have valid string IDs
 * - Agent implements required lifecycle methods (init, handle, shutdown)
 * - Transport implements required communication methods (init, send)
 * - Scope compatibility (when applicable)
 * 
 * @param agent - The agent instance to validate
 * @param transport - The transport instance to validate  
 * @param options - Connection options for additional validation context
 * 
 * @throws {@link AgentCompatibilityError} When validation fails for any reason
 * 
 * @internal
 * @category Core
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

export type {
  AgentInput,
  AgentOutput,
  AgentConfig,
  TransportConfig,
  TransportMessage
}

export { 
  defaultRegistry, 
  initializeDefaultRegistry,
  LegacyAgentRegistry 
} from '@agentkit/registry'

// Import the original AgentRegistry class
import { AgentRegistry as _AgentRegistry } from '@agentkit/registry'

// Create a hybrid AgentRegistry that is both a class constructor and has static methods
// This maintains backwards compatibility for tests that expect static methods
export const AgentRegistry = Object.assign(_AgentRegistry, {
  register: (metadata: AgentMetadata) => defaultRegistry.register(metadata),
  registerTransport: (transport: Transport) => defaultRegistry.registerTransport(transport),
  lookup: (agentId: string) => defaultRegistry.lookup(agentId),
  lookupTransport: (transportId: string) => defaultRegistry.lookupTransport(transportId),
  clear: () => defaultRegistry.clear(),
  listAgents: () => defaultRegistry.listAgents(),
  listTransports: () => defaultRegistry.listTransports()
})

// Backwards compatibility - export static methods that delegate to default registry
// These can be removed in a future major version
export const AgentRegistryLegacy = {
  register: (metadata: AgentMetadata) => defaultRegistry.register(metadata),
  registerTransport: (transport: Transport) => defaultRegistry.registerTransport(transport),
  lookup: (agentId: string) => defaultRegistry.lookup(agentId),
  lookupTransport: (transportId: string) => defaultRegistry.lookupTransport(transportId),
  clear: () => defaultRegistry.clear(),
  listAgents: () => defaultRegistry.listAgents(),
  listTransports: () => defaultRegistry.listTransports()
}
export { AgentManager, AgentState } from './AgentManager'
export { BoundedExecutor } from './boundedExecutor'
export { CircuitBreaker, CircuitState } from './circuitBreaker'

// Performance utilities
export { EnhancedBoundedExecutor, type EnhancedObservabilityHooks } from './performance/EnhancedBoundedExecutor'
export { RetryableExecutor, type RetryObservabilityHooks } from './performance/RetryableExecutor'
export {
  PluginManager,
  LoggingPlugin,
  createLoggingPlugin,
  PluginManagerOptions,
  // Enhanced V2 sandboxing system
  SecurePluginManagerV2,
  PluginSandboxV2
} from './plugins'

// Plugin execution context and chaos testing utilities
export {
  pluginExecutionContext,
  guardAgainstRecursivePluginCalls,
  withPluginExecutionContext
} from './plugins/PluginExecutionContext'

// Re-export plugin types from @agentkit/types
export type {
  AgentKitPlugin,
  AgentContext,
  SendPayload,
  PluginHookName
} from '@agentkit/types'

// Re-export plugin schemas and utilities from @agentkit/types
export {
  AgentContextSchema,
  SendPayloadSchema,
  AgentKitPluginSchema,
  isAgentKitPlugin
} from '@agentkit/types'

// Re-export all errors for convenience
export * from './errors'

// Metrics and observability
export * from './metrics'

// Observability - Stripe-grade SDK visibility and debugging
export { MetricsCollector, PrometheusMetricsSchema } from './observability/MetricsCollector'
export type { PrometheusMetrics, PluginExecutionMetric, Histogram } from './observability/MetricsCollector'

export { PluginExecutionTimeline, TimelineSchema, TimelineEntrySchema } from './observability/PluginExecutionTimeline'
export type { Timeline, TimelineEntry } from './observability/PluginExecutionTimeline'

export { ObservabilityTracker, generateRequestId, getCurrentTimestamp, safeHookExecution } from './observability'

// Deep cloning utilities for plugin sandboxing
export {
  deepClone,
  deepCloneArgs,
  createFrozenClone,
  validateClone,
  isCloneable,
  sanitizeForPlugin,
  deepFreeze
} from './utils/deepClone'

// Plugin security and signing utilities
export {
  signPlugin,
  serializePluginForSigning,
  createSignedPlugin,
  validatePluginSignatureFields,
  type PluginSignatureMetadata,
  type SigningOptions
} from './security/plugin-signer'