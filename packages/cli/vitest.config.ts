import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Ensure tests run in isolation and don't affect each other
    isolate: true,
    // Use threads for better isolation (but avoid process.chdir issues)
    threads: true,
    // Timeout for tests that might run CLI commands
    testTimeout: 120000,
    // Timeout for individual hooks
    hookTimeout: 30000,
    coverage: {
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'templates/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '__tests__/helpers/**'
      ]
    },
    // Mock configuration to prevent process.chdir usage
    setupFiles: ['__tests__/setup.ts']
  }
})