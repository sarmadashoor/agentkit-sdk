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

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### Installation

```bash
pnpm install
```

### Building

```bash
pnpm build
```

### Testing

```bash
pnpm test
```

## Development

This is a monorepo managed with pnpm workspaces. Each package in the `packages/` directory is a separate npm package that can be published independently.

### Available Scripts

- `pnpm build` - Build all packages
- `pnpm test` - Run all tests
- `pnpm clean` - Clean all build artifacts
- `pnpm lint` - Run linting
- `pnpm typecheck` - Run TypeScript type checking

## License

MIT