# AgentKit SDK Testing Strategy

**Stripe-Grade Testing Excellence**  
**Focus**: Reliability, Resource Management, and Developer Experience

## 🎯 Executive Summary

AgentKit SDK has 92 test files across 7 packages that require sophisticated orchestration due to resource-intensive components (agents, plugins, VM sandboxes, browser environments). This document establishes the definitive testing strategy.

## 📊 Test Landscape Overview

### **Test Distribution by Package**
| Package | Files | Complexity | Resource Usage | Notes |
|---------|-------|------------|----------------|-------|
| **SDK** | 60 | High | Heavy | Agent lifecycle, plugins, circuit breakers |
| **Runtime-Web** | 11 | High | Heavy | Playwright browser tests |
| **CLI** | 7 | Medium | Medium | Plugin scaffolding, signing |
| **Registry** | 6 | Low | Light | Immutable data structures |
| **Errors** | 3 | Low | Light | Error handling |
| **Types** | 3 | Low | Light | Schema validation |
| **Test-Agent** | 1 | Low | Light | Dummy implementations |
| **Transports-Dummy** | 1 | Low | Light | Local transport |

### **Total**: 92 test files requiring orchestrated execution

## 🚀 Testing Commands Matrix

### **Development Workflow (Fast Feedback)**

#### `npm run test:fast` ⚡ **[RECOMMENDED FOR DEVELOPMENT]**
```bash
Duration: ~30 seconds
Packages: 4 (Registry, Errors, Types, Test-Agent)
Purpose: Rapid feedback during development
Exit: Clean and reliable
```
**When to use**: During active development, pre-commit hooks, quick validation

#### `npm test` 🎯 **[ADAPTIVE SMART TESTING]**
```bash
Duration: Variable based on environment
Logic: Detects CI vs development environment
Behavior: Runs test:fast in dev, test:ci in CI
```
**When to use**: Default command that adapts to context

### **Comprehensive Testing (Full Coverage)**

#### `npm run test:ci` 🏗️ **[CI/CD PIPELINE]**
```bash
Duration: 5-10 minutes
Packages: All 7 packages
Execution: Sequential to prevent resource conflicts
Purpose: Complete validation before release
```
**When to use**: CI/CD pipelines, pre-release validation, comprehensive testing

#### `npm run test:sequential` 📋 **[ORIGINAL PNPM BEHAVIOR]**
```bash
Duration: 5-10 minutes
Method: pnpm -r run test
Purpose: Package-by-package execution
```
**When to use**: When you need original pnpm workspace behavior

### **Package-Specific Testing**

#### SDK Package (60 tests)
```bash
cd packages/sdk
npm test                    # All SDK tests
npm run test:core          # Core functionality only (~3 files)
npm run test:plugins       # Plugin system tests (~15 files)
npm run test:integration   # Cross-package integration
```

#### Runtime-Web Package (11 tests)
```bash
cd packages/runtime-web
npm test                    # Playwright browser tests
npm run test:browser       # Manual browser testing
npm run test:headless      # Headless browser mode
```

#### CLI Package (7 tests)
```bash
cd packages/cli
npm test                    # Plugin scaffolding tests
npm run test:signing       # Plugin signing tests
npm run test:templates     # Template system tests
```

## 🏗️ Test Organization & Standards

### **File Naming Conventions**
```
✅ CORRECT:
- feature-name.test.ts
- component-name.integration.test.ts
- package-name.unit.test.ts

❌ INCORRECT:
- feature-name.spec.ts (use .test.ts)
- test-feature-name.ts (prefix with feature name)
- featureName.test.ts (use kebab-case)
```

### **Test File Structure**
```typescript
// Required imports for resource management
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { setupTestCleanup, cleanupAllResources } from './test-utils'

describe('Feature Name', () => {
  // REQUIRED: Resource tracking
  beforeEach(() => {
    setupTestCleanup()
  })

  // REQUIRED: Cleanup after each test
  afterEach(async () => {
    await cleanupAllResources()
    vi.clearAllMocks()
  })

  // REQUIRED: Final cleanup
  afterAll(async () => {
    await cleanupAllResources()
  })

  it('should handle basic scenario', async () => {
    // Test implementation
    // IMPORTANT: No manual resource cleanup in individual tests
    // Let afterEach handle it automatically
  })
})
```

### **Resource Management Requirements**

#### **Mandatory Cleanup Patterns**
```typescript
// ✅ CORRECT: Automatic resource tracking
const handle = await connectAgent({ /* ... */ })
// No manual cleanup needed - afterEach handles it

// ✅ CORRECT: Plugin cleanup
const plugin = createPlugin()
// Plugin cleanup automatically handled

// ❌ INCORRECT: Manual cleanup in tests
afterEach(async () => {
  await handle.shutdown() // This should be in test-utils
})
```

