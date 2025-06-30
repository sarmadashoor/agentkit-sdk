# AgentKit SDK Test Debug Plan

## Principal Engineer Analysis - Test Hanging & Resource Leak Investigation

**Date:** 2025-06-29  
**Analyzed by:** Claude (Principal Engineer & Advanced Testing Expert)  
**Repository:** AgentKit SDK (Node.js/TypeScript monorepo with pnpm workspaces)

---

## 🔍 Executive Summary

**The Problem:**
Tests currently hang and require forced timeout exits, preventing live test results and clean Node.js process termination. Resource leaks in VM sandboxing, plugin lifecycle management, and worker thread handling are keeping the process alive.

**Root Causes Identified:**
1. **VM Context Resource Leaks**: Node.js VM contexts are created but not properly disposed
2. **Worker Thread Hanging**: Complex worker lifecycle with race conditions during termination  
3. **Message Port Leaks**: MessagePorts not consistently closed across test scenarios
4. **Timer Management**: Inconsistent `.unref()` usage preventing clean process exit
5. **Plugin Sandbox Cleanup**: Incomplete cleanup in VM-based and Worker-based sandbox implementations

**Solution:**
Remove the forced timeout wrapper and implement comprehensive resource cleanup across VM contexts, workers, timers, and plugin lifecycle management.

---

## 🏗️ Repository Structure Analysis

### Workspace Configuration
- **Root:** `pnpm` workspace with 8 packages
- **Test Framework:** Vitest across all packages
- **Problem Package:** `@agentkit/sdk` (primary source of resource leaks)
- **Test Command:** `pnpm test` runs `pnpm -r --parallel run test`

### Package Test Scripts Analysis

| Package | Test Script | Issues |
|---------|-------------|---------|
| `@agentkit/sdk` | `node scripts/validate-tests.mjs && timeout 120s vitest run \|\| (...)` | **FORCED TIMEOUT** |
| `@agentkit/cli` | `pretest: npm run build && vitest run` | Clean (no timeout) |
| `@agentkit/runtime-web` | `vitest run` | Clean (no timeout) |
| `@agentkit/errors` | `vitest run` | Clean (no timeout) |
| Others | `vitest run` | Clean (no timeout) |

**Only the SDK package requires a forced timeout - this is where the resource leaks are concentrated.**

---

## 🚨 Resource Leak Root Cause Analysis

### 1. VM Context Management Issues

**File:** `packages/sdk/src/plugins/PluginSandbox.ts:101-190`

**Problem:**
```typescript
class NodeVMSandbox {
  private vm?: typeof import('vm')
  private context: any

  private createContext(): void {
    this.context = this.vm.createContext(safeGlobals)
  }

  cleanup(): void {
    if (this.context) {
      this.context = null  // ❌ Basic cleanup but may not release all VM resources
    }
    if (global.gc) {
      global.gc()  // ❌ Manual GC call - indicates memory issues
    }
  }
}
```

**Issues:**
- VM contexts are created but not explicitly disposed
- Script objects are not tracked or cleaned up
- Manual `global.gc()` calls indicate memory pressure
- No explicit disposal of VM module references

### 2. Worker Thread Lifecycle Issues

**File:** `packages/sdk/src/plugins/worker-utils.ts:324-339`

**Problem:**
```typescript
terminate(): void {
  if (this.activeExecution) {
    this.rejectExecution(new Error('Worker terminated'))
  }
  this.worker.terminate()
}
```

**Issues:**
- Complex worker termination logic with potential race conditions
- Worker creation using blob URLs that may not always be cleaned up
- Timeout handling creates new workers on timeout but may not clean up old ones properly

### 3. Timer Management Inconsistencies

**Analysis across codebase:**

**✅ GOOD (BoundedExecutor pattern):**
```typescript
// packages/sdk/src/boundedExecutor.ts:464-481
private createTrackedTimeout(callback: () => void, delay: number): NodeJS.Timeout {
  const timeout = setTimeout(() => {
    this.activeTimeouts.delete(timeout)
    if (!this.isShutdown) callback()
  }, delay)
  this.activeTimeouts.add(timeout)
  return timeout
}
```

**❌ PROBLEMATIC (Inconsistent patterns):**
```typescript
// Various files - inconsistent .unref() usage
setTimeout(() => {}, delay)           // ❌ Missing .unref()
setTimeout(() => {}, delay).unref()   // ✅ Good
```

### 4. Plugin Sandbox Resource Management

