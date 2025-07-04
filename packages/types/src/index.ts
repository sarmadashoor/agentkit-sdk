import { z } from 'zod'

/**
 * Configuration object passed to an agent during initialization.
 * 
 * @example
 * ```typescript
 * const config: AgentConfig = {
 *   scope: ['chat', 'analysis'],
 *   techStack: 'node',
 *   apiKey: process.env.API_KEY,
 *   maxTokens: 1000
 * }
 * await agent.init(config)
 * ```
 * 
 * @public
 * @category Types
 */
export interface AgentConfig {
  /** Capability scopes that the agent should enable */
  scope?: string[]
  /** Technology stack identifier for environment-specific configuration */
  techStack?: string
  /** Additional configuration properties specific to the agent implementation */
  [key: string]: unknown
}

/**
 * Input data structure for agent processing operations.
 * 
 * This flexible interface allows agents to accept any structured data while maintaining type safety.
 * Agent implementations should define their own specific input schemas.
 * 
 * @example
 * ```typescript
 * // Text processing
 * const textInput: AgentInput = {
 *   message: 'Analyze this text',
 *   options: { sentiment: true }
 * }
 * 
 * // Multi-modal input
 * const multiModalInput: AgentInput = {
 *   text: 'Describe this image',
 *   image: imageBuffer,
 *   format: 'detailed'
 * }
 * ```
 * 
 * @public
 * @category Types
 */
export interface AgentInput {
  /** Flexible key-value structure for agent-specific input data */
  [key: string]: unknown
}

/**
 * Output data structure returned by agent processing operations.
 * 
 * This flexible interface allows agents to return any structured data while maintaining type safety.
 * Agent implementations should define their own specific output schemas.
 * 
 * @example
 * ```typescript
 * // Simple text response
 * const textOutput: AgentOutput = {
 *   response: 'Analysis complete',
 *   confidence: 0.95
 * }
 * 
 * // Structured analysis result
 * const analysisOutput: AgentOutput = {
 *   sentiment: 'positive',
 *   topics: ['technology', 'innovation'],
 *   summary: 'The text discusses recent advances...',
 *   metadata: { processingTime: 150 }
 * }
 * ```
 * 
 * @public
 * @category Types
 */
export interface AgentOutput {
  /** Flexible key-value structure for agent-specific output data */
  [key: string]: unknown
}

/**
 * Core interface that all AI agents must implement to work with AgentKit SDK.
 * 
 * This interface defines the standard lifecycle and communication contract for agents,
 * ensuring they can be managed consistently regardless of their underlying implementation.
 * 
 * @example Implementing a simple agent:
 * ```typescript
 * class MyAgent implements Agent {
 *   id = 'my-agent'
 *   name = 'My Custom Agent'
 *   version = '1.0.0'
 *   
 *   async init(config?: AgentConfig): Promise<void> {
 *     // Initialize resources, validate config, set up connections
 *     console.log('Agent initialized with config:', config)
 *   }
 *   
 *   async handle(input: AgentInput): Promise<AgentOutput> {
 *     // Process the input and return structured output
 *     return {
 *       result: `Processed: ${JSON.stringify(input)}`,
 *       timestamp: new Date().toISOString()
 *     }
 *   }
 *   
 *   async shutdown(): Promise<void> {
 *     // Clean up resources, close connections
 *     console.log('Agent shutdown complete')
 *   }
 * }
 * ```
 * 
 * @public
 * @category Types
 */
export interface Agent {
  /** Unique identifier for the agent instance */
  id: string
  /** Human-readable name for the agent */
  name: string
  /** Semantic version string for the agent */
  version: string
  
  /**
   * Initialize the agent with optional configuration.
   * 
   * This method is called once when the agent is first connected, before any processing begins.
   * Use this to set up resources, validate configuration, and prepare for operation.
   * 
   * @param config - Optional configuration object with agent-specific settings
   * @throws Should throw descriptive errors if initialization fails
   */
  init: (config?: AgentConfig) => Promise<void>
  
