import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 10000,
    setupFiles: ['./helpers/setup.ts'],
    teardownTimeout: 5000,
    // Ensure clean isolation between tests
    pool: 'forks',
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 3,
        isolate: true
      }
    }
  }
})