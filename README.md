# AgentKit SDK

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Version](https://img.shields.io/badge/version-0.1.0--alpha-orange.svg)](./docs/CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-51%2B%20passing-brightgreen.svg)](./packages/)

A modular, secure, agent-agnostic TypeScript SDK for managing AI agents inside host applications.

## Overview

AgentKit SDK provides a foundational framework for integrating and managing AI agents within applications. The SDK abstracts away the complexity of agent lifecycle management, transport protocols, and type safety while maintaining full flexibility for different agent implementations.

### Key Features

- **🔄 Lifecycle Management**: Comprehensive agent lifecycle with `init`, `handle`, and `shutdown` phases
- **🗂️ Dynamic Registry**: Runtime agent and transport registration with metadata preservation
- **🛡️ Type Safety**: Full TypeScript support with Zod runtime validation
- **🔧 Modular Design**: Clean separation of concerns across packages
- **🧪 Test Infrastructure**: Built-in testing utilities with dummy implementations
- **📊 Observability**: Optional lifecycle hooks and structured debug logging
- **🌐 Agent-Agnostic**: Works with any AI agent implementation

### Architecture Philosophy

AgentKit is designed around three core principles:

1. **Separation of Concerns**: Each package has a single, well-defined responsibility
2. **Agent Agnosticism**: No assumptions about specific AI providers or implementations
3. **Developer Experience**: Simple APIs with comprehensive type safety and debugging

## Quick Start

### Installation

```bash
npm install @agentkit/sdk
```

### Basic Usage

```typescript
import { connectAgent, AgentRegistry } from '@agentkit/sdk'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'

// Step 1: Register an agent
AgentRegistry.register({
  id: 'my-agent',
  name: 'My Agent',
  version: '1.0.0',
  supportedScopes: ['chat', 'analysis'],
  factory: () => new DummyAgent()
})

// Step 2: Register a transport
AgentRegistry.registerTransport(new DummyTransport())

// Step 3: Connect and use
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  scope: ['chat'],
  onOutput: (message) => console.log('Agent response:', message)
})

// Step 4: Send messages
await handle.send({ message: 'Hello, agent!' })
await handle.send({ task: 'analyze', data: [1, 2, 3] })

// Step 5: Clean shutdown
await handle.shutdown()
```

### Agent Lifecycle

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Registration  │    │   Connection     │    │   Operation     │
│                 │    │                  │    │                 │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │ Register    │ │    │ │ Resolve      │ │    │ │ Send        │ │
│ │ Agent +     │ │───▶│ │ Agent +      │ │───▶│ │ Messages    │ │
│ │ Transport   │ │    │ │ Transport    │ │    │ │             │ │
│ └─────────────┘ │    │ └──────────────┘ │    │ └─────────────┘ │
│                 │    │        │         │    │        │        │
│                 │    │        ▼         │    │        ▼        │
│                 │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│                 │    │ │ Initialize   │ │    │ │ Process &   │ │
│                 │    │ │ Components   │ │    │ │ Respond     │ │
│                 │    │ └──────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │   Shutdown      │
                                               │                 │
                                               │ ┌─────────────┐ │
                                               │ │ Cleanup     │ │
                                               │ │ Resources   │ │
                                               │ └─────────────┘ │
                                               └─────────────────┘
```

### Advanced Features

**Lifecycle Hooks for Observability:**

```typescript
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  debug: true,
  onInit: (agentId) => console.log(`Agent ${agentId} initialized`),
  onShutdown: (agentId) => console.log(`Agent ${agentId} shutdown`),
  onError: (error) => console.error('Agent error:', error)
})
```

**Scope-based Configuration:**

```typescript
AgentRegistry.register({
  id: 'specialized-agent',
  name: 'Specialized Agent',
  version: '1.0.0',
  supportedScopes: ['analysis', 'reporting'],
  factory: () => new SpecializedAgent()
})

// Request specific scopes
const handle = await connectAgent({
  agent: 'specialized-agent',
  transport: 'dummy',
  scope: ['analysis'] // Only request what you need
})
```

**Resource Limits and Concurrency Control:**

```typescript
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  resourceLimits: {
    maxConcurrentRequests: 10,
    maxQueueSize: 50,
    requestTimeoutMs: 30000,
    maxPayloadSize: 1024 * 1024 // 1MB
  }
})
```

### Shutdown Safety and Concurrency

AgentKit provides robust shutdown safety with built-in race condition prevention:

**Guaranteed Shutdown Safety:**
- ✅ All queued operations are properly rejected with `AgentShutdownError`
- ✅ Active operations are allowed to complete within a timeout window
- ✅ No new operations can be queued after shutdown begins
- ✅ Multiple shutdown calls are safely handled (idempotent)
- ✅ Memory leaks are prevented through proper timer and promise cleanup

**Race Condition Prevention:**
```typescript
// Safe concurrent operations
const operations = [
  handle.send({ message: 'first' }),
  handle.send({ message: 'second' }),
  handle.send({ message: 'third' })
]

// Safe shutdown during operations
setTimeout(() => handle.shutdown(), 100)

