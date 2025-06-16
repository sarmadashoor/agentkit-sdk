/**
 * EnhancedBoundedExecutor - Stripe-grade performance and reliability hardening
 * 
 * Extends BoundedExecutor with:
 * - Advanced queue overflow strategies
 * - Comprehensive performance instrumentation
 * - Plugin failure circuit breaking
 * - Memory leak prevention
 * - Performance guardrails
 */

import type { ResourceLimits } from '@agentkit/types'
import { 
  QueueFullError,
  PayloadTooLargeError,
  RequestTimeoutError,
  ResourceExhaustedError,
  AgentShutdownError,
  InvalidConfigurationError
} from '@agentkit/errors'
import { debugLog } from '../log'

export type QueueOverflowStrategy = 'reject' | 'dropOldest'

export interface EnhancedResourceLimits extends ResourceLimits {
  maxConcurrentTasks?: number
  maxQueueDepth?: number
  queueOverflowStrategy?: QueueOverflowStrategy
}

interface QueuedTask<T> {
  id: string
  execute: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
  payload?: unknown
  startTime: number
  queuedTime: number
  priority?: number
  retryCount?: number
  pluginName?: string
}

export interface PerformanceMetrics {
  // Queue metrics
  queueSizeHistogram: number[]
  maxQueueSizeReached: number
  totalEnqueued: number
  totalDequeued: number
  totalDropped: number
  
  // Execution metrics
  executionLatencyHistogram: number[]
  queueWaitTimeHistogram: number[]
  totalExecutions: number
  totalTimeouts: number
  totalFailures: number
  
  // Plugin-specific metrics
  pluginTimeouts: Map<string, number>
  pluginFailures: Map<string, number>
  disabledPlugins: Set<string>
  
  // Performance guardrails
  guardrailViolations: number
  consecutiveTimeouts: number
  lastTimeoutTime?: number
  
  // Memory tracking
  peakQueueSize: number
  memoryPressureEvents: number
}

export interface EnhancedObservabilityHooks {
  onTaskQueued?(taskId: string, queueSize: number, queueWaitTime?: number): void
  onTaskStarted?(taskId: string, activeRequests: number, queueWaitTime: number): void
  onTaskCompleted?(taskId: string, duration: number, queueWaitTime: number): void
  onTaskTimeout?(taskId: string, timeoutMs: number, pluginName?: string): void
  onTaskFailed?(taskId: string, error: Error, pluginName?: string): void
  onQueueOverflow?(strategy: QueueOverflowStrategy, droppedTaskId?: string): void
  onPluginDisabled?(pluginName: string, reason: string): void
  onPerformanceGuardrailViolation?(violation: string, metrics: any): void
  onMemoryPressure?(queueSize: number, memoryUsage?: number): void
  onShutdown?(activeRequests: number, queuedRequests: number, metrics: PerformanceMetrics): void
}

export class EnhancedBoundedExecutor {
  private readonly limits: Required<EnhancedResourceLimits>
  private activeRequests = 0
  private taskQueue: QueuedTask<unknown>[] = []
  private isProcessing = false
  private isShutdown = false
  
  // Performance tracking
  private metrics: PerformanceMetrics = {
    queueSizeHistogram: [],
    maxQueueSizeReached: 0,
    totalEnqueued: 0,
    totalDequeued: 0,
    totalDropped: 0,
    executionLatencyHistogram: [],
    queueWaitTimeHistogram: [],
    totalExecutions: 0,
    totalTimeouts: 0,
    totalFailures: 0,
    pluginTimeouts: new Map(),
    pluginFailures: new Map(),
    disabledPlugins: new Set(),
    guardrailViolations: 0,
    consecutiveTimeouts: 0,
    peakQueueSize: 0,
    memoryPressureEvents: 0
  }
  private startTime = Date.now()
  
  // Memory leak prevention
  private activeTimeouts = new Set<NodeJS.Timeout>()
  
  // Plugin failure tracking
  private pluginTimeoutCounts = new Map<string, number>()
  private pluginFailureCounts = new Map<string, number>()
  private disabledPlugins = new Set<string>()
  private lastTimeoutBurst: number[] = []
  
  // Observability
  private observabilityHooks?: EnhancedObservabilityHooks
  private debug: boolean

