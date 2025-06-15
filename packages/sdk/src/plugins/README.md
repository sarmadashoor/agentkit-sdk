# AgentKit Plugin System

The AgentKit Plugin System allows developers to extend AgentKit behavior without modifying the core SDK logic. Plugins can hook into agent lifecycle events for logging, metrics, debugging, retries, and other cross-cutting concerns.

## Key Features

- 🔒 **Zero mutation**: Plugins receive immutable data copies
- 🛡️ **Error isolation**: Plugin failures never break core SDK functionality  
- 🎯 **Type safety**: Full TypeScript support with runtime validation
- 📊 **Lifecycle hooks**: Init, Send, Error, and Shutdown events
- ⚡ **High performance**: Minimal overhead, optimized execution
- 🧪 **100% testable**: Complete test coverage and examples

## Quick Start

### 1. Creating a Simple Plugin

```typescript
import { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/sdk'

const myPlugin: AgentKitPlugin = {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'A simple example plugin',
  
  onInit(context: AgentContext) {
    console.log(`Agent ${context.agentId} initialized`)
  },
  
  onSend(payload: SendPayload, context: AgentContext) {
    console.log(`Sending to ${context.agentId}:`, payload.input)
  },
  
  onError(error: Error, context: AgentContext) {
    console.error(`Error in ${context.agentId}:`, error.message)
  },
  
  onShutdown(context: AgentContext) {
    console.log(`Agent ${context.agentId} shutting down`)
  }
}
```

### 2. Using Plugins with AgentKit

```typescript
import { connectAgent } from '@agentkit/sdk'

const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'my-transport',
  plugins: [myPlugin] // Add your plugins here
})

await handle.send({ message: 'Hello, world!' })
await handle.shutdown()
```

### 3. Using the Built-in LoggingPlugin

```typescript
import { connectAgent, createLoggingPlugin } from '@agentkit/sdk'

const loggingPlugin = createLoggingPlugin({
  logLevel: 'info',
  includePayload: true,
  includeContext: false
})

const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'my-transport',
  plugins: [loggingPlugin]
})
```

## Plugin Hooks

### onInit(context: AgentContext)
Called after the agent and transport are successfully initialized.

**Use cases:**
- Initialize plugin state
- Set up external connections
- Log initialization events

### onSend(payload: SendPayload, context: AgentContext)
Called before each message is sent to the agent.

**Use cases:**
- Log message details
- Validate input
- Update metrics
- Implement rate limiting

### onError(error: Error, context: AgentContext)
Called when any error occurs during agent operations.

**Use cases:**
- Error logging and reporting
- Error metrics collection
- Alerting and notifications
- Error recovery attempts

### onShutdown(context: AgentContext)
Called during agent shutdown, before cleanup.

**Use cases:**
- Cleanup plugin resources
- Save final state
- Send shutdown notifications

## Data Types

### AgentContext
```typescript
interface AgentContext {
  agentId: string      // The agent identifier
  transportId: string  // The transport identifier
  requestId: string    // Unique ID for this operation
  timestamp: number    // Operation timestamp
  metadata?: Record<string, unknown> // Additional context
}
```

### SendPayload
```typescript
interface SendPayload {
  input: unknown       // The data being sent to the agent
  metadata: Record<string, unknown> // Additional send metadata
}
```

## Advanced Usage

### Plugin with State Management

```typescript
class MetricsPlugin implements AgentKitPlugin {
  name = 'metrics-plugin'
  version = '1.0.0'
  
  private messageCount = 0
  private errorCount = 0
  private startTime = Date.now()
  
  onInit(context: AgentContext) {
    this.startTime = Date.now()
    console.log(`Metrics tracking started for ${context.agentId}`)
  }
  
  onSend(payload: SendPayload, context: AgentContext) {
    this.messageCount++
    console.log(`Messages sent: ${this.messageCount}`)
  }
  
  onError(error: Error, context: AgentContext) {
    this.errorCount++
    console.log(`Errors: ${this.errorCount}`)
  }
  
  onShutdown(context: AgentContext) {
    const duration = Date.now() - this.startTime
    console.log(`Final stats - Messages: ${this.messageCount}, Errors: ${this.errorCount}, Duration: ${duration}ms`)
  }
}
```

### Plugin with Configuration

