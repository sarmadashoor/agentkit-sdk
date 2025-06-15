# Snapshot Agent Example

A comprehensive example demonstrating how to integrate with the AgentKit SDK in a real-world scenario. This example simulates a "snapshot service" that can create, store, retrieve, and manage data snapshots.

## 🎯 Purpose

This example serves as:
- **Integration validation**: Ensures the AgentKit SDK works correctly in real scenarios
- **Documentation**: Shows best practices for SDK integration
- **Testing**: Provides an isolated smoke test for the SDK
- **Reference implementation**: Template for building your own agents

## 🏗️ Architecture

The example consists of four main components:

### 1. **SnapshotAgent** (`src/SnapshotAgent.ts`)
A realistic agent implementation that:
- Implements the `Agent` interface from `@agentkit/sdk`
- Manages in-memory snapshot storage
- Provides CRUD operations for snapshots
- Includes data processing capabilities
- Enforces storage limits and validation

### 2. **MockTransport** (`src/MockTransport.ts`)
A transport that simulates real-world network behavior:
- Configurable latency and failure rates
- Multiple transport profiles (reliable, unreliable, slow)
- Comprehensive logging and statistics
- Error simulation for testing

### 3. **SnapshotLoggingPlugin** (`src/SnapshotLoggingPlugin.ts`)
A custom plugin demonstrating real-world plugin development:
- Enhanced logging specific to snapshot operations
- Performance metrics collection
- Configurable log levels and output
- Snapshot-aware error handling

### 4. **SnapshotService** (`src/index.ts`)
A high-level service wrapper that:
- Demonstrates complete SDK integration
- Provides convenient API methods
- Handles lifecycle management
- Shows proper error handling patterns

## 🚀 Getting Started

### Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

### Basic Usage

```typescript
import { SnapshotService } from './src/index.js'

// Create and initialize the service
const service = new SnapshotService({
  debug: true,
  transport: 'reliable',
  maxSnapshots: 100,
  enableCustomLogging: true
})

await service.initialize()

// Create a snapshot
await service.createSnapshot(
  { message: 'Hello, World!', timestamp: Date.now() },
  'my-first-snapshot'
)

// Retrieve the snapshot
await service.getSnapshot('my-first-snapshot')

// List all snapshots
const snapshots = await service.listSnapshots()

// Process data without storing
await service.processData({ 
  complex: { nested: { data: 'structure' } } 
})

// Clean up
await service.shutdown()
```

### Running the Demo

```bash
# Run the interactive demonstration
npm run dev
```

## 🧪 Testing

The example includes comprehensive tests that validate:

### Integration Tests (`__tests__/integration.test.ts`)
- Complete lifecycle: init → send → shutdown
- Plugin integration and lifecycle hooks
- Error handling and resilience
- Transport failure scenarios
- High-level API functionality

### Unit Tests (`__tests__/snapshot-agent.test.ts`)
- Agent interface compliance
- All snapshot operations (CRUD)
- Input validation and error handling
- Storage limits and statistics
- Edge cases and error conditions

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## 🔧 Configuration

### SnapshotService Options

```typescript
interface SnapshotServiceConfig {
  /** Enable debug logging */
  debug?: boolean
  
  /** Transport type */
  transport?: 'reliable' | 'unreliable' | 'slow'
  
  /** Maximum snapshots to store */
  maxSnapshots?: number
  
  /** Enable custom logging plugin */
  enableCustomLogging?: boolean
}
```

### Transport Profiles

#### Reliable Transport
```typescript
// Fast, reliable transport (default)
const transport = MockTransport.createReliableTransport()
```

#### Unreliable Transport
```typescript
// High failure rate for testing error handling
const transport = MockTransport.createFailingTransport()
```

#### Slow Transport
```typescript
// High latency for testing timeout scenarios
const transport = MockTransport.createSlowTransport()
```

### Logging Plugin Configuration

```typescript
const loggingPlugin = new SnapshotLoggingPlugin({
  logLevel: 'info',           // 'debug' | 'info' | 'warn' | 'error'
  includePayloads: false,     // Include request/response data
  includeContext: true,       // Include full context objects
  logPrefix: '[SnapshotAgent]', // Custom log prefix
  enableMetrics: true         // Track performance metrics
})
```

## 📊 API Reference

### Snapshot Operations

#### Create Snapshot
```typescript
await service.createSnapshot(data: unknown, snapshotId?: string)
```
Creates a new snapshot with optional custom ID.

#### Get Snapshot
```typescript
await service.getSnapshot(snapshotId: string)
```
Retrieves a snapshot by ID.

#### List Snapshots
```typescript
const snapshots = await service.listSnapshots()
```
Returns array of all snapshot IDs.

#### Delete Snapshot
```typescript
await service.deleteSnapshot(snapshotId: string)
```
Removes a snapshot by ID.

#### Process Data
```typescript
await service.processData(data: unknown)
```
Processes data without storing it.

### Request/Response Format

#### Snapshot Request
```typescript
interface SnapshotRequest {
  action: 'create' | 'get' | 'list' | 'delete' | 'process'
  snapshotId?: string
  data?: unknown
  metadata?: Record<string, unknown>
}
```

