# AgentKit SDK API Reference

Complete API documentation for the AgentKit SDK - a modular, secure, agent-agnostic TypeScript SDK for managing AI agents.

## Table of Contents

- [Core API](#core-api)
- [Registry System](#registry-system)
- [Type System](#type-system)
- [Error Handling](#error-handling)
- [Plugin System](#plugin-system)
- [Performance & Reliability](#performance--reliability)
- [Observability](#observability)
- [Security](#security)
- [Development Tools](#development-tools)
- [Utility Functions](#utility-functions)

## Core API

### `connectAgent(options: ConnectAgentOptions): Promise<AgentRuntimeHandle>`

Main function to connect agents and transports with full lifecycle management.

```typescript
import { connectAgent } from '@agentkit/sdk'

const handle = await connectAgent({
  agent: 'my-agent',           // Agent ID or instance
  transport: 'dummy',          // Transport ID or instance  
  scope: ['chat', 'analysis'], // Capability scopes
  debug: true,                 // Enable debugging
  resourceLimits: {
    maxConcurrentRequests: 10,
    maxQueueSize: 50,
    requestTimeoutMs: 30000
  },
  onInit: (agentId) => console.log(`Agent ${agentId} initialized`),
  onShutdown: (agentId) => console.log(`Agent ${agentId} shutdown`),
  onError: (error) => console.error('Agent error:', error),
  onOutput: (message) => console.log('Agent response:', message)
})
```

**Parameters:**
- `options: ConnectAgentOptions` - Connection configuration

**Returns:**
- `Promise<AgentRuntimeHandle>` - Handle for agent interaction

### `AgentRuntimeHandle`

Interface for interacting with connected agents.

```typescript
interface AgentRuntimeHandle {
  // Send message to agent
  send: (input: AgentInput) => Promise<void>
  
  // Shutdown agent gracefully
  shutdown: () => Promise<void>
  
  // Agent metadata
  metadata: {
    agentId: string
    transportId: string
    registeredScopes: string[]
    requestedScopes: string[]
  }
  
  // Observability access
  observability: AgentObservability
}
```

**Methods:**

#### `send(input: AgentInput): Promise<void>`

Send input to the connected agent.

```typescript
await handle.send({ 
  message: 'Hello, agent!',
  metadata: { priority: 'high' }
})
```

#### `shutdown(): Promise<void>`

Gracefully shutdown the agent and clean up resources.

```typescript
await handle.shutdown()
```

## Registry System

### `AgentRegistry`

Central registry for managing agents and transports.

```typescript
import { AgentRegistry } from '@agentkit/sdk'

// Use default registry
const registry = AgentRegistry.default

// Or create custom registry
const customRegistry = new AgentRegistry({
  maxAgents: 100,
  maxTransports: 20,
  enableValidation: true
})
```

#### `register(metadata: AgentMetadata): void`

Register an agent for dynamic lookup.

```typescript
AgentRegistry.register({
  id: 'my-agent',
  name: 'My Agent',
  version: '1.0.0',
  description: 'AI agent for chat and analysis',
  supportedScopes: ['chat', 'analysis'],
  factory: () => new MyAgent()
})
```

#### `registerTransport(transport: Transport): void`

Register a transport for message passing.

```typescript
import { DummyTransport } from '@agentkit/transports-dummy'

AgentRegistry.registerTransport(new DummyTransport())
```

#### `lookup(agentId: string): AgentMetadata`

Look up registered agent by ID.

```typescript
const agent = AgentRegistry.lookup('my-agent')
console.log(agent.name, agent.version)
```

#### `lookupTransport(transportId: string): Transport`

Look up registered transport by ID.

```typescript
const transport = AgentRegistry.lookupTransport('dummy')
```

**Other Registry Methods:**
- `getAgent(agentId: string): AgentMetadata | undefined`
- `getTransport(transportId: string): Transport | undefined`
- `listAgents(): string[]`
- `listTransports(): string[]`
- `hasAgent(agentId: string): boolean`
- `hasTransport(transportId: string): boolean`
- `clear(): void`
- `removeAgent(agentId: string): boolean`
- `removeTransport(transportId: string): boolean`

## Type System

### Core Interfaces

#### `Agent`

Base interface for agent implementations.

```typescript
interface Agent {
  init: (config: AgentConfig) => Promise<void>
  handle: (input: AgentInput) => Promise<AgentOutput>
  shutdown: () => Promise<void>
  metadata?: AgentMetadata
}
```

#### `Transport`

Base interface for transport implementations.

```typescript
interface Transport {
  id: string
  init: (config: TransportConfig) => Promise<void>
  send: (message: TransportMessage) => Promise<void>
  receive: (handler: (message: TransportMessage) => void) => void
  shutdown: () => Promise<void>
  getStatus: () => TransportStatus
}
```

#### `AgentInput`

Input data structure for agents.

```typescript
interface AgentInput {
  message?: string
  data?: unknown
  metadata?: Record<string, unknown>
  scope?: string[]
  config?: Record<string, unknown>
}
```

#### `AgentOutput`

Output data structure from agents.

```typescript
interface AgentOutput {
  message?: string
  data?: unknown
  metadata?: Record<string, unknown>
  error?: string
  status?: 'success' | 'error' | 'pending'
}
```

#### `ConnectAgentOptions`

Configuration options for connecting agents.

```typescript
interface ConnectAgentOptions {
  agent: string | Agent
  transport: string | Transport
  scope?: string[]
  techStack?: string
  debug?: boolean
  resourceLimits?: ResourceLimits
  pluginManager?: PluginManager
  onInit?: (agentId: string) => void
  onShutdown?: (agentId: string) => void
  onError?: (error: Error) => void
  onOutput?: (output: AgentOutput) => void
}
```

#### `ResourceLimits`

Resource limitation configuration.

```typescript
interface ResourceLimits {
  maxConcurrentRequests?: number
  maxQueueSize?: number
  requestTimeoutMs?: number
  maxPayloadSize?: number
}
```

### Plugin Types

#### `AgentKitPlugin`

Interface for AgentKit plugins.

```typescript
interface AgentKitPlugin {
  name: string
  version: string
  description?: string
  
  onInit?: (context: AgentContext) => Promise<void>
  onSend?: (payload: SendPayload, context: AgentContext) => Promise<SendPayload>
  onError?: (error: Error, context: AgentContext) => Promise<void>
  onShutdown?: (context: AgentContext) => Promise<void>
}
```

#### `AgentContext`

Plugin execution context.

```typescript
interface AgentContext {
  agentId: string
  transportId: string
  scope: string[]
  config: Record<string, unknown>
}
```

#### `SendPayload`

Payload for plugin send hooks.

```typescript
interface SendPayload {
  message?: string
  data?: unknown
  metadata?: Record<string, unknown>
}
```

## Error Handling

### `AgentKitError`

Base error class for all AgentKit errors.

```typescript
class AgentKitError extends Error {
  readonly code: string
  readonly context?: Record<string, unknown>
  readonly timestamp: number
  readonly recoverable: boolean
  
  constructor(message: string, code: string, context?: Record<string, unknown>)
  
  toJSON(): SerializedError
  static fromJSON(data: SerializedError): AgentKitError
}
```

### Error Categories

#### SDK Errors
- `AgentInitError` - Agent initialization failures
- `AgentShutdownError` - Agent shutdown failures
- `LifecycleHookError` - Hook execution failures
- `InvalidConfigurationError` - Configuration validation failures
- `ResourceExhaustedError` - Resource limit exceeded

#### Registry Errors  
- `AgentNotFoundError` - Agent not found in registry
- `TransportNotFoundError` - Transport not found in registry
- `DuplicateAgentIdError` - Duplicate agent registration
- `RegistryValidationError` - Registry validation failures

#### Transport Errors
- `TransportInitError` - Transport initialization failures
- `NetworkError` - Network connectivity issues
- `RequestTimeoutError` - Request timeout
- `AuthenticationError` - Authentication failures
- `RateLimitError` - Rate limiting

#### Plugin Errors
- `PluginValidationError` - Plugin validation failures
- `PluginTimeoutError` - Plugin execution timeout
- `PluginSignatureError` - Plugin signature verification failures
- `PluginSandboxError` - Sandbox execution failures

### Error Utilities

#### `isAgentKitError(error: unknown): boolean`

Type guard for AgentKit errors.

```typescript
try {
  await handle.send({ message: 'test' })
} catch (error) {
  if (isAgentKitError(error)) {
    console.log('AgentKit error:', error.code, error.message)
  }
}
```

#### `wrapError(error: unknown): AgentKitError`

Wrap generic errors as AgentKit errors.

```typescript
const agentKitError = wrapError(new Error('Something went wrong'))
```

## Plugin System

### `PluginManager`

Manages plugin registration and execution.

```typescript
import { PluginManager } from '@agentkit/sdk'

const pluginManager = new PluginManager({
  debug: true,
  hookTimeout: 5000,
  failFast: false,
  sandbox: true,
  observabilityHooks: {
    onPluginStart: (name, hook) => console.log(`🚀 ${name}.${hook}`),
    onPluginSuccess: (name, hook, duration) => console.log(`✅ ${name}.${hook} (${duration}ms)`),
    onPluginError: (name, hook, error) => console.log(`❌ ${name}.${hook}:`, error)
  }
})
```

#### `register(plugin: AgentKitPlugin): void`

Register a plugin.

```typescript
pluginManager.register({
  name: 'logger',
  version: '1.0.0',
  async onSend(payload, context) {
    console.log('Message sent:', payload.message)
    return payload
  }
})
```

#### `executeHook(hookName, ...args): Promise<PluginExecutionResult[]>`

Execute a hook on all registered plugins.

```typescript
const results = await pluginManager.executeHook('onSend', payload, context)
```

**Other Plugin Manager Methods:**
- `getPlugins(): ReadonlyArray<AgentKitPlugin>`
- `getPlugin(name: string): AgentKitPlugin | undefined`
- `removePlugin(name: string): boolean`
- `clear(): void`
- `shutdown(): void`

### Built-in Plugins

#### `LoggingPlugin`

Built-in logging plugin.

```typescript
import { LoggingPlugin, createLoggingPlugin } from '@agentkit/sdk'

// Use default logging plugin
pluginManager.register(LoggingPlugin)

// Create custom logging plugin
const customLogger = createLoggingPlugin({
  logLevel: 'debug',
  includeMetadata: true,
  timestampFormat: 'iso'
})
```

## Performance & Reliability

### `BoundedExecutor`

Bounded execution with concurrency limits and backpressure.

```typescript
import { BoundedExecutor } from '@agentkit/sdk'

const executor = new BoundedExecutor({
  maxConcurrency: 5,
  maxQueueSize: 20,
  timeoutMs: 10000
})

const result = await executor.execute(async () => {
  return await expensiveOperation()
})
```

### `EnhancedBoundedExecutor`

Enhanced executor with observability and circuit breaker.

```typescript
import { EnhancedBoundedExecutor } from '@agentkit/sdk'

const executor = new EnhancedBoundedExecutor({
  maxConcurrency: 5,
  maxQueueSize: 20,
  timeoutMs: 15000,
  retryConfig: {
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 5000,
    backoffMultiplier: 2
  },
  circuitBreakerConfig: {
    failureThreshold: 5,
    resetTimeoutMs: 30000
  },
  observabilityHooks: {
    onExecutionStart: (id) => console.log(`Execution ${id} started`),
    onExecutionSuccess: (id, duration) => console.log(`Execution ${id} completed (${duration}ms)`),
    onExecutionError: (id, error) => console.log(`Execution ${id} failed:`, error)
  }
})
```

### `RetryableExecutor`

Executor with configurable retry logic.

```typescript
import { RetryableExecutor } from '@agentkit/sdk'

const retryExecutor = new RetryableExecutor({
  maxRetries: 5,
  initialDelayMs: 200,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterMs: 100
})

const result = await retryExecutor.execute(async () => {
  return await unreliableApiCall()
})
```

### `CircuitBreaker`

Circuit breaker for handling failures.

```typescript
import { CircuitBreaker, CircuitState } from '@agentkit/sdk'

const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  monitoringWindowMs: 60000
})

const result = await circuitBreaker.execute(async () => {
  return await externalServiceCall()
})

console.log('Circuit state:', circuitBreaker.getState()) // CLOSED, OPEN, or HALF_OPEN
```

## Observability

### `MetricsCollector`

Collect and export metrics in Prometheus format.

```typescript
import { MetricsCollector } from '@agentkit/sdk'

const metrics = new MetricsCollector()

// Record metrics
metrics.recordPluginExecution('my-plugin', 'onSend', 'success', 150)
metrics.recordError('ValidationError', 'my-plugin')
metrics.recordMemoryUsage(64 * 1024 * 1024)

// Export metrics
const prometheusMetrics = metrics.exportPrometheusMetrics()
console.log(prometheusMetrics)
```

### `PluginExecutionTimeline`

Track plugin execution timeline for debugging.

```typescript
import { PluginExecutionTimeline } from '@agentkit/sdk'

const timeline = new PluginExecutionTimeline()

// Timeline is automatically populated during plugin execution
timeline.printTimeline()

// Get performance statistics
const stats = timeline.getPerformanceStats()
console.log('Average execution time:', stats.averageExecutionTime)
```

### Agent Observability

Comprehensive observability for agents.

```typescript
// Access through agent handle
const handle = await connectAgent({ /* ... */ })

// Enable debug mode
handle.observability.enableDebugMode({
  verbose: true,
  graph: true,
  level: 'debug'
})

// Get performance metrics
const metrics = handle.observability.getMetrics()
const timeline = handle.observability.getDebugTimeline()

// Export metrics
const prometheusData = handle.observability.exportPrometheusMetrics()

// Display timeline
handle.observability.displayDebugTimeline('table')
```

## Security

### Plugin Signing

Sign and verify plugins for security.

```typescript
import { signPlugin, verifyPluginSignature } from '@agentkit/sdk'

// Sign a plugin
const signature = await signPlugin('./my-plugin.ts', {
  secret: 'my-signing-secret',
  expirationDays: 365
})

// Verify signature
const isValid = await verifyPluginSignature('./my-plugin.ts')
if (!isValid) {
  throw new Error('Plugin signature verification failed')
}
```

### Secure Plugin Manager

Execute plugins in secure sandboxes.

```typescript
import { SecurePluginManager } from '@agentkit/sdk'

const secureManager = new SecurePluginManager({
  verificationMode: 'strict',
  sandbox: true,
  allowedGlobals: ['Math', 'Date', 'JSON'],
  trustedKeys: ['trusted-key-1', 'trusted-key-2']
})

// Only signed, verified plugins can be registered
secureManager.register(signedPlugin)
```

### Browser-Safe Execution

Execute plugins in Web Workers for browser safety.

```typescript
const pluginManager = new PluginManager({
  sandbox: true,  // Enables Web Worker sandbox in browsers
  sandboxTimeout: 5000
})
```

## Development Tools

### Debug Manager

Comprehensive debugging capabilities.

```typescript
import { DebugManager, enableGlobalDebugMode } from '@agentkit/sdk'

// Enable global debug mode
enableGlobalDebugMode({
  level: 'debug',
  verbose: true,
  enableGraphOutput: true
})

// Get debug manager instance
const debugManager = DebugManager.getInstance()

// Create debug snapshot
const snapshot = debugManager.createSnapshot()
console.log('Debug snapshot:', snapshot)
```

### Hot Reload Manager

Hot reload plugins during development.

```typescript
import { HotReloadManager } from '@agentkit/sdk'

const hotReload = new HotReloadManager({
  enabled: process.env.NODE_ENV === 'development',
  debounceMs: 300,
  validateBeforeReload: true,
  onReload: (filePath, pluginName) => {
    console.log(`Hot reloaded ${pluginName}`)
  }
})

// Register plugin for hot reload
hotReload.registerPlugin('my-plugin', './src/plugins/my-plugin.ts')
```

### Performance Measurement

Measure and analyze plugin performance.

```typescript
import { measurePluginPerformance, createPluginDevelopmentWrapper } from '@agentkit/sdk'

// Measure plugin performance
const report = await measurePluginPerformance(
  'my-plugin',
  'onSend',
  async () => plugin.onSend(payload, context),
  1000  // iterations
)

console.log(`Performance grade: ${report.performanceGrade}`)
console.log(`Average execution time: ${report.executionMetrics.averageExecutionTime}ms`)

// Wrap plugin for development
const wrapper = createPluginDevelopmentWrapper('my-plugin', plugin, {
  enablePerformanceMonitoring: true,
  enableMemoryTracking: true,
  performanceThreshold: 100
})

const wrappedPlugin = wrapper.getWrappedPlugin()
```

### Trace Output Formatter

Format and display execution traces.

```typescript
import { TraceOutputFormatter, logTrace } from '@agentkit/sdk'

const formatter = new TraceOutputFormatter({
  colorize: true,
  includeTimestamps: true,
  maxDepth: 5
})

// Log formatted trace
logTrace('plugin-execution', {
  pluginName: 'my-plugin',
  hookName: 'onSend',
  duration: 150,
  status: 'success'
})
```

## Utility Functions

### Deep Cloning

Safe object cloning utilities.

```typescript
import { deepClone, createFrozenClone, sanitizeForPlugin } from '@agentkit/sdk'

// Deep clone object
const cloned = deepClone(originalObject)

// Create immutable clone
const frozen = createFrozenClone(originalObject)

// Sanitize object for plugin use
const sanitized = sanitizeForPlugin(userInput)
```

### Async Utilities

Concurrency and synchronization utilities.

```typescript
import { AsyncLock, Mutex } from '@agentkit/sdk'

// Async lock
const lock = new AsyncLock()
await lock.acquire('resource-key', async () => {
  // Critical section
})

// Mutex
const mutex = new Mutex()
const release = await mutex.acquire()
try {
  // Critical section
} finally {
  release()
}
```

### ID Generation

Generate unique identifiers.

```typescript
import { generateRequestId } from '@agentkit/sdk'

const requestId = generateRequestId()
console.log('Request ID:', requestId) // e.g., req_1234567890_abc123
```

## Configuration Examples

### Basic Setup

```typescript
import { connectAgent, AgentRegistry } from '@agentkit/sdk'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'

// Register agent and transport
AgentRegistry.register({
  id: 'my-agent',
  name: 'My Agent',
  version: '1.0.0',
  factory: () => new DummyAgent()
})

AgentRegistry.registerTransport(new DummyTransport())

// Connect with basic configuration
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  scope: ['chat']
})

await handle.send({ message: 'Hello!' })
await handle.shutdown()
```

### Production Setup

```typescript
import { connectAgent, AgentRegistry, PluginManager } from '@agentkit/sdk'

// Setup plugin manager with production settings
const pluginManager = new PluginManager({
  debug: false,
  sandbox: true,
  hookTimeout: 30000,
  failFast: false
})

// Connect with production configuration
const handle = await connectAgent({
  agent: 'production-agent',
  transport: 'http',
  pluginManager,
  resourceLimits: {
    maxConcurrentRequests: 20,
    maxQueueSize: 100,
    requestTimeoutMs: 60000,
    maxPayloadSize: 10 * 1024 * 1024 // 10MB
  },
  onError: (error) => {
    console.error('Production error:', error)
    // Send to error tracking service
  }
})
```

### Development Setup

```typescript
import { connectAgent, PluginManager, HotReloadManager } from '@agentkit/sdk'

// Setup hot reload for development
const hotReload = new HotReloadManager({
  enabled: true,
  onReload: (filePath, pluginName) => {
    console.log(`🔄 Reloaded ${pluginName}`)
  }
})

// Setup plugin manager with development features
const pluginManager = new PluginManager({
  debug: true,
  enableDebugMode: true,
  observabilityHooks: {
    onPluginStart: (name, hook) => console.log(`🚀 ${name}.${hook}`),
    onPluginSuccess: (name, hook, duration) => console.log(`✅ ${name}.${hook} (${duration}ms)`),
    onPluginError: (name, hook, error) => console.log(`❌ ${name}.${hook}:`, error)
  }
})

// Connect with development configuration
const handle = await connectAgent({
  agent: 'dev-agent',
  transport: 'dummy',
  pluginManager,
  debug: true,
  onInit: (agentId) => console.log(`🎯 Agent ${agentId} initialized`),
  onShutdown: (agentId) => console.log(`👋 Agent ${agentId} shutdown`)
})

// Enable comprehensive debugging
handle.observability.enableDebugMode({
  verbose: true,
  graph: true,
  level: 'debug',
  hotReload: true
})
```

---

**AgentKit SDK v0.1.0-alpha** - Complete API reference for building secure, performant AI agent integrations.