# AgentKit QA Scenarios

This package contains automated developer simulation and integration scenarios for the AgentKit SDK.

## Purpose

The QA scenarios module validates real-world developer workflows and ensures that the AgentKit SDK behaves correctly in various integration scenarios. These tests simulate how developers would actually use the SDK in their applications.

## Running

```bash
# Install dependencies
pnpm install

# Run all QA scenarios
pnpm test

# Run tests in watch mode during development
pnpm dev

# Type checking
pnpm typecheck
```

## Scenarios Covered

- **Install & Init**: Validates basic SDK installation and initialization patterns
- **TypeScript Strict Mode**: Ensures SDK works correctly with strict TypeScript settings
- **Agent Lifecycle**: Tests complete agent lifecycle from creation to shutdown
- **Plugin Integration**: Validates plugin loading, execution, and cleanup
- **Concurrency**: Tests multiple agents running simultaneously
- **Error Handling**: Validates proper error propagation and recovery

## Structure

```
packages/qa-scenarios/
├── __tests__/          # Test scenarios
├── fixtures/           # Reusable test data and configurations
├── helpers/            # Shared test utilities
├── vitest.config.ts    # Test configuration
└── package.json        # Dependencies and scripts
```

## Adding New Scenarios

1. Create a new test file in `__tests__/`
2. Use shared helpers from `helpers/` for common setup/teardown
3. Leverage fixtures from `fixtures/` for test data
4. Follow the existing naming pattern: `scenario-name.test.ts`

## Goals

- Validate real-world developer flows
- Ensure lifecycle, plugin, concurrency, and sandbox behaviors work end-to-end
- Catch integration issues that unit tests might miss
- Provide confidence in SDK reliability for production use

## Integration with CI/CD

These scenarios are designed to run as part of the Tier 2 testing suite, providing comprehensive integration validation without the resource intensity of Tier 3 tests.