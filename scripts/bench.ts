#!/usr/bin/env tsx
/**
 * AgentKit SDK Performance Benchmark Tool
 * 
 * Real-time performance monitoring and load testing for AgentKit SDK
 * 
 * Usage:
 *   npm run bench
 *   npm run bench -- --concurrent 50 --duration 30000
 *   npm run bench -- --load-test --plugins 10
 */

import { performance } from 'perf_hooks'
import { EventEmitter } from 'events'
import { EnhancedBoundedExecutor, type EnhancedObservabilityHooks } from '../packages/sdk/src/performance/EnhancedBoundedExecutor'
import { RetryableExecutor, type RetryObservabilityHooks } from '../packages/sdk/src/performance/RetryableExecutor'

interface BenchmarkOptions {
  concurrent?: number
  duration?: number
  plugins?: number
  loadTest?: boolean
  memoryTest?: boolean
  retryTest?: boolean
  verbose?: boolean
  output?: string
}

interface BenchmarkStats {
  startTime: number
  endTime?: number
  duration?: number
  
  // Task metrics
  totalTasks: number
  completedTasks: number
  failedTasks: number
  timeoutTasks: number
  
  // Performance metrics
  avgLatency: number
  p50Latency: number
  p95Latency: number
  p99Latency: number
  
  // Throughput metrics
  tasksPerSecond: number
  peakThroughput: number
  
  // Resource metrics
  peakMemoryUsage: number
  avgCpuUsage: number
  
  // Queue metrics
  avgQueueSize: number
  peakQueueSize: number
  queueOverflows: number
  
  // Reliability metrics
  successRate: number
  timeoutRate: number
  retryRate: number
  circuitBreakerTrips: number
}

class BenchmarkRunner extends EventEmitter {
  private stats: BenchmarkStats
  private latencies: number[] = []
  private throughputSamples: number[] = []
  private queueSizes: number[] = []
  private memoryUsage: number[] = []
  
  private updateInterval?: NodeJS.Timeout
  private memoryMonitor?: NodeJS.Timeout
  
  constructor() {
    super()
    this.stats = this.initializeStats()
  }
  
  private initializeStats(): BenchmarkStats {
    return {
      startTime: Date.now(),
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      timeoutTasks: 0,
      avgLatency: 0,
      p50Latency: 0,
      p95Latency: 0,
      p99Latency: 0,
      tasksPerSecond: 0,
      peakThroughput: 0,
      peakMemoryUsage: 0,
      avgCpuUsage: 0,
      avgQueueSize: 0,
      peakQueueSize: 0,
      queueOverflows: 0,
      successRate: 0,
      timeoutRate: 0,
      retryRate: 0,
      circuitBreakerTrips: 0
    }
  }
  
  async runLoadTest(options: BenchmarkOptions): Promise<BenchmarkStats> {
    console.log('🚀 Starting AgentKit SDK Load Test')
    console.log('Configuration:', {
      concurrent: options.concurrent || 20,
      duration: options.duration || 10000,
      plugins: options.plugins || 5
    })
    console.log()
    
    const executor = this.createExecutor()
    
    this.startMonitoring()
    this.stats.startTime = Date.now()
    
    // Generate load for specified duration
    const loadPromise = this.generateLoad(executor, options)
    
    // Run for specified duration
    await Promise.race([
      loadPromise,
      new Promise(resolve => setTimeout(resolve, options.duration || 10000))
    ])
    
    this.stopMonitoring()
    await executor.shutdown()
    
    this.finalizeStats()
    return this.stats
  }
  
