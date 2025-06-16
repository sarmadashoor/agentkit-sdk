import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createGreetPlugin, GreetPlugin } from './fixtures/greet-plugin'
import type { AgentContext, SendPayload } from '@agentkit/types'
import { MetricsCollector } from '../observability/MetricsCollector'
import { PluginExecutionTimeline } from '../observability/PluginExecutionTimeline'

/**
 * Plugin Performance and Observability Test Suite
 * 
 * Validates performance characteristics and observability features:
 * - Execution timing and metrics collection
 * - Memory usage tracking
 * - Timeline tracing with visual output
 * - Circuit breaker integration
 * - Performance regression detection
 */

describe('Plugin Performance and Observability', () => {
  let plugin: GreetPlugin
  let metricsCollector: MetricsCollector
  let timeline: PluginExecutionTimeline
  let mockContext: AgentContext

  beforeEach(() => {
    plugin = createGreetPlugin({
      enabled: true,
      logLevel: 'debug',
      greetingPrefix: 'Performance',
      maxDelay: 10
    })
    
    metricsCollector = new MetricsCollector()
    timeline = new PluginExecutionTimeline()
    
    mockContext = {
      agentId: 'performance-agent',
      transportId: 'performance-transport',
      requestId: 'perf-test-001',
      timestamp: Date.now(),
      metadata: { test: 'performance' }
    }
  })

  describe('Execution Timing and Metrics', () => {
    it('should track hook execution times accurately', async () => {
      const startTime = performance.now()
      
      await plugin.onInit(mockContext)
      
      const metrics = plugin.getMetrics()
      expect(metrics.initTime).toBeGreaterThan(0)
      expect(metrics.initTime).toBeLessThan(1000) // Should complete within 1 second
      
      // Verify timing accuracy (with tolerance for system variance)
      const actualTime = performance.now() - startTime
      expect(metrics.initTime).toBeLessThanOrEqual(actualTime + 5) // 5ms tolerance
    })

    it('should collect comprehensive plugin metrics', async () => {
      // Execute complete lifecycle
      await plugin.onInit(mockContext)
      
      const sendPayload: SendPayload = {
        input: { message: 'metrics test' },
        metadata: {}
      }
      
      // Execute multiple sends
      for (let i = 0; i < 5; i++) {
        await plugin.onSend(sendPayload, mockContext)
      }
      
      // Simulate error
      const testError = new Error('Metrics test error')
      await plugin.onError(testError, mockContext)
      
      await plugin.onShutdown(mockContext)
      
      const metrics = plugin.getMetrics()
      
      // Validate all metrics are tracked
      expect(metrics.initTime).toBeGreaterThan(0)
      expect(metrics.sendCount).toBe(5)
      expect(metrics.errorCount).toBe(1)
      expect(metrics.shutdownTime).toBeGreaterThan(0)
      expect(typeof metrics.memoryUsage).toBe('number')
    })

    it('should track memory usage during plugin lifecycle', async () => {
      const initialMemory = process.memoryUsage().heapUsed
      
      await plugin.onInit(mockContext)
      
      // Create substantial payload to test memory tracking
      const largePayload: SendPayload = {
        input: { 
          message: 'large message',
          data: new Array(1000).fill('memory test data')
        },
        metadata: { size: 'large' }
      }
      
      // Execute multiple operations
      for (let i = 0; i < 10; i++) {
        await plugin.onSend(largePayload, mockContext)
      }
      
      await plugin.onShutdown(mockContext)
      
      const metrics = plugin.getMetrics()
      expect(metrics.memoryUsage).toBeGreaterThan(0)
      
      // Memory increase should be reasonable
      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024) // Less than 10MB
    })
  })

  describe('Timeline Tracing and Visual Output', () => {
    it('should generate timeline logs with proper formatting', async () => {
      const logs: string[] = []
      const startTime = Date.now()
      
      const logTrace = (message: string) => {
        logs.push(message)
      }
      
      // Simulate timeline tracing
      const logHookStart = (hook: string, plugin: string) => {
        const elapsed = Date.now() - startTime
        logTrace(`▶ ${hook}(${plugin}) start (t=${elapsed}ms)`)
      }
      
      const logHookSuccess = (hook: string, plugin: string) => {
        const elapsed = Date.now() - startTime
        logTrace(`✔ ${hook}(${plugin}) success (t=${elapsed}ms)`)
      }
      
      const logHookError = (hook: string, plugin: string, error: string) => {
        const elapsed = Date.now() - startTime
        logTrace(`✖ ${hook}(${plugin}) error: ${error} (t=${elapsed}ms)`)
      }
      
      // Execute with tracing
      logHookStart('onInit', plugin.name)
      await plugin.onInit(mockContext)
      logHookSuccess('onInit', plugin.name)
      
      logHookStart('onSend', plugin.name)
      const sendPayload: SendPayload = {
        input: { message: 'timeline test' },
        metadata: {}
      }
      await plugin.onSend(sendPayload, mockContext)
      logHookSuccess('onSend', plugin.name)
      
      // Test error tracing
      plugin.setChaosConfig({ failOnError: true })
      logHookStart('onError', plugin.name)
      try {
        await plugin.onError(new Error('Test error'), mockContext)
      } catch (error) {
        logHookError('onError', plugin.name, (error as Error).message)
      }
      
      logHookStart('onShutdown', plugin.name)
      await plugin.onShutdown(mockContext)
      logHookSuccess('onShutdown', plugin.name)
      
      // Validate timeline format
      expect(logs.length).toBeGreaterThan(0)
      expect(logs[0]).toMatch(/^▶ onInit\(greet-plugin\) start \(t=\d+ms\)$/)
      expect(logs[1]).toMatch(/^✔ onInit\(greet-plugin\) success \(t=\d+ms\)$/)
      expect(logs.some(log => /^▶ onSend\(greet-plugin\) start \(t=\d+ms\)$/.test(log))).toBe(true)
      expect(logs.some(log => /^✔ onSend\(greet-plugin\) success \(t=\d+ms\)$/.test(log))).toBe(true)
    })

    it('should track timeline progression accurately', async () => {
      const timeline: Array<{ hook: string, timestamp: number, status: string }> = []
      const startTime = Date.now()
      
      const trackHook = (hook: string, status: 'start' | 'success' | 'error') => {
        timeline.push({
          hook,
          timestamp: Date.now() - startTime,
          status
        })
      }
      
      // Execute lifecycle with tracking
      trackHook('onInit', 'start')
      await plugin.onInit(mockContext)
      trackHook('onInit', 'success')
      
      trackHook('onSend', 'start')
      const sendPayload: SendPayload = {
        input: { message: 'timeline progression test' },
        metadata: {}
      }
      await plugin.onSend(sendPayload, mockContext)
      trackHook('onSend', 'success')
      
      trackHook('onShutdown', 'start')
      await plugin.onShutdown(mockContext)
      trackHook('onShutdown', 'success')
      
      // Validate timeline progression
      expect(timeline.length).toBe(6)
      
      // Verify timestamps are in ascending order
      for (let i = 1; i < timeline.length; i++) {
        expect(timeline[i].timestamp).toBeGreaterThanOrEqual(timeline[i-1].timestamp)
      }
      
      // Verify hook pairs (start -> success)
      expect(timeline[0]).toMatchObject({ hook: 'onInit', status: 'start' })
      expect(timeline[1]).toMatchObject({ hook: 'onInit', status: 'success' })
      expect(timeline[2]).toMatchObject({ hook: 'onSend', status: 'start' })
      expect(timeline[3]).toMatchObject({ hook: 'onSend', status: 'success' })
    })
  })

  describe('Circuit Breaker Integration', () => {
    it('should trigger circuit breaker after multiple failures', async () => {
      let failureCount = 0
      const maxFailures = 3
      
      // Simulate circuit breaker behavior
      const circuitBreaker = {
        state: 'CLOSED' as 'CLOSED' | 'OPEN' | 'HALF_OPEN',
        failureCount: 0,
        maxFailures,
        lastFailureTime: 0,
        
        async execute<T>(operation: () => Promise<T>): Promise<T> {
          if (this.state === 'OPEN') {
            throw new Error('Circuit breaker is OPEN')
          }
          
          try {
            const result = await operation()
            this.reset()
            return result
          } catch (error) {
            this.recordFailure()
            throw error
          }
        },
        
        recordFailure() {
          this.failureCount++
          this.lastFailureTime = Date.now()
          
          if (this.failureCount >= this.maxFailures) {
            this.state = 'OPEN'
          }
        },
        
        reset() {
          this.failureCount = 0
          this.state = 'CLOSED'
        }
      }
      
      // Configure plugin to fail
      plugin.setChaosConfig({ failOnSend: true })
      
      const sendPayload: SendPayload = {
        input: { message: 'circuit breaker test' },
        metadata: {}
      }
      
      // Execute operations until circuit breaker opens
      for (let i = 0; i < maxFailures + 1; i++) {
        try {
          await circuitBreaker.execute(() => plugin.onSend(sendPayload, mockContext))
        } catch (error) {
          if ((error as Error).message === 'Circuit breaker is OPEN') {
            expect(circuitBreaker.state).toBe('OPEN')
            expect(circuitBreaker.failureCount).toBe(maxFailures)
            break
          }
        }
      }
      
      expect(circuitBreaker.state).toBe('OPEN')
    })
  })

  describe('Performance Regression Detection', () => {
    it('should detect performance degradation', async () => {
      const baselineResults: number[] = []
      const currentResults: number[] = []
      
      // Establish baseline performance
      for (let i = 0; i < 10; i++) {
        const start = performance.now()
        await plugin.onInit(mockContext)
        const duration = performance.now() - start
        baselineResults.push(duration)
      }
      
      // Test with artificial delay (simulating performance regression)
      plugin.setChaosConfig({ delayMs: 20 })
      
      for (let i = 0; i < 10; i++) {
        const start = performance.now()
        await plugin.onInit(mockContext)
        const duration = performance.now() - start
        currentResults.push(duration)
      }
      
      // Calculate performance metrics
      const baselineAvg = baselineResults.reduce((a, b) => a + b, 0) / baselineResults.length
      const currentAvg = currentResults.reduce((a, b) => a + b, 0) / currentResults.length
      
      const performanceDegradation = (currentAvg - baselineAvg) / baselineAvg
      
      // Expect significant performance degradation due to artificial delay
      expect(performanceDegradation).toBeGreaterThan(1) // At least 100% slower
      expect(currentAvg).toBeGreaterThan(baselineAvg + 15) // At least 15ms slower
    })

    it('should maintain performance within acceptable bounds', async () => {
      const executionTimes: number[] = []
      const maxExecutionTime = 50 // 50ms max per operation
      
      const sendPayload: SendPayload = {
        input: { message: 'performance bounds test' },
        metadata: {}
      }
      
      // Test multiple operations
      for (let i = 0; i < 20; i++) {
        const start = performance.now()
        await plugin.onSend(sendPayload, mockContext)
        const duration = performance.now() - start
        executionTimes.push(duration)
      }
      
      // Validate all executions are within bounds
      executionTimes.forEach((time, index) => {
        expect(time).toBeLessThan(maxExecutionTime), 
          `Execution ${index + 1} took ${time}ms, exceeding limit of ${maxExecutionTime}ms`
      })
      
      // Validate average performance
      const avgTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
      expect(avgTime).toBeLessThan(maxExecutionTime / 2), // Average should be well under limit
        `Average execution time ${avgTime}ms exceeds expected performance`
    })
  })

  describe('Observability Snapshots', () => {
    it('should generate comprehensive observability snapshots', async () => {
      await plugin.onInit(mockContext)
      
      // Execute various operations
      const sendPayload: SendPayload = {
        input: { message: 'observability test' },
        metadata: {}
      }
      
      for (let i = 0; i < 3; i++) {
        await plugin.onSend(sendPayload, mockContext)
      }
      
      const testError = new Error('Observability test error')
      await plugin.onError(testError, mockContext)
      
      await plugin.onShutdown(mockContext)
      
      // Generate observability snapshot
      const snapshot = {
        plugin: {
          name: plugin.name,
          version: plugin.version,
          config: plugin.getConfig()
        },
        metrics: plugin.getMetrics(),
        memory: {
          usage: process.memoryUsage().heapUsed,
          timestamp: Date.now()
        },
        performance: {
          initTime: plugin.getMetrics().initTime,
          avgSendTime: plugin.getMetrics().initTime / Math.max(1, plugin.getMetrics().sendCount),
          shutdownTime: plugin.getMetrics().shutdownTime
        },
        status: {
          healthy: plugin.getMetrics().errorCount < 5,
          lastActivity: mockContext.timestamp
        }
      }
      
      // Validate snapshot structure
      expect(snapshot.plugin.name).toBe('greet-plugin')
      expect(snapshot.plugin.version).toBe('1.0.0')
      expect(snapshot.metrics.sendCount).toBe(3)
      expect(snapshot.metrics.errorCount).toBe(1)
      expect(typeof snapshot.memory.usage).toBe('number')
      expect(snapshot.performance.initTime).toBeGreaterThan(0)
      expect(snapshot.status.healthy).toBe(true)
      
      console.log('\n📊 Observability Snapshot:')
      console.log(JSON.stringify(snapshot, null, 2))
    })

    it('should track resource utilization over time', async () => {
      const resourceSnapshots: Array<{
        timestamp: number
        memoryUsage: number
        executionTime: number
        operationCount: number
      }> = []
      
      const sendPayload: SendPayload = {
        input: { message: 'resource tracking test' },
        metadata: {}
      }
      
      await plugin.onInit(mockContext)
      
      // Take snapshots during execution
      for (let i = 0; i < 5; i++) {
        const start = performance.now()
        await plugin.onSend(sendPayload, mockContext)
        const executionTime = performance.now() - start
        
        resourceSnapshots.push({
          timestamp: Date.now(),
          memoryUsage: process.memoryUsage().heapUsed,
          executionTime,
          operationCount: i + 1
        })
        
        // Small delay between operations
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      
      await plugin.onShutdown(mockContext)
      
      // Validate resource tracking
      expect(resourceSnapshots.length).toBe(5)
      
      // Check timestamps are increasing
      for (let i = 1; i < resourceSnapshots.length; i++) {
        expect(resourceSnapshots[i].timestamp).toBeGreaterThan(resourceSnapshots[i-1].timestamp)
        expect(resourceSnapshots[i].operationCount).toBe(i + 1)
      }
      
      // Memory usage should be reasonable
      resourceSnapshots.forEach(snapshot => {
        expect(snapshot.memoryUsage).toBeGreaterThan(0)
        expect(snapshot.executionTime).toBeLessThan(1000) // Less than 1 second
      })
    })
  })
})