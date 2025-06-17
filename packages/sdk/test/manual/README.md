# Manual Test Suite

This directory contains **manual simulation tests** for the AgentKit SDK. These tests were moved from `src/__tests__/` to maintain architectural purity and proper separation of concerns.

## 📁 Test Files

- **`hook-basic.test.ts`** - Basic plugin lifecycle hook validation using VM contexts
- **`observability-timeline.test.ts`** - Plugin timeline event emission and collection testing  
- **`signing-simulation.test.ts`** - Plugin signing simulation for HMAC and Ed25519
- **`fault-boundary.test.ts`** - Plugin crash isolation and fault tolerance testing
- **`malformed-plugin.test.ts`** - Error handling for malformed plugins and metadata

## 🚀 Running Tests

```bash
# Run all manual tests
npm run test:manual

# Run specific test file
npx vitest test/manual/hook-basic.test.ts

# Run with coverage
npx vitest test/manual/ --coverage
```

## 🎯 Purpose

These tests simulate real-world scenarios and edge cases for:

- Plugin lifecycle management
- VM-based security isolation  
- Observability and monitoring
- Error handling and recovery
- Cryptographic operations

## 🔧 Import Paths

All imports use relative paths from this location:
- SDK modules: `../../src/module-name`
- Types: `@agentkit/types` (workspace dependency)

## 🛡️ Guardrails

A validation script (`scripts/validate-tests.mjs`) prevents these files from being accidentally moved back into `src/`. The guardrail runs automatically before tests to maintain architectural boundaries.