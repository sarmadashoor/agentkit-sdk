import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    isolate: true,
    testTimeout: 120_000,
    hookTimeout: 30_000,
    include: [
      '__tests__/**/*.test.ts',
      '__tests__/**/*.spec.ts',
      'test/**/*.test.ts',
      'test/**/*.spec.ts'
    ],
    setupFiles: [path.resolve(__dirname, './vitest.setup.ts')],
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
    }
  }
})
