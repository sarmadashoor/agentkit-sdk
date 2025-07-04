# CLAUDE.md - AgentKit SDK Context for AI Assistants

**Repository**: AgentKit SDK  
**Type**: TypeScript monorepo for AI agent lifecycle management  
**Architecture**: Production-grade SDK with security hardening  
**Last Updated**: Current

## 🎯 Repository Overview

### **Purpose & Scope**
AgentKit SDK is a modular, secure, agent-agnostic TypeScript framework for managing AI agents inside host applications. It provides production-grade features like circuit breakers, backpressure management, and secure plugin execution.

### **Key Packages (8 total)**
```
packages/
├── sdk/                 # Core agent lifecycle management (60 test files)
├── types/               # Shared TypeScript interfaces & Zod schemas
├── registry/            # Immutable agent/transport registration system
├── runtime-web/         # Browser-specific implementations (11 test files)
├── cli/                 # Command-line tools for plugin development (7 test files)
├── test-agent/          # Testing utilities and dummy agents
├── transports-dummy/    # Local development transport
└── errors/              # Structured error handling (3 test files)
```

### **Architecture Principles**
1. **Separation of Concerns**: Each package has single responsibility
2. **Agent Agnosticism**: No assumptions about AI providers (OpenAI, Anthropic, etc.)
3. **Developer Experience**: Simple APIs with comprehensive type safety

## 🛠️ Development Workflow

### **Package Manager**: pnpm (REQUIRED)
```bash
npm install -g pnpm        # Install pnpm globally
pnpm install              # Install dependencies
```

### **Core Commands**
```bash
# Build
pnpm build                # Build all packages in dependency order

# Testing (IMPORTANT: See testing strategy below)
npm run test:fast         # Fast development tests (4 packages, ~30s)
npm run test:ci           # Full comprehensive tests (92 files, 5-10min)
npm test                  # Smart adaptive testing based on environment

# Quality
pnpm lint                 # ESLint across all packages
pnpm typecheck            # TypeScript validation
pnpm analyze:deps         # Check for circular dependencies
```

## 🧪 Testing Strategy (CRITICAL)

### **Current Challenge**
92 test files across 7 packages cause resource conflicts when run together. We've implemented tiered execution strategy.

### **Test Distribution**
| Package | Files | Type | Notes |
|---------|-------|------|-------|
| **SDK** | 60 | Heavy | Agents, plugins, VMs, circuit breakers |
| **Runtime-Web** | 11 | Heavy | Browser tests with Playwright |
| **CLI** | 7 | Medium | Plugin scaffolding and signing |
| **Registry** | 6 | Light | Agent/transport registration |
| **Others** | 8 | Light | Types, errors, test utilities |

### **Recommended Testing Commands**
```bash
# Development (fast feedback)
npm run test:fast         # 4 packages, reliable, exits cleanly

# CI/CD (comprehensive)
npm run test:ci           # Sequential execution, all 92 tests

# Package-specific
cd packages/sdk && npm test              # SDK tests only
cd packages/runtime-web && npm test     # Browser tests only
cd packages/cli && npm test             # CLI tests only
```

### **Test File Organization Rules**
- All test files use `.test.ts` extension
- Test utilities in `__tests__/test-utils.ts`
- Resource cleanup REQUIRED in `afterEach` and `afterAll`
- No hanging handles or memory leaks
- Plugin tests require sandbox cleanup

## 🏗️ Architecture Constraints (ENFORCE THESE)

### **Package Boundaries**
- **NO circular dependencies** between packages
- Each package has clearly defined exports in `index.ts`
- Use `@agentkit/types` for shared interfaces
- Import paths must be explicit (`../src/file` not `../file`)

### **Registry Immutability**
- All registry data is **deeply frozen** to prevent runtime mutations
- Use `deepFreeze()` utility for immutable data structures
- No direct modification of registered agents/transports

### **Plugin Security & Sandboxing**
```typescript
// REQUIRED: Deep cloning for plugin contexts
const clonedContext = deepClone(context)
const clonedPayload = deepClone(payload)

// REQUIRED: Timeout protection
const timeoutMs = 5000
const result = await Promise.race([
  pluginHook(clonedPayload, clonedContext),
  timeoutPromise(timeoutMs)
])
```

### **Memory Management**
- Automatic cleanup of timers and intervals
- Agent/transport shutdown must be called
- Plugin sandboxes must be disposed
- No leaked Promise chains or event listeners

## 🔌 Plugin System Architecture

### **Plugin Interface** (packages/types/src/index.ts)
```typescript
interface AgentKitPlugin {
  name: string
  version: string
  signature?: string           // HMAC signature for security
  onInit?(context: AgentContext): void | Promise<void>
  onSend?(payload: SendPayload, context: AgentContext): void | Promise<void>
  onError?(error: Error, context: AgentContext): void | Promise<void>
  onShutdown?(context: AgentContext): void | Promise<void>
}
```

### **Security Features**
- HMAC signature verification for plugin authenticity
- Deep cloning prevents context pollution
- Configurable timeout limits
- Permission-based access control
- VM sandboxing for untrusted plugins

## 🌐 Browser Compatibility (runtime-web)

### **Key Features**
- Web Worker isolation for plugin execution
- BrowserTransport for in-browser communication
- Polyfills for missing browser APIs
- Bundle size optimization
- Playwright testing for cross-browser compatibility

### **Testing Commands**
```bash
cd packages/runtime-web
npm test                  # Run Playwright tests
npm run test:browser      # Manual browser testing
```

## ⚡ Performance & Resilience

### **Circuit Breaker Pattern**
```typescript
circuitBreaker: {
  failureThreshold: 5,    // Open after 5 failures
  timeout: 60000,         // Stay open for 1 minute
  name: 'agent-circuit'   // For logging/metrics
}
```

