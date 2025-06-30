# Plugin Implementation Guide

A practical guide for implementing plugins that work correctly with the AgentKit SDK's hook execution order and safety mechanisms.

## 🎯 Plugin Design Principles

### 1. Single Responsibility
Each plugin should have a clear, focused purpose:

```typescript
// ✅ Good: Focused responsibility
const authPlugin = {
  name: 'authentication',
  hooks: {
    onSend: async (payload, context) => {
      // Only handles authentication
      await addAuthHeaders(payload, context)
    }
  }
}

// ❌ Bad: Mixed responsibilities  
const kitchenSinkPlugin = {
  name: 'everything-plugin',
  hooks: {
    onSend: async (payload, context) => {
      // Doing too many things
      await authenticate(payload)
      await validate(payload) 
      await logMessage(payload)
      await collectMetrics(payload)
    }
  }
}
```

### 2. Stateless Design
Prefer stateless plugins for better reliability:

```typescript
// ✅ Good: Stateless plugin
const statelessLogger = {
  name: 'logger',
  hooks: {
    onSend: async (payload, context) => {
      // No internal state - always safe
      console.log(`Message: ${payload.type}`)
    }
  }
}

// ⚠️ Caution: Stateful plugin (requires careful design)
class StatefulPlugin {
  private messageCount = 0
  
  plugin = {
    name: 'counter',
    hooks: {
      onSend: async (payload, context) => {
        // State must be managed carefully
        this.messageCount++
        console.log(`Message #${this.messageCount}`)
      }
    }
  }
}
```

### 3. Defensive Programming
Always handle edge cases and errors:

```typescript
const robustPlugin = {
  name: 'robust',
  hooks: {
    onSend: async (payload, context) => {
      try {
        // Validate inputs
        if (!payload || typeof payload !== 'object') {
          console.warn('Invalid payload received')
          return
        }
        
        // Safe processing
        await processPayload(payload)
        
      } catch (error) {
        // Handle errors gracefully
        console.error(`Plugin ${this.name} failed:`, error.message)
        // Don't re-throw unless critical
      }
    }
  }
}
```

## 🔧 Hook Implementation Patterns

### onInit Hook Patterns

#### Resource Initialization
```typescript
const resourcePlugin = {
  name: 'resource-manager',
  hooks: {
    onInit: async (context) => {
      try {
        // Initialize resources
        this.database = await connectToDatabase()
        this.cache = new Cache()
        this.metrics = new MetricsCollector()
        
        console.log(`Plugin ${this.name} initialized successfully`)
      } catch (error) {
        console.error(`Failed to initialize ${this.name}:`, error)
        // Decide whether to throw or continue with degraded functionality
        throw new Error(`Critical resource initialization failed: ${error.message}`)
      }
    }
  }
}
```

#### Configuration Validation
```typescript
const configPlugin = {
  name: 'config-validator',
  hooks: {
    onInit: async (context) => {
      // Validate required configuration
      const config = context.agent.config
      
      if (!config.apiKey) {
        throw new Error('Missing required configuration: apiKey')
      }
      
      if (!config.endpoint || !isValidUrl(config.endpoint)) {
        throw new Error('Invalid endpoint configuration')
      }
      
      console.log('Configuration validated successfully')
    }
  }
}
```

### onSend Hook Patterns

#### Message Transformation
```typescript
const transformPlugin = {
  name: 'message-transformer',
  hooks: {
    onSend: async (payload, context) => {
      // Transform outgoing messages
      if (payload.type === 'user-message') {
        // Add metadata
        payload.metadata = {
          timestamp: new Date().toISOString(),
          source: context.agent.id,
          version: '1.0.0'
        }
        
        // Sanitize content
        if (payload.content) {
          payload.content = sanitizeHtml(payload.content)
        }
      }
    }
  }
}
```

#### Request Enrichment
```typescript
const enrichmentPlugin = {
  name: 'request-enricher',
  hooks: {
    onSend: async (payload, context) => {
      // Add request tracking
      payload.requestId = generateRequestId()
      payload.timestamp = Date.now()
      
      // Add user context if available
      if (context.user) {
        payload.userId = context.user.id
        payload.userRole = context.user.role
      }
      
      // Add agent information
      payload.agentId = context.agent.id
      payload.agentVersion = context.agent.version
    }
  }
}
```

#### Conditional Processing
```typescript
const conditionalPlugin = {
  name: 'conditional-processor',
  hooks: {
    onSend: async (payload, context) => {
      // Only process certain message types
      if (payload.type !== 'important-message') {
        return // Skip processing
      }
      
      // Only process for specific agents
      if (!context.agent.id.startsWith('production-')) {
        console.log('Skipping non-production agent')
        return
      }
      
      // Process important messages from production agents
      await processImportantMessage(payload, context)
    }
  }
}
```

### onError Hook Patterns

#### Error Classification
```typescript
const errorClassifierPlugin = {
  name: 'error-classifier',
  hooks: {
    onError: async (error, context) => {
      // Classify error types
      let errorCategory = 'unknown'
      let severity = 'medium'
      
      if (error instanceof NetworkError) {
        errorCategory = 'network'
        severity = 'high'
      } else if (error instanceof ValidationError) {
        errorCategory = 'validation'
        severity = 'low'
      } else if (error instanceof AuthenticationError) {
        errorCategory = 'security'
        severity = 'critical'
      }
      
      // Log with classification
      console.error(`[${severity.toUpperCase()}] ${errorCategory} error:`, {
        message: error.message,
        agent: context.agent.id,
        timestamp: new Date().toISOString()
      })
      
      // Report critical errors
      if (severity === 'critical') {
        await reportCriticalError(error, context)
      }
    }
  }
}
```

#### Error Recovery
```typescript
const recoveryPlugin = {
  name: 'error-recovery',
  hooks: {
    onError: async (error, context) => {
      // Attempt recovery for specific error types
      if (error.code === 'RATE_LIMITED') {
        console.log('Rate limited - implementing backoff strategy')
        await implementBackoff(context)
        return
      }
      
      if (error.code === 'TEMPORARY_FAILURE') {
        console.log('Temporary failure - scheduling retry')
        await scheduleRetry(context)
        return
      }
      
      // For unrecoverable errors, just log
      console.error('Unrecoverable error:', error.message)
    }
  }
}
```

### onShutdown Hook Patterns

#### Graceful Cleanup
```typescript
const cleanupPlugin = {
  name: 'cleanup-manager',
  hooks: {
    onShutdown: async (context) => {
      console.log(`Starting graceful shutdown of ${this.name}`)
      
      try {
        // Close external connections
        if (this.database) {
          await this.database.close()
          console.log('Database connection closed')
        }
        
        // Flush pending operations
        if (this.messageQueue && this.messageQueue.length > 0) {
          await this.flushMessageQueue()
          console.log('Message queue flushed')
        }
        
        // Save state if needed
        if (this.state) {
          await this.saveState()
          console.log('State saved')
        }
        
        // Clear timers and intervals
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer)
          console.log('Heartbeat timer cleared')
        }
        
        console.log(`Plugin ${this.name} shutdown completed`)
        
      } catch (error) {
        console.error(`Error during ${this.name} shutdown:`, error)
        // Don't throw - allow other plugins to shutdown
      }
    }
  }
}
```

#### State Persistence
```typescript
const persistencePlugin = {
  name: 'state-persistence',
  hooks: {
    onShutdown: async (context) => {
      try {
        // Collect current state
        const state = {
          timestamp: new Date().toISOString(),
          agentId: context.agent.id,
          sessionData: this.sessionData,
          metrics: this.metrics,
          configuration: this.config
        }
        
        // Save to persistent storage
        await saveStateToFile(state, `agent-${context.agent.id}-state.json`)
        console.log('Agent state persisted successfully')
        
      } catch (error) {
        console.error('Failed to persist state:', error)
        // Continue shutdown process
      }
    }
  }
}
```

## 🏗️ Advanced Plugin Architectures

### Plugin Factory Pattern
```typescript
function createLoggingPlugin(options = {}) {
  const {
    level = 'info',
    format = 'json',
    destination = 'console'
  } = options
  
  return {
    name: `logger-${destination}`,
    hooks: {
      onSend: async (payload, context) => {
        const logEntry = {
          level,
          timestamp: new Date().toISOString(),
          event: 'message_sent',
          payload: format === 'json' ? JSON.stringify(payload) : payload.toString(),
          agent: context.agent.id
        }
        
        await writeLog(logEntry, destination)
      },
      
      onError: async (error, context) => {
        const logEntry = {
          level: 'error',
          timestamp: new Date().toISOString(),
          event: 'error_occurred',
          error: error.message,
          stack: error.stack,
          agent: context.agent.id
        }
        
        await writeLog(logEntry, destination)
      }
    }
  }
}

