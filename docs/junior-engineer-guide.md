# AgentKit SDK: Junior Engineer's Complete Guide

> **🎯 Goal**: Get you from zero to building production-ready AI agents in 30 minutes

This guide is specifically designed for junior engineers who want to understand and use the AgentKit SDK effectively. We'll build your understanding step by step, with practical examples and real-world scenarios.

## Table of Contents

1. [What is AgentKit SDK?](#what-is-agentkit-sdk)
2. [Core Concepts](#core-concepts)
3. [Your First Agent (5-minute tutorial)](#your-first-agent)
4. [Understanding the Architecture](#understanding-the-architecture)
5. [Common Patterns & Best Practices](#common-patterns--best-practices)
6. [Building Real Applications](#building-real-applications)
7. [Debugging & Troubleshooting](#debugging--troubleshooting)
8. [Plugin Development](#plugin-development)
9. [Production Deployment](#production-deployment)
10. [Common Mistakes & Solutions](#common-mistakes--solutions)

---

## What is AgentKit SDK?

**AgentKit SDK** is like a "React for AI Agents" - it gives you the building blocks to integrate AI agents into your applications without dealing with the complex plumbing.

### The Problem It Solves

Before AgentKit, integrating AI agents into applications meant:
- ❌ Writing complex agent lifecycle management
- ❌ Handling transport protocols manually  
- ❌ Managing state and error handling
- ❌ No type safety or debugging tools
- ❌ Reinventing the wheel for each project

### What AgentKit Provides

With AgentKit, you get:
- ✅ **Simple API**: `connectAgent()` is all you need to get started
- ✅ **Type Safety**: Full TypeScript support with runtime validation
- ✅ **Plugin System**: Extend functionality with plugins
- ✅ **Built-in Observability**: Debug tools and metrics out of the box
- ✅ **Production Ready**: Circuit breakers, backpressure, error handling
- ✅ **Agent Agnostic**: Works with any AI agent implementation

### Think of it Like This

```typescript
// Instead of managing this complexity:
const agent = new MyAgent()
await agent.init(config)
const transport = new Transport()
await transport.connect()
// ... handle errors, lifecycle, state management, etc.

// You just do this:
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'websocket',
  onOutput: (message) => console.log(message)
})
```

---

## Core Concepts

Let's understand the fundamental concepts that make AgentKit work.

### 🤖 Agents

An **Agent** is anything that can process input and return output. Think of it as a function that:
- Takes some input (text, data, commands)
- Processes it (using AI, rules, calculations)  
- Returns output (responses, results, actions)

```typescript
interface Agent {
  id: string           // Unique identifier
  name: string         // Human-readable name
  version: string      // Version for compatibility
  
  // Lifecycle methods
  init(config?): Promise<void>      // Setup/initialize
  handle(input): Promise<output>    // Process input
  shutdown(): Promise<void>         // Cleanup
}
```

**Examples of Agents:**
- ChatGPT wrapper that answers questions
- Image processing agent that analyzes photos
- Data analysis agent that generates reports
- Code generation agent that writes functions

### 🚛 Transports

A **Transport** handles how messages get to/from agents. It's like the "delivery system" for your data.

```typescript
interface Transport {
  id: string
  name: string
  
  // Core methods
  init(config?): Promise<void>
  send(message): Promise<void>     // Send to agent
  receive(): Promise<message>      // Get response
  
  // Health & capacity
  canAcceptMore(): boolean         // Backpressure check
}
```

**Examples of Transports:**
- `DummyTransport`: In-memory for testing/development
- `WebSocketTransport`: Real-time bidirectional communication
- `HTTPTransport`: Request/response over HTTP
- `QueueTransport`: Async processing via message queues

### 🎯 Scopes

**Scopes** define what capabilities you want from an agent. They're like "permissions" or "feature sets".

```typescript
// Register an agent with supported scopes
AgentRegistry.register({
  id: 'gpt-agent',
  name: 'GPT Agent',
  supportedScopes: ['chat', 'analysis', 'translation']
})

// Connect with specific scopes
const handle = await connectAgent({
  agent: 'gpt-agent',
  transport: 'websocket',
  scope: ['chat', 'analysis']  // Only use these capabilities
})
```

**Why Scopes Matter:**
- **Security**: Limit what agents can do
- **Performance**: Only load needed capabilities
- **Billing**: Pay only for used features
- **Compatibility**: Ensure agent supports your needs

### 🔌 Plugins

**Plugins** add functionality to the agent lifecycle without modifying core code.

```typescript
const loggingPlugin = {
  name: 'request-logger',
  version: '1.0.0',
  onSend: (payload, context) => {
    console.log(`[${context.agentId}] Sending:`, payload.input)
  }
}

const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  plugins: [loggingPlugin]
})
```

**Common Plugin Use Cases:**
- Logging and metrics collection
- Input/output transformation
- Authentication and security
- Caching and performance optimization
- Integration with external systems

---

## Your First Agent

Let's build your first working agent in 5 minutes! We'll create a simple calculator agent.

### Step 1: Install Dependencies

```bash
npm install @agentkit/sdk @agentkit/test-agent @agentkit/transports-dummy
```

### Step 2: Create Your Agent

```typescript
// calculator-agent.ts
import { Agent, AgentInput, AgentOutput } from '@agentkit/types'

export class CalculatorAgent implements Agent {
  id = 'calculator'
  name = 'Calculator Agent'
  version = '1.0.0'
  
  private initialized = false

  async init(): Promise<void> {
    console.log('🧮 Calculator Agent starting up...')
    this.initialized = true
  }

  async handle(input: AgentInput): Promise<AgentOutput> {
    if (!this.initialized) {
      throw new Error('Agent not initialized')
    }

    // Parse the math expression
    const { expression } = input as { expression: string }
    
    try {
      // Simple calculator (in production, use a safe math parser!)
      const result = eval(expression)
      
      return {
        result,
        expression,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      return {
        error: 'Invalid expression',
        expression,
        timestamp: new Date().toISOString()
      }
    }
  }

  async shutdown(): Promise<void> {
    console.log('🧮 Calculator Agent shutting down...')
    this.initialized = false
  }
}
```

### Step 3: Use Your Agent

```typescript
// main.ts
import { connectAgent, AgentRegistry } from '@agentkit/sdk'
import { DummyTransport } from '@agentkit/transports-dummy'
import { CalculatorAgent } from './calculator-agent'

async function main() {
  // 1. Register your agent
  AgentRegistry.register({
    id: 'calculator',
    name: 'Calculator Agent',
    version: '1.0.0',
    factory: () => new CalculatorAgent()
  })

  // 2. Register a transport
  AgentRegistry.registerTransport(new DummyTransport())

  // 3. Connect to your agent
  const handle = await connectAgent({
    agent: 'calculator',
    transport: 'dummy',
    onOutput: (result) => {
      console.log('📊 Result:', result)
    }
  })

  // 4. Send some calculations
  await handle.send({ expression: '2 + 2' })
  await handle.send({ expression: '10 * 5' })
  await handle.send({ expression: '100 / 4' })

  // 5. Clean shutdown
  await handle.shutdown()
  console.log('✅ Done!')
}

main().catch(console.error)
```

### Step 4: Run It

```bash
npx tsx main.ts
```

**Expected Output:**
```
🧮 Calculator Agent starting up...
📊 Result: { result: 4, expression: '2 + 2', timestamp: '2024-01-15T10:30:00.000Z' }
📊 Result: { result: 50, expression: '10 * 5', timestamp: '2024-01-15T10:30:00.001Z' }
📊 Result: { result: 25, expression: '100 / 4', timestamp: '2024-01-15T10:30:00.002Z' }
🧮 Calculator Agent shutting down...
✅ Done!
```

🎉 **Congratulations!** You just built and ran your first AgentKit agent!

---

## Understanding the Architecture

Now that you've seen it work, let's understand what's happening under the hood.

### The AgentKit Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        AgentKit SDK                             │
├─────────────────────────────────────────────────────────────────┤
│  1. connectAgent()  →  2. AgentManager  →  3. Runtime Handle    │
│                           ↓                      ↑              │
│                    4. Agent Lifecycle    5. Send/Receive        │
│                           ↓                      ↑              │
│                    6. Plugin System      7. Observability       │
└─────────────────────────────────────────────────────────────────┘
           ↓                                        ↑
    ┌─────────────┐                        ┌──────────────┐
    │    Agent    │ ←─────── Transport ────→│ Your App     │
    │ (Processing)│                        │ (Input/Output)│
    └─────────────┘                        └──────────────┘
```

### Key Components Explained

#### 1. **connectAgent()** - The Entry Point
- **What**: Single function that sets up everything
- **Why**: Hides complexity, provides simple API
- **Returns**: Runtime handle for sending messages

#### 2. **AgentManager** - The Orchestrator  
- **What**: Coordinates agent lifecycle, plugins, observability
- **Why**: Manages complexity so you don't have to
- **Handles**: Initialization, error recovery, cleanup

#### 3. **Agent Registry** - The Phone Book
- **What**: Maps agent IDs to actual agent instances
- **Why**: Enables dynamic agent loading and management
- **Pattern**: Factory pattern for creating agents

```typescript
// Registry internally looks like:
{
  'calculator': { factory: () => new CalculatorAgent() },
  'chat-agent': { factory: () => new ChatAgent() },
  'image-analyzer': { factory: () => new ImageAgent() }
}
```

#### 4. **Runtime Handle** - Your Interface
- **What**: Object you use to interact with the agent
- **Methods**: 
  - `send(input)` - Send data to agent
  - `shutdown()` - Clean shutdown
  - `metadata` - Agent information

### State Management

AgentKit manages state transitions automatically:

```
IDLE → INITIALIZING → ACTIVE → SHUTTING_DOWN → TERMINATED
  ↑         ↓           ↓            ↓           ↓
Register  init()    handle()    shutdown()   cleanup
```

**Why This Matters:**
- **Safety**: Prevents operations in wrong states
- **Reliability**: Ensures proper resource cleanup
- **Debugging**: Clear state visibility

---

## Common Patterns & Best Practices

Let's learn the patterns that will make you productive with AgentKit.

### Pattern 1: Input Validation

Always validate your inputs to prevent runtime errors:

```typescript
import { z } from 'zod'

// Define your input schema
const CalculatorInputSchema = z.object({
  expression: z.string().min(1),
  precision: z.number().optional().default(2)
})

export class CalculatorAgent implements Agent {
  async handle(input: AgentInput): Promise<AgentOutput> {
    // Validate input
    try {
      const validated = CalculatorInputSchema.parse(input)
      
      // Now you know validated.expression is a non-empty string
      const result = this.calculate(validated.expression)
      
      return {
        result: Number(result.toFixed(validated.precision)),
        expression: validated.expression
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          error: 'Invalid input',
          details: error.errors,
          input
        }
      }
      throw error
    }
  }
}
```

### Pattern 2: Error Handling

Handle errors gracefully and provide useful feedback:

```typescript
export class RobustAgent implements Agent {
  async handle(input: AgentInput): Promise<AgentOutput> {
    try {
      // Your processing logic
      const result = await this.processInput(input)
      return { success: true, result }
      
    } catch (error) {
      // Log for debugging
      console.error('Agent processing failed:', error)
      
      // Return user-friendly error
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        input // Include input for debugging
      }
    }
  }
}
```

### Pattern 3: Configuration Management

Make your agents configurable:

```typescript
interface DatabaseAgentConfig {
  connectionString: string
  timeout: number
  retries: number
}

export class DatabaseAgent implements Agent {
  private config: DatabaseAgentConfig
  
  async init(config?: unknown): Promise<void> {
    this.config = DatabaseAgentConfigSchema.parse(config)
    // Connect to database using config
  }
}

// Usage
const handle = await connectAgent({
  agent: new DatabaseAgent(),
  transport: 'http',
  // Pass config during connection
})

// Or register with default config
AgentRegistry.register({
  id: 'db-agent',
  factory: () => new DatabaseAgent(),
  // Config will be passed to init()
})
```

### Pattern 4: Async Operations

Handle long-running operations properly:

```typescript
export class LongRunningAgent implements Agent {
  async handle(input: AgentInput): Promise<AgentOutput> {
    const { task, timeout = 30000 } = input as any
    
    // Use Promise.race for timeout
    try {
      const result = await Promise.race([
        this.processTask(task),
        this.createTimeout(timeout)
      ])
      
      return { result, duration: Date.now() - startTime }
    } catch (error) {
      if (error.message === 'TIMEOUT') {
        return { error: 'Task timed out', timeout }
      }
      throw error
    }
  }
  
  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT')), ms)
    })
  }
}
```

### Pattern 5: Resource Management

Always clean up resources properly:

```typescript
export class ResourceAwareAgent implements Agent {
  private connections: Connection[] = []
  private timers: NodeJS.Timeout[] = []
  
  async init(): Promise<void> {
    // Setup resources
    const connection = await createConnection()
    this.connections.push(connection)
  }
  
  async shutdown(): Promise<void> {
    // Clean up all resources
    await Promise.all([
      // Close connections
      ...this.connections.map(conn => conn.close()),
      // Clear timers
      ...this.timers.map(timer => clearTimeout(timer))
    ])
    
    this.connections.length = 0
    this.timers.length = 0
  }
}
```

### Pattern 6: Plugin Integration

Design your agents to work well with plugins:

```typescript
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'websocket',
  
  // Add observability
  plugins: [
    {
      name: 'metrics',
      version: '1.0.0',
      onSend: (payload, context) => {
        metrics.increment('agent.requests', {
          agent: context.agentId
        })
      }
    },
    
    // Add request/response logging
    {
      name: 'logger',
      version: '1.0.0',
      onSend: (payload) => console.log('→', payload),
      onInit: (context) => console.log('🚀 Agent started:', context.agentId)
    }
  ],
  
  // Lifecycle hooks
  onError: (error) => {
    console.error('Agent error:', error)
    // Send to error tracking service
  }
})
```

---

## Building Real Applications

Let's build some real-world applications to see AgentKit in action.

### Example 1: Chat Application

A simple chat app that processes user messages:

```typescript
// chat-agent.ts
import OpenAI from 'openai'

export class ChatAgent implements Agent {
  id = 'chat-agent'
  name = 'Chat Agent'
  version = '1.0.0'
  
  private openai: OpenAI
  private conversation: Array<{role: string, content: string}> = []

  async init(config?: any): Promise<void> {
    this.openai = new OpenAI({
      apiKey: config?.apiKey || process.env.OPENAI_API_KEY
    })
  }

  async handle(input: AgentInput): Promise<AgentOutput> {
    const { message, userId } = input as {
      message: string
      userId: string
    }
    
    // Add user message to conversation
    this.conversation.push({ role: 'user', content: message })
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: this.conversation,
        max_tokens: 150
      })
      
      const reply = response.choices[0]?.message?.content || 'No response'
      
      // Add assistant response to conversation  
      this.conversation.push({ role: 'assistant', content: reply })
      
      return {
        reply,
        userId,
        timestamp: new Date().toISOString(),
        conversationLength: this.conversation.length
      }
    } catch (error) {
      return {
        error: 'Failed to process message',
        userId,
        originalMessage: message
      }
    }
  }

  async shutdown(): Promise<void> {
    this.conversation = []
  }
}

