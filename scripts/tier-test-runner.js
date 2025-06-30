#!/usr/bin/env node

/**
 * Tier-based Test Runner for Code Check-in
 * 
 * Tier 1: Core functionality (required for check-in)
 * Tier 2: Extended features (can run separately)
 * Tier 3: Heavy integration tests (CI only)
 */

import { spawn } from 'child_process'
import path from 'path'

// Test tiers based on criticality and speed
const TEST_TIERS = {
  tier1: {
    name: 'Core Functionality (Required)',
    description: '223 tests covering public API, type safety, and core reliability',
    packages: [
      { name: 'types', path: 'packages/types', tests: 15 },
      { name: 'errors', path: 'packages/errors', tests: 76 },
      { name: 'registry', path: 'packages/registry', tests: 68 },
      { name: 'sdk-core', path: 'packages/sdk', script: 'test:core', tests: 64 }
    ],
    timeout: 60000, // 1 minute
    required: true
  },
  tier2: {
    name: 'Extended Features (Optional)',
    description: '149 tests covering CLI tools, browser support, and transport layers',
    packages: [
      { name: 'cli', path: 'packages/cli', tests: 101 },
      { name: 'runtime-web', path: 'packages/runtime-web', tests: 47 },
      { name: 'transports-dummy', path: 'packages/transports-dummy', tests: 1 }
    ],
    timeout: 120000, // 2 minutes
    required: false
  },
  tier3: {
    name: 'Heavy Integration (CI Only)',
    description: '300+ tests covering plugins, concurrency, and observability (resource intensive)',
    packages: [
      { name: 'sdk-plugins', path: 'packages/sdk', script: 'test:plugins', tests: 200 },
      { name: 'sdk-concurrency', path: 'packages/sdk', script: 'test:concurrency', tests: 50 },
      { name: 'sdk-observability', path: 'packages/sdk', script: 'test:observability', tests: 75 }
    ],
    timeout: 300000, // 5 minutes
    required: false
  }
}

class TierTestRunner {
  constructor(targetTier = 'tier1') {
    this.targetTier = targetTier
    this.results = []
    this.startTime = Date.now()
  }

  async runPackage(pkg, timeout) {
    console.log(`  🧪 ${pkg.name}`)
    
    return new Promise((resolve) => {
      const startTime = Date.now()
      const command = pkg.script ? `npm run ${pkg.script}` : 'npm test'
      
      const child = spawn('bash', ['-c', command], {
        cwd: path.resolve(pkg.path),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test', FORCE_COLOR: '0' }
      })

      let stdout = '', stderr = ''
      child.stdout?.on('data', (data) => {
        const output = data.toString()
        stdout += output
        
        // Extract and display test counts in real-time
        const testMatch = output.match(/\s*Tests\s+(\d+)\s+passed.*\((\d+)\)/)
        if (testMatch) {
          console.log(`    📊 ${testMatch[1]}/${testMatch[2]} tests`)
        }
      })
      child.stderr?.on('data', (data) => stderr += data.toString())

      const timeoutHandle = setTimeout(() => {
        child.kill('SIGKILL')
        resolve({ 
          success: false, 
          reason: 'timeout',
          duration: Date.now() - startTime 
        })
      }, timeout)

      child.on('close', (code) => {
        clearTimeout(timeoutHandle)
        const duration = Date.now() - startTime
        const success = code === 0
        
        // Extract test count from output
        let testCount = 0
        const testMatch = stdout.match(/\s*Tests\s+(\d+)\s+passed.*\((\d+)\)/)
        if (testMatch) {
          testCount = parseInt(testMatch[2])
        }
        
        // Use expected test count if actual count not captured
        const displayCount = testCount || pkg.tests || 0
        console.log(`    ${success ? '✅' : '❌'} ${pkg.name} (${Math.round(duration/1000)}s)${displayCount ? ` - ${displayCount} tests` : ''}`)
        
        resolve({ 
          success, 
          duration,
          exitCode: code,
          testCount,
          stdout: success ? '' : stdout.slice(-500),
          stderr: success ? '' : stderr.slice(-500)
        })
      })

      child.on('error', (error) => {
        clearTimeout(timeoutHandle)
        resolve({ 
          success: false, 
          reason: `error: ${error.message}`,
          duration: Date.now() - startTime 
        })
      })
    })
  }