  /**
   * Process input data and return output.
   * 
   * This is the core processing method where the agent performs its main functionality.
   * It should be idempotent and handle errors gracefully.
   * 
   * @param input - Input data to process
   * @returns Promise resolving to the processing result
   * @throws Should throw descriptive errors if processing fails
   */
  handle: (input: AgentInput) => Promise<AgentOutput>
  
  /**
   * Clean up resources and prepare for termination.
   * 
   * This method is called when the agent connection is being closed.
   * Use this to release resources, close connections, and ensure clean termination.
   * 
   * @throws Should throw descriptive errors if shutdown fails
   */
  shutdown: () => Promise<void>
}

/**
 * Configuration object passed to a transport during initialization.
 * 
 * @example
 * ```typescript
 * const httpConfig: TransportConfig = {
 *   baseUrl: 'https://api.example.com',
 *   timeout: 30000,
 *   retries: 3,
 *   headers: { 'Authorization': 'Bearer token' }
 * }
 * await transport.init(httpConfig)
 * ```
 * 
 * @public
 * @category Types
 */
export interface TransportConfig {
  /** Transport-specific configuration properties */
  [key: string]: unknown
}

/**
 * Message data structure for transport operations.
 * 
 * This flexible interface allows transports to handle any structured message data
 * while maintaining type safety across different transport implementations.
 * 
 * @example
 * ```typescript
 * // HTTP transport message
 * const httpMessage: TransportMessage = {
 *   method: 'POST',
 *   url: '/agents/process',
 *   body: { input: 'Hello, agent!' },
 *   headers: { 'Content-Type': 'application/json' }
 * }
 * 
 * // WebSocket transport message
 * const wsMessage: TransportMessage = {
 *   type: 'agent_request',
 *   payload: { message: 'Process this' },
 *   requestId: 'req-123'
 * }
 * ```
 * 
 * @public
 * @category Types
 */
export interface TransportMessage {
  /** Flexible key-value structure for transport-specific message data */
  [key: string]: unknown
}

/**
 * Transport capacity and health status information.
 * 
 * Provides real-time information about transport health, capacity, and backpressure state
 * to enable intelligent load balancing and circuit breaker decisions.
 * 
 * @example
 * ```typescript
 * const status = transport.getStatus?.()
 * if (status && !status.canAcceptMore) {
 *   console.log(`Transport overloaded: ${status.queueSize}/${status.maxQueueSize}`)
 *   // Implement backpressure handling
 * }
 * ```
 * 
 * @public
 * @category Types
 */
export interface TransportStatus {
  /** Whether the transport can accept more messages without degradation */
  canAcceptMore: boolean
  /** Current number of pending/queued messages awaiting processing */
  queueSize: number
  /** Maximum queue capacity (undefined indicates unlimited capacity) */
  maxQueueSize?: number
  /** Whether the transport is healthy and operational */
  isHealthy: boolean
  /** Optional health details, error message, or diagnostic information */
  healthMessage?: string
}

/**
 * Core interface that all transports must implement to work with AgentKit SDK.
 * 
 * Transports provide the communication layer between the SDK and agents, abstracting
 * different protocols (HTTP, WebSocket, message queues, etc.) behind a unified interface.
 * 
 * @example Implementing a simple HTTP transport:
 * ```typescript
 * class HttpTransport implements Transport {
 *   id = 'http'
 *   name = 'HTTP Transport'
 *   config?: TransportConfig
 *   
 *   async init(config?: TransportConfig): Promise<void> {
 *     this.config = config
 *     // Set up HTTP client, validate endpoints
 *   }
 *   
 *   async send(message: TransportMessage): Promise<void> {
 *     // Send HTTP request to agent endpoint
 *     const response = await fetch(this.config.baseUrl, {
 *       method: 'POST',
 *       body: JSON.stringify(message)
 *     })
 *     if (!response.ok) throw new Error(`HTTP ${response.status}`)
 *   }
 *   
 *   async receive(): Promise<TransportMessage> {
 *     // Poll for or receive response from agent
 *     return await this.pollForResponse()
 *   }
 *   
 *   canAcceptMore(): boolean {
 *     return this.currentRequests < this.maxConcurrent
 *   }
 * }
 * ```
 * 
 * @public
 * @category Types
 */