  constructor(
    limits: EnhancedResourceLimits = {}, 
    observabilityHooks?: EnhancedObservabilityHooks,
    debug: boolean = false
  ) {
    // Apply enhanced defaults
    this.limits = {
      maxConcurrentRequests: limits.maxConcurrentRequests ?? limits.maxConcurrentTasks ?? 10,
      maxQueueSize: limits.maxQueueSize ?? limits.maxQueueDepth ?? 50,
      requestTimeoutMs: limits.requestTimeoutMs ?? 30000,
      maxPayloadSize: limits.maxPayloadSize ?? 1024 * 1024,
      maxConcurrentTasks: limits.maxConcurrentTasks ?? limits.maxConcurrentRequests ?? 10,
      maxQueueDepth: limits.maxQueueDepth ?? limits.maxQueueSize ?? 50,
      queueOverflowStrategy: limits.queueOverflowStrategy ?? 'reject'
    }
    
    this.observabilityHooks = observabilityHooks
    this.debug = debug

    this.validateLimits()
    this.initializeMetrics()
    
    debugLog.lifecycle('constructor', 'EnhancedBoundedExecutor', {
      limits: this.limits,
      observabilityEnabled: !!this.observabilityHooks
    }, this.debug)
  }

  private initializeMetrics(): void {
    this.metrics = {
      queueSizeHistogram: [],
      maxQueueSizeReached: 0,
      totalEnqueued: 0,
      totalDequeued: 0,
      totalDropped: 0,
      executionLatencyHistogram: [],
      queueWaitTimeHistogram: [],
      totalExecutions: 0,
      totalTimeouts: 0,
      totalFailures: 0,
      pluginTimeouts: new Map(),
      pluginFailures: new Map(),
      disabledPlugins: new Set(),
      guardrailViolations: 0,
      consecutiveTimeouts: 0,
      peakQueueSize: 0,
      memoryPressureEvents: 0
    }
  }

  private validateLimits(): void {
    if (this.limits.maxConcurrentTasks < 1) {
      throw new InvalidConfigurationError('maxConcurrentTasks must be >= 1')
    }
    if (this.limits.maxQueueDepth < 0) {
      throw new InvalidConfigurationError('maxQueueDepth must be >= 0')
    }
    if (this.limits.requestTimeoutMs < 1) {
      throw new InvalidConfigurationError('requestTimeoutMs must be >= 1')
    }
    
    // Performance guardrail: Warn if queue depth exceeds 500 without overflow strategy
    if (this.limits.maxQueueDepth > 500 && this.limits.queueOverflowStrategy === 'reject') {
      debugLog.warn('Performance guardrail: Large queue depth without overflow strategy', {
        maxQueueDepth: this.limits.maxQueueDepth,
        recommendation: 'Consider setting queueOverflowStrategy to "dropOldest"'
      }, this.debug)
      
      this.metrics.guardrailViolations++
      this.observabilityHooks?.onPerformanceGuardrailViolation?.(
        'large_queue_without_overflow_strategy',
        { maxQueueDepth: this.limits.maxQueueDepth }
      )
    }
  }

  private recordQueueSize(): void {
    const queueSize = this.taskQueue.length
    this.metrics.queueSizeHistogram.push(queueSize)
    
    if (queueSize > this.metrics.peakQueueSize) {
      this.metrics.peakQueueSize = queueSize
    }
    
    if (queueSize > this.limits.maxQueueDepth * 0.8) {
      this.metrics.memoryPressureEvents++
      this.observabilityHooks?.onMemoryPressure?.(queueSize)
    }
    
    // Keep histogram bounded to prevent memory leaks
    if (this.metrics.queueSizeHistogram.length > 1000) {
      this.metrics.queueSizeHistogram = this.metrics.queueSizeHistogram.slice(-500)
    }
  }

  private recordExecutionLatency(duration: number, queueWaitTime: number): void {
    this.metrics.executionLatencyHistogram.push(duration)
    this.metrics.queueWaitTimeHistogram.push(queueWaitTime)
    
    // Keep histograms bounded
    if (this.metrics.executionLatencyHistogram.length > 1000) {
      this.metrics.executionLatencyHistogram = this.metrics.executionLatencyHistogram.slice(-500)
    }
    if (this.metrics.queueWaitTimeHistogram.length > 1000) {
      this.metrics.queueWaitTimeHistogram = this.metrics.queueWaitTimeHistogram.slice(-500)
    }
  }

