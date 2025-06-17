# AgentKit Plugin Development Guide

Complete guide to developing, testing, and deploying plugins for the AgentKit SDK ecosystem.

## Overview

AgentKit plugins extend agent capabilities through a secure, type-safe lifecycle system. This guide covers everything from basic plugin creation to advanced security features and production deployment.

## Plugin Architecture

### Core Concepts

- **Lifecycle Hooks** - Well-defined extension points in agent execution
- **Context Isolation** - Secure sandbox execution environments
- **Type Safety** - Full TypeScript support with runtime validation
- **Observability** - Built-in performance monitoring and debugging
- **Hot Reload** - Rapid development iteration without restarts

### Plugin Lifecycle

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   onInit    │───▶│   onSend    │───▶│   onError   │───▶│ onShutdown  │
│ (startup)   │    │ (messages)  │    │ (recovery)  │    │ (cleanup)   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
      │                   │                   │                   │
      ▼                   ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Plugin Context & State                          │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Create Plugin with CLI

```bash
# Install AgentKit CLI
pnpm add -g @agentkit/cli

# Create new plugin
agentkit create-plugin --name my-analyzer --hooks onInit onSend onShutdown
cd plugins/my-analyzer
```

### 2. Basic Plugin Structure

```typescript
// index.ts
import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'

const plugin: AgentKitPlugin = {
  name: 'my-analyzer',
  version: '1.0.0',
  description: 'Analyzes message content and sentiment',
  
  // Initialize plugin resources
  async onInit(context: AgentContext): Promise<void> {
    console.log(`Analyzer plugin initialized for agent: ${context.agentId}`)
    // Setup resources, connections, etc.
  },
  
  // Process outgoing messages
  async onSend(payload: SendPayload, context: AgentContext): Promise<SendPayload> {
    // Analyze message content
    const analysis = {
      wordCount: payload.message?.split(' ').length || 0,
      sentiment: analyzeSentiment(payload.message),
      timestamp: Date.now()
    }
    
    // Add analysis to payload metadata
    return {
      ...payload,
      metadata: {
        ...payload.metadata,
        analysis
      }
    }
  },
  
  // Cleanup resources
  async onShutdown(context: AgentContext): Promise<void> {
    console.log('Analyzer plugin shutting down')
    // Cleanup connections, save state, etc.
  }
}

// Helper function
function analyzeSentiment(text: string | undefined): 'positive' | 'negative' | 'neutral' {
  if (!text) return 'neutral'
  // Simple sentiment analysis
  const positiveWords = ['good', 'great', 'excellent', 'amazing']
  const negativeWords = ['bad', 'terrible', 'awful', 'horrible']
  
  const words = text.toLowerCase().split(' ')
  const positiveCount = words.filter(word => positiveWords.includes(word)).length
  const negativeCount = words.filter(word => negativeWords.includes(word)).length
  
  if (positiveCount > negativeCount) return 'positive'
  if (negativeCount > positiveCount) return 'negative'
  return 'neutral'
}

export default plugin
```

### 3. Test Plugin

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Integration tests
npm run test:integration
```

### 4. Register and Use

```typescript
import { connectAgent, AgentRegistry } from '@agentkit/sdk'
import myAnalyzer from './plugins/my-analyzer'

// Register plugin
const pluginManager = new PluginManager()
pluginManager.register(myAnalyzer)

// Use with agent
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  pluginManager
})

