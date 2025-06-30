#!/usr/bin/env node

/**
 * Comprehensive CI/CD Test Runner
 * 
 * Runs all 92 test files across 7 packages in a controlled, reliable manner.
 * Designed for maximum reliability with proper resource management.
 */

import { spawn, execSync } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'

const TIMEOUT_MS = 300000 // 5 minutes per package
const RETRY_COUNT = 2

// Test execution order (lightweight first, heavy last)
const TEST_PACKAGES = [
  { name: 'types', path: 'packages/types', weight: 'light' },
  { name: 'errors', path: 'packages/errors', weight: 'light' },
  { name: 'test-agent', path: 'packages/test-agent', weight: 'light' },
  { name: 'transports-dummy', path: 'packages/transports-dummy', weight: 'light' },
  { name: 'registry', path: 'packages/registry', weight: 'medium' },
  { name: 'cli', path: 'packages/cli', weight: 'medium' },
  { name: 'runtime-web', path: 'packages/runtime-web', weight: 'heavy' },
  { name: 'sdk', path: 'packages/sdk', weight: 'heavy' }
]

class TestRunner {
  constructor() {
    this.results = []
    this.totalTests = 0
    this.passedTests = 0
    this.failedPackages = []
    this.startTime = Date.now()
  }

  async runPackageTests(pkg, attempt = 1) {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`🧪 Testing: ${pkg.name} (${pkg.weight}) - Attempt ${attempt}/${RETRY_COUNT + 1}`)
    console.log(`📁 Path: ${pkg.path}`)
    console.log(`${'='.repeat(80)}`)

    if (!existsSync(pkg.path)) {
      console.log(`⚠️  Package path not found: ${pkg.path}`)
      return { success: false, reason: 'Path not found' }
    }

    return new Promise((resolve) => {
      const startTime = Date.now()
      
      // Use dedicated SDK runner for SDK package
      const command = pkg.name === 'sdk' ? 'node ../../scripts/sdk-test-runner.js' : 'npm test'
      
      console.log(`🚀 Running: ${command}`)
      
      const child = spawn('bash', ['-c', command], {
        cwd: path.resolve(pkg.path),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          CI: 'true',
          FORCE_COLOR: '0'
        }
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.on('data', (data) => {
        stdout += data.toString()
        process.stdout.write(`[${pkg.name}] ${data}`)
      })

      child.stderr?.on('data', (data) => {
        stderr += data.toString()
        process.stderr.write(`[${pkg.name}] ${data}`)
      })

      const timeout = setTimeout(() => {
        console.log(`\n⏰ TIMEOUT: ${pkg.name} exceeded ${TIMEOUT_MS/1000}s limit`)
        child.kill('SIGKILL')
        resolve({ 
          success: false, 
          reason: 'timeout',
          duration: Date.now() - startTime,
          stdout: stdout.slice(-1000), // Last 1000 chars
          stderr: stderr.slice(-1000)
        })
      }, TIMEOUT_MS)

      child.on('close', (code) => {
        clearTimeout(timeout)
        const duration = Date.now() - startTime
        
        if (code === 0) {
          console.log(`✅ ${pkg.name} completed successfully (${duration}ms)`)
          resolve({ 
            success: true, 
            duration,
            testCount: this.extractTestCount(stdout)
          })
        } else {
          console.log(`❌ ${pkg.name} failed with exit code ${code}`)
          resolve({ 
            success: false, 
            reason: `exit code ${code}`,
            duration,
            stdout: stdout.slice(-2000),
            stderr: stderr.slice(-2000)
          })
        }
      })

      child.on('error', (error) => {
        clearTimeout(timeout)
        console.log(`💥 ${pkg.name} process error:`, error.message)
        resolve({ 
          success: false, 
          reason: `process error: ${error.message}`,
          duration: Date.now() - startTime
        })
      })
    })
  }

  extractTestCount(output) {
    // Extract test count from vitest output
    const matches = output.match(/(\d+) passed/)
    return matches ? parseInt(matches[1]) : 0
  }

  async runAllTests() {
    console.log(`🏁 Starting CI Test Runner`)
    console.log(`📊 Testing ${TEST_PACKAGES.length} packages with ${RETRY_COUNT + 1} max attempts each`)
    console.log(`⏱️  Timeout: ${TIMEOUT_MS/1000}s per package\n`)

    for (const pkg of TEST_PACKAGES) {
      let result = null
      
      for (let attempt = 1; attempt <= RETRY_COUNT + 1; attempt++) {
        result = await this.runPackageTests(pkg, attempt)
        
        if (result.success) {
          this.passedTests += result.testCount || 0
          break
        } else if (attempt < RETRY_COUNT + 1) {
          console.log(`🔄 Retrying ${pkg.name} (attempt ${attempt + 1})...`)
          // Brief pause between retries
          await new Promise(resolve => setTimeout(resolve, 5000))
        }
      }
      
      this.results.push({
        package: pkg.name,
        weight: pkg.weight,
        ...result
      })

      if (!result.success) {
        this.failedPackages.push(pkg.name)
      }

      this.totalTests += result.testCount || 0

      // Brief pause between packages for resource cleanup
      console.log(`⏳ Cooling down for 3 seconds...`)
      await new Promise(resolve => setTimeout(resolve, 3000))
    }

    this.printSummary()
    return this.failedPackages.length === 0
  }

  printSummary() {
    const duration = Date.now() - this.startTime
    const minutes = Math.floor(duration / 60000)
    const seconds = Math.floor((duration % 60000) / 1000)

    console.log(`\n${'='.repeat(80)}`)
    console.log(`📊 TEST SUMMARY`)
    console.log(`${'='.repeat(80)}`)
    console.log(`⏱️  Total Duration: ${minutes}m ${seconds}s`)
    console.log(`📦 Packages: ${this.results.length}`)
    console.log(`✅ Passed: ${this.results.filter(r => r.success).length}`)
    console.log(`❌ Failed: ${this.failedPackages.length}`)
    console.log(`🧪 Total Tests: ${this.totalTests}`)
    
    console.log(`\n📋 Package Results:`)
    this.results.forEach(result => {
      const status = result.success ? '✅' : '❌'
      const duration = result.duration ? `${Math.round(result.duration/1000)}s` : 'N/A'
      const reason = result.success ? '' : ` (${result.reason})`
      console.log(`  ${status} ${result.package.padEnd(15)} [${result.weight.padEnd(6)}] ${duration}${reason}`)
    })

    if (this.failedPackages.length > 0) {
      console.log(`\n🚨 Failed Packages: ${this.failedPackages.join(', ')}`)
      console.log(`\n💡 Debug Tips:`)
      console.log(`   • Run individual package: cd packages/<name> && npm test`)
      console.log(`   • Check for resource leaks or hanging processes`)
      console.log(`   • Verify package.json test scripts are correct`)
    } else {
      console.log(`\n🎉 ALL TESTS PASSED! 🎉`)
    }
    
    console.log(`${'='.repeat(80)}`)
  }
}

async function main() {
  const runner = new TestRunner()
  const success = await runner.runAllTests()
  process.exit(success ? 0 : 1)
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Test runner interrupted')
  process.exit(1)
})

process.on('SIGTERM', () => {
  console.log('\n🛑 Test runner terminated')
  process.exit(1)
})

main().catch(error => {
  console.error('💥 Test runner crashed:', error)
  process.exit(1)
})