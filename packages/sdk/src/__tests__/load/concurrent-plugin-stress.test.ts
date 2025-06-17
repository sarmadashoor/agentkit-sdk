/**
 * @testmeta type:load
 * @testmeta category:performance
 * @testmeta priority:high
 * 
 * Load Test Suite - 100 Concurrent Plugin Calls
 * Tests performance under extreme load conditions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EnhancedBoundedExecutor, type EnhancedObservabilityHooks } from '../../performance/EnhancedBoundedExecutor'
import { AgentManager } from '../../AgentManager'
import type { Agent, Transport, AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'

describe('Concurrent Plugin Stress Tests', () => {
  let executor: EnhancedBoundedExecutor
  let observabilityHooks: EnhancedObservabilityHooks
  let mockMetrics: any

  beforeEach(() => {
    mockMetrics = {
      tasksQueued: 0,
      tasksStarted: 0,
      tasksCompleted: 0,
      tasksTimedOut: 0,
      tasksFailed: 0,
      queueOverflows: 0,
      pluginsDisabled: 0,
      guardrailViolations: 0,
      memoryPressureEvents: 0,
      maxQueueSize: 0,
      totalLatency: 0,
      completedTasks: 0
    }

    observabilityHooks = {
      onTaskQueued: (taskId, queueSize) => {
        mockMetrics.tasksQueued++
        mockMetrics.maxQueueSize = Math.max(mockMetrics.maxQueueSize, queueSize)
      },
      onTaskStarted: (taskId, activeRequests, queueWaitTime) => {
        mockMetrics.tasksStarted++
      },
      onTaskCompleted: (taskId, duration, queueWaitTime) => {
        mockMetrics.tasksCompleted++
        mockMetrics.totalLatency += duration
        mockMetrics.completedTasks++
      },
      onTaskTimeout: (taskId, timeoutMs, pluginName) => {
        mockMetrics.tasksTimedOut++
      },
      onTaskFailed: (taskId, error, pluginName) => {
        mockMetrics.tasksFailed++
      },
      onQueueOverflow: (strategy, droppedTaskId) => {
        mockMetrics.queueOverflows++
      },
      onPluginDisabled: (pluginName, reason) => {
        mockMetrics.pluginsDisabled++
      },
      onPerformanceGuardrailViolation: (violation, metrics) => {
        mockMetrics.guardrailViolations++
      },
      onMemoryPressure: (queueSize, memoryUsage) => {
        mockMetrics.memoryPressureEvents++
      }
    }

    executor = new EnhancedBoundedExecutor({
      maxConcurrentTasks: 20,
      maxQueueDepth: 100,
      requestTimeoutMs: 1000,
      queueOverflowStrategy: 'dropOldest'
    }, observabilityHooks, false)
  })

  afterEach(async () => {
    console.time('concurrent-plugin-stress-cleanup')
    if (executor) {
      await executor.shutdown()
      // Allow time for cleanup
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    console.timeEnd('concurrent-plugin-stress-cleanup')
  })

  describe('100 Concurrent Plugin Execution', () => {
    it('should handle 100 concurrent tasks with random latency', async () => {
      console.time('concurrent-plugin-stress-100-tasks')
      const taskCount = 100
      const tasks: Promise<any>[] = []
      
      const startTime = Date.now()

      // Create 100 concurrent tasks with random latency (10ms-200ms)
      for (let i = 0; i < taskCount; i++) {
        const latency = 10 + Math.random() * 190 // 10-200ms
        
        const task = executor.execute(
          `task-${i}`,
          async () => {
            await new Promise(resolve => setTimeout(resolve, latency))
            return `result-${i}`
          },
          { data: `payload-${i}` },
          { pluginName: `plugin-${i % 10}` } // 10 different plugins
        )
        
        tasks.push(task)
      }

      // Wait for all tasks to complete or fail
      const results = await Promise.allSettled(tasks)
      const endTime = Date.now()
      
      const successfulTasks = results.filter(r => r.status === 'fulfilled').length
      const failedTasks = results.filter(r => r.status === 'rejected').length
      
      console.log('Load Test Results:', {
        totalTasks: taskCount,
        successfulTasks,
        failedTasks,
        totalDuration: endTime - startTime,
        avgLatency: mockMetrics.completedTasks > 0 ? mockMetrics.totalLatency / mockMetrics.completedTasks : 0,
        maxQueueSize: mockMetrics.maxQueueSize,
        queueOverflows: mockMetrics.queueOverflows,
        stats: executor.getStats()
      })

      // Assertions
      expect(successfulTasks + failedTasks).toBe(taskCount)
      expect(successfulTasks).toBeGreaterThan(taskCount * 0.8) // At least 80% success rate
      expect(executor.getStats().timeoutRate).toBeLessThan(0.2) // Less than 20% timeout rate
      console.timeEnd('concurrent-plugin-stress-100-tasks')
    }, { timeout: 20000 })

    it('should handle mixed plugin behaviors (crashes, logs, stalls)', async () => {
      const tasks: Promise<any>[] = []
      
      // Plugin that crashes randomly
      for (let i = 0; i < 20; i++) {
        const task = executor.execute(
          `crash-${i}`,
          async () => {
            if (Math.random() < 0.3) {
              throw new Error(`Crash in task ${i}`)
            }
            await new Promise(resolve => setTimeout(resolve, 50))
            return `crash-result-${i}`
          },
          undefined,
          { pluginName: 'crashy-plugin' }
        )
        tasks.push(task)
      }

      // Plugin that logs heavily
      for (let i = 0; i < 20; i++) {
        const task = executor.execute(
          `log-${i}`,
          async () => {
            // Simulate heavy logging
            for (let j = 0; j < 10; j++) {
              console.log(`Heavy log ${i}-${j}`)
            }
            await new Promise(resolve => setTimeout(resolve, 30))
            return `log-result-${i}`
          },
          undefined,
          { pluginName: 'logging-plugin' }
        )
        tasks.push(task)
      }

      // Plugin that stalls (approaches timeout)
      for (let i = 0; i < 20; i++) {
        const task = executor.execute(
          `stall-${i}`,
          async () => {
            // Stall for 800ms (close to 1000ms timeout)
            await new Promise(resolve => setTimeout(resolve, 800))
            return `stall-result-${i}`
          },
          undefined,
          { pluginName: 'slow-plugin' }
        )
        tasks.push(task)
      }

      const results = await Promise.allSettled(tasks)
      
      const byStatus = {
        fulfilled: results.filter(r => r.status === 'fulfilled').length,
        rejected: results.filter(r => r.status === 'rejected').length
      }

      console.log('Mixed Plugin Test Results:', {
        results: byStatus,
        stats: executor.getStats(),
        metrics: mockMetrics
      })

      expect(byStatus.fulfilled + byStatus.rejected).toBe(60)
      expect(byStatus.fulfilled).toBeGreaterThan(30) // At least 50% success
    }, 15000)

    it('should handle shutdown while queue is draining', async () => {
      const taskCount = 50
      const tasks: Promise<any>[] = []
      
      // Create long-running tasks
      for (let i = 0; i < taskCount; i++) {
        const task = executor.execute(
          `drain-${i}`,
          async () => {
            await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300))
            return `drain-result-${i}`
          },
          undefined,
          { pluginName: 'drain-plugin' }
        )
        tasks.push(task)
      }

      // Wait for some tasks to start processing
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const statsBeforeShutdown = executor.getStats()
      console.log('Pre-shutdown stats:', {
        activeRequests: statsBeforeShutdown.activeRequests,
        queuedRequests: statsBeforeShutdown.queuedRequests
      })

      // Initiate shutdown while tasks are running
      const shutdownPromise = executor.shutdown()
      
      // Wait for shutdown to complete
      await shutdownPromise
      
      // Check results
      const results = await Promise.allSettled(tasks)
      const rejected = results.filter(r => r.status === 'rejected').length
      const fulfilled = results.filter(r => r.status === 'fulfilled').length

      console.log('Shutdown Test Results:', {
        fulfilled,
        rejected,
        totalTasks: taskCount,
        statsBeforeShutdown
      })

      expect(fulfilled + rejected).toBe(taskCount)
      expect(rejected).toBeGreaterThan(0) // Some tasks should be rejected due to shutdown
    }, 10000)
  })

  describe('Memory and Performance Monitoring', () => {
    it('should track peak memory usage and event loop lag', async () => {
      const memoryBefore = process.memoryUsage()
      const taskCount = 200
      const tasks: Promise<any>[] = []
      
      // Create memory-intensive tasks
      for (let i = 0; i < taskCount; i++) {
        const task = executor.execute(
          `memory-${i}`,
          async () => {
            // Create some memory pressure
            const largeArray = new Array(1000).fill('memory-test-data')
            await new Promise(resolve => setTimeout(resolve, 10))
            return largeArray.length
          },
          undefined,
          { pluginName: 'memory-plugin' }
        )
        tasks.push(task)
      }

      const results = await Promise.allSettled(tasks)
      const memoryAfter = process.memoryUsage()
      
      const memoryDelta = {
        heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
        heapTotal: memoryAfter.heapTotal - memoryBefore.heapTotal,
        rss: memoryAfter.rss - memoryBefore.rss
      }

      console.log('Memory Test Results:', {
        taskCount,
        successfulTasks: results.filter(r => r.status === 'fulfilled').length,
        memoryDelta,
        memoryAfter,
        stats: executor.getStats(),
        memoryPressureEvents: mockMetrics.memoryPressureEvents
      })

      // Memory should not grow excessively (allow for some overhead)
      expect(memoryDelta.heapUsed).toBeLessThan(50 * 1024 * 1024) // Less than 50MB growth
      
      // Most tasks should complete successfully
      expect(results.filter(r => r.status === 'fulfilled').length).toBeGreaterThan(taskCount * 0.9)
    }, 15000)

    it('should measure task execution percentiles', async () => {
      const taskCount = 100
      const tasks: Promise<any>[] = []
      
      // Create tasks with predictable latencies
      for (let i = 0; i < taskCount; i++) {
        const latency = i + 10 // 10ms to 109ms
        
        const task = executor.execute(
          `perf-${i}`,
          async () => {
            await new Promise(resolve => setTimeout(resolve, latency))
            return latency
          },
          undefined,
          { pluginName: 'perf-plugin' }
        )
        tasks.push(task)
      }

      await Promise.allSettled(tasks)
      const stats = executor.getStats()
      
      console.log('Performance Percentiles:', {
        avgExecutionLatency: stats.avgExecutionLatency,
        p50ExecutionLatency: stats.p50ExecutionLatency,
        p95ExecutionLatency: stats.p95ExecutionLatency,
        avgQueueWaitTime: stats.avgQueueWaitTime,
        timeoutRate: stats.timeoutRate
      })

      // Verify percentiles are reasonable
      expect(stats.p50ExecutionLatency).toBeGreaterThan(50)
      expect(stats.p50ExecutionLatency).toBeLessThan(70)
      expect(stats.p95ExecutionLatency).toBeGreaterThan(100)
      expect(stats.avgQueueWaitTime).toBeGreaterThanOrEqual(0)
    }, 10000)
  })

  describe('Plugin Reliability and Circuit Breaking', () => {
    it('should disable plugins with excessive timeouts', async () => {
      const tasks: Promise<any>[] = []
      
      // Create tasks that will timeout
      for (let i = 0; i < 10; i++) {
        const task = executor.execute(
          `timeout-${i}`,
          async () => {
            // Wait longer than timeout (1000ms)
            await new Promise(resolve => setTimeout(resolve, 1500))
            return `timeout-result-${i}`
          },
          undefined,
          { pluginName: 'timeout-plugin' }
        ).catch(error => error) // Catch to prevent test failure
        
        tasks.push(task)
      }

      await Promise.allSettled(tasks)
      const stats = executor.getStats()
      
      console.log('Plugin Timeout Test:', {
        disabledPlugins: stats.disabledPlugins,
        pluginTimeouts: stats.pluginTimeouts,
        totalTimeouts: stats.totalTimeouts,
        guardrailViolations: stats.guardrailViolations
      })

      // Plugin should be disabled after excessive timeouts
      expect(stats.disabledPlugins).toContain('timeout-plugin')
      expect(stats.totalTimeouts).toBeGreaterThan(5)
      expect(mockMetrics.guardrailViolations).toBeGreaterThan(0)
    }, 20000)

    it('should handle timeout bursts (3+ timeouts in 5 seconds)', async () => {
      const tasks: Promise<any>[] = []
      
      // Create rapid timeout burst
      for (let i = 0; i < 5; i++) {
        const task = executor.execute(
          `burst-${i}`,
          async () => {
            await new Promise(resolve => setTimeout(resolve, 1500))
            return `burst-result-${i}`
          },
          undefined,
          { pluginName: 'burst-plugin' }
        ).catch(error => error)
        
        tasks.push(task)
        
        // Small delay between starts to simulate burst
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      await Promise.allSettled(tasks)
      
      console.log('Timeout Burst Test:', {
        guardrailViolations: mockMetrics.guardrailViolations,
        tasksTimedOut: mockMetrics.tasksTimedOut,
        stats: executor.getStats()
      })

      expect(mockMetrics.guardrailViolations).toBeGreaterThan(0)
      expect(mockMetrics.tasksTimedOut).toBeGreaterThanOrEqual(3)
    }, 15000)
  })

  describe('Queue Overflow Strategies', () => {
    it('should drop oldest tasks when queue overflows', async () => {
      // Create executor with small queue
      const smallExecutor = new EnhancedBoundedExecutor({
        maxConcurrentTasks: 2,
        maxQueueDepth: 5,
        requestTimeoutMs: 500,
        queueOverflowStrategy: 'dropOldest'
      }, observabilityHooks, false)

      const tasks: Promise<any>[] = []
      
      // Create many long-running tasks to force overflow
      for (let i = 0; i < 15; i++) {
        const task = smallExecutor.execute(
          `overflow-${i}`,
          async () => {
            await new Promise(resolve => setTimeout(resolve, 300))
            return `overflow-result-${i}`
          },
          undefined,
          { pluginName: 'overflow-plugin' }
        ).catch(error => ({ error: error.message, id: i }))
        
        tasks.push(task)
      }

      const results = await Promise.allSettled(tasks)
      await smallExecutor.shutdown()
      
      const droppedTasks = results.filter(r => 
        r.status === 'fulfilled' && 
        r.value.error && 
        r.value.error.includes('dropped')
      ).length

      console.log('Queue Overflow Test:', {
        totalTasks: 15,
        droppedTasks,
        queueOverflows: mockMetrics.queueOverflows,
        maxQueueSize: mockMetrics.maxQueueSize
      })

      expect(mockMetrics.queueOverflows).toBeGreaterThan(0)
      expect(droppedTasks).toBeGreaterThan(0)
    }, 10000)
  })

  describe('Integration with AgentManager', () => {
    it('should work with real AgentManager under load', async () => {
      const mockAgent: Agent = {
        id: 'load-test-agent',
        name: 'Load Test Agent',
        shutdown: vi.fn().mockResolvedValue(undefined)
      }

      const mockTransport: Transport = {
        id: 'load-test-transport',
        name: 'Load Test Transport',
        config: {},
        init: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue(undefined)
      }

      // Create plugins with varying performance
      const fastPlugin: AgentKitPlugin = {
        name: 'FastPlugin',
        version: '1.0.0',
        onSend: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 10))
        })
      }

      const slowPlugin: AgentKitPlugin = {
        name: 'SlowPlugin', 
        version: '1.0.0',
        onSend: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100))
        })
      }

      const agentManager = new AgentManager(mockAgent, mockTransport, {
        plugins: [fastPlugin, slowPlugin],
        observabilityConfig: {
          enableMetricsCollection: true,
          enableTimelineDebug: true,
          performanceThreshold: 50
        },
        debug: false
      })

      await agentManager.initialize()

      // Send many messages concurrently
      const sendTasks = Array.from({ length: 20 }, (_, i) =>
        agentManager.send({ content: `load-message-${i}` })
      )

      await Promise.allSettled(sendTasks)
      
      const metrics = agentManager.getMetrics()
      const timeline = agentManager.getDebugTimeline()
      
      console.log('AgentManager Load Test:', {
        totalRequests: metrics?.sdk.totalRequests.value,
        totalPluginExecutions: metrics?.plugins.length,
        timelineEntries: timeline?.entries.length,
        performanceStats: agentManager.getPerformanceStats()
      })

      await agentManager.shutdown()

      expect(metrics?.sdk.totalRequests.value).toBe(20)
      expect(timeline?.entries.length).toBeGreaterThan(20) // Should have plugin executions
    }, 15000)
  })
})