import { z } from 'zod'

export interface Agent {
  id: string
  name: string
  version: string
  init: (config?: unknown) => Promise<void>
  handle: (input: unknown) => Promise<unknown>
  shutdown: () => Promise<void>
}

export interface Transport {
  id: string
  name: string
  init: (config?: unknown) => Promise<void>
  send: (message: unknown) => Promise<void>
  receive: () => Promise<unknown>
  config?: unknown
}

export interface ObservabilityHooks {
  onRequestStart?: (metadata: RequestMetadata) => void
  onRequestEnd?: (metadata: RequestMetadata, duration: number) => void
  onError?: (error: Error, context: ErrorContext) => void
}

export interface RequestMetadata {
  requestId: string
  operation: 'init' | 'send' | 'shutdown'
  agentId: string
  transportId: string
  timestamp: string
  context?: Record<string, unknown>
}

export interface ErrorContext {
  requestId?: string
  operation?: string
  agentId: string
  transportId: string
  timestamp: string
  phase: 'init' | 'handle' | 'send' | 'shutdown' | 'cleanup'
  error: Error
  context?: Record<string, unknown>
}

export interface ResourceLimits {
  /** Maximum number of concurrent requests allowed */
  maxConcurrentRequests?: number
  /** Maximum number of requests that can be queued */
  maxQueueSize?: number
  /** Request timeout in milliseconds */
  requestTimeoutMs?: number
  /** Maximum payload size in bytes */
  maxPayloadSize?: number
}

export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold?: number
  /** Timeout in milliseconds before transitioning to half-open */
  timeout?: number
  /** Name for logging and metrics */
  name?: string
}

export interface FeatureFlags {
  /** Enable circuit breaker for fault tolerance */
  enableCircuitBreaker?: boolean
}

export interface ConnectAgentOptions {
  agent: string | Agent
  transport: string | Transport
  scope?: string[]
  techStack?: string
  onOutput?: (message: unknown) => void
  debug?: boolean
  // Registry instance for agent/transport lookup
  registry?: Registry
  // Lifecycle event hooks
  onInit?: (agentId: string) => void
  onShutdown?: (agentId: string) => void
  onError?: (err: Error) => void
  onCleanup?: (agentId: string) => void
  // Observability hooks
  observability?: ObservabilityHooks
  // Resource limits for resilience
  resourceLimits?: ResourceLimits
  // Circuit breaker configuration
  circuitBreaker?: CircuitBreakerConfig
  // Feature flags
  features?: FeatureFlags
  // Plugin system
  plugins?: AgentKitPlugin[]
}

export interface AgentRuntimeHandle {
  send: (input: unknown) => Promise<void>
  shutdown: () => Promise<void>
  metadata: {
    agentId: string
    transportId: string
    registeredScopes: string[]
    requestedScopes: string[]
  }
}

export interface AgentMetadata {
  id: string
  name: string
  version: string
  description?: string
  supportedScopes?: string[]
  factory: () => Agent
}

export const AgentSchema = z.object({
  id: z.string().min(1, 'Agent ID cannot be empty'),
  name: z.string().min(1, 'Agent name cannot be empty'),
  version: z.string().min(1, 'Agent version cannot be empty'),
  init: z.function().args(z.unknown().optional()).returns(z.promise(z.void())),
  handle: z.function().args(z.unknown()).returns(z.promise(z.unknown())),
  shutdown: z.function().returns(z.promise(z.void()))
})

export const TransportSchema = z.object({
  id: z.string().min(1, 'Transport ID cannot be empty'),
  name: z.string().min(1, 'Transport name cannot be empty'),
  init: z.function().args(z.unknown().optional()).returns(z.promise(z.void())),
  send: z.function().args(z.unknown()).returns(z.promise(z.void())),
  receive: z.function().returns(z.promise(z.unknown())),
  config: z.unknown().optional()
})

const RequestMetadataSchema = z.object({
  requestId: z.string(),
  operation: z.enum(['init', 'send', 'shutdown']),
  agentId: z.string(),
  transportId: z.string(),
  timestamp: z.string(),
  context: z.record(z.unknown()).optional()
})

const ErrorContextSchema = z.object({
  requestId: z.string().optional(),
  operation: z.string().optional(),
  agentId: z.string(),
  transportId: z.string(),
  timestamp: z.string(),
  phase: z.enum(['init', 'handle', 'send', 'shutdown', 'cleanup']),
  error: z.instanceof(Error),
  context: z.record(z.unknown()).optional()
})

const ObservabilityHooksSchema = z.object({
  onRequestStart: z.function().args(RequestMetadataSchema).returns(z.void()).optional(),
  onRequestEnd: z.function().args(RequestMetadataSchema, z.number()).returns(z.void()).optional(),
  onError: z.function().args(z.instanceof(Error), ErrorContextSchema).returns(z.void()).optional()
}).optional()

const ResourceLimitsSchema = z.object({
  maxConcurrentRequests: z.number().int().min(1).optional(),
  maxQueueSize: z.number().int().min(0).optional(),
  requestTimeoutMs: z.number().int().min(1).optional(),
  maxPayloadSize: z.number().int().min(1).optional()
}).optional()

const CircuitBreakerConfigSchema = z.object({
  failureThreshold: z.number().int().min(1).optional(),
  timeout: z.number().int().min(1).optional(),
  name: z.string().optional()
}).optional()

const FeatureFlagsSchema = z.object({
  enableCircuitBreaker: z.boolean().optional()
}).optional()

