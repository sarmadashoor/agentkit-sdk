# AgentKit SDK API Reference

## Core Functions

### `connectAgent(options: ConnectAgentOptions): Promise<AgentRuntimeHandle>`

Main entry point for connecting to agents. This function resolves agents and transports from the registry, initializes them, and returns a handle for interaction.

**Parameters:**
- `options: ConnectAgentOptions` - Configuration object for the connection

**Returns:** `Promise<AgentRuntimeHandle>` - Handle for interacting with the connected agent

**Example:**
```typescript
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  scope: ['chat', 'analysis'],
  debug: true,
  onOutput: (message) => console.log('Response:', message)
})
```

## Types & Interfaces

### `ConnectAgentOptions`

Configuration options for connecting to an agent.

```typescript
interface ConnectAgentOptions {
  agent: string | Agent                        // Agent ID or instance
  transport: string | Transport                // Transport ID or instance
  scope?: string[]                             // Requested capability scopes
  techStack?: string                           // Technology stack identifier
  onOutput?: (message: AgentOutput) => void    // Output callback
  debug?: boolean                              // Enable debug logging
  registry?: AgentRegistryInterface            // Custom registry instance
  
  // Lifecycle hooks
  onInit?: (agentId: string) => void
  onShutdown?: (agentId: string) => void
  onError?: (error: Error) => void
  onCleanup?: (agentId: string) => void
  
  // Advanced configuration
  observability?: ObservabilityHooks
  resourceLimits?: ResourceLimits
  circuitBreaker?: CircuitBreakerConfig
  features?: FeatureFlags
  plugins?: AgentKitPlugin[]
  verify?: 'strict' | 'warn' | 'off'
}
```

### `AgentRuntimeHandle`

Handle returned by `connectAgent()` for interacting with the connected agent.

```typescript
interface AgentRuntimeHandle {
  send: (input: AgentInput) => Promise<void>   // Send data to agent
  shutdown: () => Promise<void>                // Clean shutdown
  metadata: {                                  // Connection metadata
    agentId: string
    transportId: string
    registeredScopes: string[]
    requestedScopes: string[]
  }
}
```

### `Agent`

Core agent interface that all agents must implement.

```typescript
interface Agent {
  id: string                                   // Unique agent identifier
  name: string                                 // Human-readable name
  version: string                              // Semantic version
  init: (config?: AgentConfig) => Promise<void>     // Initialize agent
  handle: (input: AgentInput) => Promise<AgentOutput> // Process input
  shutdown: () => Promise<void>                // Clean shutdown
}
```

### `Transport`

Transport interface for message passing between application and agents.

```typescript
interface Transport {
  id: string                                   // Unique transport identifier
  name: string                                 // Human-readable name
  init: (config?: TransportConfig) => Promise<void>   // Initialize transport
  send: (message: TransportMessage) => Promise<void>  // Send message
  receive: () => Promise<TransportMessage>     // Receive message
  canAcceptMore: () => boolean                 // Backpressure indicator
  getStatus?: () => TransportStatus            // Health and capacity info
}
```

### `AgentMetadata`

Metadata for agent registration in the registry.

```typescript
interface AgentMetadata {
  id: string                                   // Agent identifier
  name: string                                 // Display name
  version: string                              // Semantic version
  description?: string                         // Optional description
  supportedScopes?: string[]                   // Supported capability scopes
  factory: () => Agent                         // Factory function
}
```

## Registry API

### `AgentRegistry.register(metadata: AgentMetadata): void`

Register an agent in the default registry.

**Example:**
```typescript
AgentRegistry.register({
  id: 'my-agent',
  name: 'My Custom Agent',
  version: '1.0.0',
  description: 'Custom agent for specific tasks',
  supportedScopes: ['chat', 'analysis'],
  factory: () => new MyAgent()
})
```

### `AgentRegistry.registerTransport(transport: Transport): void`

Register a transport in the default registry.

**Example:**
```typescript
AgentRegistry.registerTransport(new HttpTransport({
  baseUrl: 'https://api.example.com',
  timeout: 30000
}))
```

### `AgentRegistry.lookup(agentId: string): AgentMetadata`

Look up agent metadata by ID.