**File:** `packages/sdk/src/plugins/PluginSandbox.ts:564-588`

**Problem:**
```typescript
async cleanup(): Promise<void> {
  if (this.implementation instanceof NodeVMSandbox) {
    (this.implementation as any).cleanup()  // ❌ Cast indicates design issue
  }
  if (global.gc) {
    global.gc()  // ❌ Manual GC indicates incomplete cleanup
  }
}
```

**Issues:**
- Type casting indicates incomplete interface design
- Manual garbage collection suggests resources aren't properly released
- No guarantee that all VM script objects are disposed

### 5. Vitest Setup Resource Tracking

**File:** `packages/sdk/vitest.setup.ts:10-393`

**Analysis:**
- **GOOD:** Comprehensive handle detection and categorization
- **GOOD:** Aggressive cleanup in `afterAll` hook
- **PROBLEM:** Complex cleanup logic indicates underlying resource management issues
- **PROBLEM:** Forced exit after 500ms suggests incomplete cleanup

---

## 🛠️ Step-by-Step Refactor Plan

### Phase 1: Fix VM Context Resource Management

**Files to Modify:**
- `packages/sdk/src/plugins/PluginSandbox.ts`

**Changes:**

1. **Track VM Script Objects:**
```typescript
class NodeVMSandbox {
  private vm?: typeof import('vm')
  private context: any
  private activeScripts = new Set<any>()  // NEW: Track script objects

  execute(pluginCode: string, hookName: PluginHookName, args: unknown[]) {
    const script = new this.vm!.Script(wrapperCode, {
      filename: `plugin-${hookName}.js`
    })
    this.activeScripts.add(script)  // NEW: Track for cleanup
    
    // ... existing code ...
  }

  cleanup(): void {
    // NEW: Explicitly dispose of all VM resources
    for (const script of this.activeScripts) {
      try {
        if (script && typeof script.dispose === 'function') {
          script.dispose()
        }
      } catch (err) {
        console.warn('Failed to dispose VM script:', err)
      }
    }
    this.activeScripts.clear()

    if (this.context) {
      // NEW: More thorough context cleanup
      try {
        if (this.vm && typeof this.vm.measureMemoryUsage === 'function') {
          this.vm.measureMemoryUsage({ mode: 'detailed' }).catch(() => {})
        }
      } catch (err) {
        // Ignore measurement errors
      }
      this.context = null
    }
    
    // Remove manual GC call
  }
}
```

### Phase 2: Simplify Worker Management for Tests

**Files to Modify:**
- `packages/sdk/src/plugins/worker-utils.ts`

**Changes:**

1. **Add Test-Specific Worker Management:**
```typescript
class PooledWorker {
  private isTestEnvironment = process.env.NODE_ENV === 'test'

  terminate(): void {
    if (this.activeExecution) {
      this.rejectExecution(new Error('Worker terminated'))
    }
    
    if (this.isTestEnvironment) {
      // Aggressive termination for tests
      try {
        this.worker.terminate()
      } catch (err) {
        console.warn('Worker termination error (test env):', err)
      }
    } else {
      this.worker.terminate()
    }
  }
}

class WorkerPool {
  shutdown(): void {
    if (this.gcInterval) {
      clearInterval(this.gcInterval)
      this.gcInterval = undefined
    }

    // NEW: More aggressive shutdown for tests
    if (process.env.NODE_ENV === 'test') {
      this.workers.forEach(worker => {
        try {
          worker.terminate()
        } catch (err) {
          console.warn('Test worker termination error:', err)
        }
      })
    } else {
      this.workers.forEach(worker => worker.terminate())
    }
    this.workers = []
  }
}
```

### Phase 3: Implement Global Timeout Tracking

**Files to Modify:**
- `packages/sdk/src/plugins/PluginSandbox.ts`
- `packages/sdk/src/plugins/worker-utils.ts`

**Changes:**

1. **Create Global Timeout Registry:**
```typescript
// NEW: Global timeout tracking utility
class TimeoutRegistry {
  private static timeouts = new Set<NodeJS.Timeout>()
  
  static createTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    const timeout = setTimeout(() => {
      TimeoutRegistry.timeouts.delete(timeout)
      callback()
    }, delay).unref()
    TimeoutRegistry.timeouts.add(timeout)
    return timeout
  }
  
  static clearAll(): void {
    for (const timeout of TimeoutRegistry.timeouts) {
      clearTimeout(timeout)
    }
    TimeoutRegistry.timeouts.clear()
  }
}

// Use in PluginSandbox and other components
const timeout = TimeoutRegistry.createTimeout(callback, delay)
```