// Send message - plugin will analyze it
await handle.send({ message: 'This is a great day!' })
```

## Plugin Hooks Reference

### onInit Hook

Called when the agent initializes. Use for setup, resource allocation, and configuration.

```typescript
async onInit(context: AgentContext): Promise<void> {
  // Setup database connections
  this.db = await connectToDatabase(context.config.databaseUrl)
  
  // Initialize caches
  this.cache = new Map()
  
  // Load configuration
  this.config = await loadConfig(context.agentId)
  
  console.log(`Plugin ${this.name} initialized for agent ${context.agentId}`)
}
```

**Best Practices:**
- Keep initialization fast (< 1 second)
- Handle initialization errors gracefully
- Store references to resources for cleanup
- Validate configuration early

### onSend Hook

Called for every outgoing message. Use to modify, analyze, or log messages.

```typescript
async onSend(payload: SendPayload, context: AgentContext): Promise<SendPayload> {
  // Log message for analytics
  await this.logMessage(payload.message, context.agentId)
  
  // Add routing information
  const routing = await this.determineRouting(payload.message)
  
  // Modify payload
  return {
    ...payload,
    metadata: {
      ...payload.metadata,
      routing,
      processedBy: this.name,
      timestamp: Date.now()
    }
  }
}
```

**Best Practices:**
- Always return a valid SendPayload
- Don't mutate the original payload directly
- Keep processing time under 100ms
- Handle errors without breaking the message flow

### onError Hook

Called when errors occur in the agent or other plugins. Use for logging, recovery, or notifications.

```typescript
async onError(error: Error, context: AgentContext): Promise<void> {
  // Log error with context
  console.error(`Error in agent ${context.agentId}:`, error)
  
  // Send to error tracking service
  await this.errorTracker.report({
    error: error.message,
    stack: error.stack,
    agentId: context.agentId,
    timestamp: Date.now()
  })
  
  // Attempt recovery if possible
  if (error.name === 'NetworkError') {
    await this.attemptReconnection()
  }
}
```

**Best Practices:**
- Never throw errors from onError
- Log errors with sufficient context
- Implement retry logic for recoverable errors
- Notify monitoring systems

### onShutdown Hook

Called when the agent shuts down. Use for cleanup, saving state, and resource deallocation.

```typescript
async onShutdown(context: AgentContext): Promise<void> {
  // Save current state
  await this.saveState(context.agentId)
  
  // Close connections
  if (this.db) {
    await this.db.close()
  }
  
  // Clear caches
  this.cache.clear()
  
  // Cancel ongoing operations
  this.abortController.abort()
  
  console.log(`Plugin ${this.name} shutdown complete`)
}
```

**Best Practices:**
- Clean up all resources
- Save important state before shutdown
- Cancel ongoing operations
- Handle shutdown timeouts gracefully

## Advanced Plugin Features

### TypeScript Integration

```typescript
// types.ts - Custom plugin types
export interface AnalysisResult {
  sentiment: 'positive' | 'negative' | 'neutral'
  confidence: number
  keywords: string[]
  topics: string[]
}

export interface PluginState {
  totalMessages: number
  lastAnalysis: AnalysisResult | null
  cache: Map<string, AnalysisResult>
}

// plugin.ts - Strongly typed plugin
import type { AgentKitPlugin } from '@agentkit/types'
import type { AnalysisResult, PluginState } from './types'

class AdvancedAnalyzerPlugin implements AgentKitPlugin {
  name = 'advanced-analyzer'
  version = '2.0.0'
  
  private state: PluginState = {
    totalMessages: 0,
    lastAnalysis: null,
    cache: new Map()
  }
  
  async onInit(context: AgentContext): Promise<void> {
    // Typed initialization
  }
  
  async onSend(payload: SendPayload, context: AgentContext): Promise<SendPayload> {
    const analysis = await this.analyzeMessage(payload.message)
    this.state.lastAnalysis = analysis
    this.state.totalMessages++
    
    return {
      ...payload,
      metadata: {
        ...payload.metadata,
        analysis,
        messageCount: this.state.totalMessages
      }
    }
  }
  
  private async analyzeMessage(message: string | undefined): Promise<AnalysisResult> {
    if (!message) {
      return {
        sentiment: 'neutral',
        confidence: 0,
        keywords: [],
        topics: []
      }
    }
    
    // Check cache first
    if (this.state.cache.has(message)) {
      return this.state.cache.get(message)!
    }
    
    // Perform analysis
    const result: AnalysisResult = {
      sentiment: this.detectSentiment(message),
      confidence: this.calculateConfidence(message),
      keywords: this.extractKeywords(message),
      topics: this.identifyTopics(message)
    }
    
    // Cache result
    this.state.cache.set(message, result)
    
    return result
  }
  