**Throws:** `AgentNotFoundError` if agent not found

### `AgentRegistry.lookupTransport(transportId: string): Transport`

Look up transport by ID.

**Throws:** `TransportNotFoundError` if transport not found

### `AgentRegistry.listAgents(): string[]`

List all registered agent IDs.

### `AgentRegistry.listTransports(): string[]`

List all registered transport IDs.

### `AgentRegistry.clear(): void`

Clear all registered agents and transports. Useful for testing.

## Configuration Interfaces

### `ResourceLimits`

Resource constraints for agent operations.

```typescript
interface ResourceLimits {
  maxConcurrentRequests?: number               // Max concurrent requests
  maxQueueSize?: number                        // Max queued requests
  requestTimeoutMs?: number                    // Request timeout
  maxPayloadSize?: number                      // Max payload size in bytes
}
```

### `CircuitBreakerConfig`

Circuit breaker configuration for fault tolerance.

```typescript
interface CircuitBreakerConfig {
  failureThreshold?: number                    // Failures before opening
  timeout?: number                             // Timeout before retry (ms)
  name?: string                                // Name for logging/metrics
}
```

### `FeatureFlags`

Feature toggles for experimental functionality.

```typescript
interface FeatureFlags {
  enableCircuitBreaker?: boolean               // Enable circuit breaker
  sandbox?: boolean                            // Enable plugin sandboxing
}
```

### `ObservabilityHooks`

Hooks for monitoring and observability.

```typescript
interface ObservabilityHooks {
  onRequestStart?: (metadata: RequestMetadata) => void
  onRequestEnd?: (metadata: RequestMetadata, duration: number) => void
  onError?: (error: Error, context: ErrorContext) => void
  onTransportBackpressureDetected?: (event: BackpressureEvent) => void
  onTransportBackpressureResolved?: (event: BackpressureResolvedEvent) => void
  onCircuitBreakerStateChange?: (event: CircuitBreakerStateChangeEvent) => void
  onCircuitBreakerRequestRejected?: (event: CircuitBreakerRejectionEvent) => void
}
```

## Plugin System API

### `AgentKitPlugin`

Interface for creating plugins that extend SDK functionality.

```typescript
interface AgentKitPlugin {
  name: string                                 // Plugin name
  version: string                              // Semantic version
  description?: string                         // Optional description
  compatibility?: PluginCompatibility         // Compatibility requirements
  permissions?: PluginPermissions             // Required permissions
  
  // Security fields
  signature?: string                           // HMAC signature
  publicKey?: string                           // Public key for verification
  trustPolicy?: 'strict' | 'warn' | 'off'    // Trust policy
  
  // Lifecycle hooks (all optional)
  onInit?(context: AgentContext): void | Promise<void>
  onSend?(payload: SendPayload, context: AgentContext): void | Promise<void>
  onError?(error: Error, context: AgentContext): void | Promise<void>
  onShutdown?(context: AgentContext): void | Promise<void>
}
```

### `AgentContext`

Context provided to plugin hooks.

```typescript
interface AgentContext {
  agentId: string                              // Agent identifier
  transportId: string                          // Transport identifier
  requestId: string                            // Unique request ID
  timestamp: number                            // Request timestamp
  metadata?: Record<string, unknown>           // Additional metadata
}
```

### `SendPayload`

Payload passed to onSend hook.

```typescript
interface SendPayload {
  input: AgentInput                            // Input being sent
  metadata: Record<string, unknown>            // Send operation metadata
}
```

## Error Classes

### `AgentNotFoundError`

Thrown when a requested agent is not found in the registry.

```typescript
class AgentNotFoundError extends Error {
  constructor(agentId: string, options?: ErrorOptions)
}
```

### `TransportNotFoundError`

Thrown when a requested transport is not found in the registry.

```typescript
class TransportNotFoundError extends Error {
  constructor(transportId: string, options?: ErrorOptions)
}
```

### `AgentCompatibilityError`

Thrown when agent and transport are incompatible.

```typescript
class AgentCompatibilityError extends Error {
  constructor(agentId: string, transportId: string, message: string, options?: ErrorOptions)
}
```

### `CircuitBreakerError`

Thrown when circuit breaker prevents operation execution.