### Phase 4: Update Test Configuration

**Files to Modify:**
- `packages/sdk/vitest.config.ts`
- `packages/sdk/vitest.setup.ts`

**Changes:**

1. **Simplify Vitest Config:**
```typescript
// packages/sdk/vitest.config.ts
export default defineConfig({
  test: {
    setupFiles: [resolve(__dirname, './vitest.setup.ts')],
    globals: true,
    
    // Simplified timeouts
    threads: false,
    pool: 'forks',  // Change from vmThreads to forks for better cleanup
    
    // Reasonable timeouts
    hookTimeout: 10000,
    teardownTimeout: 10000,
    testTimeout: 30000,
    
    // Environment for cleanup
    env: {
      NODE_ENV: 'test',
      DEBUG_HANDLES: '0'
    }
  }
})
```

2. **Streamlined Setup File:**
```typescript
// packages/sdk/vitest.setup.ts
import { afterAll, afterEach } from 'vitest'

// Global cleanup registry
const cleanupTasks: (() => Promise<void> | void)[] = []

export function registerCleanup(task: () => Promise<void> | void) {
  cleanupTasks.push(task)
}

afterEach(async () => {
  // Run all registered cleanup tasks
  for (const cleanup of cleanupTasks) {
    try {
      await cleanup()
    } catch (err) {
      console.warn('Cleanup task failed:', err)
    }
  }
  cleanupTasks.length = 0
})

afterAll(async () => {
  // Final cleanup
  const handles = process._getActiveHandles()
  if (handles.length > 0) {
    console.warn(`Final cleanup: ${handles.length} handles remaining`)
    
    // Force cleanup remaining handles
    handles.forEach((handle, idx) => {
      try {
        if (typeof handle.unref === 'function') {
          handle.unref()
        }
        if (typeof handle.close === 'function') {
          handle.close()
        }
        if (typeof handle.terminate === 'function') {
          handle.terminate()
        }
      } catch (err) {
        console.warn(`Failed to cleanup handle ${idx}:`, err.message)
      }
    })
  }
})
```

### Phase 5: Remove Forced Timeout from SDK Test Script

**Files to Modify:**
- `packages/sdk/package.json`

**Changes:**

```json
{
  "scripts": {
    "test": "node scripts/validate-tests.mjs && vitest run",
    "test:watch": "vitest",
    "test:manual": "vitest test/manual/",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  }
}
```

**Remove the entire timeout wrapper:**
- ❌ `timeout 120s vitest run || ([ $? -eq 124 ] && echo '✅ Tests completed successfully (exit timeout expected)' && exit 0 || exit $?)`
- ✅ `vitest run`

---

## 🧪 Updated Test Scripts

### 1. Clean SDK Test Script

**File:** `packages/sdk/package.json`
```json
{
  "scripts": {
    "test": "node scripts/validate-tests.mjs && vitest run",
    "test:watch": "vitest",
    "test:debug": "DEBUG_HANDLES=1 vitest run",
    "test:manual": "vitest test/manual/",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  }
}
```

### 2. Root Level Test Scripts (No Changes Needed)

**File:** `package.json` (already clean)
```json
{
  "scripts": {
    "test": "pnpm -r --parallel run test",
    "test:node": "pnpm -r --parallel --filter='!@agentkit/runtime-web' run test",
    "test:browser": "pnpm --filter @agentkit/runtime-web run test"
  }
}
```

### 3. New Debug Test Script

**File:** `packages/sdk/test-debug.sh` (NEW)
```bash
#!/bin/bash
echo "🔍 Running tests with handle debugging..."
DEBUG_HANDLES=1 vitest run --reporter=verbose
echo "✅ Tests completed - checking for hanging handles..."
```

---

## 📋 Implementation Commands

### Step 1: Backup Current State
```bash
# Create backup branch
git checkout -b backup-timeout-implementation
git add -A && git commit -m "Backup: Current timeout implementation"
git checkout master
```

### Step 2: Apply VM Context Fixes
```bash
# Edit PluginSandbox.ts with VM cleanup improvements
code packages/sdk/src/plugins/PluginSandbox.ts

# Test the changes
cd packages/sdk
pnpm test:integration  # Test with smaller scope first
```

### Step 3: Apply Worker Management Fixes
```bash
# Edit worker-utils.ts with improved cleanup
code packages/sdk/src/plugins/worker-utils.ts

# Test worker-specific functionality
cd packages/sdk
npx vitest run __tests__/plugins/worker-integration.test.ts
```

