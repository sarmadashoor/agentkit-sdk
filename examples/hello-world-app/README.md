# Hello World App - AgentKit SDK Example

A complete, production-ready example application demonstrating comprehensive usage of the AgentKit SDK with plugins, error handling, concurrency, and multiple operational modes.

## 🎯 What This Example Demonstrates

### Core SDK Features
- **Agent Lifecycle Management** - Proper initialization, message handling, and shutdown
- **Plugin Integration** - Logging, metrics collection, and debug tracing plugins
- **Error Handling** - Graceful error recovery and defensive programming
- **Concurrency Control** - Resource limits and concurrent message processing
- **Transport Layer** - DummyTransport configuration and usage

### Advanced Capabilities
- **Multiple Agent Modes** - 7 different operational modes for comprehensive testing
- **Observability** - Built-in metrics collection and debug tracing
- **Security** - Plugin sandboxing and guardrail validation
- **Performance Testing** - Latency and throughput measurements
- **Developer Experience** - Clear logging, error messages, and configuration

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- pnpm (recommended) or npm

### Installation & Run
```bash
# From the repository root
cd examples/hello-world-app

# Install dependencies (automatically uses workspace packages)
pnpm install

# Run with default settings (echo mode)
pnpm start

# Or run specific modes
pnpm demo:echo      # Basic echo functionality
pnpm demo:metrics   # Metrics collection demo
pnpm demo:fail      # Error handling demo
pnpm demo:recursive # Recursion testing
pnpm demo:validation # Input validation
```

### Environment Configuration
```bash
# Agent operational mode
AGENT_MODE=metrics pnpm start

# Enable concurrent testing
CONCURRENT_DEMO=true pnpm start

# Performance benchmarking
PERFORMANCE_TEST=true pnpm start

# Debug mode with verbose logging
DEBUG=true pnpm start

# Combined configuration
AGENT_MODE=metrics CONCURRENT_DEMO=true DEBUG=true pnpm start
```

## 🎮 Agent Modes

The example supports 7 different agent modes, each demonstrating different SDK capabilities:

### 1. `echo` (Default)
**Purpose**: Basic input/output validation
```bash
pnpm demo:echo
```
- Replies with exact input received
- Demonstrates basic agent lifecycle
- Perfect for getting started

### 2. `metrics`
**Purpose**: Observability and monitoring
```bash
pnpm demo:metrics
```
- Emits fake CPU, memory, and latency metrics
- Demonstrates plugin-based metrics collection
- Shows observability patterns

### 3. `fail`
**Purpose**: Error handling and recovery
```bash
pnpm demo:fail
```
- Intentionally throws errors during operation
- Demonstrates error recovery patterns
- Tests plugin error handling

### 4. `recursive`
**Purpose**: Concurrency and recursion limits
```bash
pnpm demo:recursive
```
- Makes recursive calls to itself
- Tests recursion depth limits
- Demonstrates concurrency control

### 5. `validation`
**Purpose**: Input validation and type safety
```bash
pnpm demo:validation
```
- Requires strict payload schemas
- Validates input/output types
- Demonstrates defensive programming

### 6. `pluginExercise`
**Purpose**: Plugin lifecycle testing
```bash
AGENT_MODE=pluginExercise pnpm start
```
- Explicitly triggers all plugin hooks
- Tests plugin integration
- Validates plugin isolation

### 7. `sideEffect`
**Purpose**: Security guardrails
```bash
AGENT_MODE=sideEffect pnpm start
```
- Attempts global state mutations
- Tests security sandboxing
- Validates isolation guarantees

## 🔌 Plugins

The example includes three production-ready plugins:

### LoggingPlugin
- Captures all agent lifecycle events
- Provides execution summaries
- Demonstrates event-driven architecture

### MetricsPlugin  
- Collects fake performance metrics
- Tracks latency, CPU, and memory usage
- Shows observability integration

### DebugPlugin
- Provides detailed execution tracing
- Timeline-based logging
- Perfect for development debugging

## 📊 Sample Output

### Echo Mode
```
🌟 AgentKit SDK - Hello World Example
=====================================

📋 Configuration:
   Agent Mode: echo
   Plugin Mode: full
   Concurrent Demo: false
   Performance Test: false
   Debug Mode: false

🚀 Setting up DummyTestAgent in "echo" mode...
🔌 Connecting agent with 3 plugins...
✅ Agent "hello-world-echo-agent" initialized successfully
🔌 [hello-world-logging-plugin] Agent initialized: hello-world-echo-agent
📊 [hello-world-metrics-plugin] Recorded init metrics for hello-world-echo-agent
🔍 [hello-world-debug-plugin] [x7k9m1q2w] INIT START (t=52ms) - Agent: hello-world-echo-agent

🎯 Starting workflow for echo mode...
📨 Testing echo responses...
   Sending message 1: string
   Sending message 2: object
   Sending message 3: object
   Sending message 4: number

📊 Workflow Results:
   Messages processed: 4
   Errors encountered: 0
   Duration: 387ms
   Success: ✅
```