// main.ts - Express app integration
import express from 'express'
import { connectAgent, AgentRegistry } from '@agentkit/sdk'
import { DummyTransport } from '@agentkit/transports-dummy'

const app = express()
app.use(express.json())

// Setup AgentKit
AgentRegistry.register({
  id: 'chat',
  name: 'Chat Agent',
  version: '1.0.0',
  factory: () => new ChatAgent()
})

AgentRegistry.registerTransport(new DummyTransport())

let chatHandle: any

async function initializeAgent() {
  chatHandle = await connectAgent({
    agent: 'chat',
    transport: 'dummy',
    debug: true
  })
}

// Chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const { message, userId } = req.body
    
    // Send to agent (async)
    chatHandle.send({ message, userId })
    
    // In a real app, you'd use WebSockets or polling for responses
    // For this example, we'll use the dummy transport's synchronous behavior
    
    res.json({ 
      status: 'Message sent to agent',
      messageId: Date.now().toString()
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Start server
initializeAgent().then(() => {
  app.listen(3000, () => {
    console.log('💬 Chat server running on port 3000')
  })
})
```

### Example 2: File Processing Pipeline

An agent that processes uploaded files:

```typescript
// file-processor-agent.ts
import fs from 'fs/promises'
import path from 'path'

interface FileProcessingInput {
  filePath: string
  operation: 'analyze' | 'transform' | 'validate'
  options?: Record<string, any>
}

export class FileProcessorAgent implements Agent {
  id = 'file-processor'
  name = 'File Processor'
  version = '1.0.0'

  async init(): Promise<void> {
    // Ensure temp directory exists
    await fs.mkdir('./temp', { recursive: true })
  }

  async handle(input: AgentInput): Promise<AgentOutput> {
    const { filePath, operation, options = {} } = input as FileProcessingInput
    
    try {
      // Validate file exists
      await fs.access(filePath)
      const stats = await fs.stat(filePath)
      
      let result: any = {
        filePath,
        operation,
        fileSize: stats.size,
        timestamp: new Date().toISOString()
      }
      
      switch (operation) {
        case 'analyze':
          result.analysis = await this.analyzeFile(filePath)
          break
          
        case 'transform':
          result.outputPath = await this.transformFile(filePath, options)
          break
          
        case 'validate':
          result.validation = await this.validateFile(filePath, options)
          break
          
        default:
          throw new Error(`Unknown operation: ${operation}`)
      }
      
      return result
      
    } catch (error) {
      return {
        error: error.message,
        filePath,
        operation,
        timestamp: new Date().toISOString()
      }
    }
  }

  private async analyzeFile(filePath: string) {
    const content = await fs.readFile(filePath, 'utf-8')
    return {
      lineCount: content.split('\n').length,
      charCount: content.length,
      wordCount: content.split(/\s+/).length,
      extension: path.extname(filePath)
    }
  }

  private async transformFile(filePath: string, options: any) {
    // Example: Convert to uppercase
    const content = await fs.readFile(filePath, 'utf-8')
    const transformedContent = content.toUpperCase()
    
    const outputPath = `./temp/transformed_${Date.now()}_${path.basename(filePath)}`
    await fs.writeFile(outputPath, transformedContent)
    
    return outputPath
  }

  private async validateFile(filePath: string, options: any) {
    const content = await fs.readFile(filePath, 'utf-8')
    const { maxSize = 1024 * 1024, allowedExtensions = ['.txt', '.md'] } = options
    
    const stats = await fs.stat(filePath)
    const extension = path.extname(filePath)
    
    return {
      isValid: stats.size <= maxSize && allowedExtensions.includes(extension),
      checks: {
        sizeOk: stats.size <= maxSize,
        extensionOk: allowedExtensions.includes(extension)
      },
      fileSize: stats.size,
      extension
    }
  }

  async shutdown(): Promise<void> {
    // Clean up temp files
    try {
      const files = await fs.readdir('./temp')
      await Promise.all(
        files.map(file => fs.unlink(path.join('./temp', file)))
      )
    } catch (error) {
      console.warn('Cleanup warning:', error.message)
    }
  }
}

// Usage with file upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const filePath = req.file.path
    const operation = req.body.operation || 'analyze'
    
    // Process with agent
    await fileProcessorHandle.send({
      filePath,
      operation,
      options: req.body.options ? JSON.parse(req.body.options) : {}
    })
    
    res.json({ 
      status: 'File processing started',
      filePath,
      operation
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})
```

### Example 3: Multi-Agent Coordination

Coordinating multiple agents for complex workflows:

```typescript
// orchestrator-agent.ts
export class OrchestratorAgent implements Agent {
  id = 'orchestrator'
  name = 'Workflow Orchestrator'
  version = '1.0.0'
  
  private subAgents = new Map<string, any>()

  async init(): Promise<void> {
    // Initialize sub-agents
    this.subAgents.set('validator', await connectAgent({
      agent: 'file-processor',
      transport: 'dummy'
    }))
    
    this.subAgents.set('processor', await connectAgent({
      agent: 'image-processor',
      transport: 'dummy'
    }))
    
    this.subAgents.set('notifier', await connectAgent({
      agent: 'notification-agent',
      transport: 'dummy'
    }))
  }

  async handle(input: AgentInput): Promise<AgentOutput> {
    const { workflow, data } = input as {
      workflow: string
      data: any
    }
    
    try {
      const result = await this.executeWorkflow(workflow, data)
      return {
        workflow,
        result,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      return {
        error: error.message,
        workflow,
        data,
        timestamp: new Date().toISOString()
      }
    }
  }

  private async executeWorkflow(workflow: string, data: any) {
    switch (workflow) {
      case 'image-processing-pipeline':
        return this.imageProcessingPipeline(data)
        
      case 'document-analysis':
        return this.documentAnalysisPipeline(data)
        
      default:
        throw new Error(`Unknown workflow: ${workflow}`)
    }
  }

  private async imageProcessingPipeline(data: any) {
    const steps = []
    
    // Step 1: Validate image
    steps.push('validation')
    await this.subAgents.get('validator').send({
      filePath: data.imagePath,
      operation: 'validate',
      options: { allowedExtensions: ['.jpg', '.png', '.gif'] }
    })
    
    // Step 2: Process image
    steps.push('processing')
    await this.subAgents.get('processor').send({
      imagePath: data.imagePath,
      operations: data.operations || ['resize', 'optimize']
    })
    
    // Step 3: Send notification
    steps.push('notification')
    await this.subAgents.get('notifier').send({
      type: 'image-processed',
      userId: data.userId,
      imagePath: data.imagePath
    })
    
    return {
      pipeline: 'image-processing',
      stepsCompleted: steps,
      success: true
    }
  }

  async shutdown(): Promise<void> {
    // Shutdown all sub-agents
    await Promise.all(
      Array.from(this.subAgents.values()).map(agent => agent.shutdown())
    )
    this.subAgents.clear()
  }
}
```

---

## Debugging & Troubleshooting

AgentKit provides excellent debugging tools. Here's how to use them effectively.

### Debug Mode

Enable debug mode to see what's happening inside:

```typescript
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  debug: true,  // 🔍 Enable debug logging
  
  // Lifecycle hooks for debugging
  onInit: (agentId) => console.log(`✅ Agent ${agentId} initialized`),
  onShutdown: (agentId) => console.log(`🛑 Agent ${agentId} shutdown`),
  onError: (error) => console.error('❌ Agent error:', error)
})
```

### Plugin-Based Debugging

Add debugging plugins for specific insights:

```typescript
const debugPlugins = [
  // Request/response logging
  {
    name: 'request-logger',
    version: '1.0.0',
    onSend: (payload, context) => {
      console.log(`📤 [${context.agentId}] Sending:`, payload.input)
    }
  },
  
  // Performance monitoring
  {
    name: 'perf-monitor',
    version: '1.0.0',
    onSend: (payload, context) => {
      context.startTime = Date.now()
    },
    onOutput: (output, context) => {
      const duration = Date.now() - context.startTime
      console.log(`⏱️ Request took ${duration}ms`)
    }
  },
  
  // Error tracking
  {
    name: 'error-tracker',
    version: '1.0.0',
    onError: (error, context) => {
      console.error(`🚨 Error in ${context.agentId}:`, {
        error: error.message,
        stack: error.stack,
        context
      })
    }
  }
]

const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  plugins: debugPlugins
})
```

### Common Issues & Solutions

#### Issue 1: Agent Not Found

```
❌ Error: Agent "my-agent" not found
```

**Solution**: Make sure you registered the agent first:

```typescript
// ✅ Register before connecting
AgentRegistry.register({
  id: 'my-agent',  // Must match the ID in connectAgent()
  name: 'My Agent',
  version: '1.0.0',
  factory: () => new MyAgent()
})