export interface Transport {
  /** Unique identifier for the transport instance */
  id: string
  /** Human-readable name for the transport */
  name: string
  /** Current transport configuration (set during init) */
  config?: TransportConfig
  
  /**
   * Initialize the transport with optional configuration.
   * 
   * Called once when the transport is first used. Use this to set up connections,
   * validate configuration, and prepare for message handling.
   * 
   * @param config - Optional configuration object with transport-specific settings
   * @throws Should throw descriptive errors if initialization fails
   */
  init: (config?: TransportConfig) => Promise<void>
  
  /**
   * Send a message through the transport.
   * 
   * This method should handle the actual transmission of data to the agent,
   * including any protocol-specific formatting, headers, or metadata.
   * 
   * @param message - Message data to send
   * @throws Should throw descriptive errors if sending fails
   */
  send: (message: TransportMessage) => Promise<void>
  
  /**
   * Receive a message from the transport.
   * 
   * This method should handle receiving responses or events from the agent,
   * including any protocol-specific parsing or error handling.
   * 
   * @returns Promise resolving to the received message
   * @throws Should throw descriptive errors if receiving fails
   */
  receive: () => Promise<TransportMessage>
  
  /**
   * Check if the transport can accept more messages (backpressure indicator).
   * 
   * This method enables backpressure detection and load balancing by indicating
   * whether additional requests would degrade performance or cause failures.
   * 
   * @returns true if the transport can handle more messages, false if overloaded
   */
  canAcceptMore: () => boolean
  
  /**
   * Get detailed transport status including capacity and health information.
   * 
   * Optional method that provides comprehensive status information for monitoring,
   * debugging, and intelligent routing decisions.
   * 
   * @returns Current transport status or undefined if not implemented
   */
  getStatus?: () => TransportStatus
}

export interface ObservabilityHooks {
  onRequestStart?: (metadata: RequestMetadata) => void
  onRequestEnd?: (metadata: RequestMetadata, duration: number) => void
  onError?: (error: Error, context: ErrorContext) => void
  
  // Transport backpressure events
  onTransportBackpressureDetected?: (event: BackpressureEvent) => void
  onTransportBackpressureResolved?: (event: BackpressureResolvedEvent) => void
  onBackpressureQueueEnqueued?: (event: BackpressureQueueEvent) => void
  onBackpressureQueueProcessed?: (event: BackpressureQueueEvent) => void
  onBackpressureQueueFailed?: (event: BackpressureQueueFailedEvent) => void
  
