/**
 * RetryableExecutor - Exponential backoff retry for plugin execution
 * 
 * Provides intelligent retry logic for failed plugin operations with:
 * - Exponential backoff with jitter
 * - Retry budget tracking
 * - Plugin health scoring
 * - Circuit breaking for consistently failing plugins
 */

import { debugLog } from '../log'

export interface RetryConfig {
  maxRetries?: number
  initialDelayMs?: number
  maxDelayMs?: number
  backoffMultiplier?: number
  jitterMs?: number
  retryableErrors?: string[]
}

export interface RetryableTask<T> {
  id: string
  execute: () => Promise<T>
  pluginName?: string
  retryConfig?: RetryConfig
}

export interface PluginHealthMetrics {
  totalAttempts: number
  successfulAttempts: number
  failedAttempts: number
  retriedAttempts: number
  consecutiveFailures: number
  lastFailureTime?: number
  healthScore: number // 0-100, higher is better
  isCircuitOpen: boolean
}

export interface RetryObservabilityHooks {
  onRetryAttempt?(taskId: string, attempt: number, delay: number, error: Error): void
  onRetryExhausted?(taskId: string, finalError: Error, totalAttempts: number): void
  onRetrySuccess?(taskId: string, successAttempt: number, totalTime: number): void
  onPluginCircuitOpened?(pluginName: string, reason: string): void
  onPluginCircuitClosed?(pluginName: string): void
  onPluginHealthUpdated?(pluginName: string, metrics: PluginHealthMetrics): void
}

export class RetryableExecutor {
  private readonly defaultConfig: Required<RetryConfig>
  private pluginHealthMetrics = new Map<string, PluginHealthMetrics>()
  private observabilityHooks?: RetryObservabilityHooks
  private debug: boolean
  
  // Circuit breaker thresholds
  private readonly circuitBreakerThresholds = {
    failureThreshold: 0.5, // 50% failure rate
    minimumAttempts: 10,
    circuitResetTimeMs: 60000 // 1 minute
  }

  constructor(
    defaultConfig: RetryConfig = {},
    observabilityHooks?: RetryObservabilityHooks,
    debug: boolean = false
  ) {
    this.defaultConfig = {
      maxRetries: defaultConfig.maxRetries ?? 3,
      initialDelayMs: defaultConfig.initialDelayMs ?? 100,
      maxDelayMs: defaultConfig.maxDelayMs ?? 5000,
      backoffMultiplier: defaultConfig.backoffMultiplier ?? 2,
      jitterMs: defaultConfig.jitterMs ?? 50,
      retryableErrors: defaultConfig.retryableErrors ?? [
        'RequestTimeoutError',
        'ResourceExhaustedError',
        'TransportError',
        'TemporaryFailureError'
      ]
    }
    
    this.observabilityHooks = observabilityHooks
    this.debug = debug
  }

  async execute<T>(task: RetryableTask<T>): Promise<T> {
    const config = { ...this.defaultConfig, ...task.retryConfig }
    const startTime = Date.now()
    let lastError: Error | undefined
    
    // Check circuit breaker
    if (task.pluginName && this.isCircuitOpen(task.pluginName)) {
      throw new Error(`Circuit breaker open for plugin: ${task.pluginName}`)
    }
    
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        debugLog.operation('retry attempt', {
          taskId: task.id,
          attempt: attempt + 1,
          maxRetries: config.maxRetries + 1,
          pluginName: task.pluginName
        }, this.debug)
        
        const result = await task.execute()
        
        // Success - update metrics and return
        const totalTime = Date.now() - startTime
        this.recordSuccess(task.pluginName, attempt, totalTime)
        
        if (attempt > 0) {
          this.observabilityHooks?.onRetrySuccess?.(task.id, attempt + 1, totalTime)
        }
        
        return result
        
      } catch (error) {
        lastError = error as Error
        
        // Record failure
        const err = error instanceof Error ? error : new Error(String(error))
        this.recordFailure(task.pluginName, err)
        
        // Check if error is retryable
        if (!this.isRetryableError(err, config)) {
          debugLog.warn('non-retryable error', {
            taskId: task.id,
            error: err.message,
            pluginName: task.pluginName
          }, this.debug)
          break
        }
        
        // Don't retry on last attempt
        if (attempt === config.maxRetries) {
          break
        }
        
        // Calculate delay with exponential backoff and jitter
        const baseDelay = Math.min(
          config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
          config.maxDelayMs
        )
        const jitter = Math.random() * config.jitterMs
        const delay = Math.floor(baseDelay + jitter)
        
        debugLog.warn('retrying after delay', {
          taskId: task.id,
          attempt: attempt + 1,
          delay,
          error: err.message,
          pluginName: task.pluginName
        }, this.debug)
        
        this.observabilityHooks?.onRetryAttempt?.(task.id, attempt + 1, delay, err)
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    
    // All retries exhausted
    this.observabilityHooks?.onRetryExhausted?.(task.id, lastError!, config.maxRetries + 1)
    
    debugLog.error('retry exhausted', lastError!, this.debug)
    throw lastError!
  }