### **Backpressure Management**
```typescript
resourceLimits: {
  maxConcurrentRequests: 10,    // Process max 10 at once
  maxQueueSize: 50,             // Queue up to 50 requests
  requestTimeoutMs: 30000       // 30 second timeout
}
```

### **Observability Hooks**
```typescript
observability: {
  onRequestStart: (metadata) => { /* timing */ },
  onRequestEnd: (metadata, duration) => { /* metrics */ },
  onTransportBackpressureDetected: (event) => { /* alert */ },
  onCircuitBreakerStateChange: (event) => { /* monitoring */ }
}
```

## 🔧 CLI Tools (packages/cli)

### **Plugin Development**
```bash
pnpm agentkit create-plugin my-plugin     # Scaffold new plugin
pnpm agentkit sign-plugin plugin.json     # Sign plugin for distribution
pnpm agentkit verify-plugin plugin.json   # Verify plugin signature
```

### **CLI Architecture**
- TypeScript compilation with tsup
- HMAC-based plugin signing
- Template scaffolding system
- Plugin verification pipeline

## 📁 File Organization Patterns

### **Source Structure**
```
packages/sdk/src/
├── index.ts              # Main SDK exports
├── AgentManager.ts       # Core lifecycle management
├── boundedExecutor.ts    # Concurrency control
├── circuitBreaker.ts     # Fault tolerance
├── plugins/              # Plugin system
├── observability/        # Metrics and monitoring
├── security/             # Plugin signing and verification
└── utils/                # Utilities (deepClone, etc.)
```

### **Test Structure**
```
packages/sdk/__tests__/
├── connectAgent.test.ts       # Core API tests
├── agent-manager-*.test.ts    # Manager functionality
├── circuit-breaker-*.test.ts  # Resilience patterns
├── plugin-*.test.ts           # Plugin system tests
├── observability-*.test.ts    # Monitoring tests
└── test-utils.ts              # Shared test utilities
```

## 🚨 Current Priorities & Focus Areas

### **1. Test Isolation & Cleanup** (CRITICAL)
- All tests must properly clean up resources
- No hanging handles after test completion
- Proper async/await usage throughout
- Plugin sandbox cleanup after each test

### **2. Plugin System Security Hardening**
- Signature verification for all plugins
- Deep cloning for context isolation
- Timeout protection for plugin execution
- Permission model enforcement

### **3. Browser Compatibility** (runtime-web)
- Cross-browser testing with Playwright
- Bundle size optimization
- Web Worker sandboxing
- Polyfill management

### **4. CLI Tool Development**
- Plugin scaffolding improvements
- Enhanced signing/verification
- Template system expansion
- Developer experience optimization

### **5. Documentation Standardization**
- API reference generation from TypeScript
- Example code verification
- Architecture decision records
- Migration guides for breaking changes

## 🔍 Common Issues & Solutions

### **Test Hanging/Resource Leaks**
```typescript
// REQUIRED: Proper cleanup in tests
afterEach(async () => {
  await cleanupAllResources()
  // Check for leaked handles
  const handles = process._getActiveHandles()
  if (handles.length > BASELINE_COUNT) {
    console.warn('Potential handle leak detected')
  }
})
```

### **Plugin Context Pollution**
```typescript
// WRONG: Direct context usage
plugin.onSend(payload, context)

// CORRECT: Deep cloned context
const clonedPayload = deepClone(payload)
const clonedContext = deepClone(context)
plugin.onSend(clonedPayload, clonedContext)
```

### **Import/Export Issues**
```typescript
// CORRECT: Explicit package imports
import { Agent, Transport } from '@agentkit/types'
import { connectAgent } from '@agentkit/sdk'

// WRONG: Relative imports across packages
import { Agent } from '../../types/src/index'
```

## 📊 Key Files to Understand

### **Entry Points**
- `packages/sdk/src/index.ts` - Main SDK API
- `packages/types/src/index.ts` - All TypeScript interfaces
- `packages/registry/src/index.ts` - Registration system

### **Core Functionality**
- `packages/sdk/src/AgentManager.ts` - Agent lifecycle
- `packages/sdk/src/boundedExecutor.ts` - Concurrency control
- `packages/sdk/src/circuitBreaker.ts` - Fault tolerance

### **Plugin System**
- `packages/sdk/src/plugins/PluginManager.ts` - Plugin orchestration
- `packages/sdk/src/plugins/PluginSandbox.ts` - Security isolation
- `packages/sdk/src/security/plugin-signer.ts` - Signature verification

### **Documentation**
- `README.md` - Repository overview
- `docs/developer-guide.md` - Complete usage guide
- `TESTING_GUIDE.md` - Testing strategy and commands
- `docs/architecture.md` - System design

## 🎯 When Working on This Repository

### **Before Making Changes**
1. Run `npm run test:fast` to ensure baseline functionality
2. Check `pnpm typecheck` for TypeScript errors
3. Verify no circular dependencies with `pnpm analyze:deps`

### **For New Features**
1. Add TypeScript interfaces to `@agentkit/types` first
2. Implement in appropriate package with tests
3. Update documentation and examples
4. Ensure plugin compatibility if applicable

### **For Bug Fixes**
1. Write failing test that reproduces the issue
2. Fix the implementation
3. Verify test passes and no regressions
4. Check resource cleanup and memory usage

### **For Plugin Development**
1. Use CLI tools: `pnpm agentkit create-plugin`
2. Follow security guidelines (deep cloning, timeouts)
3. Add comprehensive tests with sandbox cleanup
4. Sign plugins for distribution

This context should enable any AI assistant to effectively work with the AgentKit SDK codebase while maintaining its architectural integrity and security standards.