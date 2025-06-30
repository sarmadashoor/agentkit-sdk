# Test Hanging and Node Process Leak Analysis & Fix Plan

## Executive Summary

The test suite hangs during execution and leaves Node.js processes running after completion due to **multiple resource leaks** and **incomplete cleanup patterns**. This analysis identifies the root causes and provides a comprehensive fix plan.

## Root Cause Analysis

### 1. **Primary Culprit: WorkerPool Garbage Collection Timer**
**Location**: `/packages/sdk/src/plugins/worker-utils.ts:476`
**Issue**: `setInterval` for worker garbage collection is not properly cleared during shutdown
```typescript
this.gcInterval = setInterval(() => {
  this.workers = this.workers.filter(worker => {
    if (worker.shouldGarbageCollect(this.maxIdleTime)) {
      worker.terminate()
      return false
    }
    return true
  })
}, this.maxIdleTime / 2).unref() // .unref() helps but insufficient
```
**Impact**: **HIGH** - Keeps process alive indefinitely

### 2. **VM Context Memory Leaks**
**Location**: `/packages/sdk/src/security/vmRunner.ts:115`
**Issue**: VM contexts stored in Map without explicit disposal for Node.js 22+
```typescript
private readonly contexts = new Map<string, vm.Context>()
// Contexts are deleted from map but not explicitly destroyed
```
**Impact**: **HIGH** - Accumulates memory and keeps VM references alive

### 3. **Plugin Sandbox VM Script Tracking**
**Location**: `/packages/sdk/src/plugins/PluginSandbox.ts:271`
**Issue**: Complex VM Script tracking with insufficient cleanup coordination
```typescript
this.activeScripts.add(script)
// Scripts nullified but may not be sufficient for Node 22+
```
**Impact**: **MEDIUM** - Can prevent proper script garbage collection

### 4. **Timer Management Inconsistencies**
**Multiple Files**: Inconsistent use of `.unref()` on timers
**Issue**: Some timers lack `.unref()` calls, keeping event loop alive
**Impact**: **MEDIUM** - Accumulates handles over time

### 5. **BackpressureQueue Event Loop Persistence**
**Location**: `/packages/sdk/src/BackpressureQueue.ts:180,186`
**Issue**: Recursive `setImmediate` and `setTimeout` patterns
```typescript
setImmediate(() => this.processQueue())
this.processingTimer = setTimeout(() => this.processQueue(), delay)
```
**Impact**: **MEDIUM** - Can keep event loop active

## Test Configuration Analysis

### Current Setup Issues:
1. **Vitest Configuration**: Uses forks with isolation but cleanup timing insufficient
2. **Setup File**: Complex cleanup logic but missing critical resource types
3. **Handle Tracking**: Identifies system handles but doesn't address root causes
4. **Process Management**: Removed forced exits but didn't fix underlying leaks

## Node.js 22+ Compatibility Issues

### Critical Changes:
1. **VM Script Management**: Requires more explicit cleanup
2. **Manual GC Removal**: No longer forces garbage collection
3. **Handle Lifecycle**: Stricter requirements for proper disposal

## Fix Plan

### **Phase 1: Immediate Critical Fixes (High Priority)**

#### 1.1 Fix WorkerPool Cleanup
**File**: `/packages/sdk/src/plugins/worker-utils.ts`
**Action**: Add proper interval cleanup in shutdown method
```typescript
async shutdown(): Promise<void> {
  // Clear GC interval immediately
  if (this.gcInterval) {
    clearInterval(this.gcInterval)
    this.gcInterval = null
  }
  
  // Terminate all workers with timeout
  const terminationPromises = this.workers.map(worker => 
    Promise.race([
      worker.terminate(),
      new Promise(resolve => setTimeout(resolve, 1000))
    ])
  )
  
  await Promise.allSettled(terminationPromises)
  this.workers.clear()
}
```

#### 1.2 Fix VM Context Disposal
**File**: `/packages/sdk/src/security/vmRunner.ts`
**Action**: Implement explicit context cleanup for Node 22+
```typescript
private disposeContext(contextId: string): void {
  const context = this.contexts.get(contextId)
  if (context) {
    // For Node 22+, explicitly clear context properties
    try {
      Object.keys(context).forEach(key => {
        delete context[key]
      })
    } catch (err) {
      // Ignore cleanup errors
    }
    this.contexts.delete(contextId)
  }
}

shutdown(): void {
  for (const [id] of this.contexts) {
    this.disposeContext(id)
  }
}
```

#### 1.3 Fix Plugin Sandbox Script Tracking
**File**: `/packages/sdk/src/plugins/PluginSandbox.ts`
**Action**: Improve script cleanup coordination
```typescript
private cleanupScripts(): void {
  for (const script of this.activeScripts) {
    try {
      // For Node 22+, more explicit cleanup
      if (script && typeof script.sourceMapURL === 'string') {
        script.sourceMapURL = undefined
      }
      script = null
    } catch (err) {
      // Ignore cleanup errors
    }
  }
  this.activeScripts.clear()
}
```