  // Analysis methods...
  private detectSentiment(message: string): 'positive' | 'negative' | 'neutral' {
    // Implementation
    return 'neutral'
  }
  
  private calculateConfidence(message: string): number {
    return Math.random() // Placeholder
  }
  
  private extractKeywords(message: string): string[] {
    return message.toLowerCase().split(' ').filter(word => word.length > 3)
  }
  
  private identifyTopics(message: string): string[] {
    // Topic modeling implementation
    return []
  }
}

export default new AdvancedAnalyzerPlugin()
```

### Async Operations and State Management

```typescript
import type { AgentKitPlugin } from '@agentkit/types'

class StatefulPlugin implements AgentKitPlugin {
  name = 'stateful-plugin'
  version = '1.0.0'
  
  private abortController = new AbortController()
  private state = new Map<string, any>()
  private workers = new Set<Promise<any>>()
  
  async onInit(context: AgentContext): Promise<void> {
    // Start background workers
    const worker = this.startBackgroundWorker()
    this.workers.add(worker)
    
    // Handle worker completion
    worker.finally(() => this.workers.delete(worker))
  }
  
  async onSend(payload: SendPayload, context: AgentContext): Promise<SendPayload> {
    // Start async operation without blocking
    const operation = this.processAsync(payload.message, context)
    this.workers.add(operation)
    
    // Return immediately with tracking ID
    const trackingId = this.generateTrackingId()
    
    // Handle completion
    operation.then(result => {
      this.state.set(trackingId, result)
    }).catch(error => {
      console.error('Async operation failed:', error)
    }).finally(() => {
      this.workers.delete(operation)
    })
    
    return {
      ...payload,
      metadata: {
        ...payload.metadata,
        trackingId,
        status: 'processing'
      }
    }
  }
  
  async onShutdown(context: AgentContext): Promise<void> {
    // Cancel all operations
    this.abortController.abort()
    
    // Wait for workers to complete (with timeout)
    if (this.workers.size > 0) {
      const timeout = new Promise(resolve => setTimeout(resolve, 5000))
      const allWorkers = Promise.all(Array.from(this.workers))
      
      await Promise.race([allWorkers, timeout])
    }
    
    // Clear state
    this.state.clear()
  }
  
