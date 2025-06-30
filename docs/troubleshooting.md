# AgentKit SDK Troubleshooting Guide

## Common Issues & Solutions

### 🔌 Connection Issues

#### Agent Not Found
```
AgentNotFoundError: Agent 'my-agent' not found
```
**Cause**: Agent not registered before attempting connection.

**Solution**:
```typescript
// Register the agent first
AgentRegistry.register({
  id: 'my-agent',
  name: 'My Agent',
  version: '1.0.0',
  factory: () => new MyAgent()
})

// Then connect
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy'
})
```

#### Transport Connection Failed
```
TransportNotFoundError: Transport 'http' not found
```
**Cause**: Transport not registered or incorrect transport ID.

**Solution**:
```typescript
// Register the transport
AgentRegistry.registerTransport(new HttpTransport())

// Verify available transports
console.log('Available transports:', AgentRegistry.listTransports())
```

### ⚡ Circuit Breaker Issues

#### Circuit Breaker Open
```
CircuitBreakerError: Circuit breaker 'my-circuit' is OPEN
```
**Cause**: Circuit breaker opened due to repeated failures.

**Solutions**:
1. **Wait for automatic recovery** (circuit will transition to HALF_OPEN after timeout)
2. **Investigate underlying failures** that caused the circuit to open
3. **Monitor circuit breaker state**:

```typescript
observability: {
  onCircuitBreakerStateChange: (event) => {
    console.log(`Circuit ${event.circuitName}: ${event.fromState} → ${event.toState}`)
    if (event.toState === 'HALF_OPEN') {
      console.log('Circuit breaker testing recovery...')
    }
  }
}
```

### 🚧 Backpressure Issues

#### Queue Full Error
```
BackpressureError: Queue is full (50/50 items)
```
**Cause**: Too many concurrent requests overwhelming the system.

**Solutions**:
1. **Increase queue size**:
```typescript
resourceLimits: {
  maxQueueSize: 100, // Increase from default 50
  maxConcurrentRequests: 10
}
```

2. **Implement flow control**:
```typescript
const handle = await connectAgent({
  // ... config
  observability: {
    onTransportBackpressureDetected: (event) => {
      console.warn(`⚠️ Backpressure: ${event.transportStatus?.queueSize} queued`)
      // Implement adaptive behavior
      await new Promise(resolve => setTimeout(resolve, 1000)) // Backoff
    }
  }
})
```

### 🔐 Plugin Issues

#### Plugin Verification Failed
```
PluginVerificationError: Plugin signature invalid
```
**Cause**: Plugin signature doesn't match or plugin is unsigned.

**Solutions**:
1. **For development** - disable verification:
```typescript
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  verify: 'off' // or 'warn' for development
})
```

2. **For production** - use properly signed plugins:
```bash
# Sign the plugin
pnpm agentkit sign-plugin ./my-plugin/plugin.json --secret-key=$SECRET_KEY
```

#### Plugin Timeout
```
PluginTimeoutError: Plugin 'my-plugin' timed out after 5000ms
```
**Cause**: Plugin hook taking too long to execute.

**Solutions**:
1. **Increase timeout**:
```typescript
// In plugin configuration
const plugin = {
  name: 'my-plugin',
  timeout: 10000, // 10 seconds instead of default 5
  // ... other config
}
```

2. **Optimize plugin code** to execute faster
3. **Use async operations** properly in plugin hooks

### 🧪 Testing Issues

#### Tests Hanging
**Symptoms**: Tests don't exit cleanly, process hangs after completion.

**Solutions**:
1. **Check for resource leaks**:
```bash
# Run with debug output
DEBUG=true npm run test:fast

# Check active handles
node -e "console.log('Active handles:', process._getActiveHandles().length)"
```

2. **Ensure proper cleanup** in tests:
```typescript
afterEach(async () => {
  await cleanupAllResources()
  vi.clearAllMocks()
})
```

3. **Use the correct test command**:
```bash
npm run test:fast    # For development (reliable exit)
npm run test:ci      # For comprehensive testing
```

#### Random Test Failures
**Symptoms**: Tests pass individually but fail when run together.

**Cause**: Resource conflicts between test files.

**Solution**: Use sequential execution:
```bash
npm run test:ci  # Sequential execution prevents conflicts
```

#### Memory Leaks in Tests
**Symptoms**: Tests slow down over time, increasing memory usage.

**Solution**: Check cleanup in test utilities:
```typescript
// In your test file
afterEach(async () => {
  await cleanupAllResources()
  
  // Check for leaks
  const handles = process._getActiveHandles()
  if (handles.length > BASELINE_COUNT) {
    console.warn('Potential handle leak detected:', handles.length)
  }
})
```

### 🏗️ Build Issues