  private isRetryableError(error: Error, config: Required<RetryConfig>): boolean {
    // Check if error type is in retryable list
    const errorTypeName = error.constructor.name
    return config.retryableErrors.includes(errorTypeName) ||
           config.retryableErrors.some(retryableType => error.message.includes(retryableType))
  }

  private recordSuccess(pluginName?: string, attempt?: number, totalTime?: number): void {
    if (!pluginName) return
    
    const metrics = this.getOrCreatePluginMetrics(pluginName)
    metrics.totalAttempts++
    metrics.successfulAttempts++
    metrics.consecutiveFailures = 0 // Reset consecutive failures
    
    if (attempt && attempt > 0) {
      metrics.retriedAttempts++
    }
    
    this.updatePluginHealth(pluginName, metrics)
  }

  private recordFailure(pluginName?: string, error?: Error): void {
    if (!pluginName) return
    
    const metrics = this.getOrCreatePluginMetrics(pluginName)
    metrics.totalAttempts++
    metrics.failedAttempts++
    metrics.consecutiveFailures++
    metrics.lastFailureTime = Date.now()
    
    this.updatePluginHealth(pluginName, metrics)
    this.checkCircuitBreaker(pluginName, metrics)
  }

  private getOrCreatePluginMetrics(pluginName: string): PluginHealthMetrics {
    if (!this.pluginHealthMetrics.has(pluginName)) {
      this.pluginHealthMetrics.set(pluginName, {
        totalAttempts: 0,
        successfulAttempts: 0,
        failedAttempts: 0,
        retriedAttempts: 0,
        consecutiveFailures: 0,
        healthScore: 100,
        isCircuitOpen: false
      })
    }
    return this.pluginHealthMetrics.get(pluginName)!
  }

  private updatePluginHealth(pluginName: string, metrics: PluginHealthMetrics): void {
    // Calculate health score (0-100)
    if (metrics.totalAttempts === 0) {
      metrics.healthScore = 100
    } else {
      const successRate = metrics.successfulAttempts / metrics.totalAttempts
      const retryPenalty = metrics.retriedAttempts / metrics.totalAttempts * 0.2 // 20% penalty for retries
      const consecutiveFailurePenalty = Math.min(metrics.consecutiveFailures * 10, 50) // Up to 50% penalty
      
      metrics.healthScore = Math.max(0, Math.round(
        (successRate * 100) - (retryPenalty * 100) - consecutiveFailurePenalty
      ))
    }
    
    this.observabilityHooks?.onPluginHealthUpdated?.(pluginName, { ...metrics })
    
    debugLog.operation('plugin health updated', {
      pluginName,
      healthScore: metrics.healthScore,
      successRate: metrics.totalAttempts > 0 ? metrics.successfulAttempts / metrics.totalAttempts : 0,
      consecutiveFailures: metrics.consecutiveFailures
    }, this.debug)
  }