### Metrics Mode
```
🎯 Starting workflow for metrics mode...
📊 Testing metrics collection...
   Sending metrics message 1
📊 [hello-world-metrics-plugin] Recorded send metrics for hello-world-metrics-agent
   Sending metrics message 2
   Sending metrics message 3

📈 [hello-world-metrics-plugin] Metrics Summary:
  • Total metrics collected: 12
  • agent.init.duration:
    - Count: 1
    - Average: 45.00
    - Range: 45 - 45
  • agent.send.latency:
    - Count: 3
    - Average: 67.33
    - Range: 23 - 89
```

### Fail Mode (Error Handling)
```
🎯 Starting workflow for fail mode...
💥 Testing error handling...
   Sending message 1 (expecting failure)
   ✅ Message 1 failed as expected: [FAIL MODE] Demo failure simulation during handle
   Sending message 2 (expecting failure)
   ✅ Message 2 failed as expected: [FAIL MODE] Demo failure simulation during handle

📊 Workflow Results:
   Messages processed: 0
   Errors encountered: 3
   Duration: 234ms
   Success: ✅

💡 Note: Errors were expected in "fail" mode - this demonstrates error handling!
```

## 🛠️ Development

### Project Structure
```
src/
├── index.ts          # Main entry point and CLI handling
├── agentSetup.ts     # Agent configuration and connection
├── pluginSetup.ts    # Plugin implementations
└── exampleWorkflow.ts # Workflow scenarios and testing
```

### Building
```bash
# TypeScript compilation
pnpm build

# Type checking only
pnpm typecheck

# Linting with auto-fix
pnpm lint
```

### Customization

#### Adding New Agent Modes
1. Extend `DummyTestAgentMode` type in `@agentkit/test-agent`
2. Add mode handling in `agentSetup.ts`
3. Create workflow in `exampleWorkflow.ts`
4. Update documentation

#### Creating Custom Plugins
```typescript
import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'

export class CustomPlugin implements AgentKitPlugin {
  public readonly name = 'my-custom-plugin'
  public readonly version = '1.0.0'
  
  async onInit(context: AgentContext): Promise<void> {
    // Plugin initialization
  }
  
  async onSend(payload: SendPayload, context: AgentContext): Promise<void> {
    // Handle sent messages
  }
  
  async onError(error: Error, context: AgentContext): Promise<void> {
    // Handle errors
  }
  
  async onShutdown(context: AgentContext): Promise<void> {
    // Cleanup resources
  }
}
```

#### Custom Workflows
```typescript
export async function myCustomWorkflow(handle: AgentRuntimeHandle): Promise<void> {
  // Send custom messages
  await handle.send({ type: 'custom', data: 'my-data' })
  
  // Handle responses via onOutput callback in setupAgent
}
```

## ⚡ Performance Considerations

### Recommended Settings
- **Production**: Disable debug mode, enable sandboxing
- **Development**: Enable debug logging, verbose metrics
- **Testing**: Use concurrent demos, performance benchmarks

### Resource Limits
```typescript
resourceLimits: {
  maxConcurrentRequests: 10,    // Adjust based on load
  maxQueueSize: 25,             // Prevent memory buildup
  requestTimeoutMs: 5000        // Fail fast on timeouts
}
```

## 🛡️ Security

### Sandbox Mode
```typescript
// Production (secure)
features: { sandbox: true }

// Development (fast)
features: { sandbox: false }
```

### Plugin Security
- All plugins are deep-cloned for isolation
- Plugin contexts are sanitized
- Global state mutations are prevented in sandbox mode

## 📚 Learning Path

1. **Start with Echo Mode** - Understand basic lifecycle
2. **Try Metrics Mode** - Learn observability patterns
3. **Test Fail Mode** - Practice error handling
4. **Explore Validation Mode** - Understand type safety
5. **Use Concurrent Demo** - Learn resource management
6. **Build Custom Plugins** - Extend functionality
7. **Create Custom Workflows** - Implement business logic

## 🐛 Troubleshooting

### Common Issues

#### "Cannot find module" errors
```bash
# Ensure you're in the hello-world-app directory
cd examples/hello-world-app

# Install dependencies
pnpm install
```

#### TypeScript compilation errors
```bash
# Check TypeScript configuration
pnpm typecheck

# Rebuild workspace dependencies
cd ../.. && pnpm build
```

#### Plugin errors
```bash
# Enable debug mode for detailed logs
DEBUG=true pnpm start
```

#### Performance issues
```bash
# Reduce processing delays
AGENT_MODE=echo pnpm start

# Disable concurrent testing
CONCURRENT_DEMO=false pnpm start
```

## 🔗 Related Documentation

- [AgentKit SDK Core Documentation](../../README.md)
- [Plugin Development Guide](../../docs/plugins.md)
- [Agent Registry Documentation](../../packages/registry/README.md)
- [Transport Layer Guide](../../packages/transports-dummy/README.md)

## 🤝 Contributing

This example is part of the AgentKit SDK project. To contribute:

1. Fork the repository
2. Create a feature branch
3. Add your improvements
4. Test thoroughly with `pnpm test`
5. Submit a pull request

## 📄 License

MIT License - see the [LICENSE](../../LICENSE) file for details.

---

**🎉 Happy Building with AgentKit SDK!**

This example demonstrates production-ready patterns for building robust, observable, and scalable agent applications. Use it as a foundation for your own AgentKit-powered projects.