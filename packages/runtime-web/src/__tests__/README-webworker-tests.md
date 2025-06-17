# WebWorker Plugin Tests

This directory contains tests for browser-based plugin execution using WebWorkers.

## Test Files

### `webworker-smoke.test.ts`
**Purpose**: Smoke test for basic WebWorker plugin execution
**Author**: SDET Team  
**Status**: ✅ Implemented

**Key Features**:
- ✅ Skips entirely if `globalThis.Worker` is not defined (Node.js environment)
- ✅ Uses inline WebWorker creation with blob URLs
- ✅ Disables Function constructor for security isolation  
- ✅ Tests ping/pong message processing
- ✅ Intercepts and validates console.log output from plugins
- ✅ Ensures zero global mutations and cross-state leaks
- ✅ Validates protocol integrity and error handling

**Test Coverage**:
1. Basic plugin execution in WebWorker
2. Function constructor isolation enforcement
3. Global state isolation and mutation prevention  
4. Graceful error handling
5. Communication protocol integrity

### `plugin-worker.test.ts`
**Purpose**: Comprehensive WebWorker plugin system tests
**Status**: ✅ Existing comprehensive test suite

## Directory Placement Note

**Original Request**: `packages/sdk-browser/src/__tests__/`  
**Actual Placement**: `packages/runtime-web/src/__tests__/`

**Rationale**: The `packages/sdk-browser` directory does not exist in this monorepo. The `packages/runtime-web` package is the appropriate location for browser-focused WebWorker functionality and tests.

## Running Tests

```bash
# Run WebWorker smoke test (will skip in Node.js)
npx vitest src/__tests__/webworker-smoke.test.ts

# Run all WebWorker tests
npx vitest src/__tests__/webworker-smoke.test.ts src/__tests__/plugin-worker.test.ts

# Run in browser environment (for full WebWorker support)
# Note: The smoke test will skip in Node.js environments
```

## Security Considerations

The WebWorker smoke test validates critical security boundaries:

1. **Function Constructor Isolation**: Prevents dynamic code execution
2. **Global Scope Isolation**: Ensures worker modifications don't affect main thread
3. **DOM API Blocking**: Validates dangerous APIs are inaccessible  
4. **Structured Cloning**: Ensures data isolation between threads
5. **Protocol Integrity**: Validates message communication security

## Browser Compatibility

The tests will automatically skip when WebWorkers are not available, making them safe to run in any environment while still providing comprehensive coverage when WebWorker support is present.