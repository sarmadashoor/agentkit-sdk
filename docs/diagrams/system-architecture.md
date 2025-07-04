# AgentKit SDK System Architecture

This diagram provides a high-level overview of the AgentKit SDK system architecture, showing the core components, package relationships, and data flow patterns.

## System Architecture Diagram

```mermaid
graph TB
    subgraph "Application Layer"
        APP[Host Application]
        USER[Developer Code]
    end
    
    subgraph "AgentKit SDK Core (@agentkit/sdk)"
        CONNECT[connectAgent]
        MANAGER[AgentManager]
        
        subgraph "Execution Engine"
            EXECUTOR[BoundedExecutor]
            CIRCUIT[CircuitBreaker]
            QUEUE[BackpressureQueue]
        end
        
        subgraph "Plugin System"
            PLUGIN_MGR[PluginManager]
            SANDBOX[Sandbox Environment]
            VERIFIER[Plugin Verifier]
        end
        
        subgraph "Observability"
            METRICS[MetricsCollector]
            TRACKER[ObservabilityTracker]
            TIMELINE[ExecutionTimeline]
        end
    end
    
    subgraph "Type System (@agentkit/types)"
        AGENT_IF[Agent Interface]
        TRANSPORT_IF[Transport Interface]
        SCHEMAS[Zod Schemas]
        CONTEXT[AgentContext]
    end
    
    subgraph "Registry System (@agentkit/registry)"
        REGISTRY[AgentRegistry]
        METADATA[AgentMetadata]
        FREEZE[ImmutableData]
    end
    
    subgraph "Error System (@agentkit/errors)"
        BASE_ERR[AgentKitError]
        CIRCUIT_ERR[CircuitBreakerError]
        PLUGIN_ERR[PluginError]
        TRANSPORT_ERR[TransportError]
    end
    
    subgraph "Runtime Environments"
        NODE_RT[Node.js Runtime]
        BROWSER_RT[Browser Runtime (@agentkit/runtime-web)]
        CLI_RT[CLI Tools (@agentkit/cli)]
    end
    
    subgraph "Agent Implementations"
        AGENT_A[Agent A]
        AGENT_B[Agent B]
        TEST_AGENT[Test Agent]
    end
    
    subgraph "Transport Layer"
        TRANSPORT_A[HTTP Transport]
        TRANSPORT_B[WebSocket Transport]
        DUMMY_TRANSPORT[Dummy Transport]
    end
    
    %% Application connections
    APP --> CONNECT
    USER --> CONNECT
    
    %% Core SDK connections
    CONNECT --> MANAGER
    MANAGER --> EXECUTOR
    MANAGER --> PLUGIN_MGR
    MANAGER --> METRICS
    
    %% Execution engine
    EXECUTOR --> CIRCUIT
    EXECUTOR --> QUEUE
    CIRCUIT --> QUEUE
    
    %% Plugin system
    PLUGIN_MGR --> SANDBOX
    PLUGIN_MGR --> VERIFIER
    SANDBOX --> VERIFIER
    
    %% Observability
    MANAGER --> TRACKER
    TRACKER --> TIMELINE
    METRICS --> TIMELINE
    
    %% Type system integration
    MANAGER --> AGENT_IF
    MANAGER --> TRANSPORT_IF
    SCHEMAS --> CONTEXT
    CONTEXT --> AGENT_IF
    
    %% Registry integration
    CONNECT --> REGISTRY
    REGISTRY --> METADATA
    REGISTRY --> FREEZE
    METADATA --> AGENT_IF
    
    %% Error system integration
    MANAGER --> BASE_ERR
    CIRCUIT --> CIRCUIT_ERR
    PLUGIN_MGR --> PLUGIN_ERR
    EXECUTOR --> TRANSPORT_ERR
    
    %% Runtime connections
    MANAGER --> NODE_RT
    BROWSER_RT --> MANAGER
    CLI_RT --> REGISTRY
    
    %% Agent connections
    MANAGER --> AGENT_A
    MANAGER --> AGENT_B
    MANAGER --> TEST_AGENT
    
    %% Transport connections
    MANAGER --> TRANSPORT_A
    MANAGER --> TRANSPORT_B
    MANAGER --> DUMMY_TRANSPORT
    
    %% Styling
    classDef corePackage fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef supportPackage fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef external fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef runtime fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px
    
    class CONNECT,MANAGER,EXECUTOR,CIRCUIT,QUEUE,PLUGIN_MGR,SANDBOX,VERIFIER,METRICS,TRACKER,TIMELINE corePackage
    class AGENT_IF,TRANSPORT_IF,SCHEMAS,CONTEXT,REGISTRY,METADATA,FREEZE,BASE_ERR,CIRCUIT_ERR,PLUGIN_ERR,TRANSPORT_ERR supportPackage
    class APP,USER,AGENT_A,AGENT_B,TEST_AGENT,TRANSPORT_A,TRANSPORT_B,DUMMY_TRANSPORT external
    class NODE_RT,BROWSER_RT,CLI_RT runtime
```

## Key Architecture Components

### **Core SDK Layer (@agentkit/sdk)**
- **connectAgent**: Primary entry point for SDK initialization
- **AgentManager**: Central orchestrator managing agent lifecycle
- **Execution Engine**: BoundedExecutor, CircuitBreaker, BackpressureQueue for resilience
- **Plugin System**: Secure sandboxed plugin execution with verification
- **Observability**: Comprehensive metrics collection and execution tracking

### **Type System (@agentkit/types)**
- **Agent/Transport Interfaces**: Standard contracts for implementations
- **Zod Schemas**: Runtime validation and type safety
- **AgentContext**: Shared context for plugin execution

### **Registry System (@agentkit/registry)**
- **AgentRegistry**: Dynamic registration and lookup of agents/transports
- **ImmutableData**: Deep freezing for runtime stability
- **AgentMetadata**: Rich metadata for agent discovery

### **Error System (@agentkit/errors)**
- **Unified Error Hierarchy**: Structured error handling with context
- **Category-Specific Errors**: Circuit breaker, plugin, transport errors
- **Serializable Errors**: JSON serialization for logging and debugging

### **Runtime Environments**
- **Node.js Runtime**: VM-based plugin sandboxing
- **Browser Runtime**: Web Worker isolation (@agentkit/runtime-web)  
- **CLI Tools**: Development and plugin management (@agentkit/cli)

## Data Flow Patterns

1. **Initialization Flow**: Application → connectAgent → Registry → AgentManager → Agent/Transport
2. **Request Flow**: User → RuntimeHandle → BoundedExecutor → CircuitBreaker → Agent → Transport
3. **Plugin Flow**: PluginManager → Sandbox → Verification → Execution → Result
4. **Error Flow**: Any Component → Error System → ObservabilityTracker → Application
5. **Metrics Flow**: All Components → MetricsCollector → ObservabilityTracker → External Systems

## Security Architecture

- **Plugin Sandboxing**: VM isolation (Node.js) and Web Workers (Browser)
- **Signature Verification**: HMAC-based plugin authentication
- **Immutable Registry**: Deep freezing prevents runtime mutations
- **Input Validation**: Zod schema validation at all boundaries
- **Resource Limits**: Bounded execution with timeout protection