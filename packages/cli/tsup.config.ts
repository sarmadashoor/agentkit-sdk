import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index-standalone.ts'],
  format: ['cjs'], // Only CJS for CLI binary
  dts: false, // Skip DTS generation for now due to workspace issues
  splitting: false,
  sourcemap: false, // Disable sourcemap for simpler bundle
  clean: true,
  shims: true,
  // Bundle all dependencies for standalone CLI
  noExternal: [/.*/],
  // Target Node.js environment for CLI
  target: 'node18',
  // Add banner to make CLI executable
  banner: {
    js: '#!/usr/bin/env node'
  },
  // Platform for Node.js CLI
  platform: 'node'
})