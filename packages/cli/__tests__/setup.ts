/**
 * Global Test Setup
 * 
 * Configures global mocks and safety measures for all tests
 */

import { vi } from 'vitest'

// Global mock to prevent any accidental process.chdir() usage across all tests
const originalChdir = process.chdir
process.chdir = vi.fn((dir: string) => {
  throw new Error(`process.chdir(${dir}) is not allowed in tests - use explicit paths instead`)
})

// Store original for cleanup if needed
;(global as any).__originalChdir = originalChdir

// Ensure tests run in development mode by default
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test'
}

// Cleanup after each test to prevent side effects
afterEach(() => {
  // Reset all mocks
  vi.clearAllMocks()
  
  // Restore process.chdir mock (in case a test overrides it)
  if (typeof process.chdir !== 'function' || process.chdir === originalChdir) {
    process.chdir = vi.fn((dir: string) => {
      throw new Error(`process.chdir(${dir}) is not allowed in tests - use explicit paths instead`)
    })
  }
})

// Global test utilities available in all test files
declare global {
  const __originalChdir: typeof process.chdir
}