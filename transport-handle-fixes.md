# Transport Handle Fixes - MessagePort Cleanup Solution

## Analysis Summary

After examining all transport implementations, the persistent `MessagePort` handles are **NOT** coming from the core transport files themselves. The 3 core transports:

1. **DummyTransport** - Uses only timers and arrays, no MessagePorts
2. **BrowserTransport** - Uses fetch/AbortController, no MessagePorts  
3. **BrowserTransportLite** - Uses fetch/AbortController, no MessagePorts

The MessagePorts are actually coming from the **WebWorker infrastructure** in the `runtime-web` package, specifically:
- `packages/runtime-web/src/worker/PluginWorker.ts`
- `packages/runtime-web/src/WebWorkerMessages.ts`

## Root Cause: WebWorker MessageChannel Infrastructure

The persistent handles come from WebWorker communication channels that are created for plugin execution but not properly cleaned up in test environments.

## Solution Strategy

### Phase 1: Enhanced Transport Disposal Methods

Even though the transports don't directly create MessagePorts, we'll add robust disposal methods to ensure all resources are cleaned up.

#### 1. Enhanced DummyTransport Disposal

```typescript
// Add to packages/transports-dummy/src/index.ts

export class DummyTransport implements Transport {
  // ... existing code ...
  
  private activeTimeouts = new Set<NodeJS.Timeout>()
  
  async send(message: unknown): Promise<void> {
    // ... existing code ...
    
    // Track timeouts for cleanup
    const timeoutId = setTimeout(() => {
      this.activeTimeouts.delete(timeoutId)
      // ... existing timeout logic ...
    }, this.config.responseDelay ?? 5)
    this.activeTimeouts.add(timeoutId)
    
    // ... rest of existing code ...
  }
  
  async shutdown(): Promise<void> {
    if (this.config.debug) {
      console.log('[DummyTransport] Shutting down')
    }
    
    // Clear all active timeouts
    for (const timeout of this.activeTimeouts) {
      clearTimeout(timeout)
    }
    this.activeTimeouts.clear()
    
    this.initialized = false
    this.messageQueue.length = 0
    this.sentMessages.length = 0
    this.processingQueue.length = 0
    this.callbacks.length = 0
    
    // Simulate async shutdown
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  
  // Add idempotent dispose method for backward compatibility
  async dispose(): Promise<void> {
    await this.shutdown()
  }
}

export class LegacyDummyTransport implements Transport {
  // ... existing code ...
  
  private activeTimeouts = new Set<NodeJS.Timeout>()
  
  async send(message: unknown): Promise<void> {
    // ... existing code ...
    
    // Track timeouts for cleanup
    const timeoutId = setTimeout(() => {
      this.activeTimeouts.delete(timeoutId)
    }, 5)
    this.activeTimeouts.add(timeoutId)
    
    // ... rest of existing code ...
  }
  
  async shutdown(): Promise<void> {
    if (this.debug) {
      console.log('[LegacyDummyTransport] Shutting down')
    }
    
    // Clear all active timeouts
    for (const timeout of this.activeTimeouts) {
      clearTimeout(timeout)
    }
    this.activeTimeouts.clear()
    
    this.messageQueue.length = 0
    
    // Simulate async shutdown
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  
  // Add idempotent dispose method for backward compatibility
  async dispose(): Promise<void> {
    await this.shutdown()
  }
}
```

#### 2. Enhanced Browser Transports (Already Good!)

The `BrowserTransport.ts` and `BrowserTransportLite.ts` already have excellent resource cleanup:
- ✅ Track and clear all timeouts
- ✅ Abort and clear all active requests
- ✅ Idempotent shutdown methods

```typescript
// Add dispose alias for consistency (add to both BrowserTransport files)
async dispose(): Promise<void> {
  await this.shutdown()
}
```

### Phase 2: WebWorker Resource Cleanup

#### 3. Enhanced WebWorker Cleanup