const handle = await connectAgent({
  agent: 'my-agent',  // This ID must exist in registry
  transport: 'dummy'
})
```

#### Issue 2: Transport Not Responding

```
❌ Error: Transport timeout or no response
```

**Solutions**:
1. Check transport initialization:
```typescript
const transport = new DummyTransport({ debug: true })
await transport.init()  // Ensure it's initialized
AgentRegistry.registerTransport(transport)
```

2. Verify transport health:
```typescript
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  
  // Add circuit breaker for fault tolerance
  circuitBreaker: {
    failureThreshold: 3,
    timeout: 5000
  }
})
```

#### Issue 3: Memory Leaks

**Prevention**:
```typescript
// ✅ Always clean up
const handles = []

// When creating connections
const handle = await connectAgent({...})
handles.push(handle)

// On application shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...')
  await Promise.all(handles.map(h => h.shutdown()))
  process.exit(0)
})
```

#### Issue 4: Plugin Errors

```
❌ Error: Plugin "my-plugin" failed validation
```

**Solutions**:
1. Check plugin structure:
```typescript
const plugin = {
  name: 'my-plugin',        // ✅ Required
  version: '1.0.0',         // ✅ Required, semver format
  description: 'My plugin', // ✅ Optional but recommended
  
  // ✅ At least one hook required
  onSend: (payload, context) => {
    // Your logic
  }
}
```

2. Handle plugin errors gracefully:
```typescript
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  plugins: [plugin],
  
  // ✅ Handle plugin errors
  onError: (error) => {
    if (error.message.includes('Plugin')) {
      console.warn('Plugin error (continuing):', error.message)
    } else {
      throw error  // Re-throw non-plugin errors
    }
  }
})
```

### Performance Debugging

Monitor performance with built-in tools:

```typescript
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  
  // Enable observability
  observability: {
    onRequestStart: (metadata) => {
      console.log(`🚀 Request ${metadata.requestId} started`)
    },
    onRequestEnd: (metadata, duration) => {
      console.log(`✅ Request ${metadata.requestId} took ${duration}ms`)
    }
  },
  
  // Resource limits
  resourceLimits: {
    maxConcurrentRequests: 10,
    requestTimeoutMs: 30000,
    maxQueueSize: 100
  }
})

