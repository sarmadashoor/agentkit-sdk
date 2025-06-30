import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Minimal config without setupFiles to test if that's causing the hang
    globals: true,
    threads: false,
    hookTimeout: 5000,
    teardownTimeout: 2000,
  }
})