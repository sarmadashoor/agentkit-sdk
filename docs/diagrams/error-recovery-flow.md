# Error Recovery Flow Diagram

This diagram illustrates the comprehensive error recovery mechanisms in AgentKit SDK, including circuit breaker patterns, backpressure management, retry logic, and multi-layered fault tolerance.

## Error Recovery Flow Diagram

```mermaid
flowchart TD
    A[Request Initiated] --> B[BoundedExecutor Check]
    
    B --> C{Executor Available?}
    C -->|No| D[Queue Request]
    C -->|Yes| E[Circuit Breaker Check]
    
    D --> F{Queue Full?}
    F -->|Yes| G[QueueFullError]
    F -->|No| H[Add to Queue]
    H --> I[Wait for Executor]
    I --> E
    
    E --> J{Circuit State?}
    J -->|OPEN| K[CircuitBreakerError<br/>Fast Fail]
    J -->|HALF_OPEN| L[Single Request Test]
    J -->|CLOSED| M[Execute Request]
    
    L --> N[Execute Test Request]
    N --> O{Test Success?}
    O -->|Yes| P[Circuit → CLOSED]
    O -->|No| Q[Circuit → OPEN]
    P --> M
    Q --> K
    
    M --> R[Plugin onSend Hooks]
    R --> S{Plugin Success?}
    S -->|No| T[Plugin Error Recovery]
    S -->|Yes| U[Agent Execution]
    
    T --> T1[PluginHookError]
    T1 --> T2{Continue Without Plugin?}
    T2 -->|Yes| U
    T2 -->|No| T3[Abort Request]
    
    U --> V{Agent Success?}
    V -->|No| W[Agent Error Handling]
    V -->|Yes| X[Transport Send]
    
    W --> W1[Agent Error Processing]
    W1 --> W2{Retryable Error?}
    W2 -->|Yes| W3[Increment Retry Count]
    W2 -->|No| W4[Non-Retryable Error]
    
    W3 --> W5{Max Retries Reached?}
    W5 -->|No| W6[Exponential Backoff]
    W5 -->|Yes| W7[MaxRetriesExceededError]
    W6 --> W8[Wait & Retry]
    W8 --> M
    
    X --> Y[Transport Backpressure Check]
    Y --> Z{Transport Available?}
    Z -->|No| AA[Backpressure Detected]
    Z -->|Yes| BB[Send to Transport]
    
    AA --> CC[Enqueue for Retry]
    CC --> DD[Backpressure Backoff]
    DD --> EE[Retry Transport Send]
    EE --> Y
    
    BB --> FF{Transport Success?}
    FF -->|No| GG[Transport Error]
    FF -->|Yes| HH[Success Response]
    
    GG --> GG1[Transport Error Analysis]
    GG1 --> GG2{Network Error?}
    GG2 -->|Yes| GG3[Network Retry Logic]
    GG2 -->|No| GG4[Transport-Specific Error]
    
    GG3 --> GG5{Retry Limit Reached?}
    GG5 -->|No| GG6[Network Backoff]
    GG5 -->|Yes| GG7[NetworkError Final]
    GG6 --> BB
    
    %% Success Path
    HH --> II[Record Success Metrics]
    II --> JJ[Circuit Breaker Success]
    JJ --> KK[Plugin onSuccess Hooks]
    KK --> LL[Return Success Response]
    
    %% Error Aggregation
    G --> MM[Error Recovery Pipeline]
    K --> MM
    T3 --> MM
    W4 --> MM
    W7 --> MM
    GG4 --> MM
    GG7 --> MM
    
    MM --> NN[Circuit Breaker Failure Record]
    NN --> OO{Failure Threshold Reached?}
    OO -->|Yes| PP[Open Circuit Breaker]
    OO -->|No| QQ[Maintain Circuit State]
    
    PP --> RR[Start Recovery Timer]
    RR --> SS[Circuit → HALF_OPEN after timeout]
    SS --> E
    
    QQ --> TT[Plugin onError Hooks]
    TT --> UU[Error Observability]
    UU --> VV[Return Error Response]
    
    %% Cleanup and Resource Management
    LL --> WW[Cleanup Resources]
    VV --> WW
    WW --> XX[Update Executor State]
    XX --> YY[Process Next Queued Request]
    YY --> B
    
    %% Styling
    classDef successClass fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef errorClass fill:#ffebee,stroke:#c62828,stroke-width:2px
    classDef retryClass fill:#fff3e0,stroke:#ef6c00,stroke-width:2px
    classDef circuitClass fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
    classDef queueClass fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    
    class HH,II,JJ,KK,LL,WW,XX successClass
    class G,K,T1,T3,W4,W7,GG4,GG7,MM,VV errorClass
    class D,H,I,W3,W6,W8,AA,CC,DD,EE,GG3,GG6 retryClass
    class E,J,L,N,O,P,Q,NN,OO,PP,QQ,RR,SS circuitClass
    class F,H,I,YY queueClass
```

