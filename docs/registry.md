# Agent Registry Documentation

## Overview

The AgentKit Registry is a runtime metadata system that enables dynamic discovery and instantiation of agents and transports. It operates as the central coordination layer between the SDK's `connectAgent()` API and the actual implementations.

## Design Principles

### 1. Metadata-Driven Registration
All agents are registered with comprehensive metadata that describes their capabilities, requirements, and constraints. This metadata enables intelligent matching and configuration.

### 2. Lazy Instantiation
Agents are created on-demand via factory functions, allowing for dependency injection, configuration customization, and resource optimization.

### 3. Type Safety + Runtime Validation
Registration data is validated both at compile time (TypeScript) and runtime (Zod schemas) to ensure system integrity.

### 4. Scope-Based Capabilities
Agents declare supported scopes that define their functional capabilities, enabling fine-grained access control and feature matching.

## Registration Patterns

### Agent Registration

#### Basic Agent Registration
```typescript
import { AgentRegistry } from '@agentkit/registry'
import { MyCustomAgent } from './my-custom-agent'

AgentRegistry.register({
  id: 'my-agent',
  name: 'My Custom Agent',
  version: '1.0.0',
  description: 'A specialized agent for data processing',
  supportedScopes: ['data-processing', 'analysis'],
  factory: () => new MyCustomAgent()
})
```

#### Factory-Based Registration with Configuration
```typescript
AgentRegistry.register({
  id: 'configurable-agent',
  name: 'Configurable Agent',
  version: '2.1.0',
  supportedScopes: ['chat', 'analysis', 'reporting'],
  factory: () => {
    const agent = new ConfigurableAgent()
    agent.configure({
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 2000
    })
    return agent
  }
})
```

#### Dependency Injection Pattern
```typescript
// Service dependencies
const aiService = new OpenAIService(process.env.OPENAI_API_KEY)
const database = new DatabaseConnection()

AgentRegistry.register({
  id: 'enterprise-agent',
  name: 'Enterprise Agent',
  version: '1.5.0',
  supportedScopes: ['enterprise', 'data-access', 'reporting'],
  factory: () => {
    return new EnterpriseAgent({
      aiService,
      database,
      enableAuditLogging: true
    })
  }
})
```

### Transport Registration

#### Basic Transport Registration
```typescript
import { DummyTransport } from '@agentkit/transports-dummy'

const transport = new DummyTransport()
AgentRegistry.registerTransport(transport)
```

#### Custom Transport Registration
```typescript
import { WebSocketTransport } from './websocket-transport'

const wsTransport = new WebSocketTransport({
  url: 'ws://localhost:8080',
  reconnectAttempts: 3,
  timeout: 5000
})

AgentRegistry.registerTransport(wsTransport)
```

## Metadata Schema

### AgentMetadata Interface
```typescript
interface AgentMetadata {
  id: string                    // Unique identifier for registry lookup
  name: string                  // Human-readable display name
  version: string               // Semantic version (e.g., "1.2.3")
  description?: string          // Optional description for documentation
  supportedScopes?: string[]    // Declared capability scopes
  factory: () => Agent          // Factory function for creating instances
}
```

### Metadata Field Guidelines

#### `id` Field
- **Purpose**: Unique identifier for registry lookup
- **Format**: kebab-case recommended (`my-agent`, `data-processor`)
- **Uniqueness**: Must be unique within the registry
- **Immutability**: Should not change across versions

#### `name` Field
- **Purpose**: Human-readable display name
- **Format**: Title Case recommended (`My Agent`, `Data Processor`)
- **Usage**: Documentation, logs, and user interfaces