// Usage
const fileLogger = createLoggingPlugin({ destination: 'file', format: 'json' })
const consoleLogger = createLoggingPlugin({ destination: 'console', format: 'text' })
```

### Configurable Plugin Chain
```typescript
class PluginChainBuilder {
  private plugins = []
  
  addAuthentication(config) {
    this.plugins.push(createAuthPlugin(config))
    return this
  }
  
  addValidation(schema) {
    this.plugins.push(createValidationPlugin(schema))
    return this
  }
  
  addLogging(options) {
    this.plugins.push(createLoggingPlugin(options))
    return this
  }
  
  addMetrics(collector) {
    this.plugins.push(createMetricsPlugin(collector))
    return this
  }
  
  build() {
    return this.plugins
  }
}

// Usage
const plugins = new PluginChainBuilder()
  .addAuthentication({ provider: 'oauth2' })
  .addValidation(messageSchema)
  .addLogging({ level: 'debug' })
  .addMetrics(prometheusCollector)
  .build()

plugins.forEach(plugin => pluginManager.register(plugin))
```

### Middleware-Style Plugins
```typescript
function createMiddlewarePlugin(middleware) {
  return {
    name: middleware.name || 'middleware',
    hooks: {
      onSend: async (payload, context) => {
        // Create middleware-style next function
        let nextCalled = false
        const next = () => { nextCalled = true }
        
        // Execute middleware
        await middleware(payload, context, next)
        
        // Ensure next was called
        if (!nextCalled) {
          console.warn(`Middleware ${middleware.name} didn't call next()`)
        }
      }
    }
  }
}