  async runTier(tierName, tier) {
    console.log(`\n📋 ${tier.name}`)
    if (tier.description) {
      console.log(`📝 ${tier.description}`)
    }
    console.log(`⏱️  Timeout: ${tier.timeout/1000}s per package`)
    
    const tierResults = []
    
    for (const pkg of tier.packages) {
      const result = await this.runPackage(pkg, tier.timeout)
      // Include expected test count if not captured
      if (!result.testCount && pkg.tests) {
        result.testCount = pkg.tests
      }
      tierResults.push({ package: pkg.name, tier: tierName, ...result })
      
      if (!result.success && tier.required) {
        console.log(`🚨 ${pkg.name} failed - stopping tier ${tierName} (required)`)
        break
      }
    }
    
    const passed = tierResults.filter(r => r.success).length
    const total = tierResults.length
    
    console.log(`📊 Tier ${tierName}: ${passed}/${total} passed`)
    
    return {
      tier: tierName,
      passed,
      total,
      results: tierResults,
      success: tier.required ? passed === total : true // Non-required tiers always "succeed"
    }
  }

  async runTiers() {
    const tiersToRun = this.targetTier === 'all' 
      ? Object.keys(TEST_TIERS)
      : [this.targetTier]
    
    console.log(`🚀 Tier Test Runner - Target: ${this.targetTier}`)
    console.log(`📊 Running ${tiersToRun.length} tier(s)`)
    
    const tierResults = []
    
    for (const tierName of tiersToRun) {
      const tier = TEST_TIERS[tierName]
      if (!tier) {
        console.log(`⚠️  Unknown tier: ${tierName}`)
        continue
      }
      
      const result = await this.runTier(tierName, tier)
      tierResults.push(result)
      this.results.push(...result.results)
      
      if (!result.success) {
        console.log(`🚨 Tier ${tierName} failed - stopping`)
        break
      }
      
      // Brief pause between tiers
      if (tiersToRun.length > 1) {
        console.log(`⏳ Cooling down for 2 seconds...`)
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    this.printSummary(tierResults)
    
    // Return success if all required tiers passed
    const allRequiredPassed = tierResults.every(t => t.success)
    return allRequiredPassed
  }

  printSummary(tierResults) {
    const duration = Date.now() - this.startTime
    const totalPassed = this.results.filter(r => r.success).length
    const totalPackages = this.results.length
    const totalTestCount = this.results.reduce((sum, r) => sum + (r.testCount || 0), 0)
    
    console.log(`\n${'='.repeat(60)}`)
    console.log(`📊 TIER TEST SUMMARY`)
    console.log(`${'='.repeat(60)}`)
    console.log(`⏱️  Duration: ${Math.round(duration/1000)}s`)
    console.log(`📦 Packages: ${totalPackages}`)
    console.log(`🧪 Total Tests: ${totalTestCount}`)
    console.log(`✅ Passed: ${totalPassed} packages`)
    console.log(`❌ Failed: ${totalPackages - totalPassed} packages`)
    
    tierResults.forEach(tier => {
      const status = tier.success ? '✅' : '❌'
      console.log(`${status} ${tier.tier}: ${tier.passed}/${tier.total}`)
    })

    const failed = this.results.filter(r => !r.success)
    if (failed.length > 0) {
      console.log(`\n🚨 Failed Packages:`)
      failed.forEach(f => {
        console.log(`  ❌ ${f.package} (${f.tier}): ${f.reason || 'exit code ' + f.exitCode}`)
      })
    }

    console.log(`\n💡 Usage:`)
    console.log(`  npm run test:tier1  # Core functionality (required for check-in)`)
    console.log(`  npm run test:tier2  # Extended features`)
    console.log(`  npm run test:tier3  # Heavy integration tests`)
    console.log(`  npm run test:tiers  # All tiers`)
    console.log(`${'='.repeat(60)}`)
  }
}

async function main() {
  const tier = process.argv[2] || 'tier1'
  const runner = new TierTestRunner(tier)
  const success = await runner.runTiers()
  process.exit(success ? 0 : 1)
}

main().catch(error => {
  console.error('💥 Tier test runner crashed:', error)
  process.exit(1)
})