```typescript
// Add to packages/runtime-web/src/WebWorkerMessages.ts

export class WebWorkerCommunicator {
  private handlers: WebWorkerMessageHandler = {}
  private worker?: Worker
  private isDisposed = false
  
  // ... existing code ...
  
  /**
   * Dispose of all resources and cleanup worker
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return // Idempotent
    }
    
    this.isDisposed = true
    
    if (this.worker) {
      // Send termination message first
      try {
        const terminationMessage = WebWorkerMessageValidator.createTerminationMessage('Disposal cleanup')
        this.worker.postMessage(terminationMessage)
      } catch {
        // Ignore errors during termination message
      }
      
      // Force terminate the worker
      this.worker.terminate()
      
      // Clear all references
      this.worker.onmessage = null
      this.worker.onerror = null
      this.worker = undefined
    }
    
    // Clear handlers
    this.handlers = {}
    
    // Wait a tick to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  
  /**
   * Enhanced terminate with proper cleanup
   */
  terminate(reason: string = 'Manual termination'): void {
    if (this.worker && !this.isDisposed) {
      try {
        const terminationMessage = WebWorkerMessageValidator.createTerminationMessage(reason)
        this.worker.postMessage(terminationMessage)
      } catch {
        // Ignore errors during termination
      }
      
      this.worker.terminate()
      this.worker.onmessage = null
      this.worker.onerror = null
      this.worker = undefined
    }
  }
}
```

### Phase 3: Test Cleanup Utilities

#### 4. Centralized Transport Cleanup Utility

```typescript
// Add to packages/sdk/__tests__/test-utils.ts

/**
 * Clean up all transport instances to prevent handle leaks
 */
export async function cleanupTransports(): Promise<void> {
  // Track all transport instances that have been created
  for (const transport of transports) {
    try {
      if (transport.dispose) {
        await transport.dispose()
      } else if (transport.shutdown) {
        await transport.shutdown()
      }
    } catch (error) {
      console.error('Error disposing transport:', error)
    }
  }
  transports.length = 0
}

/**
 * Enhanced cleanup function that handles all resources
 */
export async function cleanupAllResources(): Promise<void> {
  // Clean up agents first
  await cleanupAgents()
  
  // Clean up transports
  await cleanupTransports()
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc()
  }
  
  // Wait for cleanup to complete
  await new Promise(resolve => setTimeout(resolve, 10))
}
```

#### 5. Example Test Teardown

```typescript
// Example usage in test files
import { cleanupAllResources, cleanupTransports } from './test-utils'

describe('Transport Tests', () => {
  afterEach(async () => {
    // Clean up individual test resources
    await cleanupTransports()
  })
  
  afterAll(async () => {
    // Final cleanup of all resources
    await cleanupAllResources()
  })
  
  it('should handle transport operations', async () => {
    const transport = registerTransport(createDummyTransport())
    
    // Use transport...
    await transport.send({ test: 'data' })
    
    // Explicit cleanup in test if needed
    await transport.dispose()
  })
})
```

## Phase 4: Implementation Plan

### Immediate Actions (High Priority)

1. **Update DummyTransport** - Add timeout tracking and enhanced shutdown
2. **Add dispose() aliases** - Add to BrowserTransport files for consistency
3. **Update test-utils.ts** - Add transport cleanup utilities
4. **Update vitest.setup.ts** - Use enhanced baseline detection (already done)

### Medium Priority

1. **Update WebWorker infrastructure** - Enhanced cleanup for plugin system
2. **Add transport registry cleanup** - Ensure registry-managed transports are cleaned up

### Testing Strategy

1. **Unit Tests** - Test each transport's dispose/shutdown method
2. **Integration Tests** - Verify no handles leak after transport cleanup
3. **CI Pipeline** - Run with strict leak detection enabled

## Key Benefits

- ✅ **Idempotent cleanup** - Methods can be called multiple times safely
- ✅ **Backward compatible** - Existing APIs unchanged
- ✅ **Comprehensive** - Covers all transport types and WebWorker infrastructure
- ✅ **Test-friendly** - Easy to integrate into existing test suites
- ✅ **Resource efficient** - Prevents memory and handle leaks

## Validation Commands

```bash
# Test individual transport cleanup
cd packages/sdk && FORCE_TEST_EXIT=1 DEBUG_HANDLES=1 npx vitest run __tests__/connectAgent.test.ts

# Test full suite with strict leak detection
cd packages/sdk && STRICT_LEAK_DETECTION=1 DEBUG_HANDLES=1 npx vitest run

# Verify baseline detection working
cd packages/sdk && FORCE_TEST_EXIT=1 npx vitest run __tests__/transport-*.test.ts
```