## Circuit Breaker State Machine

```mermaid
stateDiagram-v2
    [*] --> CLOSED
    CLOSED --> OPEN: failures >= threshold
    OPEN --> HALF_OPEN: timeout elapsed
    HALF_OPEN --> CLOSED: success
    HALF_OPEN --> OPEN: failure
    CLOSED --> CLOSED: success (reset counter)
    CLOSED --> CLOSED: failure < threshold
    
    state CLOSED {
        [*] --> Monitoring
        Monitoring --> Recording: request
        Recording --> Success: success
        Recording --> Failure: failure
        Success --> [*]: count++
        Failure --> [*]: failureCount++
    }
    
    state OPEN {
        [*] --> FastFail
        FastFail --> Timer: start timeout
        Timer --> [*]: reject all
    }
    
    state HALF_OPEN {
        [*] --> TestRequest
        TestRequest --> Evaluate: single request
        Evaluate --> [*]: result
    }
```

## Error Classification & Recovery Strategy

```mermaid
graph TB
    subgraph "Error Classification"
        ERR[Error Detected] --> TYPE{Error Type?}
        
        TYPE -->|Network| NET[NetworkError]
        TYPE -->|Validation| VAL[ValidationError]
        TYPE -->|Plugin| PLUG[PluginError]
        TYPE -->|Agent| AGENT[AgentError]
        TYPE -->|Transport| TRANS[TransportError]
        TYPE -->|Circuit| CIRC[CircuitBreakerError]
        TYPE -->|Resource| RES[ResourceError]
        TYPE -->|Unknown| UNK[UnknownError]
    end
    
    subgraph "Recovery Strategy Selection"
        NET --> NET_REC[Network Recovery]
        VAL --> VAL_REC[Validation Recovery]
        PLUG --> PLUG_REC[Plugin Recovery]
        AGENT --> AGENT_REC[Agent Recovery]
        TRANS --> TRANS_REC[Transport Recovery]
        CIRC --> CIRC_REC[Circuit Recovery]
        RES --> RES_REC[Resource Recovery]
        UNK --> UNK_REC[Generic Recovery]
    end
    
    subgraph "Recovery Actions"
        NET_REC --> NET_RETRY[Retry with Backoff]
        VAL_REC --> VAL_FAIL[Fail Fast]
        PLUG_REC --> PLUG_SKIP[Skip Plugin]
        AGENT_REC --> AGENT_RETRY[Agent Retry]
        TRANS_REC --> TRANS_QUEUE[Queue & Retry]
        CIRC_REC --> CIRC_WAIT[Wait for Recovery]
        RES_REC --> RES_LIMIT[Resource Throttling]
        UNK_REC --> UNK_LOG[Log & Fail]
    end
    
    classDef networkClass fill:#e3f2fd,stroke:#1565c0
    classDef validationClass fill:#fff3e0,stroke:#ef6c00
    classDef pluginClass fill:#f3e5f5,stroke:#7b1fa2
    classDef agentClass fill:#e8f5e8,stroke:#2e7d32
    classDef transportClass fill:#ffebee,stroke:#c62828
    classDef circuitClass fill:#fce4ec,stroke:#ad1457
    classDef resourceClass fill:#f1f8e9,stroke:#558b2f
    
    class NET,NET_REC,NET_RETRY networkClass
    class VAL,VAL_REC,VAL_FAIL validationClass
    class PLUG,PLUG_REC,PLUG_SKIP pluginClass
    class AGENT,AGENT_REC,AGENT_RETRY agentClass
    class TRANS,TRANS_REC,TRANS_QUEUE transportClass
    class CIRC,CIRC_REC,CIRC_WAIT circuitClass
    class RES,RES_REC,RES_LIMIT resourceClass
```

## Multi-Layer Error Recovery Architecture

