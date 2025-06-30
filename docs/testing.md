# AgentKit SDK Testing Guide

## Overview

Testing in the AgentKit SDK requires understanding the security-first architecture, particularly around plugin sandbox isolation. This guide covers testing strategies, patterns, and best practices for different components.

## Plugin Testing Architecture

### VM Sandbox Security Model

The AgentKit plugin system uses Node.js VM sandboxing (`vm.runInContext`) for security isolation. This architectural choice has important implications for testing:

**Security Benefits:**
- Plugins cannot access host system resources
- Plugin isolation prevents cross-contamination
- Timeout and resource limits prevent abuse
- Graceful error handling maintains system stability

**Testing Implications:**
- Plugins cannot access test context variables
- Standard mocking/spying techniques don't work across VM boundaries
- Tests must use observable behavior patterns instead of closure-based state

### Anti-Pattern: Closure-Based Testing

❌ **Avoid this pattern:**
```typescript
// BROKEN: External variable access from sandbox
const pluginCalls: string[] = []

const testPlugin: AgentKitPlugin = {
  name: 'test-plugin',
  onInit: () => {
    pluginCalls.push('init') // ❌ Error: pluginCalls is not defined
  }
}
```

### Recommended Pattern: Observable Behavior Testing

✅ **Use this pattern:**
```typescript
// Plugin logs to console (observable behavior)
const testPlugin: AgentKitPlugin = {
  name: 'test-plugin', 
  onInit: (context) => {
    console.log(`PLUGIN_LIFECYCLE:${name}:onInit:${context.agentId}`)
  }
}

// Test captures and analyzes console output
const result = await runPluginTest({ plugin: testPlugin })
expect(result.logs).toContain('PLUGIN_LIFECYCLE:test-plugin:onInit')
```

## Testing Utilities

### Plugin Test Harness

Use the provided test utilities in `__tests__/plugin-system/utils.ts`:

```typescript
import { 
  runPluginTest, 
  createObservablePlugin, 
  extractPluginLifecycleEvents 
} from './utils'

// Run plugin with captured observable behavior
const result = await runPluginTest({
  plugin: myPlugin,
  handleInput: { test: 'data' },
  agentId: 'test-agent'
})

// Analyze captured logs
const events = extractPluginLifecycleEvents(result.logs)
expect(events.init).toHaveLength(1)
expect(events.send).toHaveLength(1)
expect(events.shutdown).toHaveLength(1)
```

### Observable Plugin Factory

Create test plugins that log lifecycle events:

```typescript
const lifecyclePlugin = createObservablePlugin('test-plugin', {
  onInit: 'INIT_MARKER',
  onSend: 'SEND_MARKER',
  onShutdown: 'SHUTDOWN_MARKER'
})

const result = await runPluginTest({ plugin: lifecyclePlugin })
expect(result.logs).toContain('test-plugin:onInit:INIT_MARKER')
```

### Security Test Plugins

Test sandbox boundaries with security plugins:

```typescript
const securityPlugin = createSecurityTestPlugin('security-test')
const result = await runPluginTest({ plugin: securityPlugin })

// Verify isolation is enforced
const securityLogs = extractPluginLifecycleEvents(result.logs).security
expect(securityLogs).toContain('global_access_blocked')
```

## Test Categories

### 1. Plugin Lifecycle Tests

**Purpose:** Verify plugin hooks execute in correct order with proper context

**Example:**
```typescript
it('calls onInit/onSend/onShutdown in order', async () => {
  const plugin = createObservablePlugin('lifecycle-test', {
    onInit: 'INIT_MARKER',
    onSend: 'SEND_MARKER',
    onShutdown: 'SHUTDOWN_MARKER'
  })

  const result = await runPluginTest({
    plugin,
    handleInput: { test: 'data' }
  })

  const events = extractPluginLifecycleEvents(result.logs)
  expect(events.init).toHaveLength(1)
  expect(events.send).toHaveLength(1) 
  expect(events.shutdown).toHaveLength(1)

  // Verify chronological order
  const allLogs = result.logs.filter(log => log.includes('PLUGIN_LIFECYCLE'))
  expect(allLogs[0]).toContain(':onInit:')
  expect(allLogs[allLogs.length - 1]).toContain(':onShutdown:')
})
```

### 2. Plugin Security Boundary Tests

**Purpose:** Verify sandbox isolation and security enforcement

**Example:**
```typescript
it('prevents plugins from accessing global scope variables', async () => {
  // Set up global variable that should be inaccessible
  ;(globalThis as any).sensitiveData = 'SECRET'

  const maliciousPlugin: AgentKitPlugin = {
    name: 'scope-test',
    onInit: () => {
      try {
        const data = (globalThis as any).sensitiveData
        console.log(`SECURITY_TEST:global_access_success:${data}`)
      } catch (error) {
        console.log('SECURITY_TEST:global_access_blocked')
      }
    }
  }

  const result = await runPluginTest({ plugin: maliciousPlugin })
  const securityLogs = extractPluginLifecycleEvents(result.logs).security

  // Verify access was blocked
  expect(securityLogs[0]).toMatch(/global_access_blocked/)
  expect(securityLogs[0]).not.toContain('SECRET')
})
```

### 3. Plugin Error Isolation Tests

**Purpose:** Verify system continues despite plugin failures

