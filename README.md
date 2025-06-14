# AgentKit SDK

A modular, secure, agent-agnostic TypeScript SDK for managing AI agents inside host applications.

## Overview

AgentKit SDK provides a foundational framework for integrating and managing AI agents within applications. The SDK is designed to be:

- **Modular**: Built as a monorepo with separate packages for different concerns
- **Secure**: Emphasizes secure agent integration and communication
- **Agent-Agnostic**: Works with any AI agent implementation
- **TypeScript-First**: Full TypeScript support with strong typing via Zod schemas

## MVP Goals

1. **Agent Registry**: A centralized registry for managing agent configurations and lifecycle
2. **Transport Layer**: Flexible transport interfaces for agent communication
3. **Type Safety**: Shared Zod schemas and TypeScript interfaces across all packages
4. **Test Infrastructure**: Comprehensive testing setup with dummy agents for lifecycle testing
5. **Developer Experience**: Easy-to-use APIs with clear documentation

## Project Structure

```
agentkit-sdk/
├── packages/
│   ├── sdk/              # Core SDK (@agentkit/sdk)
│   ├── registry/         # Internal Agent Registry (@agentkit/registry)
│   ├── transports-dummy/ # Dummy transport interface implementation
│   ├── test-agent/       # Dummy agent for lifecycle testing
│   └── types/            # Shared Zod schemas + interfaces
├── test/                 # Integration and lifecycle tests
├── docs/                 # Architecture, registry spec, changelog
└── scripts/              # Future CLI tooling
```

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

// Register an agent
AgentRegistry.register({
  id: 'my-agent',
  name: 'My Agent',
  version: '1.0.0',
  factory: () => new DummyAgent()
})

// Register a transport
AgentRegistry.registerTransport(new DummyTransport())

// Connect and use
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  onOutput: (message) => console.log('Agent response:', message)
})

await handle.send({ message: 'Hello, agent!' })
await handle.shutdown()
```

See [`examples/`](./examples/) for more detailed usage patterns.

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0 (recommended) or npm

### Installation

```bash
# With pnpm (recommended)
pnpm install

# Or with npm
npm install
```

### Building

```bash
# With pnpm
pnpm build

# Or with npm
npm run build:npm
```

### Testing

```bash
# With pnpm
pnpm test

# Or with npm  
npm run test:npm
```

## Development

This is a monorepo managed with pnpm workspaces. Each package in the `packages/` directory is a separate npm package that can be published independently.

### Available Scripts

- `pnpm build` / `npm run build:npm` - Build all packages
- `pnpm test` / `npm run test:npm` - Run all tests
- `pnpm typecheck` / `npm run typecheck:npm` - Run TypeScript type checking
- `pnpm clean` - Clean all build artifacts
- `pnpm lint` - Run linting

## Documentation

- [📖 Architecture Overview](./docs/architecture.md) - System design and component relationships
- [🗂️ Registry Documentation](./docs/registry.md) - Agent and transport registration patterns
- [📋 Changelog](./docs/CHANGELOG.md) - Version history and release notes

## Examples

- [`examples/basic-agent-usage.ts`](./examples/basic-agent-usage.ts) - Fundamental SDK usage patterns
- [`examples/debug-mode.ts`](./examples/debug-mode.ts) - Debug logging and lifecycle hooks

## License

MIT