  private checkCircuitBreaker(pluginName: string, metrics: PluginHealthMetrics): void {
    const { failureThreshold, minimumAttempts } = this.circuitBreakerThresholds
    
    // Only consider circuit breaking after minimum attempts
    if (metrics.totalAttempts < minimumAttempts) {
      return
    }
    
    const failureRate = metrics.failedAttempts / metrics.totalAttempts
    
    // Open circuit if failure rate exceeds threshold
    if (!metrics.isCircuitOpen && failureRate >= failureThreshold) {
      metrics.isCircuitOpen = true
      
      debugLog.warn('circuit breaker opened', {
        pluginName,
        failureRate,
        threshold: failureThreshold,
        totalAttempts: metrics.totalAttempts,
        failedAttempts: metrics.failedAttempts
      }, this.debug)
      
      this.observabilityHooks?.onPluginCircuitOpened?.(
        pluginName, 
        `Failure rate ${Math.round(failureRate * 100)}% exceeded threshold ${Math.round(failureThreshold * 100)}%`
      )
    }
  }

  private isCircuitOpen(pluginName: string): boolean {
    const metrics = this.pluginHealthMetrics.get(pluginName)
    if (!metrics || !metrics.isCircuitOpen) {
      return false
    }
    
    // Check if circuit should reset
    const now = Date.now()
    const timeSinceLastFailure = metrics.lastFailureTime ? now - metrics.lastFailureTime : 0
    
    if (timeSinceLastFailure >= this.circuitBreakerThresholds.circuitResetTimeMs) {
      metrics.isCircuitOpen = false
      metrics.consecutiveFailures = 0
      
      debugLog.operation('circuit breaker closed', {
        pluginName,
        timeSinceLastFailure,
        resetTimeMs: this.circuitBreakerThresholds.circuitResetTimeMs
      }, this.debug)
      
      this.observabilityHooks?.onPluginCircuitClosed?.(pluginName)
      
      return false
    }
    
    return true
  }

  getPluginHealth(pluginName?: string): PluginHealthMetrics | Map<string, PluginHealthMetrics> {
    if (pluginName) {
      return this.pluginHealthMetrics.get(pluginName) || this.getOrCreatePluginMetrics(pluginName)
    }
    return new Map(this.pluginHealthMetrics)
  }

  getHealthyPlugins(): string[] {
    return Array.from(this.pluginHealthMetrics.entries())
      .filter(([_, metrics]) => metrics.healthScore >= 70 && !metrics.isCircuitOpen)
      .map(([pluginName, _]) => pluginName)
  }

  getUnhealthyPlugins(): string[] {
    return Array.from(this.pluginHealthMetrics.entries())
      .filter(([_, metrics]) => metrics.healthScore < 50 || metrics.isCircuitOpen)
      .map(([pluginName, _]) => pluginName)
  }

  resetPluginHealth(pluginName: string): void {
    this.pluginHealthMetrics.delete(pluginName)
    debugLog.operation('plugin health reset', { pluginName }, this.debug)
  }

  getStats() {
    const allMetrics = Array.from(this.pluginHealthMetrics.values())
    
    return {
      totalPlugins: this.pluginHealthMetrics.size,
      healthyPlugins: this.getHealthyPlugins().length,
      unhealthyPlugins: this.getUnhealthyPlugins().length,
      openCircuits: allMetrics.filter(m => m.isCircuitOpen).length,
      
      totalAttempts: allMetrics.reduce((sum, m) => sum + m.totalAttempts, 0),
      totalSuccesses: allMetrics.reduce((sum, m) => sum + m.successfulAttempts, 0),
      totalFailures: allMetrics.reduce((sum, m) => sum + m.failedAttempts, 0),
      totalRetries: allMetrics.reduce((sum, m) => sum + m.retriedAttempts, 0),
      
      avgHealthScore: allMetrics.length > 0 ? 
        allMetrics.reduce((sum, m) => sum + m.healthScore, 0) / allMetrics.length : 100,
      
      successRate: allMetrics.reduce((sum, m) => sum + m.totalAttempts, 0) > 0 ?
        allMetrics.reduce((sum, m) => sum + m.successfulAttempts, 0) / 
        allMetrics.reduce((sum, m) => sum + m.totalAttempts, 0) : 0,
      
      retryRate: allMetrics.reduce((sum, m) => sum + m.totalAttempts, 0) > 0 ?
        allMetrics.reduce((sum, m) => sum + m.retriedAttempts, 0) / 
        allMetrics.reduce((sum, m) => sum + m.totalAttempts, 0) : 0
    }
  }
}