#### TypeScript Compilation Errors
```
error TS2307: Cannot find module '@agentkit/types'
```
**Cause**: Package dependencies not built or installed correctly.

**Solutions**:
1. **Clean and rebuild**:
```bash
pnpm clean
pnpm install
pnpm build
```

2. **Check workspace setup**:
```bash
pnpm list --depth=0  # Verify all packages are installed
```

#### Circular Dependency Errors
```
Error: Circular dependency detected
```
**Solution**: Analyze and fix circular imports:
```bash
pnpm analyze:deps  # Check for circular dependencies
```

### 🌐 Browser Issues

#### Web Worker Not Loading
**Symptoms**: Browser transport fails to initialize Web Worker.

**Solutions**:
1. **Check browser compatibility**:
```typescript
// Feature detection
if (typeof Worker !== 'undefined') {
  // Use Web Worker
} else {
  // Fallback to main thread
}
```

2. **Verify bundle configuration**:
```javascript
// webpack.config.js
module.exports = {
  // ... other config
  resolve: {
    fallback: {
      "worker_threads": false
    }
  }
}
```

#### CORS Issues
**Symptoms**: Browser transport fails with CORS errors.

**Solution**: Configure proper CORS headers on your server:
```javascript
// Express.js example
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  next()
})
```

### 📊 Performance Issues

#### Slow Response Times
**Symptoms**: Agent responses taking longer than expected.

**Debug Steps**:
1. **Enable performance monitoring**:
```typescript
observability: {
  onRequestStart: (metadata) => {
    console.time(`Request ${metadata.requestId}`)
  },
  onRequestEnd: (metadata, duration) => {
    console.timeEnd(`Request ${metadata.requestId}`)
    if (duration > 5000) {
      console.warn(`Slow request detected: ${duration}ms`)
    }
  }
}
```

2. **Check resource limits**:
```typescript
resourceLimits: {
  maxConcurrentRequests: 5, // Reduce if overwhelmed
  requestTimeoutMs: 10000   // Increase if needed
}
```

#### High Memory Usage
**Debug Steps**:
1. **Monitor memory usage**:
```typescript
setInterval(() => {
  const usage = process.memoryUsage()
  console.log('Memory usage:', {
    rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB'
  })
}, 30000)
```

2. **Check for leaks**:
```bash
# Run with --inspect for heap profiling
node --inspect app.js
```

## Debug Techniques

### Enable Debug Logging
```typescript
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'my-transport',
  debug: true, // Enables detailed SDK logging
  
  onError: (error) => {
    console.error('Detailed error:', {
      message: error.message,
      stack: error.stack,
      cause: error.cause
    })
  }
})
```

### Monitor Active Handles
```typescript
// Check for resource leaks
console.log('Active handles:', process._getActiveHandles().length)
console.log('Active requests:', process._getActiveRequests().length)

// Log handle types
process._getActiveHandles().forEach((handle, i) => {
  console.log(`Handle ${i}:`, handle.constructor.name)
})
```

### Trace Request Flow
```typescript
let requestCounter = 0

observability: {
  onRequestStart: (metadata) => {
    const id = ++requestCounter
    console.log(`🚀 [${id}] ${metadata.operation} started for ${metadata.agentId}`)
  },
  onRequestEnd: (metadata, duration) => {
    console.log(`✅ [${metadata.requestId}] completed in ${duration}ms`)
  },
  onError: (error, context) => {
    console.error(`❌ [${context.requestId}] Error in ${context.phase}:`, error.message)
  }
}
```

## Environment-Specific Issues

### Node.js Version Compatibility
**Required**: Node.js >= 18.0.0

**Check version**:
```bash
node --version  # Should be 18.0.0 or higher
```

### Package Manager Issues
**Required**: pnpm >= 8.0.0

**Install pnpm**:
```bash
npm install -g pnpm
pnpm --version  # Should be 8.0.0 or higher
```

### Docker Issues
**Common Issue**: Permission errors in containers.

**Solution**: Set proper user permissions:
```dockerfile
FROM node:18-alpine
RUN addgroup -g 1001 -S nodejs
RUN adduser -S agentkit -u 1001
USER agentkit
```

## Getting Help

### Enable Verbose Logging
```bash
DEBUG=agentkit:* npm test
```

### Collect Debug Information
```typescript
// Add to your error handler
const debugInfo = {
  nodeVersion: process.version,
  platform: process.platform,
  sdkVersion: '0.1.0-alpha',
  activeHandles: process._getActiveHandles().length,
  memoryUsage: process.memoryUsage(),
  timestamp: new Date().toISOString()
}
console.log('Debug info:', debugInfo)
```

### Community Support
- **GitHub Issues**: Report bugs and feature requests
- **Discussions**: Ask questions and share solutions
- **Documentation**: Check the complete developer guide

Remember to include debug information and steps to reproduce when seeking help!