// Usage
const authMiddleware = (payload, context, next) => {
  if (!context.user?.authenticated) {
    throw new Error('Authentication required')
  }
  next()
}

const validationMiddleware = (payload, context, next) => {
  if (!isValidPayload(payload)) {
    throw new Error('Invalid payload')
  }
  next()
}

pluginManager.register(createMiddlewarePlugin(authMiddleware))
pluginManager.register(createMiddlewarePlugin(validationMiddleware))
```

## 🧪 Testing Plugin Implementations

### Unit Testing Individual Hooks
```typescript
import { describe, it, expect, vi } from 'vitest'

describe('LoggingPlugin', () => {
  const loggingPlugin = createLoggingPlugin()
  
  it('should log outgoing messages', async () => {
    const consoleSpy = vi.spyOn(console, 'log')
    
    const payload = { type: 'test', content: 'Hello' }
    const context = { agent: { id: 'test-agent' } }
    
    await loggingPlugin.hooks.onSend(payload, context)
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Message sent'),
      expect.objectContaining({ agent: 'test-agent' })
    )
  })
  
  it('should handle errors gracefully', async () => {
    const error = new Error('Test error')
    const context = { agent: { id: 'test-agent' } }
    
    // Should not throw
    expect(() => 
      loggingPlugin.hooks.onError(error, context)
    ).not.toThrow()
  })
})
```

### Integration Testing Plugin Chains
```typescript
describe('Plugin Chain Integration', () => {
  let pluginManager
  
  beforeEach(() => {
    pluginManager = new PluginManager()
    
    // Register test plugins in specific order
    pluginManager.register(authPlugin)
    pluginManager.register(validationPlugin) 
    pluginManager.register(loggingPlugin)
  })
  
  it('should execute plugins in correct order', async () => {
    const executionOrder = []
    
    // Mock plugins to track execution
    const trackingPlugin = (name) => ({
      name,
      hooks: {
        onSend: async () => {
          executionOrder.push(name)
        }
      }
    })
    
    pluginManager.register(trackingPlugin('first'))
    pluginManager.register(trackingPlugin('second'))
    pluginManager.register(trackingPlugin('third'))
    
    await pluginManager.executeHook('onSend', {}, {})
    
    expect(executionOrder).toEqual(['first', 'second', 'third'])
  })
})
```

### Error Isolation Testing
```typescript
describe('Plugin Error Isolation', () => {
  it('should continue execution when one plugin fails', async () => {
    const pluginManager = new PluginManager()
    const executionResults = []
    
    const successPlugin = {
      name: 'success',
      hooks: {
        onSend: async () => {
          executionResults.push('success')
        }
      }
    }
    
    const failingPlugin = {
      name: 'failing',
      hooks: {
        onSend: async () => {
          executionResults.push('failing-started')
          throw new Error('Plugin failed')
        }
      }
    }
    
    const anotherSuccessPlugin = {
      name: 'another-success',
      hooks: {
        onSend: async () => {
          executionResults.push('another-success')
        }
      }
    }
    
    pluginManager.register(successPlugin)
    pluginManager.register(failingPlugin)
    pluginManager.register(anotherSuccessPlugin)
    
    // Should not throw despite failing plugin
    await pluginManager.executeHook('onSend', {}, {})
    
    expect(executionResults).toEqual([
      'success',
      'failing-started',
      'another-success'  // This should still execute
    ])
  })
})
```

This implementation guide provides practical patterns and examples for building robust, well-ordered plugins that work effectively within the AgentKit SDK's execution model.