  async runMemoryTest(options: BenchmarkOptions): Promise<BenchmarkStats> {
    console.log('🧠 Starting Memory Leak Test')
    console.log()
    
    const executor = this.createExecutor()
    this.startMonitoring()
    
    // Create memory-intensive workload
    const tasks: Promise<any>[] = []
    for (let i = 0; i < 1000; i++) {
      const task = executor.execute(
        `memory-${i}`,
        async () => {
          // Create memory pressure
          const largeData = new Array(1000).fill(`memory-test-${i}`)
          await new Promise(resolve => setTimeout(resolve, 10))
          return largeData.length
        },
        undefined,
        { pluginName: `memory-plugin-${i % 5}` }
      ).catch(() => 'failed')
      
      tasks.push(task)
    }
    
    await Promise.allSettled(tasks)
    
    this.stopMonitoring()
    await executor.shutdown()
    
    // Force GC and measure final memory
    if (global.gc) {
      global.gc()
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    this.finalizeStats()
    return this.stats
  }
  
  async runRetryTest(options: BenchmarkOptions): Promise<BenchmarkStats> {
    console.log('🔄 Starting Retry & Circuit Breaker Test')
    console.log()
    
    const retryExecutor = new RetryableExecutor({
      maxRetries: 3,
      initialDelayMs: 50,
      maxDelayMs: 1000
    }, {
      onRetryAttempt: (taskId, attempt, delay, error) => {
        if (options.verbose) {
          console.log(`Retry ${attempt} for ${taskId} after ${delay}ms: ${error.message}`)
        }
      },
      onPluginCircuitOpened: (pluginName, reason) => {
        console.log(`🚨 Circuit breaker opened for ${pluginName}: ${reason}`)
        this.stats.circuitBreakerTrips++
      }
    })
    
    this.startMonitoring()
    
    // Create tasks with various failure patterns
    const tasks: Promise<any>[] = []
    
    // Flaky tasks (30% failure rate)
    for (let i = 0; i < 50; i++) {
      const task = retryExecutor.execute({
        id: `flaky-${i}`,
        execute: async () => {
          if (Math.random() < 0.3) {
            throw new Error('RequestTimeoutError: Simulated flaky failure')
          }
          await new Promise(resolve => setTimeout(resolve, 20))
          return `flaky-result-${i}`
        },
        pluginName: 'flaky-plugin'
      }).catch(error => ({ error: error.message }))
      
      tasks.push(task)
    }
    
    // Consistently failing tasks
    for (let i = 0; i < 20; i++) {
      const task = retryExecutor.execute({
        id: `failing-${i}`,
        execute: async () => {
          throw new Error('ResourceExhaustedError: Simulated consistent failure')
        },
        pluginName: 'failing-plugin'
      }).catch(error => ({ error: error.message }))
      
      tasks.push(task)
    }
    
    await Promise.allSettled(tasks)
    
    this.stopMonitoring()
    
    const retryStats = retryExecutor.getStats()
    console.log('Retry Statistics:', retryStats)
    
    this.finalizeStats()
    return this.stats
  }
  
  private createExecutor(): EnhancedBoundedExecutor {
    let taskCounter = 0
    let completedCounter = 0
    let lastThroughputCheck = Date.now()
    
    const observabilityHooks: EnhancedObservabilityHooks = {
      onTaskQueued: (taskId, queueSize) => {
        this.stats.totalTasks++
        this.queueSizes.push(queueSize)
        this.stats.peakQueueSize = Math.max(this.stats.peakQueueSize, queueSize)
      },
      
      onTaskCompleted: (taskId, duration, queueWaitTime) => {
        this.stats.completedTasks++
        this.latencies.push(duration)
        
        completedCounter++
        const now = Date.now()
        if (now - lastThroughputCheck >= 1000) {
          const throughput = completedCounter / ((now - lastThroughputCheck) / 1000)
          this.throughputSamples.push(throughput)
          this.stats.peakThroughput = Math.max(this.stats.peakThroughput, throughput)
          completedCounter = 0
          lastThroughputCheck = now
        }
      },
      
      onTaskTimeout: (taskId, timeoutMs, pluginName) => {
        this.stats.timeoutTasks++
      },
      
      onTaskFailed: (taskId, error, pluginName) => {
        this.stats.failedTasks++
      },
      
      onQueueOverflow: (strategy, droppedTaskId) => {
        this.stats.queueOverflows++
      },
      
      onPerformanceGuardrailViolation: (violation, metrics) => {
        console.log(`⚠️  Performance guardrail violation: ${violation}`)
      }
    }
    
    return new EnhancedBoundedExecutor({
      maxConcurrentTasks: 20,
      maxQueueDepth: 100,
      requestTimeoutMs: 2000,
      queueOverflowStrategy: 'dropOldest'
    }, observabilityHooks, false)
  }
  
  private async generateLoad(executor: EnhancedBoundedExecutor, options: BenchmarkOptions): Promise<void> {
    const concurrent = options.concurrent || 20
    const pluginCount = options.plugins || 5
    
    const generateTask = async (taskId: string) => {
      // Random latency between 10-200ms
      const latency = 10 + Math.random() * 190
      
      return executor.execute(
        taskId,
        async () => {
          await new Promise(resolve => setTimeout(resolve, latency))
          
          // Simulate some work
          const data = new Array(100).fill(`work-${taskId}`)
          return data.length
        },
        { payload: `data-${taskId}` },
        { pluginName: `plugin-${Math.floor(Math.random() * pluginCount)}` }
      ).catch(() => 'failed')
    }
    
    // Continuously generate tasks
    const activeTasks = new Set<Promise<any>>()
    let taskCounter = 0
    
    while (Date.now() - this.stats.startTime < (options.duration || 10000)) {
      // Maintain target concurrency
      while (activeTasks.size < concurrent) {
        const taskId = `task-${taskCounter++}`
        const task = generateTask(taskId)
        
        activeTasks.add(task)
        
        // Remove task when complete
        task.finally(() => {
          activeTasks.delete(task)
        })
      }
      
      // Small delay to prevent tight loop
      await new Promise(resolve => setTimeout(resolve, 1))
    }
    
    // Wait for remaining tasks
    await Promise.allSettled(Array.from(activeTasks))
  }
  
  private startMonitoring(): void {
    // Real-time stats updates
    this.updateInterval = setInterval(() => {
      this.printRealTimeStats()
    }, 1000)
    
    // Memory monitoring
    this.memoryMonitor = setInterval(() => {
      const usage = process.memoryUsage()
      this.memoryUsage.push(usage.heapUsed)
      this.stats.peakMemoryUsage = Math.max(this.stats.peakMemoryUsage, usage.heapUsed)
    }, 500)
  }
  
  private stopMonitoring(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = undefined
    }
    
    if (this.memoryMonitor) {
      clearInterval(this.memoryMonitor)
      this.memoryMonitor = undefined
    }
  }
  