```typescript
interface RetryPluginConfig {
  maxRetries: number
  retryDelay: number
  retryableErrors: string[]
}

class RetryPlugin implements AgentKitPlugin {
  name = 'retry-plugin'
  version = '1.0.0'
  
  constructor(private config: RetryPluginConfig) {}
  
  onError(error: Error, context: AgentContext) {
    if (this.config.retryableErrors.includes(error.message)) {
      console.log(`Retryable error detected: ${error.message}`)
      // Plugin-based retry logic would go here
      // Note: Plugins cannot directly retry operations, 
      // but can log/report retryable conditions
    }
  }
}

// Usage
const retryPlugin = new RetryPlugin({
  maxRetries: 3,
  retryDelay: 1000,
  retryableErrors: ['NETWORK_ERROR', 'TIMEOUT']
})
```

## Plugin Manager API

For advanced use cases, you can interact with the PluginManager directly:

```typescript
import { PluginManager } from '@agentkit/sdk'

const pluginManager = new PluginManager({
  debug: true,
  hookTimeout: 5000
})

// Register plugins
pluginManager.register(myPlugin)

// Execute hooks manually
await pluginManager.executeHook('onInit', context)

// Get registered plugins
const plugins = pluginManager.getPlugins()

// Remove plugins
pluginManager.removePlugin('my-plugin')
```

## Best Practices

### 1. Keep Plugins Lightweight
```typescript
// ✅ Good - Fast, synchronous operations
onSend(payload, context) {
  this.messageCount++
  console.log(`Message ${this.messageCount}`)
}

// ❌ Bad - Heavy operations that slow down the SDK
onSend(payload, context) {
  // Don't do heavy computations or network calls
  const result = heavyComputation(payload.input)
  await sendToExternalAPI(result)
}
```

### 2. Handle Errors Gracefully
```typescript
// ✅ Good - Safe error handling
onSend(payload, context) {
  try {
    this.processPayload(payload)
  } catch (error) {
    console.warn('Plugin processing failed:', error)
    // Plugin continues to work
  }
}

// ❌ Bad - Throwing errors
onSend(payload, context) {
  if (!payload.input) {
    throw new Error('Invalid payload') // This is caught by the SDK
  }
}
```

### 3. Don't Mutate Data
```typescript
// ✅ Good - Read-only access
onSend(payload, context) {
  console.log('Input type:', typeof payload.input)
  console.log('Agent ID:', context.agentId)
}

// ❌ Bad - Attempting mutation (won't work anyway)
onSend(payload, context) {
  payload.input.modified = true // This won't affect the actual data
  context.agentId = 'hacked'    // This won't work either
}
```

### 4. Use Descriptive Names and Versions
```typescript
// ✅ Good
{
  name: 'company-metrics-collector',
  version: '2.1.0',
  description: 'Collects agent metrics for internal monitoring'
}

// ❌ Bad
{
  name: 'plugin',
  version: '1.0.0'
}
```

## Plugin Validation

The plugin system automatically validates:

- Plugin schema (name, version, hook signatures)
- Hook function parameter counts
- Synchronous execution (no async hooks)
- Type safety at runtime

Invalid plugins will throw descriptive errors:

```typescript
// This will throw an error
const invalidPlugin = {
  name: 'bad-plugin',
  version: '1.0.0',
  onInit: async (context) => {} // ❌ Async not allowed
}

pluginManager.register(invalidPlugin)
// Error: Invalid plugin "bad-plugin": onInit must be synchronous (not async)
```

## Testing Plugins

```typescript
import { describe, it, expect, vi } from 'vitest'

describe('MyPlugin', () => {
  it('should track message count', () => {
    const plugin = new MetricsPlugin()
    const context = {
      agentId: 'test-agent',
      transportId: 'test-transport',
      requestId: 'req-123',
      timestamp: Date.now()
    }

    plugin.onInit(context)
    
    plugin.onSend({ input: 'test', metadata: {} }, context)
    plugin.onSend({ input: 'test2', metadata: {} }, context)
    
    expect(plugin.messageCount).toBe(2)
  })
})
```

## Plugin Examples

See the `/examples` directory for complete plugin examples:

- **LoggingPlugin**: Comprehensive logging of all agent events
- **MetricsPlugin**: Performance and usage metrics collection  
- **ValidationPlugin**: Input/output validation
- **RetryPlugin**: Retry logic and failure tracking
- **CircuitBreakerPlugin**: Circuit breaker pattern implementation

## Architecture Notes

- **Zero Coupling**: Plugins never directly modify SDK behavior
- **Immutable Data**: All data passed to plugins is deep-cloned
- **Error Isolation**: Plugin exceptions are caught and logged
- **Deterministic Execution**: Plugins execute in registration order
- **Type Safety**: Full TypeScript support with runtime validation
- **Performance**: Minimal overhead with optimized execution paths