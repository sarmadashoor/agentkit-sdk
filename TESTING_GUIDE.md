# AgentKit Testing Guide

## 🚨 **IMPORTANT: Current Testing Issues**

**The test suite has 92 test files across 7 packages that currently cause resource conflicts when run together. We've implemented a new testing strategy to solve this.**

## 📊 **Test Distribution**

| Package | Test Files | Type |
|---------|------------|------|
| **SDK** | 60 files | Heavy (agents, plugins, VMs) |
| **CLI** | 7 files | Medium |
| **Runtime-Web** | 11 files | Heavy (browser tests) |
| **Registry** | 6 files | Light |
| **Errors** | 3 files | Light |
| **Types** | 3 files | Light |
| **Others** | 2 files | Light |
| **TOTAL** | **92 files** | |

## 🎯 **Testing Commands Overview**

### **🚀 Development Commands (Fast Feedback)**

```bash
# Quick development testing (recommended)
npm run test:fast          # 4 packages, ~30 seconds, reliable exit

# Smart adaptive testing  
npm test                   # Adapts based on environment
```

### **🏗️ CI/CD Commands (Comprehensive)**

```bash
# Full comprehensive testing (all 92 tests)
npm run test:ci            # Sequential execution, ~5-10 minutes, reliable exit

# Force comprehensive mode
npm test --full            # Same as test:ci

# Individual package testing  
npm run test:sequential    # Original pnpm -r run test behavior
```

### **⚡ Package-Specific Commands**

```bash
# SDK package only (60 tests)
cd packages/sdk && npm run test:core        # Core tests only (~3 files)
cd packages/sdk && npm run test:plugins     # Plugin tests (~15 files)  
cd packages/sdk && npm run test:all-batched # All SDK tests in batches

# Individual packages
cd packages/cli && npm test
cd packages/errors && npm test
```

## 📋 **What Tests Run With Each Command**

### **`npm run test:fast`** ⚡
- ✅ **packages/types** (3 tests) - Type validation
- ✅ **packages/errors** (3 tests) - Error handling  
- ✅ **packages/registry** (6 tests) - Registry functionality
- ✅ **packages/sdk/core** (3 tests) - Core SDK functionality
- 📊 **Total: ~15 tests in 4 packages**
- ⏱️ **Duration: ~30 seconds**
- ✅ **Reliable Exit: YES**

### **`npm run test:ci`** 🏗️
- ✅ **ALL 7 packages** in sequence
- ✅ **All 92 test files**
- ✅ **Timeouts & retries** for reliability
- ✅ **Resource cleanup** between packages
- ⏱️ **Duration: ~5-10 minutes**  
- ✅ **Reliable Exit: YES**

### **`npm test`** 🎯 (Smart Mode)
- 🔍 **Detects environment**:
  - **CI=true** → Runs `test:ci` (comprehensive)
  - **--fast flag** → Runs `test:fast` 
  - **Default** → Runs `test:fast` with suggestion for full coverage

## 🛠️ **How It Works**

### **Problem We Solved**
- **Before**: 92 tests run simultaneously → resource conflicts → hanging → manual kill required
- **After**: Tests run in controlled batches → proper cleanup → reliable exit

### **Smart Test Runner Logic**
```javascript
// scripts/test-runner.js
if (process.env.CI === 'true') → Full comprehensive testing
if (process.argv.includes('--fast')) → Fast development testing  
else → Balanced mode (fast + suggestion for full)
```

### **Resource Management**
- **Sequential execution** prevents VM/agent conflicts
- **Timeouts** (2 minutes per package) prevent hanging
- **Retries** (up to 2) handle flaky tests
- **Cleanup pauses** between packages
- **Proper process termination**

## 📖 **Usage Examples**

### **Development Workflow**
```bash
# Quick check before committing
npm run test:fast

# Full verification before pushing  
npm run test:ci

# Debug specific issues
cd packages/sdk && npm run test:core
```

### **CI/CD Pipeline**
```yaml
# .github/workflows/test.yml
- name: Run Tests
  run: npm run test:ci
  env:
    CI: true
```

### **Local Development**
```bash
# Working on core SDK
cd packages/sdk
npm run test:core           # Just connectAgent, bounded-queue, circuit-breaker

# Working on plugins
cd packages/sdk  
npm run test:plugins        # All plugin-related tests

# Working on specific feature
npx vitest run __tests__/specific-feature.test.ts
```

## 🚨 **Current Issues & Solutions**

### **Issue: `npm test` from packages/sdk still hangs**
**Cause**: Running from SDK directory uses SDK's package.json which runs all 60 tests
**Solution**: 
```bash
# Instead of this (from packages/sdk):
npm test                    # ❌ Runs all 60 SDK tests, hangs

# Do this:
npm run test:core          # ✅ Runs 3 core tests, exits cleanly
# OR go to root:
cd ../.. && npm test       # ✅ Uses smart test runner
```

### **Issue: Need to test everything**
**Solution**:
```bash
npm run test:ci            # ✅ Tests all 92 files reliably
```

### **Issue: Too slow for development**
**Solution**:
```bash
npm run test:fast          # ✅ Tests core functionality in 30s
```

## 🎉 **Benefits of New System**

✅ **Reliable**: No more hanging tests  
✅ **Fast**: 30s feedback for development  
✅ **Comprehensive**: Still tests all 92 files when needed  
✅ **CI-Friendly**: Proper exit codes and error reporting  
✅ **Debuggable**: Easy to isolate and fix issues  
✅ **Scalable**: Handles large test suites properly  

## 🔧 **Migration Guide**

### **Old Workflow → New Workflow**

| Old Command | New Command | Why |
|-------------|-------------|-----|
| `pnpm test` | `npm run test:ci` | Comprehensive testing |
| `npm test` (in SDK) | `npm run test:core` | Avoid hanging |
| Manual test running | `npm run test:fast` | Quick development |

### **For Developers**
1. Use `npm run test:fast` for quick development feedback
2. Use `npm run test:ci` before pushing to ensure full coverage  
3. Use package-specific commands for debugging

### **For CI/CD**
Replace `pnpm test` with `npm run test:ci` in your CI configuration.

## 📞 **Getting Help**

If tests still hang or fail:

1. **Check individual packages**:
   ```bash
   cd packages/sdk && npm run test:core
   ```

2. **Check for orphaned processes**:
   ```bash
   ps aux | grep node
   killall node  # If needed
   ```

3. **Run with debugging**:
   ```bash
   DEBUG_HANDLES=1 npm run test:fast
   ```

4. **Check CI logs** for specific package failures in `npm run test:ci`