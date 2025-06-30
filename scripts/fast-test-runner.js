#!/usr/bin/env node

/**
 * Fast Test Runner for Development
 * 
 * Runs tests in optimized batches for quick feedback during development.
 * Skips heavy tests by default, focuses on core functionality.
 */

import { spawn } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'

const QUICK_PACKAGES = [
  { name: 'types', path: 'packages/types' },
  { name: 'errors', path: 'packages/errors' },  
  { name: 'registry', path: 'packages/registry' },
  { name: 'sdk-core', path: 'packages/sdk', script: 'test:core' }
]

class FastTestRunner {
  constructor() {
    this.results = []
    this.startTime = Date.now()
  }

  async runQuickTest(pkg) {
    console.log(`🚀 Quick testing: ${pkg.name}`)
    
    return new Promise((resolve) => {
      const command = pkg.script ? `npm run ${pkg.script}` : 'npm test'
      const child = spawn('bash', ['-c', command], {
        cwd: path.resolve(pkg.path),
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'test' }
      })

      const timeout = setTimeout(() => {
        child.kill('SIGKILL')
        resolve({ success: false, reason: 'timeout' })
      }, 30000) // 30s timeout for quick tests

      child.on('close', (code) => {
        clearTimeout(timeout)
        resolve({ success: code === 0 })
      })
    })
  }

  async runAll() {
    console.log(`⚡ Fast Test Runner - Development Mode`)
    console.log(`📊 Running ${QUICK_PACKAGES.length} quick test suites\n`)

    for (const pkg of QUICK_PACKAGES) {
      if (!existsSync(pkg.path)) {
        console.log(`⚠️  Skipping ${pkg.name} (not found)`)
        continue
      }

      const result = await this.runQuickTest(pkg)
      this.results.push({ package: pkg.name, ...result })
      
      if (!result.success) {
        console.log(`❌ ${pkg.name} failed - stopping fast run`)
        break
      }
      console.log(`✅ ${pkg.name} passed\n`)
    }

    const duration = Date.now() - this.startTime
    const passed = this.results.filter(r => r.success).length
    
    console.log(`\n⚡ Fast tests completed in ${Math.round(duration/1000)}s`)
    console.log(`✅ ${passed}/${this.results.length} packages passed`)
    
    if (passed === this.results.length) {
      console.log(`🎉 All quick tests passed! Ready for full CI run.`)
    } else {
      console.log(`🚨 Some quick tests failed. Fix before running full CI.`)
    }

    return passed === this.results.length
  }
}

async function main() {
  const runner = new FastTestRunner()
  const success = await runner.runAll()
  process.exit(success ? 0 : 1)
}

main().catch(error => {
  console.error('💥 Fast test runner crashed:', error)
  process.exit(1)
})