#### `version` Field
- **Purpose**: Semantic versioning for compatibility tracking
- **Format**: Must follow [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`)
- **Usage**: Compatibility checks and documentation

#### `description` Field (Optional)
- **Purpose**: Detailed description of agent capabilities
- **Format**: Single sentence or short paragraph
- **Usage**: Documentation and developer guidance

#### `supportedScopes` Field (Optional)
- **Purpose**: Declare functional capabilities
- **Format**: Array of kebab-case scope names
- **Usage**: Capability matching and access control

#### `factory` Field
- **Purpose**: Create agent instances on demand
- **Requirements**: Must return a valid `Agent` instance
- **Best Practices**: Handle dependency injection and configuration

## Scope-Based Capabilities

### Scope Declaration
Agents can declare their supported capabilities through scopes:

```typescript
AgentRegistry.register({
  id: 'multi-capability-agent',
  name: 'Multi-Capability Agent',
  version: '1.0.0',
  supportedScopes: [
    'chat',           // Conversational interactions
    'analysis',       // Data analysis tasks
    'file-processing', // File operations
    'web-search',     // Web search capabilities
    'code-generation' // Code generation tasks
  ],
  factory: () => new MultiCapabilityAgent()
})
```

### Scope Matching During Connection
When connecting to an agent, the SDK performs scope validation:

```typescript
const handle = await connectAgent({
  agent: 'multi-capability-agent',
  transport: 'dummy',
  scope: ['chat', 'analysis'] // Request specific capabilities
})

// Access scope information
console.log(handle.metadata.registeredScopes) // All agent capabilities
console.log(handle.metadata.requestedScopes)  // Requested subset
```

### Scope Validation Behavior
- **Subset Matching**: Requested scopes must be a subset of supported scopes
- **Logging**: Mismatches are logged for debugging but don't prevent connection
- **Metadata Tracking**: Both registered and requested scopes are available in runtime metadata

## Registry Operations

### Registration Operations

#### Register Agent
```typescript
AgentRegistry.register(metadata: AgentMetadata): void
```
- Validates metadata structure and types
- Stores metadata for lookup
- Throws error on duplicate IDs

#### Register Transport
```typescript
AgentRegistry.registerTransport(transport: Transport): void
```
- Stores transport instance for reuse
- Uses `transport.id` as lookup key
- Throws error on duplicate IDs

### Lookup Operations

#### Get Agent Metadata
```typescript
const metadata = AgentRegistry.getAgent('my-agent')
if (metadata) {
  console.log(`Found agent: ${metadata.name} v${metadata.version}`)
  console.log(`Scopes: ${metadata.supportedScopes?.join(', ')}`)
}
```

#### Get Transport Instance
```typescript
const transport = AgentRegistry.getTransport('dummy')
if (transport) {
  console.log(`Found transport: ${transport.id}`)
}
```

#### List All Registered Agents
```typescript
const allAgents = AgentRegistry.listAgents()
allAgents.forEach(metadata => {
  console.log(`${metadata.id}: ${metadata.name} v${metadata.version}`)
})
```

#### List All Registered Transports
```typescript
const allTransports = AgentRegistry.listTransports()
allTransports.forEach(transport => {
  console.log(`Transport: ${transport.id}`)
})
```

### Registry State Management

#### Clear All Registrations
```typescript
AgentRegistry.clear()  // Removes all agents and transports
```

#### Remove Specific Agent
```typescript
AgentRegistry.removeAgent('my-agent')  // Remove specific agent
```

#### Remove Specific Transport
```typescript
AgentRegistry.removeTransport('my-transport')  // Remove specific transport
```

## Error Handling

### Registration Errors

#### Duplicate Agent ID
```typescript
try {
  AgentRegistry.register({ id: 'existing-agent', /* ... */ })
} catch (error) {
  if (error instanceof RegistryError) {
    console.error(`Registration failed: ${error.message}`)
  }
}
```

#### Invalid Metadata
```typescript
try {
  AgentRegistry.register({
    id: '',  // Invalid: empty ID
    name: 'Test Agent',
    version: 'invalid',  // Invalid: not semantic version
    factory: null  // Invalid: not a function
  })
} catch (error) {
  // Validation error with detailed message
}
```

### Lookup Errors

#### Agent Not Found
```typescript
const metadata = AgentRegistry.getAgent('nonexistent-agent')
if (!metadata) {
  throw new Error('Agent not found: nonexistent-agent')
}
```

#### Transport Not Found
```typescript
const transport = AgentRegistry.getTransport('nonexistent-transport')
if (!transport) {
  throw new Error('Transport not found: nonexistent-transport')
}
```

## Advanced Patterns

### Conditional Registration
```typescript
// Register different agents based on environment
if (process.env.NODE_ENV === 'production') {
  AgentRegistry.register({
    id: 'prod-agent',
    name: 'Production Agent',
    version: '1.0.0',
    supportedScopes: ['production', 'optimized'],
    factory: () => new ProductionAgent()
  })
} else {
  AgentRegistry.register({
    id: 'prod-agent',  // Same ID, different implementation
    name: 'Development Agent',
    version: '1.0.0-dev',
    supportedScopes: ['development', 'debug'],
    factory: () => new DevelopmentAgent()
  })
}
```

### Plugin System Pattern
```typescript
interface AgentPlugin {
  register(registry: typeof AgentRegistry): void
}

class ChatPlugin implements AgentPlugin {
  register(registry: typeof AgentRegistry) {
    registry.register({
      id: 'chat-agent',
      name: 'Chat Agent',
      version: '1.0.0',
      supportedScopes: ['chat', 'conversation'],
      factory: () => new ChatAgent()
    })
  }
}

// Load plugins
const plugins = [new ChatPlugin(), new AnalysisPlugin()]
plugins.forEach(plugin => plugin.register(AgentRegistry))
```

### Factory Validation Pattern
```typescript
AgentRegistry.register({
  id: 'validated-agent',
  name: 'Validated Agent',
  version: '1.0.0',
  factory: () => {
    // Validate environment
    if (!process.env.REQUIRED_API_KEY) {
      throw new Error('REQUIRED_API_KEY environment variable not set')
    }
    
    // Validate dependencies
    if (!isServiceAvailable()) {
      throw new Error('Required service not available')
    }
    
    return new ValidatedAgent()
  }
})
```

## Best Practices

### 1. ID Naming Conventions
- Use kebab-case: `my-agent`, `data-processor`
- Be descriptive: `sentiment-analyzer` vs `agent1`
- Include domain when relevant: `finance-report-agent`

### 2. Version Management
- Follow semantic versioning strictly
- Use pre-release versions for development: `1.0.0-alpha`, `1.0.0-beta`
- Document breaking changes clearly

### 3. Scope Design
- Use domain-specific scope names: `finance-analysis` vs `analysis`
- Keep scopes granular for precise capability matching
- Document scope meanings and requirements

### 4. Factory Function Guidelines
- Keep factories lightweight and fast
- Handle configuration and dependency injection
- Validate prerequisites before creating instances
- Use consistent error handling patterns

### 5. Error Handling
- Provide clear, actionable error messages
- Include context in error reporting
- Use structured errors for programmatic handling
- Log registration failures appropriately

## Testing and Development

### Mock Registration for Testing
```typescript
import { AgentRegistry } from '@agentkit/registry'
import { DummyAgent } from '@agentkit/test-agent'

// Set up test environment
beforeEach(() => {
  AgentRegistry.clear()
  
  AgentRegistry.register({
    id: 'test-agent',
    name: 'Test Agent',
    version: '1.0.0-test',
    supportedScopes: ['test'],
    factory: () => new DummyAgent()
  })
})
```

### Development Mode Registration
```typescript
if (process.env.NODE_ENV === 'development') {
  // Register debug-friendly agents
  AgentRegistry.register({
    id: 'debug-agent',
    name: 'Debug Agent',
    version: '1.0.0-dev',
    supportedScopes: ['debug', 'logging'],
    factory: () => {
      const agent = new DummyAgent()
      agent.enableDebugMode(true)
      return agent
    }
  })
}
```

## Integration with SDK

The registry integrates seamlessly with the main SDK through the `connectAgent()` function:

```typescript
// String-based lookup (recommended)
const handle = await connectAgent({
  agent: 'my-agent',        // Registry lookup by ID
  transport: 'dummy',       // Registry lookup by ID
  scope: ['chat']           // Scope validation against metadata
})

// Direct instance passing (bypasses registry)
const handle = await connectAgent({
  agent: new MyAgent(),     // Direct instance
  transport: new MyTransport(),  // Direct instance
  scope: ['chat']
})
```

The registry enables the SDK to:
- Resolve string identifiers to actual implementations
- Validate scope compatibility
- Track metadata for runtime introspection
- Support dynamic configuration and dependency injection

This documentation provides the foundation for using the AgentKit Registry effectively in your applications.