#### Snapshot Response
```typescript
interface SnapshotResponse {
  success: boolean
  snapshotId?: string
  data?: unknown
  snapshots?: string[]
  error?: string
  timestamp: number
  agentVersion: string
}
```

## 🔍 Key SDK Integration Points

### 1. Agent Registration
```typescript
import { AgentRegistry } from '@agentkit/sdk'

const registry = new AgentRegistry()
registry.register({
  id: 'snapshot-agent',
  name: 'Snapshot Agent',
  version: '1.0.0',
  factory: () => new SnapshotAgent(),
  supportedScopes: ['read', 'write']
})
```

### 2. Transport Registration
```typescript
const transport = new MockTransport(config)
registry.registerTransport(transport)
```

### 3. Plugin Setup
```typescript
const plugins = [
  new SnapshotLoggingPlugin(config),
  // Add more plugins as needed
]
```

### 4. SDK Connection
```typescript
import { connectAgent } from '@agentkit/sdk'

const handle = await connectAgent({
  agent: 'snapshot-agent',
  transport: 'mock-transport',
  registry,
  plugins,
  scope: ['read', 'write'],
  debug: true,
  onInit: (agentId) => console.log(`Initialized: ${agentId}`),
  onError: (error) => console.error('Error:', error),
  onShutdown: (agentId) => console.log(`Shutdown: ${agentId}`)
})
```

## 🛡️ Error Handling

The example demonstrates proper error handling at multiple levels:

### Transport Level
- Network timeouts and failures
- Connection issues
- Retry mechanisms

### Agent Level
- Input validation
- Business logic errors
- Storage constraints

### Plugin Level
- Plugin failure isolation
- Error logging and metrics
- Graceful degradation

### Service Level
- Lifecycle management
- State validation
- Resource cleanup

## 📈 Performance Considerations

### Metrics Collection
The logging plugin tracks:
- Request count and response times
- Error rates and success rates
- Memory usage patterns
- Throughput metrics

### Resource Management
- Configurable storage limits
- Memory-efficient snapshot storage
- Proper cleanup on shutdown

### Concurrency
- Safe concurrent operations
- Queue management
- Resource contention handling

## 🔄 Lifecycle Management

### Initialization Sequence
1. Create agent and transport instances
2. Register with AgentRegistry
3. Configure plugins
4. Connect via `connectAgent()`
5. Verify successful initialization

### Operation Phase
1. Send requests via `handle.send()`
2. Process responses asynchronously
3. Handle errors gracefully
4. Monitor performance metrics

### Shutdown Sequence
1. Stop accepting new requests
2. Complete in-flight operations
3. Call `handle.shutdown()`
4. Clean up resources
5. Verify graceful termination

## 🎛️ Customization

### Creating Custom Agents
```typescript
import type { Agent } from '@agentkit/sdk'

class MyCustomAgent implements Agent {
  readonly id = 'my-agent'
  readonly name = 'My Custom Agent'
  readonly version = '1.0.0'

  async init(config?: unknown): Promise<void> {
    // Initialize your agent
  }

  async handle(input: unknown): Promise<unknown> {
    // Process requests
  }

  async shutdown(): Promise<void> {
    // Clean up resources
  }
}
```

### Creating Custom Transports
```typescript
import type { Transport } from '@agentkit/sdk'

class MyCustomTransport implements Transport {
  readonly id = 'my-transport'
  readonly name = 'My Custom Transport'

  async init(config?: unknown): Promise<void> {
    // Initialize transport
  }

  async send(data: unknown): Promise<void> {
    // Send data to destination
  }
}
```

### Creating Custom Plugins
```typescript
import type { AgentKitPlugin } from '@agentkit/sdk'

const myPlugin: AgentKitPlugin = {
  name: 'my-plugin',
  version: '1.0.0',
  
  onInit(context) {
    // Agent initialized
  },
  
  onSend(payload, context) {
    // Request being sent
  },
  
  onError(error, context) {
    // Error occurred
  },
  
  onShutdown(context) {
    // Agent shutting down
  }
}
```

## 🚨 Important Notes

### SDK API Usage
This example **ONLY** uses public APIs from `@agentkit/sdk`:
- No internal imports or private APIs
- No tight coupling with SDK internals
- Demonstrates real-world usage patterns

### Type Safety
- Full TypeScript support
- Proper interface implementations
- Runtime validation where needed

### Testing Strategy
- Comprehensive test coverage
- Integration and unit tests
- Error scenario validation
- Performance verification

## 📚 Additional Resources

- [AgentKit SDK Documentation](../../packages/sdk/README.md)
- [Plugin Development Guide](../../packages/sdk/src/plugins/README.md)
- [Transport Implementation Guide](../../packages/transports/README.md)
- [Registry Usage Examples](../../packages/registry/README.md)

## 🤝 Contributing

This example serves as a reference implementation. When making changes:

1. Maintain compatibility with public SDK APIs only
2. Update tests to match any changes
3. Document new features or configurations
4. Ensure example remains realistic and practical

## 📄 License

This example is part of the AgentKit project and follows the same license terms.