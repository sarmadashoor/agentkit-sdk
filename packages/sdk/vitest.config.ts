import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    // Ensure setup file loads with absolute path
    setupFiles: [resolve(__dirname, './vitest.setup.ts')],
    globals: true,
    
    // Configuration to prevent hanging
    hookTimeout: 5000,
    teardownTimeout: 5000,
    testTimeout: 15000,
    
    // Use forks for better isolation with limited parallelism
    pool: 'forks',
    poolOptions: {
      forks: {
        // Allow 2-3 parallel workers instead of single fork
        minForks: 1,
        maxForks: 3,
        isolate: true
      }
    },
    
    // Environment variables for cleanup (Node 22+ compatible)
    env: {
      NODE_ENV: 'test',
      DEBUG_HANDLES: '0'
      // Removed NODE_OPTIONS memory constraint for Node 22+ compatibility
    },
    
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
    },
    
    // Reporter configuration for better debugging
    reporter: process.env.CI ? ['github-actions', 'junit'] : ['verbose'],
    
    // Output configuration
    outputFile: {
      junit: './test-results/junit.xml'
    }
  }
})