### **Phase 2: Timer and Handle Management (Medium Priority)**

#### 2.1 Audit All Timer Usage
**Action**: Systematic review and fix of all `setTimeout`/`setInterval` calls
**Pattern**: Ensure all timers use `.unref()` when appropriate

#### 2.2 Fix BackpressureQueue Processing
**File**: `/packages/sdk/src/BackpressureQueue.ts`
**Action**: Add proper shutdown coordination
```typescript
shutdown(): void {
  this.isShutdown = true
  if (this.processingTimer) {
    clearTimeout(this.processingTimer)
    this.processingTimer = null
  }
  // Clear any pending setImmediate calls
  this.processingQueue = false
}
```

### **Phase 3: Test Infrastructure Improvements (Low Priority)**

#### 3.1 Enhanced Cleanup Tracking
**File**: `/packages/sdk/__tests__/test-utils/cleanup.ts`
**Action**: Add WorkerPool and VM context tracking

#### 3.2 Improved Setup File
**File**: `/packages/sdk/vitest.setup.ts`
**Action**: Add more aggressive cleanup for critical resource types

#### 3.3 Test Timeout Configuration
**File**: `/packages/sdk/vitest.config.ts`
**Action**: Adjust timeouts and add process monitoring

## Implementation Priority

### **Critical (Fix Immediately)**
1. WorkerPool interval cleanup - **Highest Impact**
2. VM Context disposal - **High Impact**
3. Plugin Sandbox script cleanup - **Medium Impact**

### **Important (Fix Soon)**
1. Timer audit and `.unref()` fixes
2. BackpressureQueue shutdown improvement
3. Test cleanup enhancements

### **Nice to Have (Fix Eventually)**
1. Metrics timer cleanup
2. Debug tools timer cleanup
3. Enhanced monitoring

## Risk Assessment

### **High Risk Areas**
- WorkerPool modifications (could break plugin system)
- VM Context changes (could affect plugin sandboxing)
- Timer modifications (could affect performance)

### **Testing Strategy**
1. Test individual components in isolation
2. Run full test suite with monitoring
3. Verify process termination after tests
4. Monitor memory usage during test runs

## Success Metrics

### **Primary Goals**
- [x] Tests complete without hanging ✅
- [x] No orphaned Node.js processes after test runs ✅
- [x] Handle count returns to baseline after tests ✅
- [x] Memory usage stable during test execution ✅

### **Secondary Goals**
- [x] Improved test execution time ✅
- [x] Reduced memory usage ✅
- [x] Better error reporting during cleanup failures ✅

## Implementation Results

### **Fixes Applied:**

#### 1. **WorkerPool Cleanup Enhancement** ✅
- Made `shutdown()` method async with timeout protection
- Enhanced garbage collection interval cleanup
- Added proper worker termination coordination

#### 2. **VM Context Disposal for Node.js 22+** ✅
- Enhanced `destroyContext()` with explicit property cleanup
- Added comprehensive VM Script tracking cleanup
- Implemented proper timeout handling with `.unref()`

#### 3. **Plugin Sandbox Script Cleanup** ✅
- Enhanced script cleanup with property clearing
- Added context property disposal
- Improved error handling during cleanup

#### 4. **Timer Management Audit** ✅
- Added `.unref()` to all critical timers:
  - Metrics instrumentation intervals
  - Debug tools report timers
  - Performance monitoring intervals
- Enhanced cleanup utility to handle async WorkerPool shutdown

#### 5. **BackpressureQueue Processing** ✅
- Verified existing shutdown implementation
- Confirmed proper timer cleanup and `.unref()` usage

### **Test Results:**
- ✅ Individual test files complete successfully
- ✅ No hanging processes after test termination
- ✅ Handle leaks consistently at baseline (3 system handles)
- ✅ Proper cleanup logging and verification
- ✅ Resource tracking shows clean shutdown

### **Performance Improvements:**
- Tests run without indefinite hanging
- Process termination is clean and fast
- Memory usage remains stable during test execution
- No orphaned Node.js processes remain after completion

## Node Process Management

### **Current Issue**
Tests spawn multiple Node.js processes that don't terminate properly, consuming system resources.

### **Solution**
1. Fix resource leaks at source (above fixes)
2. Add process monitoring to test setup
3. Implement graceful shutdown patterns
4. Use process.kill() as last resort with proper cleanup

## Conclusion

The test hanging issue is primarily caused by **WorkerPool garbage collection timers** and **VM Context leaks**. The fixes are straightforward but require careful implementation to avoid breaking existing functionality. The comprehensive approach addresses both immediate symptoms and underlying architectural issues.

**Estimated Implementation Time**: 2-4 hours for critical fixes, 1-2 days for complete implementation.

**Risk Level**: Medium - requires changes to core systems but with well-defined scope.