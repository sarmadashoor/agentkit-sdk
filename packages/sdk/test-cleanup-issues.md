# Test Cleanup Issues Found

## Summary
Found several test files with cleanup issues that could cause test failures similar to the transport-simulation.test.ts issue.

## Major Issues Found

### 1. Syntax Error: Combined afterEach and afterAll hooks
Many test files (53 found) have a syntax error where `afterEach` and `afterAll` are incorrectly combined as:
```typescript
afterEach, afterAll(async () => {
  // cleanup code
})
```

This is invalid syntax and likely causes the cleanup code to not run properly.

### 2. Files with the syntax error pattern
Found via: `grep -l "afterEach.*afterAll" __tests__/*.test.ts`

Key files affected:
- `/home/s/dev/agentkit-sdk/packages/sdk/__tests__/plugin-verification.test.ts` (line 74)
- `/home/s/dev/agentkit-sdk/packages/sdk/__tests__/plugin-lifecycle.test.ts` (line 89)
- And 51 more files...

### 3. Files using connectAgent without explicit cleanup
Some files use `connectAgent()` but may rely solely on test-utils cleanup:
- `agent-manager-memory-leaks.test.ts` - Uses cleanupAllResources() properly
- `plugin-hmac-verification.test.ts` - Uses cleanupAllResources() properly
- `plugin-lifecycle.test.ts` - Has syntax error in cleanup
- `plugin-security.test.ts` - Needs checking
- `plugin-signature-integration.test.ts` - Needs checking

## Recommendations

1. **Fix all syntax errors**: Replace all instances of `afterEach, afterAll` with separate hooks:
   ```typescript
   afterEach(async () => {
     // cleanup code
   })
   
   afterAll(async () => {
     // additional cleanup if needed
   })
   ```

2. **Ensure proper cleanup pattern**: All test files should follow this pattern:
   ```typescript
   import { cleanupAllResources, flushPromises } from './test-utils'
   
   afterEach(async () => {
     await cleanupAllResources()
     await flushPromises()
   })
   ```

3. **Check for missing awaits**: Ensure all async operations in tests are properly awaited.

4. **Handle-specific cleanup**: For tests that create handles directly, ensure they're tracked via test-utils or explicitly shutdown.

## Next Steps

1. Run a bulk fix for the syntax error across all 53 files
2. Verify each file has proper cleanup imports and calls
3. Run tests individually to ensure they pass and don't leave hanging handles
4. Consider adding a linter rule to catch the invalid `afterEach, afterAll` pattern