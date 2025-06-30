# AgentKit SDK - Developer Guide

**Version:** 0.1.0-alpha  
**License:** MIT

A comprehensive developer guide to using the AgentKit SDK - a modular, secure, agent-agnostic TypeScript framework for managing AI agents inside host applications.

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Installation & Setup](#installation--setup)
4. [Use Cases & Patterns](#use-cases--patterns)
5. [API Reference](#api-reference)
6. [Plugin System](#plugin-system)
7. [Production Features](#production-features)
8. [Testing & Development](#testing--development)
9. [Examples & Recipes](#examples--recipes)
10. [Troubleshooting](#troubleshooting)

## Overview

### What is AgentKit SDK?

AgentKit SDK is a TypeScript framework that abstracts the complexity of AI agent lifecycle management, transport protocols, and type safety while maintaining full flexibility for different agent implementations. It provides a foundational layer for integrating AI agents into applications with production-grade features like circuit breakers, backpressure management, and secure plugin execution.

### Key Design Principles

1. **Separation of Concerns** - Each package has a single, well-defined responsibility
2. **Agent Agnosticism** - No assumptions about specific AI providers or implementations  
3. **Developer Experience** - Simple APIs with comprehensive type safety and debugging

### Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Application   │    │   AgentKit SDK   │    │   AI Agents     │
│                 │    │                  │    │                 │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │Your Business│ │───▶│ │ Agent        │ │───▶│ │ OpenAI      │ │
│ │Logic        │ │    │ │ Management   │ │    │ │ Anthropic   │ │
│ └─────────────┘ │    │ └──────────────┘ │    │ │ Custom LLMs │ │
│                 │    │        │         │    │ └─────────────┘ │
│ ┌─────────────┐ │    │        ▼         │    │                 │
│ │Transport    │ │◀───│ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │Layer        │ │    │ │ Transport    │ │    │ │ Transport   │ │
│ └─────────────┘ │    │ │ Abstraction  │ │    │ │ Adapters    │ │
└─────────────────┘    │ └──────────────┘ │    │ └─────────────┘ │
                       │                  │    └─────────────────┘
                       │ ┌──────────────┐ │
                       │ │ Observability│ │
                       │ │ & Security   │ │
                       │ └──────────────┘ │
                       └──────────────────┘
```

### Package Structure

```
agentkit-sdk/
├── packages/
│   ├── sdk/                 # Core SDK functionality
│   ├── types/               # Shared TypeScript interfaces
│   ├── registry/            # Agent and transport registration
│   ├── cli/                 # Command-line tools for development
│   ├── test-agent/          # Testing utilities and dummy agents
│   ├── transports-dummy/    # Local development transport
│   ├── runtime-web/         # Browser-specific implementations
│   └── errors/              # Structured error handling
```

## Core Concepts

### Agents

An **Agent** represents an AI service that can process inputs and return outputs. Agents follow a strict lifecycle:

```typescript
interface Agent {
  id: string
  name: string
  version: string
  init: (config?: AgentConfig) => Promise<void>
  handle: (input: AgentInput) => Promise<AgentOutput>
  shutdown: () => Promise<void>
}
```

**Lifecycle phases:**
1. **Registration** - Agent metadata is registered in the registry
2. **Connection** - Agent is resolved and initialized
3. **Operation** - Agent processes inputs and returns outputs
4. **Shutdown** - Agent performs cleanup and resource deallocation

### Transports

A **Transport** handles message passing between your application and agents. This abstraction allows the same agent code to work with different communication mechanisms:

```typescript
interface Transport {
  id: string
  name: string
  init: (config?: TransportConfig) => Promise<void>
  send: (message: TransportMessage) => Promise<void>
  receive: () => Promise<TransportMessage>
  canAcceptMore: () => boolean  // Backpressure indicator
  getStatus?: () => TransportStatus // Health & capacity info
}
```

**Common transport types:**
- **Local/Dummy** - In-memory message passing for development
- **HTTP** - REST API communication
- **WebSocket** - Real-time bidirectional communication
- **Message Queue** - Asynchronous processing via RabbitMQ, SQS, etc.
- **Browser Worker** - Web Worker isolation for browser environments

### Registry

The **Registry** provides dynamic discovery and instantiation of agents and transports:

```typescript
// Register an agent
AgentRegistry.register({
  id: 'my-llm-agent',
  name: 'My LLM Agent',
  version: '1.0.0',
  supportedScopes: ['chat', 'completion', 'analysis'],
  factory: () => new MyLLMAgent()
})

// Register a transport
AgentRegistry.registerTransport(new HttpTransport())

// Connect using IDs
const handle = await connectAgent({
  agent: 'my-llm-agent',
  transport: 'http'
})
```

### Scopes

**Scopes** define capability boundaries for agents. They enable:
- Permission-based access control
- Feature gating
- Billing and usage tracking
- Compatibility validation

```typescript
AgentRegistry.register({
  id: 'restricted-agent',
  supportedScopes: ['read', 'analyze'] // Only supports these operations
})

const handle = await connectAgent({
  agent: 'restricted-agent',
  scope: ['read', 'write'] // Will log scope mismatch warning
})
```

## Installation & Setup

### Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0 (required package manager)

### Installation

```bash
# Install pnpm globally if not already installed
npm install -g pnpm

# Install AgentKit SDK packages
pnpm add @agentkit/sdk @agentkit/types

# For development/testing
pnpm add -D @agentkit/test-agent @agentkit/transports-dummy
```

### Environment Setup

Create a basic configuration:

```typescript
// agent-config.ts
import { connectAgent, AgentRegistry } from '@agentkit/sdk'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'

// Register your agents and transports
export function setupAgentKit() {
  // Register a test agent
  AgentRegistry.register({
    id: 'test-agent',
    name: 'Test Agent',
    version: '1.0.0',
    supportedScopes: ['general'],
    factory: () => new DummyAgent()
  })

  // Register a local transport
  AgentRegistry.registerTransport(new DummyTransport())
}
```

## Use Cases & Patterns

### 1. Basic Agent Connection

**Use Case:** Connect to an agent and send messages

```typescript
import { connectAgent, AgentRegistry } from '@agentkit/sdk'
import { setupAgentKit } from './agent-config'

async function basicUsage() {
  // Setup registry
  setupAgentKit()
  
  // Connect to agent
  const handle = await connectAgent({
    agent: 'test-agent',
    transport: 'dummy',
    scope: ['general'],
    onOutput: (message) => console.log('Response:', message)
  })
  
  // Send messages
  await handle.send({ message: 'Hello, world!' })
  await handle.send({ task: 'analyze', data: [1, 2, 3] })
  
  // Clean shutdown
  await handle.shutdown()
}
```

**When to use:**
- Simple AI agent integration
- Proof of concept development
- Basic request-response patterns

### 2. Debug & Observability

**Use Case:** Monitor agent lifecycle and troubleshoot issues

```typescript
async function debugExample() {
  const handle = await connectAgent({
    agent: 'test-agent',
    transport: 'dummy',
    debug: true, // Enable detailed logging
    
    // Lifecycle hooks
    onInit: (agentId) => console.log(`✅ Agent ${agentId} initialized`),
    onShutdown: (agentId) => console.log(`🛑 Agent ${agentId} shutdown`),
    onError: (error) => console.error('❌ Error:', error.message),
    
    // Advanced observability
    observability: {
      onRequestStart: (metadata) => {
        console.log(`🚀 Request ${metadata.requestId} started`)
      },
      onRequestEnd: (metadata, duration) => {
        console.log(`✅ Request ${metadata.requestId} completed in ${duration}ms`)
      }
    }
  })
  
  await handle.send({ message: 'Debug test' })
  await handle.shutdown()
}
```

**When to use:**
- Development and testing
- Production debugging
- Performance monitoring
- Error investigation

### 3. Production Resilience

**Use Case:** Handle failures, backpressure, and resource limits

```typescript
async function productionExample() {
  const handle = await connectAgent({
    agent: 'production-agent',
    transport: 'http-transport',
    
    // Resource limits
    resourceLimits: {
      maxConcurrentRequests: 10,
      maxQueueSize: 50,
      requestTimeoutMs: 30000,
      maxPayloadSize: 1024 * 1024 // 1MB
    },
    
    // Circuit breaker for fault tolerance
    circuitBreaker: {
      failureThreshold: 5,
      timeout: 60000, // 1 minute
      name: 'production-circuit'
    },
    
    // Feature flags
    features: {
      enableCircuitBreaker: true
    },
    
    // Advanced observability
    observability: {
      onTransportBackpressureDetected: (event) => {
        console.warn(`🚨 Backpressure detected: ${event.transportStatus?.queueSize} items queued`)
      },
      onCircuitBreakerStateChange: (event) => {
        console.log(`⚡ Circuit breaker: ${event.fromState} → ${event.toState}`)
      }
    }
  })
  
  // Send requests with automatic backpressure handling
  const promises = Array.from({ length: 20 }, (_, i) => 
    handle.send({ id: i, message: `Request ${i}` })
      .catch(error => console.error(`Request ${i} failed:`, error.message))
  )
  
  await Promise.allSettled(promises)
  await handle.shutdown()
}
```

**When to use:**
- Production deployments
- High-throughput scenarios
- Unreliable network conditions
- Resource-constrained environments

### 4. Plugin Extension

**Use Case:** Extend functionality with custom plugins

```typescript
import type { AgentKitPlugin } from '@agentkit/types'

// Create a logging plugin
const loggingPlugin: AgentKitPlugin = {
  name: 'request-logger',
  version: '1.0.0',
  description: 'Logs all agent requests and responses',
  
  onInit: async (context) => {
    console.log(`📋 Logger initialized for agent: ${context.agentId}`)
  },
  
  onSend: async (payload, context) => {
    console.log(`📤 [${context.requestId}] Sending:`, payload.input)
  },
  
  onError: async (error, context) => {
    console.error(`❌ [${context.requestId}] Error:`, error.message)
  },
  
  onShutdown: async (context) => {
    console.log(`📋 Logger shutdown for agent: ${context.agentId}`)
  }
}

async function pluginExample() {
  const handle = await connectAgent({
    agent: 'test-agent',
    transport: 'dummy',
    plugins: [loggingPlugin]
  })
  
  await handle.send({ message: 'Plugin test' })
  await handle.shutdown()
}
```

**When to use:**
- Cross-cutting concerns (logging, metrics, security)
- Custom business logic injection
- Third-party integrations
- Development tools and debugging

### 5. Browser Integration

**Use Case:** Run agents in browser with Web Worker isolation

```typescript
// browser-agent.ts
import { connectAgent } from '@agentkit/sdk'
import { BrowserTransport } from '@agentkit/runtime-web'

async function browserExample() {
  // Browser-specific transport with Worker support
  const transport = new BrowserTransport({
    useWorker: true, // Enable Web Worker isolation
    workerTimeout: 30000
  })
  
  const handle = await connectAgent({
    agent: browserAgent,
    transport: transport,
    
    // Browser-specific features
    features: {
      enableCircuitBreaker: false // Disable for client-side
    }
  })
  
  await handle.send({ message: 'Browser test' })
  await handle.shutdown()
}
```

**When to use:**
- Client-side AI applications
- Browser-based development tools
- Isolated plugin execution
- Web Worker sandboxing

### 6. Testing & Mocking

**Use Case:** Test applications that use AgentKit

```typescript
// test-example.test.ts
import { describe, it, expect, vi } from 'vitest'
import { connectAgent, AgentRegistry } from '@agentkit/sdk'
import { createTestAgent } from '@agentkit/test-agent'

describe('AgentKit Integration', () => {
  it('should handle agent responses correctly', async () => {
    // Create mock agent
    const mockAgent = createTestAgent({
      responses: [
        { result: 'success', data: 'test response' }
      ]
    })
    
    // Register test agent
    AgentRegistry.register({
      id: 'test-mock',
      name: 'Test Mock',
      version: '1.0.0',
      factory: () => mockAgent
    })
    
    // Test the integration
    const handle = await connectAgent({
      agent: 'test-mock',
      transport: 'dummy'
    })
    
    const responses: any[] = []
    const outputSpy = vi.fn((output) => responses.push(output))
    
    // Override output handler
    handle.metadata.onOutput = outputSpy
    
    await handle.send({ message: 'test' })
    
    expect(outputSpy).toHaveBeenCalledWith({
      result: 'success',
      data: 'test response'
    })
    
    await handle.shutdown()
  })
})
```

**When to use:**
- Unit testing applications
- Integration testing
- Mocking AI responses
- Performance testing

## API Reference

### Core Functions

#### `connectAgent(options: ConnectAgentOptions): Promise<AgentRuntimeHandle>`

Main entry point for connecting to agents.

**Parameters:**
- `agent`: Agent ID (string) or Agent instance
- `transport`: Transport ID (string) or Transport instance  
- `scope?`: Requested capability scopes
- `debug?`: Enable detailed logging
- `onOutput?`: Callback for agent responses
- `onInit?`, `onShutdown?`, `onError?`: Lifecycle hooks
- `observability?`: Advanced monitoring hooks
- `resourceLimits?`: Concurrency and resource constraints
- `circuitBreaker?`: Fault tolerance configuration
- `plugins?`: Plugin extensions

**Returns:** `AgentRuntimeHandle` with methods:
- `send(input: AgentInput): Promise<void>` - Send data to agent
- `shutdown(): Promise<void>` - Clean shutdown
- `metadata` - Connection metadata and configuration

#### Registry Methods

```typescript
// Agent registration
AgentRegistry.register(metadata: AgentMetadata): void
AgentRegistry.lookup(agentId: string): AgentMetadata
AgentRegistry.listAgents(): string[]

// Transport registration  
AgentRegistry.registerTransport(transport: Transport): void
AgentRegistry.lookupTransport(transportId: string): Transport
AgentRegistry.listTransports(): string[]

// Utility methods
AgentRegistry.clear(): void
```

### Type Definitions

#### Core Interfaces

```typescript
interface Agent {
  id: string
  name: string
  version: string
  init: (config?: AgentConfig) => Promise<void>
  handle: (input: AgentInput) => Promise<AgentOutput>
  shutdown: () => Promise<void>
}

interface Transport {
  id: string
  name: string
  init: (config?: TransportConfig) => Promise<void>
  send: (message: TransportMessage) => Promise<void>
  receive: () => Promise<TransportMessage>
  canAcceptMore: () => boolean
  getStatus?: () => TransportStatus
}

interface AgentMetadata {
  id: string
  name: string
  version: string
  description?: string
  supportedScopes?: string[]
  factory: () => Agent
}
```

#### Configuration Interfaces

```typescript
interface ResourceLimits {
  maxConcurrentRequests?: number
  maxQueueSize?: number
  requestTimeoutMs?: number
  maxPayloadSize?: number
}

interface CircuitBreakerConfig {
  failureThreshold?: number
  timeout?: number
  name?: string
}

interface ObservabilityHooks {
  onRequestStart?: (metadata: RequestMetadata) => void
  onRequestEnd?: (metadata: RequestMetadata, duration: number) => void
  onError?: (error: Error, context: ErrorContext) => void
  onTransportBackpressureDetected?: (event: BackpressureEvent) => void
  onCircuitBreakerStateChange?: (event: CircuitBreakerStateChangeEvent) => void
}
```

## Plugin System

### Plugin Architecture

The AgentKit plugin system provides secure, sandboxed execution of custom logic during agent lifecycle events. Plugins can extend functionality without modifying core SDK code.

#### Plugin Interface

```typescript
interface AgentKitPlugin {
  name: string
  version: string
  description?: string
  compatibility?: PluginCompatibility
  permissions?: PluginPermissions
  
  // Security fields
  signature?: string      // HMAC signature for verification
  publicKey?: string     // Public key for signature verification
  trustPolicy?: 'strict' | 'warn' | 'off'
  
  // Lifecycle hooks
  onInit?(context: AgentContext): void | Promise<void>
  onSend?(payload: SendPayload, context: AgentContext): void | Promise<void>
  onError?(error: Error, context: AgentContext): void | Promise<void>
  onShutdown?(context: AgentContext): void | Promise<void>
}
```

#### Plugin Development

```typescript
// Create a metrics plugin
const metricsPlugin: AgentKitPlugin = {
  name: 'metrics-collector',
  version: '1.0.0',
  description: 'Collects request metrics and performance data',
  
  permissions: {
    network: false,     // No network access required
    filesystem: false,  // No filesystem access required
    system: false      // No system access required
  },
  
  compatibility: {
    minSdkVersion: '0.1.0',
    nodeVersion: '>=18.0.0'
  },
  
  onInit: async (context) => {
    console.log(`📊 Metrics collection started for ${context.agentId}`)
  },
  
  onSend: async (payload, context) => {
    const startTime = Date.now()
    
    // Store timing data
    context.metadata = {
      ...context.metadata,
      requestStartTime: startTime
    }
  },
  
  onError: async (error, context) => {
    // Log error metrics
    console.error(`📊 Error in ${context.agentId}:`, error.message)
  },
  
  onShutdown: async (context) => {
    console.log(`📊 Metrics collection stopped for ${context.agentId}`)
  }
}
```

#### Plugin Security

Plugins support HMAC signature verification for security:

```typescript
import { signPlugin } from '@agentkit/sdk'

// Sign a plugin for distribution
const signedPlugin = await signPlugin(metricsPlugin, {
  secretKey: process.env.PLUGIN_SECRET_KEY,
  algorithm: 'sha256'
})

// Use signed plugin
const handle = await connectAgent({
  agent: 'production-agent',
  transport: 'https-transport',
  plugins: [signedPlugin],
  verify: 'strict' // Reject unsigned plugins
})
```

### CLI Plugin Development

Use the AgentKit CLI to scaffold new plugins:

```bash
# Create a new plugin
pnpm agentkit create-plugin my-plugin

# Sign a plugin for distribution
pnpm agentkit sign-plugin ./my-plugin/plugin.json --secret-key=$SECRET_KEY
```

## Production Features

### Circuit Breaker

Automatic fault tolerance to prevent cascade failures:

```typescript
const handle = await connectAgent({
  agent: 'external-api-agent',
  transport: 'http-transport',
  
  circuitBreaker: {
    failureThreshold: 5,    // Open after 5 failures
    timeout: 60000,         // Stay open for 1 minute
    name: 'external-api'    // Name for logging/metrics
  },
  
  observability: {
    onCircuitBreakerStateChange: (event) => {
      // Log state changes: CLOSED → OPEN → HALF_OPEN → CLOSED
      console.log(`Circuit ${event.circuitName}: ${event.fromState} → ${event.toState}`)
      
      if (event.toState === 'OPEN') {
        // Alert operations team
        sendAlert(`Circuit breaker opened for ${event.circuitName}`)
      }
    }
  }
})
```

### Backpressure Management

Automatic queue management and load balancing:

```typescript
const handle = await connectAgent({
  agent: 'heavy-processing-agent',
  transport: 'queue-transport',
  
  resourceLimits: {
    maxConcurrentRequests: 5,   // Process max 5 requests at once
    maxQueueSize: 20,           // Queue up to 20 requests
    requestTimeoutMs: 30000     // 30 second timeout
  },
  
  observability: {
    onTransportBackpressureDetected: (event) => {
      console.warn(`⚠️ Backpressure: ${event.transportStatus?.queueSize} items queued`)
      
      // Implement adaptive behavior
      if (event.transportStatus?.queueSize > 15) {
        // Switch to degraded service mode
        enableDegradedMode()
      }
    },
    
    onTransportBackpressureResolved: (event) => {
      console.log(`✅ Backpressure resolved in ${event.totalProcessingTime}ms`)
      disableDegradedMode()
    }
  }
})
```

### Memory & Resource Management

Automatic cleanup and leak prevention:

```typescript
// AgentKit automatically manages:
// - Agent lifecycle cleanup
// - Transport connection cleanup  
// - Plugin sandbox cleanup
// - Timer and handle cleanup
// - Promise cleanup and cancellation

const handle = await connectAgent({
  agent: 'memory-intensive-agent',
  transport: 'stream-transport',
  
  resourceLimits: {
    maxPayloadSize: 5 * 1024 * 1024, // 5MB payload limit
    requestTimeoutMs: 120000          // 2 minute timeout
  },
  
  // Cleanup is automatic on shutdown
  onShutdown: (agentId) => {
    console.log(`✅ Cleanup completed for ${agentId}`)
  }
})

// Manual cleanup (automatic on process exit)
process.on('SIGTERM', async () => {
  await handle.shutdown()
})
```

## Testing & Development

### Testing Utilities

AgentKit provides comprehensive testing utilities:

```typescript
import { 
  createTestAgent, 
  createDummyTransport, 
  mockAgentResponse 
} from '@agentkit/test-agent'

// Create predictable test agent
const testAgent = createTestAgent({
  id: 'test-agent',
  responses: [
    { success: true, data: 'First response' },
    { success: true, data: 'Second response' },
    { success: false, error: 'Test error' }
  ],
  delay: 100 // Simulate network delay
})

// Create test transport with custom behavior
const testTransport = createDummyTransport({
  debug: true,
  logMessages: true,
  responseDelay: 50,
  errorRate: 0.1 // 10% error rate for testing
})
```

### Development Workflow

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run tests with coverage
pnpm test -- --coverage

# Run specific package tests
cd packages/sdk
pnpm test

# Validate types
pnpm typecheck

# Lint code
pnpm lint

# Check for circular dependencies
pnpm analyze:deps
```

### Debugging

Enable detailed logging for troubleshooting:

```typescript
const handle = await connectAgent({
  agent: 'problem-agent',
  transport: 'problem-transport',
  debug: true, // Enable SDK debug logs
  
  onError: (error) => {
    // Custom error handling
    console.error('Detailed error:', {
      message: error.message,
      stack: error.stack,
      cause: error.cause
    })
  }
})
```

## Examples & Recipes

### Recipe 1: Retry Logic with Circuit Breaker

```typescript
async function resilientConnection() {
  const handle = await connectAgent({
    agent: 'unreliable-agent',
    transport: 'http-transport',
    
    circuitBreaker: {
      failureThreshold: 3,
      timeout: 30000
    },
    
    observability: {
      onError: async (error, context) => {
        // Implement exponential backoff
        const attempt = context.context?.attempt || 1
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000)
        
        console.log(`Retry attempt ${attempt} after ${delay}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  })
  
  // Automatic retry with circuit breaker protection
  for (let i = 0; i < 5; i++) {
    try {
      await handle.send({ message: `Attempt ${i + 1}` })
      break // Success
    } catch (error) {
      if (i === 4) throw error // Final attempt failed
      // Circuit breaker will handle retry logic
    }
  }
  
  await handle.shutdown()
}
```

### Recipe 2: Multi-Agent Orchestration

```typescript
async function orchestrateAgents() {
  // Connect to multiple specialized agents
  const [nlpAgent, visionAgent, reasoningAgent] = await Promise.all([
    connectAgent({ agent: 'nlp-processor', transport: 'http' }),
    connectAgent({ agent: 'vision-analyzer', transport: 'http' }),
    connectAgent({ agent: 'reasoning-engine', transport: 'http' })
  ])
  
  try {
    // Process input through pipeline
    const input = { text: 'Analyze this image...', image: imageData }
    
    // Step 1: NLP preprocessing
    const nlpResult = await new Promise(resolve => {
      nlpAgent.onOutput = resolve
      nlpAgent.send({ text: input.text, task: 'preprocess' })
    })
    
    // Step 2: Vision analysis
    const visionResult = await new Promise(resolve => {
      visionAgent.onOutput = resolve
      visionAgent.send({ image: input.image, context: nlpResult })
    })
    
    // Step 3: Reasoning synthesis
    const finalResult = await new Promise(resolve => {
      reasoningAgent.onOutput = resolve
      reasoningAgent.send({ 
        nlp: nlpResult, 
        vision: visionResult, 
        task: 'synthesize' 
      })
    })
    
    return finalResult
    
  } finally {
    // Cleanup all agents
    await Promise.all([
      nlpAgent.shutdown(),
      visionAgent.shutdown(),
      reasoningAgent.shutdown()
    ])
  }
}
```

### Recipe 3: Plugin-Based Architecture

```typescript
// Create a modular system with plugins
const auditPlugin: AgentKitPlugin = {
  name: 'audit-logger',
  version: '1.0.0',
  
  onSend: async (payload, context) => {
    // Log all requests for compliance
    await auditLog.record({
      timestamp: new Date(),
      agentId: context.agentId,
      requestId: context.requestId,
      payload: sanitizeForAudit(payload.input)
    })
  }
}

const securityPlugin: AgentKitPlugin = {
  name: 'security-scanner',
  version: '1.0.0',
  
  onSend: async (payload, context) => {
    // Scan for sensitive data
    const violations = await scanForPII(payload.input)
    if (violations.length > 0) {
      throw new SecurityError(`PII detected: ${violations.join(', ')}`)
    }
  }
}

async function secureAgentConnection() {
  const handle = await connectAgent({
    agent: 'production-agent',
    transport: 'encrypted-transport',
    plugins: [auditPlugin, securityPlugin],
    verify: 'strict' // Only allow signed plugins
  })
  
  // All requests automatically audited and security-scanned
  await handle.send({ message: 'Process this safely' })
  await handle.shutdown()
}
```

## Troubleshooting

### Common Issues

#### Agent Not Found
```
AgentNotFoundError: Agent 'my-agent' not found
```
**Solution:** Ensure the agent is registered before connecting
```typescript
AgentRegistry.register({
  id: 'my-agent',
  // ... metadata
})
```

#### Transport Connection Failed
```
TransportNotFoundError: Transport 'http' not found
```
**Solution:** Register the transport or check transport ID
```typescript
AgentRegistry.registerTransport(new HttpTransport())
```

#### Circuit Breaker Open
```
CircuitBreakerError: Circuit breaker 'my-circuit' is OPEN
```
**Solution:** Wait for timeout or investigate underlying failures
```typescript
// Check circuit breaker state
observability: {
  onCircuitBreakerStateChange: (event) => {
    if (event.toState === 'HALF_OPEN') {
      console.log('Circuit breaker testing recovery...')
    }
  }
}
```

#### Backpressure Queue Full
```
BackpressureError: Queue is full (50/50 items)
```
**Solution:** Increase queue size or implement flow control
```typescript
resourceLimits: {
  maxQueueSize: 100, // Increase queue size
  maxConcurrentRequests: 10 // Increase throughput
}
```

#### Plugin Verification Failed
```
PluginVerificationError: Plugin signature invalid
```
**Solution:** Use properly signed plugins or adjust verification mode
```typescript
connectAgent({
  // ...
  verify: 'warn' // or 'off' for development
})
```

### Debug Techniques

#### Enable Debug Logging
```typescript
const handle = await connectAgent({
  debug: true, // Enables detailed SDK logging
  // ...
})
```

#### Monitor Active Handles
```typescript
// Check for resource leaks
console.log('Active handles:', process._getActiveHandles().length)
console.log('Active requests:', process._getActiveRequests().length)
```

#### Trace Request Flow
```typescript
observability: {
  onRequestStart: (metadata) => {
    console.log(`🚀 [${metadata.requestId}] ${metadata.operation} started`)
  },
  onRequestEnd: (metadata, duration) => {
    console.log(`✅ [${metadata.requestId}] completed in ${duration}ms`)
  }
}
```

### Performance Optimization

#### Optimize Resource Limits
```typescript
resourceLimits: {
  maxConcurrentRequests: Math.min(10, os.cpus().length * 2),
  maxQueueSize: 50,
  requestTimeoutMs: 30000
}
```

#### Use Connection Pooling
```typescript
// Reuse agent connections when possible
const connectionPool = new Map()

async function getOrCreateConnection(agentId: string) {
  if (!connectionPool.has(agentId)) {
    const handle = await connectAgent({ agent: agentId, transport: 'pool' })
    connectionPool.set(agentId, handle)
  }
  return connectionPool.get(agentId)
}
```

#### Monitor Memory Usage
```typescript
setInterval(() => {
  const usage = process.memoryUsage()
  console.log('Memory usage:', {
    rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB'
  })
}, 30000)
```

---

## Conclusion

AgentKit SDK provides a comprehensive framework for integrating AI agents into applications with production-grade features. The modular architecture, extensive type safety, and powerful plugin system make it suitable for everything from simple prototypes to large-scale production deployments.

For additional resources:
- [GitHub Repository](https://github.com/your-org/agentkit-sdk)
- [API Documentation](./API.md)
- [Plugin Development Guide](./PLUGIN_DEVELOPMENT.md)
- [Examples Repository](./examples/)

**Version:** 0.1.0-alpha | **License:** MIT | **Built for reliable AI agent integration**