#### **Memory Leak Prevention**
```typescript
// Check for handle leaks (included in test-utils)
const baselineHandles = process._getActiveHandles().length
// ... test execution ...
const finalHandles = process._getActiveHandles().length
expect(finalHandles).toBeLessThanOrEqual(baselineHandles + ACCEPTABLE_THRESHOLD)
```

## 🎯 When to Add New Tests

### **Feature Development**
1. **Unit Tests**: For individual functions/classes
   - Place in same package as implementation
   - Use descriptive test names
   - Mock external dependencies

2. **Integration Tests**: For cross-package functionality
   - Place in most relevant package
   - Test real component interactions
   - Verify complete workflows

3. **E2E Tests**: For full system scenarios
   - Add to examples/ or integration test suite
   - Test real-world usage patterns
   - Include error scenarios

### **Bug Fixes**
1. **Write failing test** that reproduces the bug
2. **Fix the implementation**
3. **Verify test passes** and no regressions
4. **Add edge case tests** if applicable

### **Performance Tests**
```typescript
// Add to packages/sdk/__tests__/performance/
describe('Performance Tests', () => {
  it('should handle 1000 concurrent requests', async () => {
    const requests = Array.from({ length: 1000 }, (_, i) => 
      handle.send({ id: i, message: `Request ${i}` })
    )
    
    const start = Date.now()
    await Promise.allSettled(requests)
    const duration = Date.now() - start
    
    expect(duration).toBeLessThan(5000) // 5 second threshold
  })
})
```

## 🔧 CI/CD Integration

### **GitHub Actions Workflow**
```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]

jobs:
  fast-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '18' }
      - run: npm install -g pnpm
      - run: pnpm install
      - run: npm run test:fast

  comprehensive-tests:
    runs-on: ubuntu-latest
    needs: fast-tests
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '18' }
      - run: npm install -g pnpm
      - run: pnpm install
      - run: npm run test:ci

  browser-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '18' }
      - run: npm install -g pnpm
      - run: pnpm install
      - run: cd packages/runtime-web && npm test
```

### **Pre-commit Hooks**
```bash
# Install husky and lint-staged
pnpm add -D husky lint-staged

# .husky/pre-commit
#!/bin/sh
npm run test:fast
npm run lint
npm run typecheck
```

## 🚨 Troubleshooting Guide

### **Common Issues**

#### **Tests Hanging**
```bash
# Symptom: Tests don't exit cleanly
# Solution: Check for resource leaks
npm run test:fast -- --reporter=verbose

# Check active handles
node -e "console.log('Active handles:', process._getActiveHandles().length)"
```

#### **Resource Conflicts**
```bash
# Symptom: Random test failures
# Solution: Use sequential execution
npm run test:ci  # Instead of npm run test:parallel
```

#### **Memory Leaks**
```bash
# Symptom: Tests slow down over time
# Solution: Check cleanup in test-utils
npm run test:fast -- --reporter=verbose --logLevel=debug
```

#### **Plugin Sandbox Issues**
```typescript
// Symptom: Plugin tests interfere with each other
// Solution: Ensure proper sandbox cleanup
afterEach(async () => {
  await cleanupPluginSandboxes()
  await cleanupVMContexts()
})
```

### **Debug Commands**
```bash
# Run with debug output
DEBUG=true npm run test:fast

# Run specific test file
npm test -- packages/sdk/__tests__/connectAgent.test.ts

# Run with coverage
npm test -- --coverage

# Run with verbose output
npm test -- --reporter=verbose
```

## 📈 Performance Benchmarks

### **Target Metrics**
- **test:fast**: < 30 seconds
- **test:ci**: < 10 minutes
- **Memory usage**: < 512MB peak
- **Handle leaks**: 0 after completion

### **Monitoring**
```typescript
// Built into test-utils
const performanceMetrics = {
  duration: testDuration,
  memoryUsage: process.memoryUsage(),
  activeHandles: process._getActiveHandles().length
}
```

## 🎯 Future Improvements

### **Planned Enhancements**
1. **Test Parallelization**: Safe parallel execution for light tests
2. **Snapshot Testing**: UI component and API response snapshots
3. **Contract Testing**: Plugin interface compatibility
4. **Visual Regression**: Browser UI consistency testing
5. **Property-Based Testing**: Fuzz testing for edge cases

### **Automation Goals**
1. **Auto-retry**: Flaky test detection and retry
2. **Test Selection**: Run only affected tests based on changes
3. **Performance Regression**: Detect performance degradation
4. **Resource Monitoring**: Real-time leak detection

This testing strategy ensures reliable, maintainable tests that support rapid development while maintaining production-grade quality standards.