### Step 4: Update Test Configuration
```bash
# Update vitest config
code packages/sdk/vitest.config.ts
code packages/sdk/vitest.setup.ts

# Test configuration changes
cd packages/sdk
npx vitest run __tests__/bounded-queue.test.ts  # Quick test
```

### Step 5: Remove Timeout Wrapper
```bash
# Update package.json test script
code packages/sdk/package.json

# Test the new script
cd packages/sdk
pnpm test  # Should now run without timeout wrapper
```

### Step 6: Full Test Suite
```bash
# Test all packages
pnpm test:node  # All non-browser packages
pnpm test       # Full test suite

# Check for hanging processes
ps aux | grep node  # Should see no hanging node processes after tests
```

### Step 7: Validate CI/Git Hooks
```bash
# Test pre-commit hook
git add -A
git commit -m "Fix: Remove forced timeouts and implement proper resource cleanup"

# Should run: typecheck -> test -> build (all should pass)
```

---

## 🔧 Verification Commands

### Test Individual Components
```bash
# Test VM sandboxing specifically
cd packages/sdk
npx vitest run __tests__/plugins/sandboxed-plugin.test.ts

# Test worker management
npx vitest run __tests__/plugins/worker-integration.test.ts

# Test resource cleanup
npx vitest run __tests__/bounded-queue.test.ts
```

### Monitor Resource Usage
```bash
# Run with handle debugging
cd packages/sdk
DEBUG_HANDLES=1 npx vitest run

# Monitor active handles during test run
node -e "
setInterval(() => {
  const handles = process._getActiveHandles();
  console.log(\`Active handles: \${handles.length}\`);
}, 1000);
"
```

### Validate Clean Exit
```bash
# Test clean process termination
cd packages/sdk
time pnpm test  # Should complete cleanly without hanging

# Check exit code
echo $?  # Should be 0 for success
```

---

## 🎯 Expected Outcomes

### Before Changes
- ❌ Tests hang without forced timeout
- ❌ `timeout 120s` required to complete tests
- ❌ Exit code 124 (timeout) treated as success
- ❌ No live test results visible
- ❌ Resource leaks in VM contexts and workers

### After Changes
- ✅ Tests complete naturally without timeout
- ✅ Live pass/fail results displayed
- ✅ Clean Node.js process exit (exit code 0)
- ✅ No hanging handles or resource leaks
- ✅ Faster test execution
- ✅ Reliable CI/CD integration

### Performance Improvements
- **Faster Tests:** Remove 120s timeout overhead
- **Better Debugging:** Live test output and error reporting
- **Reliable CI:** No timeout-dependent test results
- **Resource Efficiency:** Proper cleanup prevents memory leaks

---

## 🚨 Rollback Plan

If issues arise during implementation:

### Quick Rollback
```bash
# Restore timeout wrapper temporarily
cd packages/sdk
# Edit package.json to restore old test script:
# "test": "node scripts/validate-tests.mjs && timeout 120s vitest run || ([ $? -eq 124 ] && echo '✅ Tests completed successfully (exit timeout expected)' && exit 0 || exit $?)"
```

### Full Rollback
```bash
git checkout backup-timeout-implementation
git checkout master
git merge backup-timeout-implementation
```

---

## 📝 Maintenance Notes

### Regular Monitoring
- Monitor test execution times in CI
- Watch for new resource leak patterns
- Review handle cleanup in new code

### Code Review Checklist
- [ ] All timeouts use `.unref()`
- [ ] VM contexts have proper cleanup
- [ ] Workers terminate cleanly
- [ ] No manual `global.gc()` calls
- [ ] Tests don't create persistent handles

### Future Improvements
- Consider implementing resource monitoring metrics
- Add automated resource leak detection in CI
- Create development tools for handle debugging

---

## 🏁 Conclusion

This plan provides a comprehensive solution to eliminate forced timeouts and achieve clean test execution. The root causes are well-identified in VM context management, worker lifecycle, and resource cleanup patterns. The implementation is incremental and can be rolled back if needed.

**Key Success Factors:**
1. Proper VM context and script object disposal
2. Simplified worker management for test environments  
3. Consistent timeout tracking across all components
4. Streamlined test setup and teardown processes
5. Complete removal of forced timeout dependency

The result will be a robust, fast, and reliable test suite that provides immediate feedback and integrates seamlessly with CI/CD pipelines.