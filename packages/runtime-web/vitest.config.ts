import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['tests/browser/**/*', 'node_modules/**/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.config.ts',
        '**/browser-example.ts'
      ]
    },
    // Browser-specific test configuration
    testTimeout: 10000,
    hookTimeout: 10000,
    // Run tests in parallel for faster execution
    threads: true,
    maxThreads: 4,
    // Enable browser-like APIs in happy-dom
    pool: 'threads'
  },
  esbuild: {
    target: 'es2020'
  }
})