  private printRealTimeStats(): void {
    const elapsed = Date.now() - this.stats.startTime
    const throughput = this.stats.completedTasks / (elapsed / 1000)
    
    process.stdout.write(`\r📊 ` +
      `Tasks: ${this.stats.completedTasks}/${this.stats.totalTasks} | ` +
      `Throughput: ${throughput.toFixed(1)}/s | ` +
      `Queue: ${this.queueSizes[this.queueSizes.length - 1] || 0} | ` +
      `Memory: ${Math.round((this.memoryUsage[this.memoryUsage.length - 1] || 0) / 1024 / 1024)}MB | ` +
      `Elapsed: ${Math.round(elapsed / 1000)}s`
    )
  }
  
  private finalizeStats(): void {
    this.stats.endTime = Date.now()
    this.stats.duration = this.stats.endTime - this.stats.startTime
    
    // Calculate percentiles
    if (this.latencies.length > 0) {
      const sorted = [...this.latencies].sort((a, b) => a - b)
      this.stats.avgLatency = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
      this.stats.p50Latency = sorted[Math.floor(sorted.length * 0.5)]
      this.stats.p95Latency = sorted[Math.floor(sorted.length * 0.95)]
      this.stats.p99Latency = sorted[Math.floor(sorted.length * 0.99)]
    }
    
    // Calculate rates
    if (this.stats.totalTasks > 0) {
      this.stats.successRate = this.stats.completedTasks / this.stats.totalTasks
      this.stats.timeoutRate = this.stats.timeoutTasks / this.stats.totalTasks
    }
    
    // Calculate throughput
    if (this.stats.duration) {
      this.stats.tasksPerSecond = this.stats.completedTasks / (this.stats.duration / 1000)
    }
    
    // Calculate averages
    if (this.queueSizes.length > 0) {
      this.stats.avgQueueSize = this.queueSizes.reduce((a, b) => a + b, 0) / this.queueSizes.length
    }
  }
  