  // Circuit breaker events
  onCircuitBreakerStateChange?: (event: CircuitBreakerStateChangeEvent) => void
  onCircuitBreakerRequestRejected?: (event: CircuitBreakerRejectionEvent) => void
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

// Backpressure observability event interfaces
export interface BackpressureEvent {
  agentId: string
  transportId: string
  timestamp: number
  requestId?: string
  transportStatus?: TransportStatus
  context?: Record<string, unknown>
}

export interface BackpressureResolvedEvent {
  agentId: string
  transportId: string
  timestamp: number
  queueSize: number
  totalProcessingTime: number
  context?: Record<string, unknown>
}

export interface BackpressureQueueEvent {
  agentId: string
  transportId: string
  timestamp: number
  itemId: string
  queueSize: number
  processingTime?: number
  attempts?: number
  context?: Record<string, unknown>
}

export interface BackpressureQueueFailedEvent extends BackpressureQueueEvent {
  error: Error
  willRetry: boolean
  maxRetries: number
}

// Circuit breaker observability event interfaces
export interface CircuitBreakerStateChangeEvent {
  agentId: string
  transportId: string
  circuitName: string
  fromState: string
  toState: string
  timestamp: number
  reason: string
  metadata?: Record<string, unknown>
}

export interface CircuitBreakerRejectionEvent {
  agentId: string
  transportId: string
  circuitName: string
  timestamp: number
  rejectedCount: number
  nextAttemptAt?: number
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
  /** Enable plugin sandboxing */
  sandbox?: boolean
}

export interface ConnectAgentOptions {
  agent: string | Agent
  transport: string | Transport
  scope?: string[]
  techStack?: string
  onOutput?: (message: AgentOutput) => void
  debug?: boolean
  // Registry instance for agent/transport lookup
  registry?: AgentRegistryInterface
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
  // Plugin verification mode: 'strict' (reject unsigned), 'warn' (log warning), 'off' (disable)
  verify?: 'strict' | 'warn' | 'off'
}

export interface AgentRuntimeHandle {
  send: (input: AgentInput) => Promise<void>
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

const AgentConfigSchema = z.object({
  scope: z.array(z.string()).optional(),
  techStack: z.string().optional()
}).catchall(z.unknown())

const AgentInputSchema = z.record(z.unknown())
const AgentOutputSchema = z.record(z.unknown())

export const AgentSchema = z.object({
  id: z.string().min(1, 'Agent ID cannot be empty'),
  name: z.string().min(1, 'Agent name cannot be empty'),
  version: z.string().min(1, 'Agent version cannot be empty'),
  init: z.function().args(AgentConfigSchema.optional()).returns(z.promise(z.void())),
  handle: z.function().args(AgentInputSchema).returns(z.promise(AgentOutputSchema)),
  shutdown: z.function().returns(z.promise(z.void()))
})

const TransportConfigSchema = z.record(z.unknown())
const TransportMessageSchema = z.record(z.unknown())

export const TransportStatusSchema = z.object({
  canAcceptMore: z.boolean(),
  queueSize: z.number().min(0),
  maxQueueSize: z.number().min(0).optional(),
  isHealthy: z.boolean(),
  healthMessage: z.string().optional()
})

export const TransportSchema = z.object({
  id: z.string().min(1, 'Transport ID cannot be empty'),
  name: z.string().min(1, 'Transport name cannot be empty'),
  init: z.function().args(TransportConfigSchema.optional()).returns(z.promise(z.void())),
  send: z.function().args(TransportMessageSchema).returns(z.promise(z.void())),
  receive: z.function().returns(z.promise(TransportMessageSchema)),
  config: TransportConfigSchema.optional(),
  // Required backpressure method
  canAcceptMore: z.function().returns(z.boolean()),
  getStatus: z.function().returns(TransportStatusSchema).optional()
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

// Plugin compatibility schemas
const PluginCompatibilitySchema = z.object({
  minSdkVersion: z.string().optional(),
  maxSdkVersion: z.string().optional(),
  supportedVersions: z.array(z.string()).optional(),
  nodeVersion: z.string().optional(),
  browserCompatibility: z.object({
    chrome: z.string().optional(),
    firefox: z.string().optional(),
    safari: z.string().optional(),
    edge: z.string().optional()
  }).optional()
}).optional()

const PluginPermissionsSchema = z.object({
  network: z.boolean().optional(),
  filesystem: z.boolean().optional(),
  system: z.boolean().optional(),
  custom: z.record(z.boolean()).optional()
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
  input: AgentInputSchema,
  metadata: z.record(z.unknown())
})

const PluginSignatureManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  allowedHooks: z.array(z.string()),
  fingerprintHash: z.string().regex(/^[a-f0-9]{64}$/) // SHA-256 hash validation
})

const AgentKitPluginSchema = z.object({
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().optional(),
  compatibility: PluginCompatibilitySchema,
  permissions: PluginPermissionsSchema,
  signature: z.string().optional(),
  publicKey: z.string().optional(),
  trustPolicy: z.enum(['strict', 'warn', 'off']).optional(),
  signatureManifest: PluginSignatureManifestSchema.optional(),
  capabilities: z.array(z.string()).optional(),
  onInit: z.function().args(AgentContextSchema).returns(z.union([z.void(), z.promise(z.void())])).optional(),
  onSend: z.function().args(SendPayloadSchema, AgentContextSchema).returns(z.union([z.void(), z.promise(z.void())])).optional(),
  onError: z.function().args(z.instanceof(Error), AgentContextSchema).returns(z.union([z.void(), z.promise(z.void())])).optional(),
  onShutdown: z.function().args(AgentContextSchema).returns(z.union([z.void(), z.promise(z.void())])).optional()
})

// Registry schema for validation
const RegistrySchema = z.object({
  register: z.function().args(z.string(), z.record(z.unknown())).returns(z.void()),
  lookup: z.function().args(z.string()).returns(z.record(z.unknown()).optional()),
  list: z.function().returns(z.array(z.string())),
  has: z.function().args(z.string()).returns(z.boolean()),
  remove: z.function().args(z.string()).returns(z.boolean())
})

// Agent metadata schema (defined early for use in other schemas)
export const AgentMetadataSchema = z.object({
  id: z.string().min(1, 'Agent ID cannot be empty'),
  name: z.string().min(1, 'Agent name cannot be empty'),
  version: z.string().min(1, 'Agent version cannot be empty'),
  description: z.string().optional(),
  supportedScopes: z.array(z.string()).optional(),
  factory: z.function().returns(AgentSchema)
})

// AgentRegistry schema for validation
const AgentRegistrySchema = z.object({
  // Agent methods
  register: z.function().args(AgentMetadataSchema).returns(z.void()),
  lookup: z.function().args(z.string()).returns(AgentMetadataSchema),
  getAgent: z.function().args(z.string()).returns(AgentMetadataSchema.optional()),
  removeAgent: z.function().args(z.string()).returns(z.boolean()),
  listAgents: z.function().returns(z.array(z.string())),
  hasAgent: z.function().args(z.string()).returns(z.boolean()),
  // Transport methods
  registerTransport: z.function().args(TransportSchema).returns(z.void()),
  lookupTransport: z.function().args(z.string()).returns(TransportSchema),
  getTransport: z.function().args(z.string()).returns(TransportSchema.optional()),
  removeTransport: z.function().args(z.string()).returns(z.boolean()),
  listTransports: z.function().returns(z.array(z.string())),
  hasTransport: z.function().args(z.string()).returns(z.boolean()),
  // General methods
  clear: z.function().returns(z.void()),
  agentCount: z.number(),
  transportCount: z.number()
})

export const ConnectAgentOptionsSchema = z.object({
  agent: z.union([z.string(), AgentSchema]),
  transport: z.union([z.string(), TransportSchema]),
  scope: z.array(z.string()).optional(),
  techStack: z.string().optional(),
  onOutput: z.function().args(AgentOutputSchema).returns(z.void()).optional(),
  debug: z.boolean().optional(),
  // Registry instance for agent/transport lookup
  registry: AgentRegistrySchema.optional(),
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
  plugins: z.array(AgentKitPluginSchema).optional(),
  // Plugin verification options
  allowUnverifiedPlugins: z.boolean().optional(),
  trustedKeysPath: z.string().optional()
})

export type ValidatedAgent = z.infer<typeof AgentSchema>
export type ValidatedTransport = z.infer<typeof TransportSchema>
export type ValidatedConnectAgentOptions = z.infer<typeof ConnectAgentOptionsSchema>
export type ValidatedAgentMetadata = z.infer<typeof AgentMetadataSchema>

/**
 * Options for connecting to an agent with plugin verification support
 */
export interface ConnectAgentOptions {
  /** Agent instance or agent ID to connect to */
  agent: string | Agent
  /** Transport instance or transport ID to use */
  transport: string | Transport
  /** Optional scope restrictions */
  scope?: string[]
  /** Tech stack information */
  techStack?: string
  /** Callback for agent output */
  onOutput?: (output: AgentOutput) => void
  /** Enable debug logging */
  debug?: boolean
  /** Registry instance for agent/transport lookup */
  registry?: AgentRegistryInterface
  /** Lifecycle event hooks */
  onInit?: (agentId: string) => void
  onShutdown?: (agentId: string) => void
  onError?: (error: Error) => void
  onCleanup?: (agentId: string) => void
  /** Observability hooks */
  observability?: ObservabilityHooks
  /** Resource limits */
  resourceLimits?: ResourceLimits
  /** Circuit breaker configuration */
  circuitBreaker?: CircuitBreakerConfig
  /** Feature flags */
  features?: FeatureFlags
  /** Plugin system */
  plugins?: AgentKitPlugin[]
  /** Allow unsigned plugins in development mode */
  allowUnverifiedPlugins?: boolean
  /** Path to trusted keys registry file */
  trustedKeysPath?: string
}

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
  input: AgentInput
  /** Additional metadata about the send operation */
  metadata: Record<string, unknown>
}

/**
 * Hook names for type safety
 */
export type PluginHookName = 'onInit' | 'onSend' | 'onError' | 'onShutdown'

/**
 * Plugin compatibility specification
 */
export interface PluginCompatibility {
  /** Minimum SDK version required */
  minSdkVersion?: string
  /** Maximum SDK version supported */
  maxSdkVersion?: string
  /** Specific SDK versions supported (alternative to min/max) */
  supportedVersions?: string[]
  /** Node.js version requirements */
  nodeVersion?: string
  /** Browser compatibility requirements */
  browserCompatibility?: {
    chrome?: string
    firefox?: string
    safari?: string
    edge?: string
  }
}

/**
 * Plugin execution permissions
 */
export interface PluginPermissions {
  /** Allow access to network APIs */
  network?: boolean
  /** Allow access to filesystem APIs */
  filesystem?: boolean
  /** Allow access to process/system APIs */
  system?: boolean
  /** Custom permission flags */
  custom?: Record<string, boolean>
}

/**
 * Plugin signature manifest containing signed metadata
 */
export interface PluginSignatureManifest {
  /** Plugin name (must match plugin.name) */
  name: string
  /** Plugin version (must match plugin.version) */
  version: string
  /** Array of hook names this plugin is allowed to implement */
  allowedHooks: string[]
  /** SHA-256 fingerprint hash of plugin content for integrity verification */
  fingerprintHash: string
}

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
  /** Compatibility requirements */
  compatibility?: PluginCompatibility
  /** Required permissions */
  permissions?: PluginPermissions
  