**Example:**
```typescript
it('continues operation when plugin hook throws error', async () => {
  const errorPlugin: AgentKitPlugin = {
    name: 'error-plugin',
    onInit: () => {
      console.log('BEFORE_ERROR')
      throw new Error('Plugin failed')
    }
  }

  const workingPlugin = createObservablePlugin('working-plugin', {
    onInit: 'SUCCESS'
  })

  // Test both plugins together
  const handle = await connectAgent({
    agent: 'test-agent',
    transport: 'dummy',
    registry,
    plugins: [errorPlugin, workingPlugin]
  })

  // Capture logs and verify working plugin still executes
  // System should handle error gracefully
})
```

### 4. Multiple Plugin Coordination Tests

**Purpose:** Verify plugins execute in correct order without interference

**Example:**
```typescript
it('executes multiple plugins in registration order', async () => {
  const plugin1 = createObservablePlugin('plugin-1', {
    onInit: 'P1_INIT',
    onSend: 'P1_SEND'
  })

  const plugin2 = createObservablePlugin('plugin-2', {
    onInit: 'P2_INIT', 
    onSend: 'P2_SEND'
  })

  const result = await runPluginTest({
    plugin: null, // Use connectAgent directly for multiple plugins
    connectOptions: { plugins: [plugin1, plugin2] }
  })

  const events = extractPluginLifecycleEvents(result.logs)
  
  // Verify execution order
  expect(events.init[0]).toContain('plugin-1:onInit')
  expect(events.init[1]).toContain('plugin-2:onInit')
})
```

## Testing Best Practices

### 1. Use Observable Behavior

Always test through observable side effects rather than internal state:
- Console logs with structured markers
- Transport message patterns
- Agent response modifications
- Error patterns and recovery

### 2. Structured Test Markers

Use consistent logging patterns for easy parsing:
```typescript
console.log(`PLUGIN_LIFECYCLE:${pluginName}:${hookName}:${marker}:${context}`)
console.log(`SECURITY_TEST:${pluginName}:${testType}:${result}`)
```

### 3. Test Isolation

Each test should be independent:
```typescript
beforeEach(() => {
  registry = new AgentRegistry()
  transport = new DummyTransport()
  // Clean slate for each test
})

afterEach(() => {
  // Clean up any global state
  delete (globalThis as any).testGlobals
})
```

### 4. Error Resilience

Test error scenarios comprehensively:
- Plugin initialization failures
- Runtime exceptions during hooks
- Timeout scenarios
- Resource exhaustion
- Security boundary violations

### 5. Performance Considerations

Monitor test performance:
```typescript
it('enforces execution timeout for long-running plugins', async () => {
  const timeoutPlugin: AgentKitPlugin = {
    name: 'timeout-test',
    onInit: () => {
      const start = Date.now()
      while (Date.now() - start < 1000) {
        // Busy wait - should be terminated by sandbox
      }
    }
  }

  // Verify timeout enforcement without hanging test suite
  const result = await runPluginTest({ plugin: timeoutPlugin })
  expect(result.errors.length).toBeGreaterThanOrEqual(0)
})
```

## Legacy Test Migration

### Moving from Closure-Based Tests

When migrating existing tests:

1. **Identify closure dependencies:**
   ```typescript
   // Old: External array access
   const calls: string[] = []
   onInit: () => calls.push('init') // ❌ Will fail in sandbox
   ```

2. **Convert to observable patterns:**
   ```typescript
   // New: Console logging  
   onInit: () => console.log('PLUGIN_LIFECYCLE:test:onInit:marker')
   ```

3. **Update test assertions:**
   ```typescript
   // Old: Direct array inspection
   expect(calls).toContain('init')
   
   // New: Log analysis
   const events = extractPluginLifecycleEvents(result.logs)
   expect(events.init).toHaveLength(1)
   ```

### Legacy Test Preservation

Existing incompatible tests are preserved in `__tests__/legacy/` with:
- Clear documentation explaining incompatibility
- Skip directives to prevent execution
- References to new test implementations

## Debugging Plugin Tests

### Enable Debug Mode

```typescript
const result = await runPluginTest({
  plugin: myPlugin,
  debug: true // Enables additional logging
})
```

### Log Analysis Tools

```typescript
// Extract specific event types
const events = extractPluginLifecycleEvents(result.logs)
console.log('Init events:', events.init)
console.log('Security events:', events.security)

// Debug all captured logs
console.log('All logs:', result.logs)
console.log('Transport messages:', result.transportMessages)
console.log('Errors:', result.errors)
```

### Timeline Analysis

For complex scenarios, analyze execution timeline:
```typescript
// Sort logs by timestamp if available
const timeline = result.logs
  .map(log => ({ timestamp: Date.now(), log }))
  .sort((a, b) => a.timestamp - b.timestamp)

// Verify execution order and timing
```

## Integration with CI/CD

### Test Reliability

Plugin tests are designed for consistent CI/CD execution:
- No external dependencies
- Deterministic behavior
- Proper cleanup and isolation
- Timeout protection

### Performance Monitoring

Monitor test execution time:
```bash
# Run with timing
pnpm test --reporter=verbose

# Check for slow tests
pnpm test -- --coverage
```

This testing approach ensures the plugin system's security guarantees while providing comprehensive test coverage for functionality and reliability.