// Get performance metrics
setTimeout(() => {
  if (handle.getMetrics) {
    console.log('📊 Metrics:', handle.getMetrics())
  }
}, 5000)
```

---

## Plugin Development

Plugins are a powerful way to extend AgentKit functionality. Let's learn how to build them.

### Your First Plugin

```typescript
// simple-logger-plugin.ts
import { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'

export const simpleLoggerPlugin: AgentKitPlugin = {
  name: 'simple-logger',
  version: '1.0.0',
  description: 'Logs all agent interactions',
  
  // Called when agent initializes
  onInit: (context: AgentContext) => {
    console.log(`🚀 Agent ${context.agentId} started at ${new Date().toISOString()}`)
  },
  
  // Called before sending data to agent
  onSend: (payload: SendPayload, context: AgentContext) => {
    console.log(`📤 [${context.agentId}] Input:`, payload.input)
  },
  
  // Called when errors occur
  onError: (error: Error, context: AgentContext) => {
    console.error(`❌ [${context.agentId}] Error:`, error.message)
  },
  
  // Called when agent shuts down
  onShutdown: (context: AgentContext) => {
    console.log(`🛑 Agent ${context.agentId} shutdown`)
  }
}

// Usage
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  plugins: [simpleLoggerPlugin]
})
```

### Advanced Plugin: Metrics Collection

```typescript
// metrics-plugin.ts
interface MetricsData {
  totalRequests: number
  totalErrors: number
  averageResponseTime: number
  requestsPerMinute: number
}

