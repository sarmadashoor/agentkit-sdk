# Plugin Execution Flow Chart

This diagram illustrates the complete plugin execution flow including security verification, sandbox creation, and isolated execution with comprehensive error handling and timeout protection.

## Plugin Execution Flow Chart

```mermaid
flowchart TD
    A[Plugin Registration Request] --> B{Plugin Valid?}
    B -->|No| C[PluginValidationError]
    B -->|Yes| D[HMAC Signature Verification]
    
    D --> E{Signature Valid?}
    E -->|No| F[PluginSignatureError]
    E -->|Yes| G[Security Scan]
    
    G --> H{Security Violations?}
    H -->|Yes| I[UntrustedPluginError]
    H -->|No| J[Create Sandbox Environment]
    
    J --> K{Platform Type?}
    K -->|Node.js| L[VM Sandbox Creation]
    K -->|Browser| M[Web Worker Creation]
    K -->|Fallback| N[Restricted Function Context]
    
    L --> O[Configure VM Context]
    M --> P[Setup Worker Environment]
    N --> Q[Limited Global Access]
    
    O --> R[Plugin Successfully Registered]
    P --> R
    Q --> R
    
    R --> S[Plugin Hook Execution Triggered]
    
    S --> T{Hook Type?}
    T -->|onInit| U[Initialize Context]
    T -->|onSend| V[Prepare Send Payload]
    T -->|onError| W[Handle Error Context]
    T -->|onShutdown| X[Cleanup Context]
    
    U --> Y[Deep Clone Context]
    V --> Y
    W --> Y
    X --> Y
    
    Y --> Z[Execute in Sandbox]
    
    Z --> AA{Execution Platform?}
    AA -->|VM| BB[vm.runInContext]
    AA -->|WebWorker| CC[postMessage to Worker]
    AA -->|Function| DD[Restricted Function Call]
    
    BB --> EE[Timeout Protection]
    CC --> EE
    DD --> EE
    
    EE --> FF{Timeout Exceeded?}
    FF -->|Yes| GG[PluginTimeoutError]
    FF -->|No| HH[Await Plugin Result]
    
    HH --> II{Execution Success?}
    II -->|No| JJ[PluginHookError]
    II -->|Yes| KK[Validate Result]
    
    KK --> LL{Result Valid?}
    LL -->|No| MM[ValidationError]
    LL -->|Yes| NN[Deep Clone Result]
    
    NN --> OO[Return to Caller]
    
    %% Error paths
    C --> PP[Log Error & Reject]
    F --> PP
    I --> PP
    GG --> PP
    JJ --> PP
    MM --> PP
    
    PP --> QQ[Update Plugin Status]
    QQ --> RR[Trigger Error Observers]
    
    %% Success path
    OO --> SS[Update Execution Metrics]
    SS --> TT[Trigger Success Observers]
    
    %% Styling
    classDef errorClass fill:#ffebee,stroke:#c62828,stroke-width:2px
    classDef securityClass fill:#fff3e0,stroke:#ef6c00,stroke-width:2px
    classDef sandboxClass fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef executionClass fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
    classDef successClass fill:#f1f8e9,stroke:#558b2f,stroke-width:2px
    
    class C,F,I,GG,JJ,MM,PP,QQ,RR errorClass
    class D,E,G,H securityClass
    class J,K,L,M,N,O,P,Q,R sandboxClass
    class S,T,U,V,W,X,Y,Z,AA,BB,CC,DD,EE,FF,HH,II,KK,LL,NN executionClass
    class OO,SS,TT successClass
```

## Plugin Security Architecture

```mermaid
graph TB
    subgraph "Security Verification Layer"
        SIG[HMAC Signature Verification]
        SCAN[Static Security Scan]
        TRUST[Trust Validation]
    end
    
    subgraph "Sandbox Environment"
        direction TB
        VM[VM Context<br/>Node.js]
        WORKER[Web Worker<br/>Browser]
        FUNC[Function Context<br/>Fallback]
        
        subgraph "VM Features"
            VM_CTX[Controlled Context]
            VM_TIMEOUT[Timeout Protection]
            VM_GLOBALS[Limited Globals]
        end
        
        subgraph "Worker Features"
            WORKER_ISO[Complete Isolation]
            WORKER_MSG[Message Passing]
            WORKER_TIMEOUT[Timeout Handling]
        end
        
        subgraph "Function Features"
            FUNC_SCOPE[Restricted Scope]
            FUNC_TIMEOUT[Timeout Guard]
            FUNC_GLOBALS[Minimal Globals]
        end
        
        VM --> VM_CTX
        VM --> VM_TIMEOUT
        VM --> VM_GLOBALS
        
        WORKER --> WORKER_ISO
        WORKER --> WORKER_MSG
        WORKER --> WORKER_TIMEOUT
        
        FUNC --> FUNC_SCOPE
        FUNC --> FUNC_TIMEOUT
        FUNC --> FUNC_GLOBALS
    end
    
    subgraph "Execution Protection"
        CLONE[Deep Cloning]
        TIMEOUT[Timeout Management]
        VALIDATE[Result Validation]
        METRICS[Execution Metrics]
    end
    
    SIG --> VM
    SCAN --> VM
    TRUST --> VM
    
    SIG --> WORKER
    SCAN --> WORKER
    TRUST --> WORKER
    
    SIG --> FUNC
    SCAN --> FUNC
    TRUST --> FUNC
    
    VM --> CLONE
    WORKER --> CLONE
    FUNC --> CLONE
    
    CLONE --> TIMEOUT
    TIMEOUT --> VALIDATE
    VALIDATE --> METRICS
```

