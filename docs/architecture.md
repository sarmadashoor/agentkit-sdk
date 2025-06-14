# AgentKit SDK Architecture

## Design Philosophy

AgentKit SDK is built around three foundational principles that guide all architectural decisions:

### 1. Separation of Concerns

Each package has a single, well-defined responsibility:
- **SDK**: Agent lifecycle management and API surface
- **Registry**: Dynamic registration and lookup
- **Types**: Shared interfaces and validation
- **Transports**: Message passing abstractions
- **Test utilities**: Development and testing support

This separation ensures that changes in one area don't cascade through the system, making the SDK more maintainable and extensible.

### 2. Agent Agnosticism

AgentKit makes no assumptions about:
- AI providers (OpenAI, Anthropic, local models)
- Agent implementations (chatbots, task agents, data processors)
- Message formats or protocols
- Execution environments (browser, Node.js, serverless)

This flexibility allows developers to integrate any agent implementation while maintaining consistent lifecycle management.

### 3. Developer Experience First

All APIs prioritize:
- **Type Safety**: Full TypeScript support with runtime validation
- **Simplicity**: Minimal boilerplate, sensible defaults
- **Debugging**: Structured logging and error context
- **Reliability**: Graceful error handling and resource cleanup

## Module Breakdown

### `@agentkit/sdk` - Core SDK

**Purpose**: Primary entry point providing the `connectAgent()` API and lifecycle management.

**Key Components**:
- `index.ts` - Main `connectAgent()` function
- `AgentManager.ts` - Internal lifecycle orchestration
- `errors.ts` - Structured error system
- `log.ts` - Debug logging utilities
- `validation.ts` - Zod validation helpers

**Responsibilities**:
- Resolve agent and transport references from registry
- Initialize and coordinate agent/transport lifecycle
- Provide runtime handle for message passing
- Execute optional lifecycle hooks
- Handle errors gracefully with context preservation

### `@agentkit/registry` - Dynamic Registry

**Purpose**: Runtime registration and lookup of agents and transports.

**Key Components**:
- Agent metadata storage with factory functions
- Transport instance management
- ID-based lookup with validation
- Metadata introspection capabilities

**Responsibilities**:
- Store agent metadata including supported scopes
- Manage transport instances for reuse
- Validate registration data integrity
- Provide lookup services for SDK connection

### `@agentkit/types` - Shared Type System

**Purpose**: Centralized type definitions and runtime validation schemas.

**Key Interfaces**:
```typescript
// Core agent interface
interface Agent {
  id: string
  init(config: unknown): Promise<void>
  handle(input: unknown): Promise<unknown>
  shutdown(): Promise<void>
}

// Transport abstraction
interface Transport {
  id: string
  init(): Promise<void>
  send(message: unknown): Promise<void>
  shutdown(): Promise<void>
  onMessage(callback: (message: unknown) => void): void
}

// Connection options
interface ConnectAgentOptions {
  agent: string | Agent
  transport: string | Transport
  scope?: string[]
  debug?: boolean
  onInit?: (agentId: string) => void
  onShutdown?: (agentId: string) => void
  onError?: (err: Error) => void
  onOutput?: (message: unknown) => void
}

// Runtime handle
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
```

**Responsibilities**:
- Define contracts between all modules
- Provide Zod schemas for runtime validation
- Ensure type safety across package boundaries
- Document expected interfaces and behaviors

### `@agentkit/transports-dummy` - Local Transport

**Purpose**: In-memory transport implementation for development and testing.

**Key Features**:
- Synchronous message passing
- Event-driven architecture
- Memory-safe operation
- Consistent lifecycle management

**Responsibilities**:
- Demonstrate transport interface implementation
- Provide reliable testing infrastructure
- Enable local development without external dependencies

### `@agentkit/test-agent` - Test Utilities

**Purpose**: Dummy agent implementation for testing and development.

**Key Features**:
- Configurable response patterns
- Lifecycle event tracking
- Error simulation capabilities
- Scope-aware behavior

**Responsibilities**:
- Enable comprehensive SDK testing
- Provide development examples
- Support integration testing scenarios
- Validate agent interface compliance

## Lifecycle Overview

### Agent Lifecycle: `init` → `handle` → `shutdown`

**Initialization Phase**:
1. Agent factory creates instance
2. `agent.init(config)` called with configuration
3. Transport initialization and connection
4. Optional `onInit` hook execution

**Operation Phase**:
1. Messages sent via `handle.send(input)`
2. Agent processes input via `agent.handle(input)`
3. Response delivered through transport
4. Optional `onOutput` callback execution

**Shutdown Phase**:
1. `handle.shutdown()` called
2. Agent cleanup via `agent.shutdown()`
3. Transport disconnection and cleanup
4. Optional `onShutdown` hook execution