export class MetricsPlugin implements AgentKitPlugin {
  name = 'metrics-collector'
  version = '1.0.0'
  description = 'Collects performance metrics'
  
  private metrics: MetricsData = {
    totalRequests: 0,
    totalErrors: 0,
    averageResponseTime: 0,
    requestsPerMinute: 0
  }
  
  private responseTimes: number[] = []
  private requestTimestamps: number[] = []
  private pendingRequests = new Map<string, number>()

  onInit = (context: AgentContext) => {
    console.log(`📊 Metrics collection started for ${context.agentId}`)
    
    // Report metrics every minute
    setInterval(() => this.reportMetrics(context.agentId), 60000)
  }

  onSend = (payload: SendPayload, context: AgentContext) => {
    // Track request start
    this.pendingRequests.set(context.requestId, Date.now())
    this.requestTimestamps.push(Date.now())
    this.metrics.totalRequests++
    
    // Keep only last minute of timestamps
    const oneMinuteAgo = Date.now() - 60000
    this.requestTimestamps = this.requestTimestamps.filter(t => t > oneMinuteAgo)
    this.metrics.requestsPerMinute = this.requestTimestamps.length
  }

  onError = (error: Error, context: AgentContext) => {
    this.metrics.totalErrors++
    
    // Complete the timing for this request
    const startTime = this.pendingRequests.get(context.requestId)
    if (startTime) {
      this.completeTiming(context.requestId, startTime)
    }
  }

  onShutdown = (context: AgentContext) => {
    this.reportMetrics(context.agentId)
    console.log(`📊 Metrics collection stopped for ${context.agentId}`)
  }

  // Method to complete request timing (would be called from response handling)
  completeRequest(requestId: string) {
    const startTime = this.pendingRequests.get(requestId)
    if (startTime) {
      this.completeTiming(requestId, startTime)
    }
  }

  private completeTiming(requestId: string, startTime: number) {
    const responseTime = Date.now() - startTime
    this.responseTimes.push(responseTime)
    this.pendingRequests.delete(requestId)
    
    // Keep only last 100 response times for average
    if (this.responseTimes.length > 100) {
      this.responseTimes = this.responseTimes.slice(-100)
    }
    
    // Calculate average
    this.metrics.averageResponseTime = 
      this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length
  }

  private reportMetrics(agentId: string) {
    console.log(`📊 [${agentId}] Metrics Report:`, {
      ...this.metrics,
      errorRate: this.metrics.totalRequests > 0 
        ? (this.metrics.totalErrors / this.metrics.totalRequests * 100).toFixed(2) + '%'
        : '0%'
    })
  }

  // Public API for external access
  getMetrics(): MetricsData & { errorRate: string } {
    return {
      ...this.metrics,
      errorRate: this.metrics.totalRequests > 0 
        ? (this.metrics.totalErrors / this.metrics.totalRequests * 100).toFixed(2) + '%'
        : '0%'
    }
  }
}

// Usage
const metricsPlugin = new MetricsPlugin()

const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  plugins: [metricsPlugin]
})

// Access metrics
setTimeout(() => {
  console.log('Current metrics:', metricsPlugin.getMetrics())
}, 10000)
```

### Plugin with External Dependencies

```typescript
// database-logger-plugin.ts
import { Database } from 'sqlite3'

export class DatabaseLoggerPlugin implements AgentKitPlugin {
  name = 'database-logger'
  version = '1.0.0'
  description = 'Logs agent interactions to database'
  
  private db: Database | null = null

