/**
 * Memory Leak Sentinel Tests
 * Tests for memory leaks and GC effectiveness under high load
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EnhancedBoundedExecutor } from '../../performance/EnhancedBoundedExecutor'
import { AgentManager } from '../../AgentManager'
import type { Agent, Transport, AgentKitPlugin } from '@agentkit/types'

// Helper to force garbage collection if available
function forceGC(): Promise<void> {
  return new Promise(resolve => {
    if (global.gc) {
      global.gc()
      // Give GC time to run
      setTimeout(resolve, 100)
    } else {
      resolve()
    }
  })
}

// Helper to get memory usage snapshot
function getMemorySnapshot() {
  const usage = process.memoryUsage()
  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    rss: usage.rss,
    timestamp: Date.now()
  }
}

// Helper to calculate memory growth
function calculateMemoryGrowth(before: any, after: any) {
  return {
    heapUsed: after.heapUsed - before.heapUsed,
    heapTotal: after.heapTotal - before.heapTotal,
    external: after.external - before.external,
    rss: after.rss - before.rss
  }
}

describe('Memory Leak Sentinel Tests', () => {
  describe('EnhancedBoundedExecutor Memory Behavior', () => {
    it('should not leak memory with 100K plugin hook executions', async () => {
      const initialMemory = getMemorySnapshot()
      
      // Force initial GC
      await forceGC()
      const baselineMemory = getMemorySnapshot()
      
      const executor = new EnhancedBoundedExecutor({
        maxConcurrentTasks: 50,
        maxQueueDepth: 200,
        requestTimeoutMs: 100,
        queueOverflowStrategy: 'dropOldest'
      })

      const batchSize = 1000
      const totalBatches = 100 // 100K total executions
      
      console.log('Starting memory leak test: 100K executions in batches of', batchSize)
      
      for (let batch = 0; batch < totalBatches; batch++) {
        const batchTasks: Promise<any>[] = []
        
        // Create batch of tasks
        for (let i = 0; i < batchSize; i++) {
          const taskId = `batch-${batch}-task-${i}`
          
          const task = executor.execute(
            taskId,
            async () => {
              // Simulate plugin work with some data allocation
              const data = new Array(100).fill(`data-${batch}-${i}`)
              await new Promise(resolve => setTimeout(resolve, 1))
              return data.length
            },
            { batchId: batch, taskId: i },
            { pluginName: `plugin-${i % 10}` }
          ).catch(() => 'failed') // Catch failures to continue test
          
          batchTasks.push(task)
        }
        
        // Wait for batch to complete
        await Promise.allSettled(batchTasks)
        
        // Periodic memory checks and GC
        if (batch % 10 === 0) {
          await forceGC()
          const currentMemory = getMemorySnapshot()
          const growth = calculateMemoryGrowth(baselineMemory, currentMemory)
          
          console.log(`Batch ${batch}/100 - Memory growth:`, {
            heapUsed: Math.round(growth.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(growth.heapTotal / 1024 / 1024) + 'MB',
            executedTasks: (batch + 1) * batchSize
          })
          
          // Memory growth should be reasonable for the amount of work done
          expect(growth.heapUsed).toBeLessThan(100 * 1024 * 1024) // Less than 100MB growth
        }
      }
      
      await executor.shutdown()
      
      // Final memory check after shutdown
      await forceGC()
      const finalMemory = getMemorySnapshot()
      const totalGrowth = calculateMemoryGrowth(baselineMemory, finalMemory)
      
      console.log('Final memory analysis:', {
        initialHeap: Math.round(initialMemory.heapUsed / 1024 / 1024) + 'MB',
        baselineHeap: Math.round(baselineMemory.heapUsed / 1024 / 1024) + 'MB', 
        finalHeap: Math.round(finalMemory.heapUsed / 1024 / 1024) + 'MB',
        totalGrowth: Math.round(totalGrowth.heapUsed / 1024 / 1024) + 'MB'
      })
      
      // Memory should stabilize after shutdown and GC
      expect(totalGrowth.heapUsed).toBeLessThan(50 * 1024 * 1024) // Less than 50MB net growth
      
    }, 60000) // 1 minute timeout for large test

    it('should clean up timeouts and prevent timeout leaks', async () => {
      const executor = new EnhancedBoundedExecutor({
        maxConcurrentTasks: 10,
        maxQueueDepth: 50,
        requestTimeoutMs: 50, // Very short timeout
        queueOverflowStrategy: 'reject'
      })

      const baselineMemory = getMemorySnapshot()
      
      // Create many tasks that will timeout
      const timeoutTasks: Promise<any>[] = []
      for (let i = 0; i < 1000; i++) {
        const task = executor.execute(
          `timeout-${i}`,
          async () => {
            // Wait longer than timeout to force timeout
            await new Promise(resolve => setTimeout(resolve, 200))
            return `result-${i}`
          },
          undefined,
          { pluginName: `timeout-plugin-${i % 5}` }
        ).catch(() => 'timeout') // Catch timeouts
        
        timeoutTasks.push(task)
      }

      await Promise.allSettled(timeoutTasks)
      
      const stats = executor.getStats()
      console.log('Timeout test stats:', {
        totalTimeouts: stats.totalTimeouts,
        timeoutRate: stats.timeoutRate,
        disabledPlugins: stats.disabledPlugins.length
      })
      
      await executor.shutdown()
      await forceGC()
      
      const finalMemory = getMemorySnapshot()
      const memoryGrowth = calculateMemoryGrowth(baselineMemory, finalMemory)
      
      console.log('Timeout cleanup memory analysis:', {
        memoryGrowth: Math.round(memoryGrowth.heapUsed / 1024 / 1024) + 'MB',
        timeouts: stats.totalTimeouts
      })
      
      // Should have cleaned up timeout references
      expect(stats.totalTimeouts).toBeGreaterThan(500) // Many timeouts occurred
      expect(memoryGrowth.heapUsed).toBeLessThan(10 * 1024 * 1024) // Less than 10MB growth
      
    }, 30000)

    it('should handle heap pressure and prevent memory exhaustion', async () => {
      const executor = new EnhancedBoundedExecutor({
        maxConcurrentTasks: 20,
        maxQueueDepth: 100,
        requestTimeoutMs: 1000,
        queueOverflowStrategy: 'dropOldest'
      })

      const baselineMemory = getMemorySnapshot()
      let memoryPressureDetected = false
      
      // Monitor for memory pressure during execution
      const memoryMonitor = setInterval(() => {
        const current = getMemorySnapshot()
        const growth = calculateMemoryGrowth(baselineMemory, current)
        
        // Detect significant memory growth
        if (growth.heapUsed > 200 * 1024 * 1024) { // 200MB
          memoryPressureDetected = true
          console.log('Memory pressure detected:', Math.round(growth.heapUsed / 1024 / 1024) + 'MB')
        }
      }, 100)

      try {
        // Create memory-intensive tasks
        const memoryTasks: Promise<any>[] = []
        for (let i = 0; i < 500; i++) {
          const task = executor.execute(
            `memory-${i}`,
            async () => {
              // Create significant memory allocation
              const largeData = new Array(10000).fill({
                id: i,
                data: new Array(100).fill(`memory-test-${i}`),
                timestamp: Date.now()
              })
              
              // Hold memory briefly
              await new Promise(resolve => setTimeout(resolve, 10))
              
              // Return smaller result to test cleanup
              return largeData.length
            },
            undefined,
            { pluginName: `memory-plugin-${i % 3}` }
          ).catch(() => 'failed')
          
          memoryTasks.push(task)
        }

        await Promise.allSettled(memoryTasks)
        
      } finally {
        clearInterval(memoryMonitor)
        await executor.shutdown()
      }
      
      // Force multiple GC cycles
      await forceGC()
      await new Promise(resolve => setTimeout(resolve, 200))
      await forceGC()
      
      const finalMemory = getMemorySnapshot()
      const totalGrowth = calculateMemoryGrowth(baselineMemory, finalMemory)
      
      console.log('Heap pressure test results:', {
        memoryPressureDetected,
        finalMemoryGrowth: Math.round(totalGrowth.heapUsed / 1024 / 1024) + 'MB',
        stats: executor.getStats()
      })
      
      // Memory should stabilize after cleanup
      expect(totalGrowth.heapUsed).toBeLessThan(100 * 1024 * 1024) // Less than 100MB net growth
      
    }, 30000)
  })

  describe('AgentManager Memory Behavior', () => {
    let mockAgent: Agent
    let mockTransport: Transport
    
    beforeEach(() => {
      mockAgent = {
        id: 'memory-test-agent',
        name: 'Memory Test Agent',
        shutdown: vi.fn().mockResolvedValue(undefined)
      }

      mockTransport = {
        id: 'memory-test-transport',
        name: 'Memory Test Transport',
        config: {},
        init: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue(undefined)
      }
    })

    it('should not leak memory with many plugin instances', async () => {
      const baselineMemory = getMemorySnapshot()
      
      // Create many plugin instances
      const plugins: AgentKitPlugin[] = []
      for (let i = 0; i < 100; i++) {
        plugins.push({
          name: `MemoryPlugin${i}`,
          version: '1.0.0',
          onInit: vi.fn().mockImplementation(async () => {
            // Simulate plugin initialization work
            const initData = new Array(1000).fill(`init-${i}`)
            await new Promise(resolve => setTimeout(resolve, 1))
            return initData.length
          }),
          onSend: vi.fn().mockImplementation(async () => {
            // Simulate plugin send work
            const sendData = new Array(500).fill(`send-${i}`)
            await new Promise(resolve => setTimeout(resolve, 1))
            return sendData.length
          }),
          onShutdown: vi.fn().mockImplementation(async () => {
            // Simulate plugin cleanup
            await new Promise(resolve => setTimeout(resolve, 1))
          })
        })
      }

      const agentManager = new AgentManager(mockAgent, mockTransport, {
        plugins,
        observabilityConfig: {
          enableMetricsCollection: true,
          enableTimelineDebug: true
        },
        debug: false
      })

      await agentManager.initialize()
      
      // Send many messages to trigger plugin executions
      const sendTasks = Array.from({ length: 200 }, (_, i) =>
        agentManager.send({ content: `memory-test-${i}` })
      )
      
      await Promise.allSettled(sendTasks)
      
      const metrics = agentManager.getMetrics()
      console.log('Plugin memory test metrics:', {
        totalPlugins: plugins.length,
        totalRequests: metrics?.sdk.totalRequests.value,
        pluginExecutions: metrics?.plugins.length
      })
      
      await agentManager.shutdown()
      await forceGC()
      
      const finalMemory = getMemorySnapshot()
      const memoryGrowth = calculateMemoryGrowth(baselineMemory, finalMemory)
      
      console.log('Plugin memory test results:', {
        memoryGrowth: Math.round(memoryGrowth.heapUsed / 1024 / 1024) + 'MB',
        pluginCount: plugins.length,
        messagesSent: 200
      })
      
      // Should not have excessive memory growth
      expect(memoryGrowth.heapUsed).toBeLessThan(100 * 1024 * 1024) // Less than 100MB
      
    }, 30000)

    it('should clean up observability data on shutdown', async () => {
      const baselineMemory = getMemorySnapshot()
      
      const heavyLoggingPlugin: AgentKitPlugin = {
        name: 'HeavyLoggingPlugin',
        version: '1.0.0',
        onSend: vi.fn().mockImplementation(async (payload, context) => {
          // Simulate heavy observability data generation
          const observabilityData = {
            timestamp: Date.now(),
            payload: JSON.stringify(payload),
            context: JSON.stringify(context),
            metrics: new Array(100).fill({
              metric: 'heavy-data',
              value: Math.random(),
              tags: { plugin: 'heavy-logging' }
            })
          }
          
          await new Promise(resolve => setTimeout(resolve, 5))
          return observabilityData
        })
      }

      const agentManager = new AgentManager(mockAgent, mockTransport, {
        plugins: [heavyLoggingPlugin],
        observabilityConfig: {
          enableMetricsCollection: true,
          enableTimelineDebug: true
        },
        debug: false
      })

      await agentManager.initialize()
      
      // Generate lots of observability data
      const sendTasks = Array.from({ length: 1000 }, (_, i) =>
        agentManager.send({ 
          content: `heavy-observability-${i}`,
          metadata: { iteration: i, timestamp: Date.now() }
        })
      )
      
      await Promise.allSettled(sendTasks)
      
      const beforeShutdownMemory = getMemorySnapshot()
      
      await agentManager.shutdown()
      await forceGC()
      
      const afterShutdownMemory = getMemorySnapshot()
      const shutdownMemoryChange = calculateMemoryGrowth(beforeShutdownMemory, afterShutdownMemory)
      const totalMemoryGrowth = calculateMemoryGrowth(baselineMemory, afterShutdownMemory)
      
      console.log('Observability cleanup test:', {
        totalMemoryGrowth: Math.round(totalMemoryGrowth.heapUsed / 1024 / 1024) + 'MB',
        shutdownMemoryChange: Math.round(shutdownMemoryChange.heapUsed / 1024 / 1024) + 'MB',
        messagesSent: 1000
      })
      
      // Memory should decrease or stay stable after shutdown
      expect(shutdownMemoryChange.heapUsed).toBeLessThan(20 * 1024 * 1024) // Less than 20MB growth after shutdown
      expect(totalMemoryGrowth.heapUsed).toBeLessThan(150 * 1024 * 1024) // Less than 150MB total
      
    }, 30000)
  })

  describe('GC Effectiveness Validation', () => {
    it('should demonstrate effective garbage collection', async () => {
      if (!global.gc) {
        console.log('Skipping GC test - global.gc not available')
        return
      }
      
      const memorySnapshots: any[] = []
      
      // Baseline measurement
      await forceGC()
      memorySnapshots.push({
        phase: 'baseline',
        ...getMemorySnapshot()
      })
      
      // Create and destroy many objects
      for (let cycle = 0; cycle < 10; cycle++) {
        // Allocation phase
        const largeObjects: any[] = []
        for (let i = 0; i < 1000; i++) {
          largeObjects.push({
            id: i,
            data: new Array(1000).fill(`cycle-${cycle}-object-${i}`),
            metadata: {
              created: Date.now(),
              cycle,
              index: i
            }
          })
        }
        
        memorySnapshots.push({
          phase: `cycle-${cycle}-allocated`,
          ...getMemorySnapshot()
        })
        
        // Clear references and force GC
        largeObjects.length = 0
        await forceGC()
        
        memorySnapshots.push({
          phase: `cycle-${cycle}-collected`,
          ...getMemorySnapshot()
        })
      }
      
      // Analyze memory behavior
      const baselineHeap = memorySnapshots[0].heapUsed
      const allocatedPeaks = memorySnapshots
        .filter(s => s.phase.includes('allocated'))
        .map(s => s.heapUsed - baselineHeap)
      const collectedValues = memorySnapshots
        .filter(s => s.phase.includes('collected'))
        .map(s => s.heapUsed - baselineHeap)
      
      const avgPeakGrowth = allocatedPeaks.reduce((a, b) => a + b, 0) / allocatedPeaks.length
      const avgPostGCGrowth = collectedValues.reduce((a, b) => a + b, 0) / collectedValues.length
      const gcEffectiveness = 1 - (avgPostGCGrowth / avgPeakGrowth)
      
      console.log('GC Effectiveness Analysis:', {
        avgPeakGrowth: Math.round(avgPeakGrowth / 1024 / 1024) + 'MB',
        avgPostGCGrowth: Math.round(avgPostGCGrowth / 1024 / 1024) + 'MB',
        gcEffectiveness: Math.round(gcEffectiveness * 100) + '%',
        cycles: 10
      })
      
      // GC should be reasonably effective
      expect(gcEffectiveness).toBeGreaterThan(0.5) // At least 50% effective
      expect(avgPostGCGrowth).toBeLessThan(avgPeakGrowth * 0.5) // Post-GC should be less than half peak
      
    }, 30000)

    it('should validate resident memory stabilization', async () => {
      const stabilizationPeriod = 5000 // 5 seconds
      const measurementInterval = 500 // 500ms
      const measurements: any[] = []
      
      // Initial activity to establish baseline
      const executor = new EnhancedBoundedExecutor({
        maxConcurrentTasks: 10,
        maxQueueDepth: 50
      })
      
      // Generate some activity
      const tasks = Array.from({ length: 100 }, (_, i) =>
        executor.execute(`stabilization-${i}`, async () => {
          const data = new Array(100).fill(`data-${i}`)
          await new Promise(resolve => setTimeout(resolve, 10))
          return data.length
        }).catch(() => 'failed')
      )
      
      await Promise.allSettled(tasks)
      await executor.shutdown()
      await forceGC()
      
      // Monitor memory stabilization
      const startTime = Date.now()
      const measurementPromise = new Promise<void>(resolve => {
        const interval = setInterval(() => {
          measurements.push({
            timestamp: Date.now(),
            ...getMemorySnapshot()
          })
          
          if (Date.now() - startTime >= stabilizationPeriod) {
            clearInterval(interval)
            resolve()
          }
        }, measurementInterval)
      })
      
      await measurementPromise
      
      // Analyze stability
      const heapValues = measurements.map(m => m.heapUsed)
      const rssValues = measurements.map(m => m.rss)
      
      const heapVariance = calculateVariance(heapValues)
      const rssVariance = calculateVariance(rssValues)
      const heapStability = 1 - (Math.sqrt(heapVariance) / average(heapValues))
      const rssStability = 1 - (Math.sqrt(rssVariance) / average(rssValues))
      
      console.log('Memory Stabilization Analysis:', {
        measurementCount: measurements.length,
        heapStability: Math.round(heapStability * 100) + '%',
        rssStability: Math.round(rssStability * 100) + '%',
        avgHeap: Math.round(average(heapValues) / 1024 / 1024) + 'MB',
        avgRSS: Math.round(average(rssValues) / 1024 / 1024) + 'MB'
      })
      
      // Memory should be reasonably stable
      expect(heapStability).toBeGreaterThan(0.8) // 80% stable
      expect(rssStability).toBeGreaterThan(0.7) // 70% stable
      
    }, 15000)
  })
})

// Helper functions
function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

function calculateVariance(values: number[]): number {
  const avg = average(values)
  const squaredDiffs = values.map(value => Math.pow(value - avg, 2))
  return average(squaredDiffs)
}