  printFinalReport(): void {
    console.log('\n\n📋 BENCHMARK REPORT')
    console.log('=' .repeat(50))
    
    console.log('\n🎯 Execution Summary:')
    console.log(`Duration: ${this.stats.duration}ms`)
    console.log(`Total Tasks: ${this.stats.totalTasks}`)
    console.log(`Completed: ${this.stats.completedTasks}`)
    console.log(`Failed: ${this.stats.failedTasks}`)
    console.log(`Timeouts: ${this.stats.timeoutTasks}`)
    console.log(`Success Rate: ${(this.stats.successRate * 100).toFixed(1)}%`)
    
    console.log('\n⚡ Performance Metrics:')
    console.log(`Throughput: ${this.stats.tasksPerSecond.toFixed(1)} tasks/sec`)
    console.log(`Peak Throughput: ${this.stats.peakThroughput.toFixed(1)} tasks/sec`)
    console.log(`Avg Latency: ${this.stats.avgLatency.toFixed(1)}ms`)
    console.log(`P50 Latency: ${this.stats.p50Latency}ms`)
    console.log(`P95 Latency: ${this.stats.p95Latency}ms`)
    console.log(`P99 Latency: ${this.stats.p99Latency}ms`)
    
    console.log('\n📦 Queue Metrics:')
    console.log(`Avg Queue Size: ${this.stats.avgQueueSize.toFixed(1)}`)
    console.log(`Peak Queue Size: ${this.stats.peakQueueSize}`)
    console.log(`Queue Overflows: ${this.stats.queueOverflows}`)
    
    console.log('\n🧠 Memory Metrics:')
    console.log(`Peak Memory: ${Math.round(this.stats.peakMemoryUsage / 1024 / 1024)}MB`)
    
    if (this.stats.circuitBreakerTrips > 0) {
      console.log('\n🚨 Reliability Issues:')
      console.log(`Circuit Breaker Trips: ${this.stats.circuitBreakerTrips}`)
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2)
  const options: BenchmarkOptions = {}
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--concurrent':
        options.concurrent = parseInt(args[++i])
        break
      case '--duration':
        options.duration = parseInt(args[++i])
        break
      case '--plugins':
        options.plugins = parseInt(args[++i])
        break
      case '--load-test':
        options.loadTest = true
        break
      case '--memory-test':
        options.memoryTest = true
        break
      case '--retry-test':
        options.retryTest = true
        break
      case '--verbose':
        options.verbose = true
        break
      case '--output':
        options.output = args[++i]
        break
      case '--help':
        printHelp()
        return
    }
  }
  
  const runner = new BenchmarkRunner()
  
  try {
    let stats: BenchmarkStats
    
    if (options.memoryTest) {
      stats = await runner.runMemoryTest(options)
    } else if (options.retryTest) {
      stats = await runner.runRetryTest(options)
    } else {
      stats = await runner.runLoadTest(options)
    }
    
    runner.printFinalReport()
    
    // Save results if output specified
    if (options.output) {
      const fs = await import('fs/promises')
      await fs.writeFile(options.output, JSON.stringify(stats, null, 2))
      console.log(`\n💾 Results saved to ${options.output}`)
    }
    
  } catch (error) {
    console.error('❌ Benchmark failed:', error)
    process.exit(1)
  }
}

function printHelp() {
  console.log(`
🚀 AgentKit SDK Performance Benchmark Tool

Usage:
  npm run bench [options]

Options:
  --concurrent <n>     Number of concurrent tasks (default: 20)
  --duration <ms>      Test duration in milliseconds (default: 10000)
  --plugins <n>        Number of plugins to simulate (default: 5)
  --load-test          Run standard load test (default)
  --memory-test        Run memory leak test
  --retry-test         Run retry and circuit breaker test
  --verbose            Enable verbose output
  --output <file>      Save results to JSON file
  --help               Show this help

Examples:
  npm run bench
  npm run bench -- --concurrent 50 --duration 30000
  npm run bench -- --memory-test --verbose
  npm run bench -- --retry-test --output results.json
`)
}

if (require.main === module) {
  main().catch(console.error)
}

export { BenchmarkRunner, type BenchmarkOptions, type BenchmarkStats }