## Plugin Hook Execution States

```mermaid
stateDiagram-v2
    [*] --> PENDING: Plugin Registered
    PENDING --> VERIFYING: Execute Hook
    VERIFYING --> SANDBOX_READY: Verification Success
    VERIFYING --> FAILED: Verification Failed
    SANDBOX_READY --> EXECUTING: Enter Sandbox
    EXECUTING --> TIMEOUT: Timeout Exceeded
    EXECUTING --> ERROR: Execution Error
    EXECUTING --> SUCCESS: Execution Complete
    SUCCESS --> VALIDATING: Validate Result
    VALIDATING --> COMPLETED: Validation Success
    VALIDATING --> FAILED: Validation Failed
    COMPLETED --> [*]
    TIMEOUT --> [*]
    ERROR --> [*]
    FAILED --> [*]
    
    note right of VERIFYING
        - HMAC signature check
        - Security scan
        - Trust validation
    end note
    
    note right of EXECUTING
        - Deep cloned context
        - Timeout protection
        - Isolated environment
    end note
    
    note right of VALIDATING
        - Result type checking
        - Deep clone output
        - Security validation
    end note
```

## Security Verification Process

### **1. Plugin Registration Security**
```mermaid
flowchart LR
    A[Plugin Upload] --> B[HMAC Verification]
    B --> C{Signature Valid?}
    C -->|No| D[Reject Plugin]
    C -->|Yes| E[Static Analysis]
    E --> F{Security Violations?}
    F -->|Yes| G[Block Plugin]
    F -->|No| H[Trust Assessment]
    H --> I{Trusted Source?}
    I -->|No| J[Sandbox Only]
    I -->|Yes| K[Full Access]
    J --> L[Register Plugin]
    K --> L
```

### **2. Sandbox Environment Selection**
- **Node.js VM**: Maximum isolation with `vm.runInContext()`
- **Web Worker**: Browser isolation with message passing
- **Function Context**: Fallback with restricted global access

### **3. Context Protection**
```typescript
// Deep cloning prevents context pollution
const clonedContext = deepClone(context)
const clonedPayload = deepClone(payload)

// Timeout protection prevents infinite loops
const result = await Promise.race([
  pluginHook(clonedPayload, clonedContext),
  timeoutPromise(timeoutMs)
])
```

## Plugin Hook Types & Execution

### **onInit Hook**
- **Purpose**: Plugin initialization after agent setup
- **Context**: Agent metadata, configuration, observability hooks
- **Security**: Full context cloning, initialization-safe operations
- **Timeout**: 5 seconds default

### **onSend Hook**
- **Purpose**: Process/modify requests before sending to agent
- **Context**: Send payload, agent context, request metadata
- **Security**: Payload cloning, input validation, result validation
- **Timeout**: 2 seconds default (performance critical)

### **onError Hook**
- **Purpose**: Error handling and recovery logic
- **Context**: Error object, agent context, failure metadata
- **Security**: Error object cloning, safe error handling
- **Timeout**: 3 seconds default

### **onShutdown Hook**
- **Purpose**: Cleanup and resource disposal
- **Context**: Agent context, shutdown reason, cleanup utilities
- **Security**: Cleanup-safe operations, resource validation
- **Timeout**: 10 seconds default (allow thorough cleanup)

## Error Handling & Recovery

### **Plugin Error Types**
1. **PluginValidationError**: Invalid plugin structure or configuration
2. **PluginSignatureError**: HMAC signature verification failed
3. **UntrustedPluginError**: Security scan detected violations
4. **PluginTimeoutError**: Execution exceeded timeout limit
5. **PluginHookError**: Runtime error during plugin execution
6. **PluginSandboxError**: Sandbox creation or management failed

### **Recovery Strategies**
- **Graceful Degradation**: Continue operation without failed plugin
- **Retry Logic**: Automatic retry for transient failures
- **Circuit Breaking**: Disable plugin after repeated failures
- **Fallback Execution**: Use default behavior if plugin fails
- **Observability**: Comprehensive error tracking and metrics

## Performance Optimizations

### **Execution Optimizations**
- **Sandbox Reuse**: Reuse VM contexts for multiple executions
- **Lazy Loading**: Load plugins only when needed
- **Parallel Execution**: Execute multiple plugins concurrently
- **Result Caching**: Cache plugin results for identical inputs

### **Security Optimizations**
- **Signature Caching**: Cache verified signatures to avoid re-verification
- **Static Analysis**: Pre-compute security scans during registration
- **Trust Levels**: Different sandbox restrictions based on trust level
- **Resource Monitoring**: Track plugin resource usage and enforce limits

This comprehensive plugin execution flow ensures maximum security while maintaining high performance and reliability for plugin-based extensibility.