// Plugin-related schemas (defined early for use in ConnectAgentOptionsSchema)
const AgentContextSchema = z.object({
  agentId: z.string(),
  transportId: z.string(),
  requestId: z.string(),
  timestamp: z.number(),
  metadata: z.record(z.unknown()).optional()
})

const SendPayloadSchema = z.object({
  input: z.unknown(),
  metadata: z.record(z.unknown())
})

const AgentKitPluginSchema = z.object({
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().optional(),
  onInit: z.function().args(AgentContextSchema).returns(z.union([z.void(), z.promise(z.void())])).optional(),
  onSend: z.function().args(SendPayloadSchema, AgentContextSchema).returns(z.union([z.void(), z.promise(z.void())])).optional(),
  onError: z.function().args(z.instanceof(Error), AgentContextSchema).returns(z.union([z.void(), z.promise(z.void())])).optional(),
  onShutdown: z.function().args(AgentContextSchema).returns(z.union([z.void(), z.promise(z.void())])).optional()
})

// Registry schema for validation
const RegistrySchema = z.object({
  register: z.function().args(z.string(), z.any()).returns(z.void()),
  lookup: z.function().args(z.string()).returns(z.any()),
  list: z.function().returns(z.array(z.string())),
  has: z.function().args(z.string()).returns(z.boolean()),
  remove: z.function().args(z.string()).returns(z.boolean())
})

export const ConnectAgentOptionsSchema = z.object({
  agent: z.union([z.string(), AgentSchema]),
  transport: z.union([z.string(), TransportSchema]),
  scope: z.array(z.string()).optional(),
  techStack: z.string().optional(),
  onOutput: z.function().args(z.unknown()).returns(z.void()).optional(),
  debug: z.boolean().optional(),
  // Registry instance for agent/transport lookup
  registry: RegistrySchema.optional(),
  // Lifecycle event hooks
  onInit: z.function().args(z.string()).returns(z.void()).optional(),
  onShutdown: z.function().args(z.string()).returns(z.void()).optional(),
  onError: z.function().args(z.instanceof(Error)).returns(z.void()).optional(),
  onCleanup: z.function().args(z.string()).returns(z.void()).optional(),
  // Observability hooks
  observability: ObservabilityHooksSchema,
  // Resource limits
  resourceLimits: ResourceLimitsSchema,
  // Circuit breaker configuration
  circuitBreaker: CircuitBreakerConfigSchema,
  // Feature flags
  features: FeatureFlagsSchema,
  // Plugin system
  plugins: z.array(AgentKitPluginSchema).optional()
})

export const AgentMetadataSchema = z.object({
  id: z.string().min(1, 'Agent ID cannot be empty'),
  name: z.string().min(1, 'Agent name cannot be empty'),
  version: z.string().min(1, 'Agent version cannot be empty'),
  description: z.string().optional(),
  supportedScopes: z.array(z.string()).optional(),
  factory: z.function().returns(AgentSchema)
})

export type ValidatedAgent = z.infer<typeof AgentSchema>
export type ValidatedTransport = z.infer<typeof TransportSchema>
export type ValidatedConnectAgentOptions = z.infer<typeof ConnectAgentOptionsSchema>
export type ValidatedAgentMetadata = z.infer<typeof AgentMetadataSchema>

// Plugin-related types (moved from SDK to avoid circular dependencies)

/**
 * Context provided to all plugin hooks
 */
export interface AgentContext {
  /** The ID of the agent being used */
  agentId: string
  /** The ID of the transport being used */
  transportId: string
  /** Unique request ID for tracing */
  requestId: string
  /** Timestamp of the operation */
  timestamp: number
  /** Additional metadata that may be available */
  metadata?: Record<string, unknown>
}

/**
 * Payload for the onSend hook
 */
export interface SendPayload {
  /** The input being sent to the agent */
  input: unknown
  /** Additional metadata about the send operation */
  metadata: Record<string, unknown>
}

/**
 * Hook names for type safety
 */
export type PluginHookName = 'onInit' | 'onSend' | 'onError' | 'onShutdown'

/**
 * AgentKit Plugin Interface
 * Plugins can hook into various lifecycle events
 * All hooks support both sync and async execution
 */
export interface AgentKitPlugin {
  /** Unique name for the plugin */
  name: string
  /** Semantic version of the plugin */
  version: string
  /** Optional description of what the plugin does */
  description?: string
  
  /**
   * Called when the agent is initialized
   * @param context - The agent context
   */
  onInit?(context: AgentContext): void | Promise<void>
  
  /**
   * Called before sending data to the agent
   * @param payload - The data being sent
   * @param context - The agent context
   */
  onSend?(payload: SendPayload, context: AgentContext): void | Promise<void>
  
  /**
   * Called when an error occurs
   * @param error - The error that occurred
   * @param context - The agent context
   */
  onError?(error: Error, context: AgentContext): void | Promise<void>
  
  /**
   * Called when the agent is shutting down
   * @param context - The agent context
   */
  onShutdown?(context: AgentContext): void | Promise<void>
}

/**
 * Generic registry interface for type safety
 */
export interface Registry<T = any> {
  register(id: string, item: T): void
  lookup(id: string): T | undefined
  list(): ReadonlyArray<string>
  has(id: string): boolean
  remove(id: string): boolean
}

// Export schemas for external use
export { AgentContextSchema, SendPayloadSchema, AgentKitPluginSchema }

// Type guard
export function isAgentKitPlugin(value: unknown): value is AgentKitPlugin {
  try {
    AgentKitPluginSchema.parse(value)
    return true
  } catch {
    return false
  }
}