```mermaid
graph TB
    subgraph "Layer 1: Request Level"
        L1[Immediate Retry]
        L1_TIMEOUT[Timeout Protection]
        L1_VALIDATE[Input Validation]
    end
    
    subgraph "Layer 2: Component Level"
        L2_PLUGIN[Plugin Error Handling]
        L2_AGENT[Agent Error Recovery]
        L2_TRANSPORT[Transport Backpressure]
    end
    
    subgraph "Layer 3: System Level"
        L3_CIRCUIT[Circuit Breaker]
        L3_QUEUE[Bounded Queue]
        L3_RESOURCE[Resource Limits]
    end
    
    subgraph "Layer 4: Application Level"
        L4_GRACEFUL[Graceful Degradation]
        L4_FALLBACK[Fallback Strategies]
        L4_MONITORING[Error Monitoring]
    end
    
    L1 --> L2_PLUGIN
    L1_TIMEOUT --> L2_AGENT
    L1_VALIDATE --> L2_TRANSPORT
    
    L2_PLUGIN --> L3_CIRCUIT
    L2_AGENT --> L3_QUEUE
    L2_TRANSPORT --> L3_RESOURCE
    
    L3_CIRCUIT --> L4_GRACEFUL
    L3_QUEUE --> L4_FALLBACK
    L3_RESOURCE --> L4_MONITORING
```

## Retry Logic & Backoff Strategies

### **Exponential Backoff Configuration**
```mermaid
graph LR
    A[Retry 1] -->|100ms| B[Retry 2]
    B -->|200ms| C[Retry 3]
    C -->|400ms| D[Retry 4]
    D -->|800ms| E[Retry 5]
    E -->|1600ms| F[Max Retries]
    F --> G[Give Up]
    
    A -.->|Success| SUCCESS[Success]
    B -.->|Success| SUCCESS
    C -.->|Success| SUCCESS
    D -.->|Success| SUCCESS
    E -.->|Success| SUCCESS
```

### **Backpressure Handling**
```mermaid
sequenceDiagram
    participant C as Client
    participant Q as Queue
    participant T as Transport
    participant CB as CircuitBreaker
    
    C->>Q: send(request)
    Q->>T: canAcceptMore()
    T-->>Q: false (backpressure)
    Q->>Q: enqueue(request)
    Q->>Q: start backoff timer
    
    loop Retry Logic
        Q->>T: canAcceptMore()
        alt Transport Available
            T-->>Q: true
            Q->>T: send(request)
            T-->>Q: success
            Q-->>C: success
        else Still Backpressure
            T-->>Q: false
            Q->>Q: exponential backoff
        end
    end
    
    opt Max Retries Exceeded
        Q->>CB: recordFailure()
        Q-->>C: BackpressureError
    end
```

## Error Recovery Metrics & Observability

### **Key Metrics Tracked**
1. **Circuit Breaker Metrics**
   - State transitions (CLOSED → OPEN → HALF_OPEN)
   - Failure rate and threshold monitoring
   - Recovery time tracking

2. **Retry Metrics**
   - Retry attempt counts per error type
   - Backoff duration effectiveness
   - Success rate after retries

3. **Queue Metrics**
   - Queue depth and processing rate
   - Backpressure frequency and duration
   - Resource utilization patterns

4. **Plugin Error Metrics**
   - Plugin failure rates by type
   - Sandbox violation frequency
   - Plugin execution timeouts

### **Recovery Success Indicators**
- **Circuit Recovery**: Successful transition from OPEN → HALF_OPEN → CLOSED
- **Retry Success**: Request success after retry attempts
- **Backpressure Relief**: Queue processing resumption
- **Plugin Recovery**: Successful plugin execution after failure
- **Transport Recovery**: Successful message delivery after backpressure

## Error Recovery Best Practices

### **Configuration Guidelines**
- **Circuit Breaker**: 5 failures threshold, 60s timeout
- **Retry Logic**: 3 attempts with exponential backoff
- **Queue Limits**: 50 max queue size, 30s request timeout
- **Plugin Timeouts**: 5s for onInit, 2s for onSend
- **Backpressure**: 100ms initial delay, 2x multiplier

### **Monitoring & Alerting**
- Circuit breaker state changes
- High retry rates indicating systemic issues
- Queue depth approaching limits
- Plugin error rate spikes
- Transport backpressure frequency

This comprehensive error recovery system ensures high availability and resilience through multiple layers of fault tolerance, automatic recovery, and intelligent retry mechanisms.