  /** HMAC signature for plugin verification */
  signature?: string
  /** Public key for signature verification (optional, can use environment secret) */
  publicKey?: string
  /** Trust policy for this plugin: 'strict' | 'warn' | 'off' */
  trustPolicy?: 'strict' | 'warn' | 'off'
  
  /** Signed manifest containing plugin metadata and allowed hooks */
  signatureManifest?: PluginSignatureManifest
  /** Plugin capabilities - extensible string array for custom permissions */
  capabilities?: string[]
  
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
 * T should extend Record<string, unknown> to ensure serializable objects
 */
export interface Registry<T extends Record<string, unknown> = Record<string, unknown>> {
  register(id: string, item: T): void
  lookup(id: string): T | undefined
  list(): ReadonlyArray<string>
  has(id: string): boolean
  remove(id: string): boolean
}

/**
 * Agent registry interface with specific methods for agents and transports
 */
export interface AgentRegistryInterface {
  // Agent methods
  register(metadata: AgentMetadata): void
  lookup(agentId: string): AgentMetadata
  getAgent(agentId: string): AgentMetadata | undefined
  removeAgent(agentId: string): boolean
  listAgents(): string[]
  hasAgent(agentId: string): boolean
  
  // Transport methods
  registerTransport(transport: Transport): void
  lookupTransport(transportId: string): Transport
  getTransport(transportId: string): Transport | undefined
  removeTransport(transportId: string): boolean
  listTransports(): string[]
  hasTransport(transportId: string): boolean
  
  // General methods
  clear(): void
  agentCount: number
  transportCount: number
}

// Export schemas for external use
export { 
  AgentContextSchema, 
  SendPayloadSchema, 
  AgentKitPluginSchema,
  PluginCompatibilitySchema,
  PluginPermissionsSchema,
  PluginSignatureManifestSchema
}

// Type guard
export function isAgentKitPlugin(value: unknown): value is AgentKitPlugin {
  try {
    AgentKitPluginSchema.parse(value)
    return true
  } catch {
    return false
  }
}