// All operations will either complete or fail with AgentShutdownError
const results = await Promise.allSettled(operations)
```

**Error Handling After Shutdown:**
```typescript
try {
  await handle.send({ message: 'after shutdown' })
} catch (error) {
  if (error instanceof AgentShutdownError) {
    console.log('Operation rejected: agent has been shutdown')
    // Handle graceful degradation
  }
}
```

**Bounded Execution and Backpressure:**
AgentKit uses a built-in bounded executor that provides:
- Automatic concurrency limiting based on `resourceLimits`
- Queue management with configurable backpressure
- Timeout handling for long-running operations
- Graceful error propagation without hanging

## Project Structure

```
agentkit-sdk/
├── packages/
│   ├── sdk/                 # Core SDK (@agentkit/sdk)
│   │   ├── src/
│   │   │   ├── index.ts     # Main connectAgent() API
│   │   │   ├── AgentManager.ts  # Internal lifecycle management
│   │   │   ├── errors.ts    # Structured error system
│   │   │   ├── log.ts       # Debug logging utilities
│   │   │   └── validation.ts # Zod validation helpers
│   │   └── __tests__/       # Comprehensive test suite
│   │
│   ├── types/               # Shared types (@agentkit/types)
│   │   └── src/index.ts     # Agent, Transport, and validation schemas
│   │
│   ├── registry/            # Agent registry (@agentkit/registry)
│   │   └── src/index.ts     # Dynamic registration and lookup
│   │
│   ├── test-agent/          # Testing utilities (@agentkit/test-agent)
│   │   └── src/index.ts     # DummyAgent for development
│   │
│   └── transports-dummy/    # Local transport (@agentkit/transports-dummy)
│       └── src/index.ts     # In-memory message passing
│
├── examples/                # Usage examples
│   ├── basic-agent-usage.ts # Getting started guide
│   └── debug-mode.ts        # Advanced debugging
│
├── docs/                    # Documentation
│   ├── architecture.md      # System design overview
│   ├── registry.md          # Registration patterns
│   ├── migration.md         # Version and scope info
│   └── CHANGELOG.md         # Release history
│
└── scripts/                 # Build and development tools
    ├── build-all.sh         # Cross-platform build
    ├── test-all.sh          # Cross-platform testing
    └── typecheck.sh         # Type validation
```

## Development Setup

### Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0 (recommended) or npm

### Installation

```bash
# With pnpm (recommended)
pnpm install

# Or with npm (fallback)
npm install
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm build` / `npm run build:npm` | Build all packages in dependency order |
| `pnpm test` / `npm run test:npm` | Run comprehensive test suite (51+ tests) |
| `pnpm typecheck` / `npm run typecheck:npm` | Validate TypeScript across all packages |
| `pnpm clean` | Remove all build artifacts |
| `pnpm lint` | Run ESLint across packages |

### Package Development

Each package is independently buildable and testable:

```bash
# Work on a specific package
cd packages/sdk
npm run build
npm test
npm run typecheck
```

## Documentation

| Document | Description |
|----------|-------------|
| [📖 Architecture Overview](./docs/architecture.md) | System design, modules, and philosophy |
| [🗂️ Registry Documentation](./docs/registry.md) | Agent registration and metadata patterns |
| [🚀 Migration Guide](./docs/migration.md) | Version scope and stability guarantees |
| [📋 Changelog](./docs/CHANGELOG.md) | Complete version history and features |

## Examples

| Example | Description |
|---------|-------------|
| [`basic-agent-usage.ts`](./examples/basic-agent-usage.ts) | Complete getting started example |
| [`debug-mode.ts`](./examples/debug-mode.ts) | Lifecycle hooks and debugging |

## API Reference

### Core Functions

#### `connectAgent(options: ConnectAgentOptions): Promise<AgentRuntimeHandle>`

Main SDK entry point for connecting to registered agents.

**Parameters:**
- `agent`: Agent ID (string) or Agent instance
- `transport`: Transport ID (string) or Transport instance
- `scope?`: Array of requested capability scopes
- `techStack?`: Technology stack identifier
- `debug?`: Enable detailed logging
- `onInit?`, `onShutdown?`, `onError?`: Lifecycle hooks
- `onOutput?`: Message output callback

**Returns:** `AgentRuntimeHandle` with `send()`, `shutdown()`, and `metadata`

#### `AgentRegistry.register(metadata: AgentMetadata): void`

Register an agent for dynamic lookup.

#### `AgentRegistry.registerTransport(transport: Transport): void`

Register a transport for message passing.

### Types

```typescript
interface AgentRuntimeHandle {
  send: (input: unknown) => Promise<void>
  shutdown: () => Promise<void>
  metadata: {
    agentId: string
    transportId: string
    registeredScopes: string[]
    requestedScopes: string[]
  }
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

## Testing

The SDK includes comprehensive testing infrastructure:

- **51+ tests** covering all packages and scenarios
- **Unit tests** for individual components
- **Integration tests** for full lifecycle workflows  
- **Edge case testing** for error scenarios and validation
- **End-to-end tests** with real agent/transport interactions

```bash
# Run all tests
npm run test:npm

# Run tests for specific package
cd packages/sdk && npm test

# Run with coverage
npm test -- --coverage
```

## Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/my-feature`
3. **Commit** changes: `git commit -am 'Add my feature'`
4. **Push** to branch: `git push origin feature/my-feature`
5. **Submit** a pull request

### Development Guidelines

- All code must pass TypeScript compilation (`npm run typecheck:npm`)
- All tests must pass (`npm run test:npm`)
- Follow existing code style and patterns
- Add tests for new functionality
- Update documentation for API changes

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Support

- 📚 [Documentation](./docs/) - Complete guides and API reference
- 🐛 [Issues](https://github.com/your-org/agentkit-sdk/issues) - Bug reports and feature requests
- 💬 [Discussions](https://github.com/your-org/agentkit-sdk/discussions) - Community support

---

**AgentKit SDK v0.1.0-alpha** - Built for reliable AI agent integration.