### Error Handling

All lifecycle phases include comprehensive error handling:
- Validation errors during connection
- Runtime errors during message handling
- Resource cleanup errors during shutdown
- Optional `onError` hook for observability

## Internal Architecture

### AgentManager (Private Module)

The `AgentManager` class orchestrates the entire agent lifecycle:

```typescript
class AgentManager {
  constructor(
    agent: Agent,
    transport: Transport,
    options: ConnectAgentOptions,
    registeredScopes: string[] = [],
    agentId?: string
  )
  
  async start(): Promise<AgentRuntimeHandle>
  async shutdown(): Promise<void>
  private callOnInit(): void
  private callOnShutdown(): void
  private callOnError(error: Error): void
}
```

**Key Responsibilities**:
- Coordinate initialization sequence
- Manage message routing between agent and transport
- Execute lifecycle hooks safely (non-blocking)
- Ensure proper resource cleanup
- Track authoritative agent IDs

### Registry as Schema + Metadata Layer

The registry operates as a typed metadata layer:

**Agent Registration**:
```typescript
interface AgentMetadata {
  id: string                    // Unique identifier
  name: string                  // Human-readable name
  version: string               // Semantic version
  description?: string          // Optional description
  supportedScopes?: string[]    // Capability declarations
  factory: () => Agent          // Instance creation function
}
```

**Transport Registration**:
```typescript
// Direct instance registration
registerTransport(transport: Transport): void
```

This approach provides:
- Type-safe metadata storage
- Factory-based lazy initialization
- Scope-based capability matching
- Version and compatibility tracking

## Zod and Type Validation Strategy

### Runtime Validation Philosophy

AgentKit uses a "validate at boundaries" approach:
- **Input Validation**: All external inputs validated on entry
- **Internal Trust**: Validated data flows safely through internal APIs
- **Output Validation**: Responses validated before delivery

### Zod Schema Strategy

```typescript
// Runtime validation with type inference
const ConnectAgentOptionsSchema = z.object({
  agent: z.union([z.string(), z.any()]),
  transport: z.union([z.string(), z.any()]),
  scope: z.array(z.string()).optional(),
  debug: z.boolean().optional(),
  // Lifecycle hooks
  onInit: z.function().optional(),
  onShutdown: z.function().optional(),
  onError: z.function().optional(),
  onOutput: z.function().optional()
})

// TypeScript type derived from schema
type ConnectAgentOptions = z.infer<typeof ConnectAgentOptionsSchema>
```

**Benefits**:
- Single source of truth for types and validation
- Runtime safety without type assertion overhead
- Automatic TypeScript IntelliSense support
- Clear error messages for validation failures

### Validation Boundaries

1. **SDK Entry Points**: `connectAgent()` validates all options
2. **Registry Operations**: Metadata validation during registration
3. **Agent Interfaces**: Input/output validation in test implementations
4. **Transport Messages**: Optional validation for debugging

## Design Patterns

### Factory Pattern
- Agents created via factory functions for lazy initialization
- Enables dependency injection and configuration

### Registry Pattern
- Centralized lookup with metadata preservation
- Supports runtime discovery and introspection

### Handle Pattern
- Runtime handles provide controlled access to agent capabilities
- Encapsulates lifecycle management and resource cleanup

### Observer Pattern
- Lifecycle hooks enable non-intrusive observability
- Transport events support message routing and debugging

## Security Considerations

### Input Validation
- All external inputs validated with Zod schemas
- Agent implementations responsible for additional validation

### Resource Management
- Automatic cleanup on shutdown or error
- Transport isolation prevents cross-contamination

### Error Context
- Structured errors with context preservation
- No sensitive data leakage in error messages

## Performance Characteristics

### Memory Management
- Lazy initialization reduces startup overhead
- Explicit shutdown ensures resource cleanup
- Transport reuse minimizes connection overhead

### Scalability
- Stateless agent instances support horizontal scaling
- Registry lookup optimized for frequent access
- Minimal runtime overhead for lifecycle management

### Monitoring
- Optional lifecycle hooks for performance tracking
- Structured logging for debugging and observability
- Metadata exposure for runtime introspection

## Extension Points

### Custom Agents
- Implement the `Agent` interface
- Register with metadata including supported scopes
- Leverage existing lifecycle management

### Custom Transports
- Implement the `Transport` interface
- Handle message routing and connection management
- Support any protocol or communication pattern

### Custom Validation
- Extend Zod schemas for domain-specific validation
- Add custom error types for specialized error handling
- Implement custom logging strategies

This architecture provides a solid foundation for AI agent integration while maintaining flexibility for diverse use cases and implementations.