  onInit = async (context: AgentContext) => {
    // Initialize database
    this.db = new Database('./agent-logs.db')
    
    // Create table if not exists
    return new Promise<void>((resolve, reject) => {
      this.db!.run(`
        CREATE TABLE IF NOT EXISTS agent_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_id TEXT NOT NULL,
          request_id TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          data TEXT
        )
      `, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  onSend = (payload: SendPayload, context: AgentContext) => {
    this.logEvent(context, 'send', { input: payload.input })
  }

  onError = (error: Error, context: AgentContext) => {
    this.logEvent(context, 'error', { 
      message: error.message,
      stack: error.stack 
    })
  }

  onShutdown = (context: AgentContext) => {
    this.logEvent(context, 'shutdown', {})
    
    // Close database
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  private logEvent(context: AgentContext, eventType: string, data: any) {
    if (!this.db) return
    
    this.db.run(`
      INSERT INTO agent_logs (agent_id, request_id, timestamp, event_type, data)
      VALUES (?, ?, ?, ?, ?)
    `, [
      context.agentId,
      context.requestId,
      context.timestamp,
      eventType,
      JSON.stringify(data)
    ])
  }

  // Public API to query logs
  async getLogs(agentId?: string, limit = 100): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = agentId 
        ? 'SELECT * FROM agent_logs WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?'
        : 'SELECT * FROM agent_logs ORDER BY timestamp DESC LIMIT ?'
      
      const params = agentId ? [agentId, limit] : [limit]
      
      this.db!.all(query, params, (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })
  }
}
```

### Plugin Security & Best Practices

#### 1. Input Validation

```typescript
export const securePlugin: AgentKitPlugin = {
  name: 'secure-plugin',
  version: '1.0.0',
  
  onSend: (payload, context) => {
    // ✅ Validate inputs
    if (!payload || typeof payload.input !== 'object') {
      throw new Error('Invalid payload structure')
    }
    
    // ✅ Sanitize data
    const sanitized = sanitizeInput(payload.input)
    
    // ✅ Check permissions
    if (!hasPermission(context.agentId, 'send')) {
      throw new Error('Insufficient permissions')
    }
  }
}
```

#### 2. Error Handling

```typescript
export const robustPlugin: AgentKitPlugin = {
  name: 'robust-plugin',
  version: '1.0.0',
  
  onSend: (payload, context) => {
    try {
      // Your plugin logic
      processPayload(payload)
    } catch (error) {
      // ✅ Log error but don't break the chain
      console.error(`Plugin ${this.name} error:`, error)
      
      // ✅ Optional: emit metrics
      emitMetric('plugin.error', 1, { plugin: this.name })
      
      // ✅ Don't re-throw unless critical
    }
  }
}
```

#### 3. Resource Management

```typescript
export class ResourceManagedPlugin implements AgentKitPlugin {
  name = 'resource-managed'
  version = '1.0.0'
  
  private resources: any[] = []
  private timers: NodeJS.Timeout[] = []

  onInit = (context: AgentContext) => {
    // ✅ Track resources
    const resource = createResource()
    this.resources.push(resource)
    
    const timer = setInterval(() => {}, 1000)
    this.timers.push(timer)
  }

  onShutdown = (context: AgentContext) => {
    // ✅ Clean up all resources
    this.resources.forEach(resource => resource.cleanup())
    this.timers.forEach(timer => clearInterval(timer))
    
    this.resources.length = 0
    this.timers.length = 0
  }
}
```

---

## Production Deployment

When you're ready to deploy AgentKit applications to production, here are the key considerations.

### Environment Configuration

```typescript
// config/production.ts
export const productionConfig = {
  agents: {
    // Production agent configurations
    'chat-agent': {
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4',
      timeout: 30000,
      retries: 3
    },
    'processor-agent': {
      maxConcurrency: 10,
      queueSize: 1000,
      timeout: 60000
    }
  },
  
  transports: {
    // Use real transports in production
    'websocket': {
      url: process.env.WEBSOCKET_URL,
      reconnectInterval: 5000,
      maxReconnectAttempts: 10
    },
    'http': {
      baseUrl: process.env.API_BASE_URL,
      timeout: 30000,
      retries: 3
    }
  },
  
  observability: {
    metricsEnabled: true,
    loggingLevel: 'info',
    errorTracking: process.env.SENTRY_DSN
  },
  
  security: {
    pluginVerification: 'strict',
    trustedKeysPath: './trusted-keys.json'
  }
}

// Initialize with production config
const handle = await connectAgent({
  agent: 'chat-agent',
  transport: 'websocket',
  
  // Production settings
  resourceLimits: {
    maxConcurrentRequests: 100,
    maxQueueSize: 1000,
    requestTimeoutMs: 30000
  },
  
  circuitBreaker: {
    failureThreshold: 5,
    timeout: 60000,
    name: 'chat-agent-circuit'
  },
  
  // Production plugins
  plugins: [
    productionMetricsPlugin,
    errorTrackingPlugin,
    securityPlugin
  ]
})
```

### Health Checks & Monitoring

```typescript
// health-check.ts
import express from 'express'

const app = express()

// Store agent handles for health checking
const agentHandles = new Map<string, any>()

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    agents: {} as any,
    uptime: process.uptime()
  }
  
  // Check each agent
  for (const [agentId, handle] of agentHandles) {
    try {
      const state = handle.getState?.()
      const metrics = handle.getMetrics?.()
      
      health.agents[agentId] = {
        status: state?.shutdown ? 'down' : 'up',
        state: state,
        metrics: metrics
      }
    } catch (error) {
      health.agents[agentId] = {
        status: 'error',
        error: error.message
      }
      health.status = 'degraded'
    }
  }
  
  const statusCode = health.status === 'healthy' ? 200 : 503
  res.status(statusCode).json(health)
})

// Metrics endpoint (Prometheus format)
app.get('/metrics', (req, res) => {
  let metrics = ''
  
  for (const [agentId, handle] of agentHandles) {
    try {
      if (handle.exportPrometheusMetrics) {
        metrics += handle.exportPrometheusMetrics()
      }
    } catch (error) {
      console.error(`Failed to export metrics for ${agentId}:`, error)
    }
  }
  
  res.set('Content-Type', 'text/plain').send(metrics)
})

app.listen(process.env.HEALTH_PORT || 3001, () => {
  console.log('🔍 Health check server running')
})
```

### Error Handling & Recovery

```typescript
// production-error-handling.ts
import Sentry from '@sentry/node'

// Initialize error tracking
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV
})

const productionErrorHandler = {
  name: 'production-error-handler',
  version: '1.0.0',
  
  onError: (error: Error, context: any) => {
    // Log to console
    console.error(`❌ [${context.agentId}] ${error.message}`, {
      requestId: context.requestId,
      timestamp: context.timestamp,
      stack: error.stack
    })
    
    // Send to error tracking
    Sentry.captureException(error, {
      tags: {
        agentId: context.agentId,
        requestId: context.requestId
      },
      extra: {
        context
      }
    })
    
    // Emit metrics
    if (metrics) {
      metrics.increment('agent.errors', {
        agent: context.agentId,
        error_type: error.constructor.name
      })
    }
  }
}