  private async startBackgroundWorker(): Promise<void> {
    const { signal } = this.abortController
    
    while (!signal.aborted) {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.performBackgroundTask()
      } catch (error) {
        if (!signal.aborted) {
          console.error('Background worker error:', error)
        }
      }
    }
  }
  
  private async processAsync(message: string | undefined, context: AgentContext): Promise<any> {
    // Simulate async processing
    await new Promise(resolve => setTimeout(resolve, 2000))
    return { processed: true, length: message?.length || 0 }
  }
  
  private async performBackgroundTask(): Promise<void> {
    // Background processing
  }
  
  private generateTrackingId(): string {
    return `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

export default new StatefulPlugin()
```

### Error Handling and Recovery

```typescript
import { AgentKitError } from '@agentkit/types'

class ResilientPlugin implements AgentKitPlugin {
  name = 'resilient-plugin'
  version = '1.0.0'
  
  private retryCount = new Map<string, number>()
  private circuitBreaker = {
    failures: 0,
    lastFailure: 0,
    isOpen: false
  }
  
  async onSend(payload: SendPayload, context: AgentContext): Promise<SendPayload> {
    try {
      // Check circuit breaker
      if (this.isCircuitOpen()) {
        throw new AgentKitError('Circuit breaker is open', 'CIRCUIT_OPEN')
      }
      
      const result = await this.processWithRetry(payload, context)
      
      // Reset circuit breaker on success
      this.circuitBreaker.failures = 0
      this.circuitBreaker.isOpen = false
      
      return result
      
    } catch (error) {
      // Handle different error types
      if (error instanceof AgentKitError) {
        await this.handleAgentKitError(error, context)
      } else {
        await this.handleGenericError(error as Error, context)
      }
      
      // Update circuit breaker
      this.circuitBreaker.failures++
      this.circuitBreaker.lastFailure = Date.now()
      
      if (this.circuitBreaker.failures >= 5) {
        this.circuitBreaker.isOpen = true
        console.warn('Circuit breaker opened due to repeated failures')
      }
      
      // Return fallback response
      return this.getFallbackResponse(payload)
    }
  }
  
  private async processWithRetry(payload: SendPayload, context: AgentContext): Promise<SendPayload> {
    const maxRetries = 3
    const trackingId = this.getTrackingId(payload)
    let attempt = this.retryCount.get(trackingId) || 0
    
    while (attempt < maxRetries) {
      try {
        return await this.processMessage(payload, context)
      } catch (error) {
        attempt++
        this.retryCount.set(trackingId, attempt)
        
        if (attempt >= maxRetries) {
          throw error
        }
        
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    
    throw new Error('Max retries exceeded')
  }
  
  private async processMessage(payload: SendPayload, context: AgentContext): Promise<SendPayload> {
    // Actual message processing logic
    if (Math.random() < 0.1) { // 10% failure rate for testing
      throw new Error('Random processing failure')
    }
    
    return {
      ...payload,
      metadata: {
        ...payload.metadata,
        processed: true,
        processingTime: Date.now()
      }
    }
  }
  
  private isCircuitOpen(): boolean {
    if (!this.circuitBreaker.isOpen) return false
    
    // Reset circuit breaker after 30 seconds
    if (Date.now() - this.circuitBreaker.lastFailure > 30000) {
      this.circuitBreaker.isOpen = false
      this.circuitBreaker.failures = 0
      return false
    }
    
    return true
  }
  
  private async handleAgentKitError(error: AgentKitError, context: AgentContext): Promise<void> {
    console.error(`AgentKit error in ${context.agentId}:`, error.code, error.message)
    // Send to error tracking
  }
  
  private async handleGenericError(error: Error, context: AgentContext): Promise<void> {
    console.error(`Generic error in ${context.agentId}:`, error.message)
    // Send to error tracking
  }
  
  private getFallbackResponse(payload: SendPayload): SendPayload {
    return {
      ...payload,
      metadata: {
        ...payload.metadata,
        fallback: true,
        error: 'Processing failed, using fallback'
      }
    }
  }
  
  private getTrackingId(payload: SendPayload): string {
    return payload.metadata?.trackingId as string || 'default'
  }
}

export default new ResilientPlugin()
```

## Security and Sandboxing

### Browser-Safe Plugins

```typescript
// browser-safe-plugin.ts
import type { AgentKitPlugin } from '@agentkit/types'

// Mark plugin as browser-safe in package.json
// "agentkit": { "browserSafe": true }

const browserSafePlugin: AgentKitPlugin = {
  name: 'browser-safe-plugin',
  version: '1.0.0',
  
  async onInit(context: AgentContext): Promise<void> {
    // Only use Web Worker compatible APIs
    console.log('Initializing in sandbox environment')
    
    // ❌ Don't use: require, fs, process, etc.
    // ✅ Use: console, JSON, Math, Date, etc.
  },
  
  async onSend(payload: SendPayload, context: AgentContext): Promise<SendPayload> {
    // Pure computation - no side effects
    const processed = this.processData(payload.message)
    
    return {
      ...payload,
      metadata: {
        ...payload.metadata,
        processed,
        sandboxed: true
      }
    }
  },
  
  private processData(message: string | undefined): any {
    if (!message) return null
    
    // Use only safe APIs
    return {
      length: message.length,
      upperCase: message.toUpperCase(),
      wordCount: message.split(' ').length,
      timestamp: Date.now()
    }
  }
}

export default browserSafePlugin
```

### Plugin Signing and Verification

```bash
# Sign plugin for security
agentkit sign-plugin my-plugin.ts

# Verify signature
agentkit verify-plugin my-plugin.ts
```

```typescript
// In your plugin
import { verifyPluginSignature } from '@agentkit/sdk'

// Verify before loading
const isValid = await verifyPluginSignature('./my-plugin.ts')
if (!isValid) {
  throw new Error('Plugin signature verification failed')
}
```

## Testing Plugins

### Unit Testing

```typescript
// plugin.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import myPlugin from '../index'
import type { AgentContext, SendPayload } from '@agentkit/types'

describe('MyAnalyzerPlugin', () => {
  let context: AgentContext
  
  beforeEach(() => {
    context = {
      agentId: 'test-agent',
      transportId: 'test-transport',
      scope: ['test'],
      config: {}
    }
  })
  
  it('should initialize correctly', async () => {
    await expect(myPlugin.onInit(context)).resolves.not.toThrow()
  })
  
  it('should analyze message sentiment', async () => {
    const payload: SendPayload = {
      message: 'This is a great day!',
      metadata: {}
    }
    
    const result = await myPlugin.onSend(payload, context)
    
    expect(result.metadata?.analysis).toBeDefined()
    expect(result.metadata.analysis.sentiment).toBe('positive')
    expect(result.metadata.analysis.wordCount).toBe(5)
  })
  
  it('should handle empty messages', async () => {
    const payload: SendPayload = {
      message: undefined,
      metadata: {}
    }
    
    const result = await myPlugin.onSend(payload, context)
    
    expect(result.metadata?.analysis?.sentiment).toBe('neutral')
    expect(result.metadata?.analysis?.wordCount).toBe(0)
  })
  
  it('should shutdown cleanly', async () => {
    await myPlugin.onInit(context)
    await expect(myPlugin.onShutdown(context)).resolves.not.toThrow()
  })
})
```

### Integration Testing

```typescript
// plugin.integration.test.ts
import { describe, it, expect } from 'vitest'
import { connectAgent, AgentRegistry, PluginManager } from '@agentkit/sdk'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'
import myPlugin from '../index'

describe('MyAnalyzerPlugin Integration', () => {
  it('should work with AgentKit SDK', async () => {
    // Setup
    AgentRegistry.register({
      id: 'test-agent',
      name: 'Test Agent',
      version: '1.0.0',
      factory: () => new DummyAgent()
    })
    
    AgentRegistry.registerTransport(new DummyTransport())
    
    const pluginManager = new PluginManager()
    pluginManager.register(myPlugin)
    
    // Connect with plugin
    const handle = await connectAgent({
      agent: 'test-agent',
      transport: 'dummy',
      pluginManager,
      onOutput: (message) => {
        expect(message.metadata?.analysis).toBeDefined()
      }
    })
    
    // Test message processing
    await handle.send({ message: 'Integration test message' })
    
    // Cleanup
    await handle.shutdown()
  })
})
```

### Browser Testing

```typescript
// plugin.browser.test.ts (using Playwright)
import { test, expect } from '@playwright/test'

test('plugin works in browser environment', async ({ page }) => {
  // Setup browser environment
  await page.goto('http://localhost:3000/test')
  
  // Load plugin in Web Worker
  const result = await page.evaluate(async () => {
    const worker = new Worker('/plugin-worker.js')
    
    return new Promise((resolve) => {
      worker.postMessage({
        type: 'load-plugin',
        plugin: 'my-analyzer'
      })
      
      worker.onmessage = (event) => {
        if (event.data.type === 'plugin-loaded') {
          worker.postMessage({
            type: 'execute-hook',
            hook: 'onSend',
            payload: {
              message: 'Browser test message',
              metadata: {}
            }
          })
        }
        
        if (event.data.type === 'hook-result') {
          resolve(event.data.result)
        }
      }
    })
  })
  
  expect(result.metadata.analysis).toBeDefined()
})
```

## Development Workflow

### Hot Reload Development

```typescript
// Enable hot reload in development
import { HotReloadManager } from '@agentkit/sdk'

if (process.env.NODE_ENV === 'development') {
  const hotReload = new HotReloadManager({
    enabled: true,
    onReload: (filePath, pluginName) => {
      console.log(`🔄 Reloaded ${pluginName}`)
    }
  })
  
  hotReload.registerPlugin('my-analyzer', './plugins/my-analyzer/index.ts')
}
```

### Performance Monitoring

```typescript
// Wrap plugin for development
import { createPluginDevelopmentWrapper } from '@agentkit/sdk'

const wrapped = createPluginDevelopmentWrapper('my-analyzer', myPlugin, {
  enablePerformanceMonitoring: true,
  enableMemoryTracking: true,
  performanceThreshold: 100 // Warn if > 100ms
})

// Use wrapped plugin in development
const developmentPlugin = wrapped.getWrappedPlugin()
```

### Debugging Tools

```typescript
// Enable debug mode
const pluginManager = new PluginManager({
  debug: true,
  observabilityHooks: {
    onPluginStart: (name, hook) => console.log(`🚀 ${name}.${hook}`),
    onPluginSuccess: (name, hook, duration) => console.log(`✅ ${name}.${hook} (${duration}ms)`),
    onPluginError: (name, hook, error) => console.log(`❌ ${name}.${hook}:`, error)
  }
})
```

## Production Deployment

### Plugin Optimization

```typescript
// production-plugin.ts
const productionPlugin: AgentKitPlugin = {
  name: 'production-plugin',
  version: '1.0.0',
  
  async onInit(context: AgentContext): Promise<void> {
    // Initialize with production settings
    if (process.env.NODE_ENV === 'production') {
      // Disable debug logging
      // Use production databases
      // Set conservative timeouts
    }
  },
  
  async onSend(payload: SendPayload, context: AgentContext): Promise<SendPayload> {
    try {
      return await this.processMessage(payload, context)
    } catch (error) {
      // Log error but don't break message flow
      console.error('Plugin error:', error)
      return payload // Return original payload
    }
  }
}
```

### Monitoring and Metrics

```typescript
// Add production monitoring
const pluginManager = new PluginManager({
  debug: false, // Disable debug in production
  observabilityHooks: {
    onPluginError: (name, hook, error, duration) => {
      // Send to error tracking
      errorTracker.report({
        plugin: name,
        hook,
        error: error.message,
        duration
      })
    }
  }
})
```

### Security Best Practices

1. **Always sign plugins** before deployment
2. **Use browser-safe mode** when possible
3. **Validate inputs** in plugin hooks
4. **Handle secrets securely** - use environment variables
5. **Monitor plugin performance** in production
6. **Implement proper error handling** to prevent crashes

## Plugin Registry and Distribution

### Plugin Metadata

```json
// plugin.json
{
  "name": "my-analyzer",
  "version": "1.0.0",
  "description": "Message analysis plugin",
  "author": "Your Name",
  "license": "MIT",
  "keywords": ["analysis", "sentiment", "nlp"],
  "agentkit": {
    "version": "^0.1.0",
    "browserSafe": true,
    "hooks": ["onInit", "onSend", "onShutdown"],
    "dependencies": [],
    "permissions": ["network"],
    "resources": {
      "memory": "64MB",
      "cpu": "low"
    }
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/username/my-analyzer-plugin"
  }
}
```

### Publishing

```bash
# Build plugin
npm run build

# Run tests
npm test

# Sign plugin
agentkit sign-plugin dist/index.js

# Publish (coming soon)
agentkit publish-plugin my-analyzer
```

---

**AgentKit Plugin Development Guide** - Build secure, performant plugins for the AgentKit ecosystem.