```typescript
class CircuitBreakerError extends Error {
  constructor(circuitName: string, state: string)
}
```

### `BackpressureError`

Thrown when system is overwhelmed and cannot accept more requests.

```typescript
class BackpressureError extends Error {
  constructor(queueSize: number, maxSize: number)
}
```

### `PluginVerificationError`

Thrown when plugin signature verification fails.

```typescript
class PluginVerificationError extends Error {
  constructor(pluginName: string, reason: string)
}
```

## Utility Functions

### `deepClone<T>(obj: T): T`

Deep clone an object for plugin isolation.

```typescript
const clonedData = deepClone(originalData)
```

### `deepFreeze<T>(obj: T): T`

Deep freeze an object to prevent mutations.

```typescript
const immutableData = deepFreeze(data)
```

### `signPlugin(plugin: AgentKitPlugin, options: SigningOptions): Promise<AgentKitPlugin>`

Sign a plugin with HMAC for verification.

```typescript
const signedPlugin = await signPlugin(plugin, {
  secretKey: process.env.PLUGIN_SECRET_KEY,
  algorithm: 'sha256'
})
```

## Testing Utilities

### `createTestAgent(options?: TestAgentOptions): Agent`

Create a test agent with predictable responses.

```typescript
const testAgent = createTestAgent({
  id: 'test-agent',
  responses: [
    { success: true, data: 'Response 1' },
    { success: true, data: 'Response 2' }
  ],
  delay: 100
})
```

### `createDummyTransport(options?: DummyTransportOptions): Transport`

Create a dummy transport for testing.

```typescript
const transport = createDummyTransport({
  debug: true,
  logMessages: true,
  responseDelay: 50,
  errorRate: 0.1 // 10% error rate
})
```

## Type Guards

### `isAgentKitPlugin(value: unknown): value is AgentKitPlugin`

Type guard to check if a value is a valid AgentKitPlugin.

```typescript
if (isAgentKitPlugin(plugin)) {
  // plugin is safely typed as AgentKitPlugin
}
```

## Constants

### Default Values

```typescript
const DEFAULT_CONFIG = {
  REQUEST_TIMEOUT: 30000,          // 30 seconds
  MAX_CONCURRENT_REQUESTS: 10,     // 10 concurrent requests
  MAX_QUEUE_SIZE: 50,              // 50 queued requests
  CIRCUIT_BREAKER_THRESHOLD: 5,    // 5 failures to open
  CIRCUIT_BREAKER_TIMEOUT: 60000,  // 1 minute recovery time
  PLUGIN_TIMEOUT: 5000,            // 5 second plugin timeout
  MAX_PAYLOAD_SIZE: 1048576        // 1MB payload limit
}
```

## Usage Examples

### Basic Agent Connection
```typescript
import { connectAgent, AgentRegistry } from '@agentkit/sdk'

// Register and connect
AgentRegistry.register({
  id: 'my-agent',
  name: 'My Agent',
  version: '1.0.0',
  factory: () => new MyAgent()
})

const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy'
})

await handle.send({ message: 'Hello!' })
await handle.shutdown()
```

### Production Configuration
```typescript
const handle = await connectAgent({
  agent: 'production-agent',
  transport: 'http',
  
  resourceLimits: {
    maxConcurrentRequests: 5,
    maxQueueSize: 20,
    requestTimeoutMs: 15000
  },
  
  circuitBreaker: {
    failureThreshold: 3,
    timeout: 30000,
    name: 'prod-circuit'
  },
  
  observability: {
    onError: (error, context) => {
      logger.error('Agent error', { error, context })
    },
    onCircuitBreakerStateChange: (event) => {
      metrics.increment('circuit_breaker_state_change', {
        circuit: event.circuitName,
        state: event.toState
      })
    }
  }
})
```

### Plugin Development
```typescript
const myPlugin: AgentKitPlugin = {
  name: 'audit-logger',
  version: '1.0.0',
  
  onSend: async (payload, context) => {
    auditLog.record({
      agentId: context.agentId,
      requestId: context.requestId,
      input: sanitize(payload.input),
      timestamp: context.timestamp
    })
  }
}

const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  plugins: [myPlugin]
})
```