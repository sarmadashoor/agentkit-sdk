import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Exclude integration tests from normal test runs
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.d.ts',
      '**/__tests__/integration/**', // Exclude integration tests
    ],
    // Default timeout for regular tests
    testTimeout: 10000,
    // Hook timeout for setup/teardown
    hookTimeout: 10000,
    // Environment setup
    environment: 'node',
    // Global setup
    globals: true,
    // Coverage settings
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'coverage/**',
        'dist/**',
        '**/node_modules/**',
        '**/*.d.ts',
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.spec.ts'
      ]
    }
  }
})