// Graceful shutdown handling
const gracefulShutdown = async () => {
  console.log('🛑 Shutting down gracefully...')
  
  // Stop accepting new requests
  server.close()
  
  // Shutdown all agents
  const shutdownPromises = Array.from(agentHandles.values()).map(handle => 
    handle.shutdown().catch(err => console.error('Shutdown error:', err))
  )
  
  await Promise.all(shutdownPromises)
  
  console.log('✅ Graceful shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)
```

### Load Balancing & Scaling

```typescript
// cluster.ts - Multi-process scaling
import cluster from 'cluster'
import os from 'os'

if (cluster.isPrimary) {
  // Master process
  const numWorkers = process.env.WORKERS || os.cpus().length
  
  console.log(`🚀 Starting ${numWorkers} worker processes`)
  
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork()
  }
  
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`)
    cluster.fork()
  })
  
} else {
  // Worker process
  startAgentServer()
}

async function startAgentServer() {
  // Initialize agents in each worker
  const agents = await initializeAgents()
  
  // Start HTTP server
  const server = createServer(agents)
  server.listen(process.env.PORT || 3000)
  
  console.log(`👷 Worker ${process.pid} started`)
}
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build application
RUN pnpm build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S agentkit -u 1001

# Switch to non-root user
USER agentkit

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start application
CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  agentkit-app:
    build: .
    ports:
      - "3000:3000"
      - "3001:3001"  # Health check port
    environment:
      - NODE_ENV=production
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - SENTRY_DSN=${SENTRY_DSN}
      - WEBSOCKET_URL=${WEBSOCKET_URL}
    volumes:
      - ./logs:/app/logs
      - ./trusted-keys.json:/app/trusted-keys.json:ro
    restart: unless-stopped
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-storage:/var/lib/grafana

volumes:
  grafana-storage:
```

---

## Common Mistakes & Solutions

Let's cover the most common mistakes junior engineers make with AgentKit and how to avoid them.

### Mistake 1: Not Handling Agent Lifecycle Properly

❌ **Wrong**:
```typescript
// Creating agents without proper cleanup
const handle1 = await connectAgent({...})
const handle2 = await connectAgent({...})
const handle3 = await connectAgent({...})

// Never calling shutdown() - causes memory leaks!
```

✅ **Correct**:
```typescript
// Keep track of all handles
const handles: AgentRuntimeHandle[] = []

// Create agents
const handle1 = await connectAgent({...})
handles.push(handle1)

const handle2 = await connectAgent({...})
handles.push(handle2)

// Always cleanup on exit
process.on('exit', async () => {
  await Promise.all(handles.map(h => h.shutdown()))
})

// Or use try/finally
try {
  const handle = await connectAgent({...})
  await handle.send({...})
} finally {
  if (handle) {
    await handle.shutdown()
  }
}
```

### Mistake 2: Blocking the Event Loop

❌ **Wrong**:
```typescript
export class BlockingAgent implements Agent {
  async handle(input: AgentInput): Promise<AgentOutput> {
    // This blocks the event loop!
    const result = this.heavyComputationSync(input)
    return { result }
  }
  
  private heavyComputationSync(input: any) {
    // Synchronous heavy computation
    let sum = 0
    for (let i = 0; i < 10000000; i++) {
      sum += Math.random()
    }
    return sum
  }
}
```

✅ **Correct**:
```typescript
export class NonBlockingAgent implements Agent {
  async handle(input: AgentInput): Promise<AgentOutput> {
    // Use async operations or worker threads
    const result = await this.heavyComputationAsync(input)
    return { result }
  }
  
  private async heavyComputationAsync(input: any) {
    // Break work into chunks
    return new Promise(resolve => {
      let sum = 0
      let i = 0
      const chunkSize = 100000
      
      const processChunk = () => {
        const end = Math.min(i + chunkSize, 10000000)
        for (; i < end; i++) {
          sum += Math.random()
        }
        
        if (i < 10000000) {
          // Continue in next tick
          setImmediate(processChunk)
        } else {
          resolve(sum)
        }
      }
      
      processChunk()
    })
  }
}
```

### Mistake 3: Poor Error Handling

❌ **Wrong**:
```typescript
export class BadErrorHandling implements Agent {
  async handle(input: AgentInput): Promise<AgentOutput> {
    // No error handling - crashes will propagate
    const data = JSON.parse(input.jsonString)
    const result = await this.processData(data)
    return result
  }
}
```

✅ **Correct**:
```typescript
export class GoodErrorHandling implements Agent {
  async handle(input: AgentInput): Promise<AgentOutput> {
    try {
      // Validate input
      if (!input || typeof input.jsonString !== 'string') {
        return {
          error: 'Invalid input: jsonString is required',
          timestamp: new Date().toISOString()
        }
      }
      
      // Parse with error handling
      let data
      try {
        data = JSON.parse(input.jsonString)
      } catch (parseError) {
        return {
          error: 'Invalid JSON format',
          input: input.jsonString,
          timestamp: new Date().toISOString()
        }
      }
      
      // Process with timeout
      const result = await Promise.race([
        this.processData(data),
        this.timeout(30000)
      ])
      
      return {
        success: true,
        result,
        timestamp: new Date().toISOString()
      }
      
    } catch (error) {
      // Always return a valid response, never throw
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        input
      }
    }
  }
  
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Operation timeout')), ms)
    })
  }
}
```

### Mistake 4: Ignoring Backpressure

❌ **Wrong**:
```typescript
// Sending requests without checking capacity
for (let i = 0; i < 10000; i++) {
  // This might overwhelm the system!
  handle.send({ data: i })
}
```

✅ **Correct**:
```typescript
// Respect backpressure and rate limiting
async function sendWithBackpressure(handle: AgentRuntimeHandle, requests: any[]) {
  const concurrencyLimit = 10
  const activeRequests = new Set<Promise<void>>()
  
  for (const request of requests) {
    // Wait if we're at the limit
    if (activeRequests.size >= concurrencyLimit) {
      await Promise.race(activeRequests)
    }
    
    // Send request
    const promise = handle.send(request)
      .finally(() => activeRequests.delete(promise))
    
    activeRequests.add(promise)
  }
  
  // Wait for all remaining requests
  await Promise.all(activeRequests)
}

// Or use the built-in resource limits
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  resourceLimits: {
    maxConcurrentRequests: 10,
    maxQueueSize: 100,
    requestTimeoutMs: 30000
  }
})
```

### Mistake 5: Plugin Development Errors

❌ **Wrong**:
```typescript
const badPlugin = {
  name: 'bad-plugin',
  // Missing version!
  
  onSend: async (payload, context) => {
    // Throwing errors breaks the plugin chain
    throw new Error('Something went wrong')
  },
  
  onInit: (context) => {
    // Creating resources without cleanup
    setInterval(() => {
      // This timer will never be cleared!
    }, 1000)
  }
}
```

✅ **Correct**:
```typescript
class GoodPlugin implements AgentKitPlugin {
  name = 'good-plugin'
  version = '1.0.0'  // ✅ Required
  
  private timers: NodeJS.Timeout[] = []
  
  onSend = async (payload: SendPayload, context: AgentContext) => {
    try {
      // Your plugin logic
      await this.processPayload(payload)
    } catch (error) {
      // Log error but don't break the chain
      console.error(`Plugin ${this.name} error:`, error)
      // Don't re-throw unless critical
    }
  }
  
  onInit = (context: AgentContext) => {
    // Track resources for cleanup
    const timer = setInterval(() => {
      // Your logic
    }, 1000)
    this.timers.push(timer)
  }
  
  onShutdown = (context: AgentContext) => {
    // ✅ Always clean up resources
    this.timers.forEach(timer => clearInterval(timer))
    this.timers.length = 0
  }
}
```

### Mistake 6: Not Using TypeScript Properly

❌ **Wrong**:
```typescript
// Using 'any' everywhere defeats the purpose
const handle = await connectAgent({
  agent: 'my-agent' as any,
  transport: 'dummy' as any,
  onOutput: (message: any) => {
    // No type safety!
    console.log(message.someProperty)
  }
})

await handle.send({ data: 'anything' } as any)
```

✅ **Correct**:
```typescript
// Define your types
interface MyAgentInput {
  operation: 'add' | 'subtract' | 'multiply'
  numbers: number[]
}

interface MyAgentOutput {
  result: number
  operation: string
  timestamp: string
}

// Use proper typing
const handle = await connectAgent({
  agent: 'calculator',
  transport: 'dummy',
  onOutput: (message: MyAgentOutput) => {
    // Type-safe access
    console.log(`Result: ${message.result}`)
  }
})

// Type-safe sending
await handle.send({
  operation: 'add',
  numbers: [1, 2, 3, 4, 5]
} satisfies MyAgentInput)
```

### Mistake 7: Testing Antipatterns

❌ **Wrong**:
```typescript
// Testing without proper setup/teardown
describe('MyAgent', () => {
  it('should work', async () => {
    const handle = await connectAgent({...})
    // Test logic
    // Missing cleanup!
  })
})
```

✅ **Correct**:
```typescript
describe('MyAgent', () => {
  let handle: AgentRuntimeHandle
  
  beforeEach(async () => {
    // Setup
    AgentRegistry.register({...})
    AgentRegistry.registerTransport(new DummyTransport())
    
    handle = await connectAgent({...})
  })
  
  afterEach(async () => {
    // Cleanup
    if (handle) {
      await handle.shutdown()
    }
    AgentRegistry.clear()
  })
  
  it('should process input correctly', async () => {
    const result = await new Promise(resolve => {
      handle.onOutput = resolve
      handle.send({ test: 'data' })
    })
    
    expect(result).toEqual({
      // Expected output
    })
  })
})
```

---

## Next Steps

Congratulations! You now have a solid foundation in AgentKit SDK. Here's what to do next:

### 🎯 Immediate Next Steps

1. **Build Your First Real Agent**
   - Choose a use case (chat, data processing, API integration)
   - Implement it following the patterns in this guide
   - Add proper error handling and testing

2. **Explore Advanced Features**
   - Read the [Plugin Development Guide](../PLUGIN_DEVELOPMENT.md)
   - Study the [Architecture Documentation](../docs/architecture.md)
   - Check out the [Performance Guide](../PERFORMANCE.md)

3. **Join the Community**
   - Review existing examples in `/examples`
   - Contribute to the project on GitHub
   - Share your own agent implementations

### 📚 Additional Resources

- **[API Reference](../API.md)** - Complete API documentation
- **[Debugging Guide](../DEBUGGING.md)** - Advanced debugging techniques
- **[Migration Guide](../docs/migration.md)** - Version compatibility info
- **[Testing Guide](../docs/testing.md)** - Comprehensive testing strategies

### 🚀 Advanced Projects to Try

1. **Multi-Agent System**: Build a system where multiple agents collaborate
2. **Real-time Chat Bot**: Create a WebSocket-based chat agent
3. **File Processing Pipeline**: Build a document processing workflow
4. **API Gateway**: Use AgentKit to create an intelligent API proxy
5. **Monitoring Dashboard**: Build a real-time agent monitoring system

### 💡 Tips for Continued Learning

- **Start Small**: Begin with simple agents and gradually add complexity
- **Read the Code**: Study the AgentKit source code to understand internals
- **Test Everything**: Write comprehensive tests for your agents
- **Monitor Performance**: Use the built-in observability tools
- **Stay Updated**: Follow the project for new features and best practices

---

## Summary

This guide covered everything you need to know to be productive with AgentKit SDK:

✅ **Core Concepts**: Agents, Transports, Scopes, Plugins
✅ **Hands-on Tutorial**: Built your first working agent
✅ **Architecture Understanding**: How everything fits together
✅ **Best Practices**: Patterns that scale and perform well
✅ **Real Examples**: Production-ready application patterns
✅ **Debugging Skills**: Tools and techniques for troubleshooting
✅ **Plugin Development**: Extending functionality safely
✅ **Production Deployment**: Scaling and monitoring considerations
✅ **Common Pitfalls**: Mistakes to avoid and how to fix them

**Remember**: AgentKit SDK is designed to make AI agent integration simple and reliable. Focus on building great agents and let the SDK handle the complexity of lifecycle management, transport protocols, and observability.

Happy building! 🚀

---

*This guide is maintained by the AgentKit team. For questions, issues, or contributions, please visit our [GitHub repository](https://github.com/your-org/agentkit-sdk).*