  private checkPluginTimeout(pluginName?: string): void {
    if (!pluginName) return

    const now = Date.now()
    this.lastTimeoutBurst.push(now)
    
    // Keep only timeouts from last 5 seconds
    this.lastTimeoutBurst = this.lastTimeoutBurst.filter(time => now - time < 5000)
    
    // Track plugin-specific timeouts
    const currentCount = this.pluginTimeoutCounts.get(pluginName) || 0
    this.pluginTimeoutCounts.set(pluginName, currentCount + 1)
    this.metrics.pluginTimeouts.set(pluginName, currentCount + 1)
    
    // Check for timeout burst (3+ timeouts in 5 seconds)
    if (this.lastTimeoutBurst.length >= 3) {
      debugLog.warn('Performance guardrail: Timeout burst detected', {
        timeoutsInBurst: this.lastTimeoutBurst.length,
        pluginName,
        timeWindow: '5 seconds'
      }, this.debug)
      
      this.metrics.guardrailViolations++
      this.observabilityHooks?.onPerformanceGuardrailViolation?.(
        'timeout_burst',
        { 
          pluginName, 
          timeoutsInBurst: this.lastTimeoutBurst.length,
          timeWindow: 5000
        }
      )
    }
    
    // Disable plugin after excessive timeouts
    if (currentCount >= 5 && !this.disabledPlugins.has(pluginName)) {
      this.disablePlugin(pluginName, `Excessive timeouts: ${currentCount + 1}`)
    }
  }

  private disablePlugin(pluginName: string, reason: string): void {
    this.disabledPlugins.add(pluginName)
    this.metrics.disabledPlugins.add(pluginName)
    
    debugLog.warn('Plugin disabled due to reliability issues', {
      pluginName,
      reason,
      timeouts: this.pluginTimeoutCounts.get(pluginName) || 0,
      failures: this.pluginFailureCounts.get(pluginName) || 0
    }, this.debug)
    
    this.observabilityHooks?.onPluginDisabled?.(pluginName, reason)
  }

  private isPluginDisabled(pluginName?: string): boolean {
    return pluginName ? this.disabledPlugins.has(pluginName) : false
  }

  private handleQueueOverflow(newTask: QueuedTask<unknown>): boolean {
    if (this.limits.queueOverflowStrategy === 'dropOldest' && this.taskQueue.length > 0) {
      const droppedTask = this.taskQueue.shift()!
      this.metrics.totalDropped++
      
      debugLog.warn('Queue overflow: dropping oldest task', {
        droppedTaskId: droppedTask.id,
        newTaskId: newTask.id,
        queueSize: this.taskQueue.length,
        strategy: 'dropOldest'
      }, this.debug)
      
      // Reject the dropped task
      droppedTask.reject(new QueueFullError('Task dropped due to queue overflow (dropOldest strategy)'))
      
      this.observabilityHooks?.onQueueOverflow?.('dropOldest', droppedTask.id)
      return true
    }
    
    this.observabilityHooks?.onQueueOverflow?.('reject')
    return false
  }

