# Plugin Hook Execution Order

This document provides comprehensive documentation on the execution order and lifecycle of plugin hooks in the AgentKit SDK, ensuring predictable and safe plugin behavior.

## 📋 Table of Contents

- [Hook Types and Lifecycle](#hook-types-and-lifecycle)
- [Execution Order](#execution-order)
- [Timing and Sequencing](#timing-and-sequencing)
- [Error Handling and Isolation](#error-handling-and-isolation)
- [Best Practices](#best-practices)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## 🔄 Hook Types and Lifecycle

The AgentKit SDK defines four core plugin hook types that correspond to different phases of the agent lifecycle:

### 1. `onInit` Hook
- **Purpose**: Initialize plugin state and resources
- **Timing**: Called during agent initialization
- **Parameters**: `(context: PluginContext) => void | Promise<void>`
- **Use Cases**: Setup resources, validate configuration, establish connections

### 2. `onSend` Hook  
- **Purpose**: Process outgoing messages and requests
- **Timing**: Called before every agent send operation
- **Parameters**: `(payload: SendPayload, context: PluginContext) => void | Promise<void>`
- **Use Cases**: Logging, authentication, message transformation, validation

### 3. `onError` Hook
- **Purpose**: Handle and respond to errors
- **Timing**: Called when errors occur during agent operations
- **Parameters**: `(error: Error, context: PluginContext) => void | Promise<void>`
- **Use Cases**: Error logging, alerting, recovery actions, metrics collection

### 4. `onShutdown` Hook
- **Purpose**: Clean up resources and state
- **Timing**: Called during agent shutdown
- **Parameters**: `(context: PluginContext) => void | Promise<void>`
- **Use Cases**: Close connections, flush buffers, save state, cleanup resources

## ⚡ Execution Order

### Registration Order Determines Execution Order

Plugins execute in the **same order they were registered** with the PluginManager:

```typescript
const pluginManager = new PluginManager()

// Execution order: 1st -> 2nd -> 3rd
pluginManager.register(firstPlugin)   // Executes first
pluginManager.register(secondPlugin)  // Executes second  
pluginManager.register(thirdPlugin)   // Executes third
```

### Hook-Specific Execution Patterns

#### Sequential Execution (Default)
All hooks execute **sequentially** by default:

```typescript
// onInit execution flow:
await firstPlugin.hooks.onInit(context)    // Waits for completion
await secondPlugin.hooks.onInit(context)   // Then executes
await thirdPlugin.hooks.onInit(context)    // Finally executes
```

#### Error Isolation
Each plugin executes in isolation - one plugin's failure doesn't stop others:

```typescript
// If secondPlugin throws an error:
await firstPlugin.hooks.onSend(payload, context)    // ✅ Executes successfully
await secondPlugin.hooks.onSend(payload, context)   // ❌ Throws error (isolated)
await thirdPlugin.hooks.onSend(payload, context)    // ✅ Still executes
```

## ⏱️ Timing and Sequencing

### Agent Lifecycle Integration

Plugin hooks are integrated at specific points in the agent lifecycle:

```
Agent Startup:
┌─────────────────┐
│ Agent.init()    │
├─────────────────┤
│ onInit hooks    │ ← Plugins initialize here
├─────────────────┤
│ Transport.init()│
└─────────────────┘

Agent Operation:
┌─────────────────┐
│ Agent.send()    │
├─────────────────┤
│ onSend hooks    │ ← Plugins process outgoing messages
├─────────────────┤
│ Transport.send()│
└─────────────────┘

Error Handling:
┌─────────────────┐
│ Error occurs    │
├─────────────────┤
│ onError hooks   │ ← Plugins handle errors
└─────────────────┘

Agent Shutdown:
┌─────────────────┐
│ onShutdown hooks│ ← Plugins cleanup
├─────────────────┤
│ Agent.shutdown()│
├─────────────────┤
│ Transport.shutdown()│
└─────────────────┘
```

### Timeout Behavior

Each plugin hook has a configurable timeout (default: 5000ms):

```typescript
const pluginManager = new PluginManager({
  hookTimeout: 3000 // 3 second timeout per hook
})
```

**Timeout Execution:**
1. Hook starts executing
2. Timer starts (e.g., 3000ms)
3. If hook completes before timeout: ✅ Success
4. If hook exceeds timeout: ❌ PluginTimeoutError thrown
5. Next plugin continues executing

### Concurrent vs Sequential Execution

**Current Implementation: Sequential**
```typescript
// Hooks execute one after another
for (const plugin of this.plugins) {
  await plugin.hooks.onSend(payload, context)  // Wait for each
}
```

**Future Enhancement: Concurrent Option**
```typescript
// Could support concurrent execution
const promises = this.plugins.map(plugin => 
  plugin.hooks.onSend(payload, context)
)
await Promise.allSettled(promises)  // All execute simultaneously
```

## 🛡️ Error Handling and Isolation

### Error Isolation Pattern

The PluginManager implements **fail-fast isolation** - plugin errors are contained but don't stop other plugins:

```typescript
async executeHook(hookName: PluginHookName, ...args: unknown[]): Promise<void> {
  for (const plugin of this.plugins) {
    try {
      // Each plugin executes in isolation
      await this.executePluginHook(plugin, hookName, ...args)
    } catch (error) {
      // Error is logged but doesn't stop execution
      console.error(`Plugin ${plugin.name} failed:`, error)
      // Other plugins continue executing
    }
  }
}
```

### Error Types and Handling

#### 1. PluginTimeoutError
```typescript
// When plugin exceeds timeout
throw new PluginTimeoutError(
  `Plugin ${plugin.name} hook ${hookName} timed out after ${timeout}ms`
)
```

#### 2. Plugin Execution Errors
```typescript
// When plugin throws during execution
try {
  await plugin.hooks.onSend(payload, context)
} catch (error) {
  // Logged and isolated - other plugins continue
  this.logger.error('Plugin execution failed', { plugin: plugin.name, error })
}
```

#### 3. Configuration Errors
```typescript
// When plugin registration fails
throw new Error(`Invalid plugin: missing required hooks`)
```

### State Isolation

Each plugin receives **immutable, cloned arguments** to prevent state mutations:

```typescript
// Arguments are deep cloned before passing to plugins
const clonedPayload = this.secureClone(payload)
const clonedContext = this.secureClone(context)

await plugin.hooks.onSend(clonedPayload, clonedContext)
```

## 🎯 Best Practices

### 1. Plugin Registration Order

**Strategy**: Register plugins in order of importance/priority

```typescript
// Critical plugins first
pluginManager.register(authenticationPlugin)  // 1st - Must run first
pluginManager.register(validationPlugin)      // 2nd - Validate after auth
pluginManager.register(loggingPlugin)         // 3rd - Log after validation
pluginManager.register(metricsPlugin)         // 4th - Collect metrics last
```

### 2. Hook Implementation Guidelines

#### Fast and Efficient Hooks
```typescript
const goodPlugin = {
  name: 'efficient-plugin',
  hooks: {
    onSend: async (payload, context) => {
      // ✅ Quick operations
      console.log(`Sending message: ${payload.type}`)
      metrics.incrementCounter('messages_sent')
    }
  }
}
```

#### Avoid Heavy Operations
```typescript
const problematicPlugin = {
  name: 'slow-plugin', 
  hooks: {
    onSend: async (payload, context) => {
      // ❌ Slow operations that block other plugins
      await heavyDatabaseQuery()
      await slowExternalAPICall()
    }
  }
}
```

### 3. Error Handling in Plugins

```typescript
const robustPlugin = {
  name: 'robust-plugin',
  hooks: {
    onSend: async (payload, context) => {
      try {
        // Plugin logic here
        await processMessage(payload)
      } catch (error) {
        // ✅ Handle errors gracefully within plugin
        console.error('Plugin processing failed:', error)
        // Don't re-throw unless absolutely necessary
      }
    }
  }
}
```

### 4. Resource Management

```typescript
const resourcePlugin = {
  name: 'resource-plugin',
  hooks: {
    onInit: async (context) => {
      // ✅ Setup resources
      this.connection = await createConnection()
    },
    onShutdown: async (context) => {
      // ✅ Always cleanup resources
      if (this.connection) {
        await this.connection.close()
      }
    }
  }
}
```

## 📝 Examples

### Example 1: Logging and Metrics Plugin Chain

```typescript
const loggingPlugin = {
  name: 'request-logger',
  hooks: {
    onSend: async (payload, context) => {
      console.log(`[${new Date().toISOString()}] Sending: ${payload.type}`)
    },
    onError: async (error, context) => {
      console.error(`[${new Date().toISOString()}] Error:`, error.message)
    }
  }
}

const metricsPlugin = {
  name: 'metrics-collector',
  hooks: {
    onSend: async (payload, context) => {
      metrics.incrementCounter('requests_total', { type: payload.type })
    },
    onError: async (error, context) => {
      metrics.incrementCounter('errors_total', { type: error.constructor.name })
    }
  }
}

// Registration order determines execution
pluginManager.register(loggingPlugin)   // Logs first
pluginManager.register(metricsPlugin)   // Collects metrics second
```

**Execution Flow:**
```
Agent.send(message) called
├── loggingPlugin.onSend()     # Logs request
├── metricsPlugin.onSend()     # Records metric  
└── Transport.send()           # Sends message
```

### Example 2: Authentication and Validation Chain

```typescript
const authPlugin = {
  name: 'authentication',
  hooks: {
    onSend: async (payload, context) => {
      if (!context.user?.authenticated) {
        throw new Error('User not authenticated')
      }
      // Add auth headers
      payload.headers = { ...payload.headers, 'Authorization': context.user.token }
    }
  }
}

const validationPlugin = {
  name: 'message-validator',
  hooks: {
    onSend: async (payload, context) => {
      if (!payload.type || !payload.data) {
        throw new Error('Invalid message format')
      }
      // Validate payload structure
      validateMessageSchema(payload)
    }
  }
}

// Order matters: authenticate before validating
pluginManager.register(authPlugin)       // 1st - Add auth
pluginManager.register(validationPlugin) // 2nd - Validate complete message
```

### Example 3: Error Recovery Chain

```typescript
const retryPlugin = {
  name: 'retry-handler',
  hooks: {
    onError: async (error, context) => {
      if (error.code === 'NETWORK_ERROR' && context.retryCount < 3) {
        console.log(`Retry attempt ${context.retryCount + 1}`)
        // Trigger retry logic
        await context.agent.send(context.lastPayload)
      }
    }
  }
}

const alertingPlugin = {
  name: 'error-alerting',
  hooks: {
    onError: async (error, context) => {
      if (error.severity === 'critical') {
        await sendAlert({
          message: error.message,
          agent: context.agent.id,
          timestamp: new Date()
        })
      }
    }
  }
}

// Error handling order
pluginManager.register(retryPlugin)     // 1st - Try to recover
pluginManager.register(alertingPlugin) // 2nd - Alert if still failed
```

## 🔍 Troubleshooting

### Common Issues and Solutions

#### 1. Plugin Order Dependencies

**Problem**: Plugin B depends on Plugin A's modifications
```typescript
// ❌ Wrong order - validation runs before auth adds required data
pluginManager.register(validationPlugin)  
pluginManager.register(authPlugin)
```

**Solution**: Register dependencies first
```typescript
// ✅ Correct order - auth runs first, then validation
pluginManager.register(authPlugin)
pluginManager.register(validationPlugin)
```

#### 2. Plugin Timeouts

**Problem**: Plugin operations exceed timeout
```typescript
// Error: PluginTimeoutError: Plugin slow-plugin hook onSend timed out after 5000ms
```

**Solutions**:
```typescript
// Option 1: Increase timeout
const pluginManager = new PluginManager({
  hookTimeout: 10000  // 10 seconds
})

// Option 2: Optimize plugin performance
const optimizedPlugin = {
  hooks: {
    onSend: async (payload, context) => {
      // Use fast operations
      setImmediate(() => slowOperation()) // Don't block
      return quickOperation()
    }
  }
}
```

#### 3. State Mutation Issues

**Problem**: Plugins modifying shared state
```typescript
const badPlugin = {
  hooks: {
    onSend: async (payload, context) => {
      // ❌ Mutates original payload
      payload.timestamp = Date.now()
    }
  }
}
```

**Solution**: SDK automatically clones arguments
```typescript
// ✅ Plugins receive cloned data - mutations are isolated
const safePlugin = {
  hooks: {
    onSend: async (payload, context) => {
      // This mutation doesn't affect other plugins
      payload.processed = true
    }
  }
}
```

#### 4. Error Propagation

**Problem**: Plugin errors stopping execution
```typescript
// ❌ This won't stop other plugins due to error isolation
const errorPlugin = {
  hooks: {
    onSend: async () => {
      throw new Error('Plugin failed')  // Isolated - others continue
    }
  }
}
```

**Debugging**: Enable debug logging
```typescript
const pluginManager = new PluginManager({
  debug: true  // Shows detailed execution logs
})
```

### Debugging Tools

#### 1. Execution Logging

```typescript
// Enable detailed plugin execution logging
const debugManager = new PluginManager({
  debug: true,
  onHookStart: (plugin, hook) => console.log(`Starting ${plugin.name}.${hook}`),
  onHookEnd: (plugin, hook, duration) => console.log(`Completed ${plugin.name}.${hook} (${duration}ms)`)
})
```

#### 2. Hook Execution Metrics

```typescript
// Track plugin performance
const instrumentedManager = new PluginManager()

instrumentedManager.on('hookExecuted', (event) => {
  metrics.observeHistogram('plugin_execution_duration', event.duration, {
    plugin: event.plugin,
    hook: event.hook,
    status: event.status
  })
})
```

#### 3. Hook Tracing

```typescript
// Trace hook execution flow
const tracingManager = new PluginManager({
  onBeforeHook: (plugin, hook, args) => {
    console.log(`🔄 Executing ${plugin.name}.${hook}`, { args })
  },
  onAfterHook: (plugin, hook, result, duration) => {
    console.log(`✅ Completed ${plugin.name}.${hook} in ${duration}ms`, { result })
  },
  onHookError: (plugin, hook, error) => {
    console.log(`❌ Failed ${plugin.name}.${hook}:`, error.message)
  }
})
```

## 🔬 Advanced Concepts

### Hook Execution State Machine

```
[Plugin Registration] 
       │
       ▼
[Hook Discovery] ────┐
       │             │
       ▼             │
[Argument Cloning]   │
       │             │
       ▼             │
[Hook Execution] ◄───┘
       │
       ├─ Success ──► [Next Plugin]
       │
       └─ Error/Timeout ──► [Error Log] ──► [Next Plugin]
```

### Execution Context

Each plugin hook receives a rich context object:

```typescript
interface PluginContext {
  agent: {
    id: string
    name: string
    version: string
  }
  transport: {
    id: string
    name: string
  }
  execution: {
    hookName: string
    startTime: number
    attemptCount: number
  }
  metadata: Record<string, unknown>
}
```

This comprehensive documentation ensures predictable, safe, and efficient plugin hook execution in the AgentKit SDK.