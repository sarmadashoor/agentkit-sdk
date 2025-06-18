import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Only run integration tests
    include: [
      'packages/sdk/__tests__/integration/*.test.ts',
    ],
    // Longer timeouts for integration tests
    testTimeout: 30000,
    hookTimeout: 15000,
    // Environment setup
    environment: 'node',
    // Global setup
    globals: true,
    // More verbose output for integration tests
    reporter: ['verbose'],
    // Disable parallelization for integration tests to avoid conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  }
})