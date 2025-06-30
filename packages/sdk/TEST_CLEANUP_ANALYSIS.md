# Test Cleanup Analysis for SDK Tests

## Overview
After analyzing the test files in `/home/s/dev/agentkit-sdk/packages/sdk/__tests__`, I've identified several patterns that could cause test failures and hanging handles similar to the transport-simulation.test.ts issue.

## Critical Issues Found

### 1. Widespread Syntax Error: `afterEach, afterAll`
- **Impact**: High - Prevents proper cleanup from running
- **Files affected**: 53 test files
- **Pattern**: `afterEach, afterAll(async () => { ... })`
- **Issue**: This is invalid JavaScript/TypeScript syntax. The cleanup code likely never runs.
- **Examples**:
  - `plugin-verification.test.ts` (line 74)
  - `plugin-lifecycle.test.ts` (line 89)
  - Many others...

### 2. Missing handle.shutdown() calls
- **Impact**: Medium - Can leave handles open
- **Files identified**:
  - `plugin-verification.test.ts` - No connectAgent usage
  - `agent-manager-memory-leaks.test.ts` - Uses cleanupAllResources() 
  - `plugin-hmac-verification.test.ts` - Uses cleanupAllResources()
  - `plugin-lifecycle.test.ts` - Has syntax error in cleanup
  - `plugin-security.test.ts` - Needs verification
  - `plugin-signature-integration.test.ts` - Needs verification

### 3. Test Cleanup Patterns

#### Good Pattern (Found in some files):
```typescript
import { cleanupAllResources, flushPromises } from './test-utils'

afterEach(async () => {
  await cleanupAllResources()
  await flushPromises()
})

afterAll(async () => {
  // Additional cleanup if needed
})
```

#### Bad Pattern (Found in many files):
```typescript
afterEach, afterAll(async () => {  // SYNTAX ERROR!
  // cleanup code that never runs
})
```

## Files with Proper Cleanup
These files follow good practices:
- `circuit-breaker.test.ts` - Proper afterEach and afterAll
- `agent-manager-memory-leaks.test.ts` - Uses cleanupAllResources
- `plugin-hmac-verification.test.ts` - Uses cleanupAllResources

## Recommendations

### Immediate Actions
1. **Run the fix script**: `./fix-test-cleanup-syntax.sh` to fix all syntax errors
2. **Add missing afterAll hooks** where needed
3. **Verify cleanup patterns** in each file

### Long-term Actions
1. **Add ESLint rule** to catch `afterEach, afterAll` pattern
2. **Standardize cleanup** using test-utils across all tests
3. **Add test runner validation** to ensure no hanging handles

## Test Execution Strategy

After fixing the syntax errors:
1. Run each test file individually to verify it passes
2. Check for hanging handles using: `node --trace-warnings`
3. Use the handle detection from test-utils to identify leaks

## Additional Observations

1. **Promise patterns**: Most async operations are properly awaited or collected for Promise.all()
2. **Timer cleanup**: Some tests use fake timers but properly restore them
3. **Resource tracking**: test-utils provides good infrastructure for cleanup

## Next Steps

1. Execute `fix-test-cleanup-syntax.sh`
2. Manually review and add afterAll hooks where removed
3. Run test suite with handle detection enabled
4. Fix any remaining cleanup issues
5. Add preventive measures (linting, etc.)

## Command to Find Remaining Issues

```bash
# Find files still needing review
grep -l "connectAgent" __tests__/**/*.test.ts | \
  xargs grep -L "cleanupAllResources\|handle\.shutdown" | \
  xargs grep -L "afterEach.*afterAll"
```

This will find files that:
- Use connectAgent
- Don't have cleanupAllResources or handle.shutdown
- Don't have the syntax error (already fixed)