  async execute<T>(
    taskId: string,
    taskFn: () => Promise<T>,
    payload?: unknown,
    options: {
      pluginName?: string
      priority?: number
      retryCount?: number
    } = {}
  ): Promise<T> {
    const queuedTime = Date.now()
    
    // Check if executor has been shutdown
    if (this.isShutdown) {
      throw new AgentShutdownError('EnhancedBoundedExecutor has been shutdown', {
        context: { taskId }
      })
    }

    // Check if plugin is disabled
    if (this.isPluginDisabled(options.pluginName)) {
      throw new ResourceExhaustedError(`Plugin ${options.pluginName} is disabled due to reliability issues`)
    }

    // Validate payload size
    if (payload !== undefined) {
      this.validatePayloadSize(payload)
    }

    // Check concurrency limits
    if (this.activeRequests >= this.limits.maxConcurrentTasks) {
      // Handle queue overflow
      if (this.taskQueue.length >= this.limits.maxQueueDepth) {
        if (!this.handleQueueOverflow({
          id: taskId,
          execute: taskFn,
          resolve: () => {},
          reject: () => {},
          payload,
          startTime: Date.now(),
          queuedTime,
          ...options
        })) {
          throw new QueueFullError(`Task queue (max: ${this.limits.maxQueueDepth})`)
        }
      }

      // Queue the task
      this.metrics.totalEnqueued++
      this.recordQueueSize()
      
      this.observabilityHooks?.onTaskQueued?.(taskId, this.taskQueue.length + 1)
      
      return new Promise<T>((resolve, reject) => {
        const queuedTask: QueuedTask<T> = {
          id: taskId,
          execute: taskFn,
          resolve,
          reject,
          payload,
          startTime: Date.now(),
          queuedTime,
          ...options
        }

        this.taskQueue.push(queuedTask as QueuedTask<unknown>)
      })
    }

    // Execute immediately
    return this.executeTaskDirectly(taskId, taskFn, queuedTime, options)
  }

