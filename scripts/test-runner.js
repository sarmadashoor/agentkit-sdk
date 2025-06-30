#!/usr/bin/env node

/**
 * Smart Test Runner
 * 
 * Default test runner that adapts based on environment and context.
 * - Development: Fast mode (core tests only)
 * - CI: Full comprehensive mode
 * - Local: Balanced mode
 */

import { spawn } from 'child_process'

function detectEnvironment() {
  if (process.env.CI === 'true') return 'ci'
  if (process.argv.includes('--fast')) return 'fast'
  if (process.argv.includes('--full')) return 'ci'
  return 'balanced'
}

async function runScript(scriptWithArgs) {
  const parts = scriptWithArgs.split(' ')
  const scriptName = parts[0]
  const args = parts.slice(1)
  
  console.log(`🎯 Running ${scriptWithArgs}`)
  
  return new Promise((resolve) => {
    const child = spawn('node', [`scripts/${scriptName}.js`, ...args], {
      stdio: 'inherit',
      env: process.env
    })

    child.on('close', (code) => {
      resolve(code === 0)
    })

    child.on('error', (error) => {
      console.error(`Failed to run ${scriptWithArgs}:`, error)
      resolve(false)
    })
  })
}

async function main() {
  const mode = detectEnvironment()
  
  console.log(`🔍 Detected environment: ${mode}`)
  
  let success = false
  
  switch (mode) {
    case 'ci':
      success = await runScript('ci-test-runner')
      break
    case 'fast':
      success = await runScript('tier-test-runner tier1')
      break
    case 'balanced':
      console.log(`⚖️  Balanced mode: running Tier 1 (core functionality)`)
      success = await runScript('tier-test-runner tier1')
      if (success) {
        console.log(`\n✅ Core tests passed! For extended coverage, run: npm run test:tier2`)
        console.log(`For full CI coverage, run: npm run test:ci`)
      }
      break
  }
  
  process.exit(success ? 0 : 1)
}

main().catch(error => {
  console.error('💥 Test runner crashed:', error)
  process.exit(1)
})