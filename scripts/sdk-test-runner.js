#!/usr/bin/env node

/**
 * Dedicated SDK Test Runner
 * 
 * Runs SDK tests in even smaller batches with longer timeouts
 */

import { spawn } from 'child_process'
import path from 'path'

const SDK_TEST_BATCHES = [
  { name: 'core', script: 'test:core', timeout: 120000 },
  { name: 'plugins', script: 'test:plugins', timeout: 240000 },
  { name: 'concurrency', script: 'test:concurrency', timeout: 180000 },
  { name: 'observability', script: 'test:observability', timeout: 120000 }
]

class SDKTestRunner {
  constructor() {
    this.results = []
    this.startTime = Date.now()
  }

  async runBatch(batch) {
    console.log(`\n🧪 SDK Batch: ${batch.name} (timeout: ${batch.timeout/1000}s)`)
    
    return new Promise((resolve) => {
      const startTime = Date.now()
      
      const child = spawn('npm', ['run', batch.script], {
        cwd: path.resolve('packages/sdk'),
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'test' }
      })

      const timeout = setTimeout(() => {
        console.log(`⏰ TIMEOUT: ${batch.name} exceeded ${batch.timeout/1000}s`)
        child.kill('SIGKILL')
        resolve({ success: false, reason: 'timeout', duration: Date.now() - startTime })
      }, batch.timeout)

      child.on('close', (code) => {
        clearTimeout(timeout)
        const duration = Date.now() - startTime
        const success = code === 0
        
        console.log(`${success ? '✅' : '❌'} ${batch.name} ${success ? 'passed' : 'failed'} (${Math.round(duration/1000)}s)`)
        resolve({ success, duration, exitCode: code })
      })

      child.on('error', (error) => {
        clearTimeout(timeout)
        console.log(`💥 ${batch.name} error:`, error.message)
        resolve({ success: false, reason: `error: ${error.message}`, duration: Date.now() - startTime })
      })
    })
  }

  async runAll() {
    console.log(`🚀 SDK Test Runner - Running ${SDK_TEST_BATCHES.length} test batches`)
    
    for (const batch of SDK_TEST_BATCHES) {
      const result = await this.runBatch(batch)
      this.results.push({ batch: batch.name, ...result })
      
      if (!result.success) {
        console.log(`🚨 ${batch.name} failed - stopping SDK tests`)
        break
      }
      
      // Cool down between batches
      console.log(`⏳ Cooling down for 2 seconds...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    const duration = Date.now() - this.startTime
    const passed = this.results.filter(r => r.success).length
    
    console.log(`\n📊 SDK Results: ${passed}/${this.results.length} batches passed in ${Math.round(duration/1000)}s`)
    
    if (passed === this.results.length) {
      console.log(`🎉 All SDK test batches passed!`)
    } else {
      console.log(`🚨 Some SDK batches failed:`)
      this.results.filter(r => !r.success).forEach(r => {
        console.log(`  ❌ ${r.batch}: ${r.reason || 'exit code ' + r.exitCode}`)
      })
    }

    return passed === this.results.length
  }
}

async function main() {
  const runner = new SDKTestRunner()
  const success = await runner.runAll()
  process.exit(success ? 0 : 1)
}

main().catch(error => {
  console.error('💥 SDK test runner crashed:', error)
  process.exit(1)
})