  private async executeTaskDirectly<T>(
    taskId: string,
    taskFn: () => Promise<T>,
    queuedTime: number,
    options: { pluginName?: string } = {}
  ): Promise<T> {
    this.activeRequests++
    this.metrics.totalExecutions++
    
    const executionStartTime = Date.now()
    const queueWaitTime = executionStartTime - queuedTime
    
    this.observabilityHooks?.onTaskStarted?.(taskId, this.activeRequests, queueWaitTime)
    
    let timeoutId: NodeJS.Timeout | undefined

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = this.createTrackedTimeout(() => {
          this.metrics.totalTimeouts++
          this.checkPluginTimeout(options.pluginName)
          
          const timeoutError = new RequestTimeoutError(this.limits.requestTimeoutMs, {
            context: { taskId, pluginName: options.pluginName }
          })
          
          this.observabilityHooks?.onTaskTimeout?.(taskId, this.limits.requestTimeoutMs, options.pluginName)
          reject(timeoutError)
        }, this.limits.requestTimeoutMs)
      })

      const result = await Promise.race([taskFn(), timeoutPromise])
      
      const duration = Date.now() - executionStartTime
      this.recordExecutionLatency(duration, queueWaitTime)
      
      this.observabilityHooks?.onTaskCompleted?.(taskId, duration, queueWaitTime)
      return result
      
    } catch (error) {
      this.metrics.totalFailures++
      
      if (options.pluginName) {
        const currentFailures = this.pluginFailureCounts.get(options.pluginName) || 0
        this.pluginFailureCounts.set(options.pluginName, currentFailures + 1)
        this.metrics.pluginFailures.set(options.pluginName, currentFailures + 1)
      }
      
      this.observabilityHooks?.onTaskFailed?.(taskId, error as Error, options.pluginName)
      throw error
      
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
        this.activeTimeouts.delete(timeoutId)
      }
      
      this.activeRequests--
      
      if (!this.isShutdown) {
        this.processQueue()
      }
    }
  }

  private processQueue(): void {
    if (this.isProcessing) return
    this.isProcessing = true

    while (this.taskQueue.length > 0 && this.activeRequests < this.limits.maxConcurrentTasks) {
      const task = this.taskQueue.shift()!
      this.metrics.totalDequeued++
      this.executeQueuedTask(task)
    }

    this.isProcessing = false
  }

  private async executeQueuedTask<T>(task: QueuedTask<T>): Promise<void> {
    try {
      // Check if plugin was disabled while in queue
      if (this.isPluginDisabled(task.pluginName)) {
        task.reject(new ResourceExhaustedError(`Plugin ${task.pluginName} disabled while in queue`))
        return
      }

      const result = await this.executeTaskDirectly(
        task.id, 
        task.execute, 
        task.queuedTime, 
        { pluginName: task.pluginName }
      )
      task.resolve(result)
    } catch (error) {
      task.reject(error as Error)
    }
  }

  private calculatePayloadSize(payload: unknown): number {
    if (payload === null || payload === undefined) return 0
    
    try {
      return JSON.stringify(payload).length
    } catch {
      if (typeof payload === 'string') return payload.length
      return 100 // Default fallback
    }
  }

  private validatePayloadSize(payload: unknown): void {
    const size = this.calculatePayloadSize(payload)
    if (size > this.limits.maxPayloadSize) {
      throw new PayloadTooLargeError(size, this.limits.maxPayloadSize)
    }
  }

  private createTrackedTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    if (this.isShutdown) {
      throw new AgentShutdownError('Cannot create timeout after shutdown')
    }

    const timeout = setTimeout(() => {
      this.activeTimeouts.delete(timeout)
      if (!this.isShutdown) {
        callback()
      }
    }, delay)
    
    this.activeTimeouts.add(timeout)
    return timeout
  }

  getMetrics(): PerformanceMetrics {
    return {
      ...this.metrics,
      pluginTimeouts: new Map(this.metrics.pluginTimeouts),
      pluginFailures: new Map(this.metrics.pluginFailures),
      disabledPlugins: new Set(this.metrics.disabledPlugins)
    }
  }

  getStats() {
    const queueSizes = this.metrics.queueSizeHistogram
    const executionLatencies = this.metrics.executionLatencyHistogram
    const queueWaitTimes = this.metrics.queueWaitTimeHistogram
    
    return {
      activeRequests: this.activeRequests,
      queuedRequests: this.taskQueue.length,
      limits: { ...this.limits },
      
      // Performance statistics
      avgQueueSize: queueSizes.length > 0 ? queueSizes.reduce((a, b) => a + b, 0) / queueSizes.length : 0,
      peakQueueSize: this.metrics.peakQueueSize,
      
      avgExecutionLatency: executionLatencies.length > 0 ? 
        executionLatencies.reduce((a, b) => a + b, 0) / executionLatencies.length : 0,
      p50ExecutionLatency: this.calculatePercentile(executionLatencies, 50),
      p95ExecutionLatency: this.calculatePercentile(executionLatencies, 95),
      
      avgQueueWaitTime: queueWaitTimes.length > 0 ?
        queueWaitTimes.reduce((a, b) => a + b, 0) / queueWaitTimes.length : 0,
      
      // Reliability statistics
      totalExecutions: this.metrics.totalExecutions,
      totalTimeouts: this.metrics.totalTimeouts,
      totalFailures: this.metrics.totalFailures,
      timeoutRate: this.metrics.totalExecutions > 0 ? 
        this.metrics.totalTimeouts / this.metrics.totalExecutions : 0,
      
      // Plugin health
      disabledPlugins: Array.from(this.disabledPlugins),
      pluginTimeouts: Object.fromEntries(this.metrics.pluginTimeouts),
      pluginFailures: Object.fromEntries(this.metrics.pluginFailures),
      
      // Performance guardrails
      guardrailViolations: this.metrics.guardrailViolations,
      memoryPressureEvents: this.metrics.memoryPressureEvents,
      
      uptime: Date.now() - this.startTime
    }
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0
    
    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.ceil((percentile / 100) * sorted.length) - 1
    return sorted[Math.max(0, index)]
  }

  async shutdown(): Promise<void> {
    if (this.isShutdown) return

    this.isShutdown = true
    
    debugLog.lifecycle('shutdown start', 'EnhancedBoundedExecutor', {
      activeRequests: this.activeRequests,
      queuedRequests: this.taskQueue.length,
      metrics: this.getStats()
    }, this.debug)

    this.observabilityHooks?.onShutdown?.(this.activeRequests, this.taskQueue.length, this.metrics)

    // Clear timeouts
    for (const timeout of this.activeTimeouts) {
      clearTimeout(timeout)
    }
    this.activeTimeouts.clear()

    // Reject queued tasks
    const queuedTasks = [...this.taskQueue]
    this.taskQueue.length = 0
    
    for (const task of queuedTasks) {
      task.reject(new AgentShutdownError('EnhancedBoundedExecutor shutdown'))
    }

    // Wait for active requests with timeout
    const maxWaitTime = 5000
    const startTime = Date.now()
    
    while (this.activeRequests > 0 && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    debugLog.lifecycle('shutdown complete', 'EnhancedBoundedExecutor', {
      remainingActiveRequests: this.activeRequests,
      shutdownDuration: Date.now() - startTime
    }, this.debug)
  }
}