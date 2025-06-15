/**
 * SnapshotLoggingPlugin - A realistic example of how external teams would
 * create custom plugins for the AgentKit SDK
 * 
 * This plugin provides enhanced logging specifically tailored for snapshot operations
 */

// IMPORTANT: Only importing from public SDK API
import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/sdk'

export interface SnapshotLoggingConfig {
  /** Log level threshold */
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
  /** Include request/response payloads in logs */
  includePayloads?: boolean
  /** Include full context in logs */
  includeContext?: boolean
  /** Custom log prefix */
  logPrefix?: string
  /** Enable performance metrics */
  enableMetrics?: boolean
}

interface PerformanceMetrics {
  totalRequests: number
  totalErrors: number
  averageResponseTime: number
  lastRequestTime?: number
  requestTimes: number[]
}

export class SnapshotLoggingPlugin implements AgentKitPlugin {
  readonly name = 'snapshot-logging-plugin'
  readonly version = '1.0.0'
  readonly description = 'Enhanced logging plugin specifically designed for snapshot agents'

  private config: Required<SnapshotLoggingConfig>
  private metrics: PerformanceMetrics
  private sessionStartTime: number

  constructor(config: SnapshotLoggingConfig = {}) {
    this.config = {
      logLevel: config.logLevel ?? 'info',
      includePayloads: config.includePayloads ?? false,
      includeContext: config.includeContext ?? true,
      logPrefix: config.logPrefix ?? '[SnapshotAgent]',
      enableMetrics: config.enableMetrics ?? true
    }

    this.metrics = {
      totalRequests: 0,
      totalErrors: 0,
      averageResponseTime: 0,
      requestTimes: []
    }

    this.sessionStartTime = Date.now()
  }

  onInit(context: AgentContext): void {
    this.log('info', '🚀 Agent session started', {
      agentId: context.agentId,
      transportId: context.transportId,
      sessionId: context.requestId,
      timestamp: new Date(context.timestamp).toISOString(),
      ...(this.config.includeContext ? { fullContext: context } : {})
    })

    if (this.config.enableMetrics) {
      this.log('debug', '📊 Performance metrics enabled')
    }
  }

  onSend(payload: SendPayload, context: AgentContext): void {
    this.metrics.totalRequests++
    this.metrics.lastRequestTime = Date.now()

    // Extract snapshot-specific information
    const snapshotInfo = this.extractSnapshotInfo(payload.input)

    this.log('info', '📤 Sending request to agent', {
      requestId: context.requestId,
      agentId: context.agentId,
      requestNumber: this.metrics.totalRequests,
      snapshotAction: snapshotInfo.action,
      snapshotId: snapshotInfo.snapshotId,
      hasData: snapshotInfo.hasData,
      timestamp: new Date(context.timestamp).toISOString(),
      ...(this.config.includePayloads ? { payload } : {}),
      ...(this.config.includeContext ? { context } : {})
    })

    // Log specific warnings for snapshot operations
    if (snapshotInfo.action === 'delete') {
      this.log('warn', '⚠️ Destructive operation: deleting snapshot', {
        snapshotId: snapshotInfo.snapshotId
      })
    }

    if (snapshotInfo.action === 'create' && !snapshotInfo.hasData) {
      this.log('warn', '⚠️ Creating snapshot without data', {
        requestId: context.requestId
      })
    }
  }

  onError(error: Error, context: AgentContext): void {
    this.metrics.totalErrors++

    // Calculate response time if we have a start time
    let responseTime: number | undefined
    if (this.metrics.lastRequestTime) {
      responseTime = Date.now() - this.metrics.lastRequestTime
      this.updateResponseTimeMetrics(responseTime)
    }

    this.log('error', '❌ Agent operation failed', {
      requestId: context.requestId,
      agentId: context.agentId,
      errorMessage: error.message,
      errorType: error.constructor.name,
      responseTime,
      totalErrors: this.metrics.totalErrors,
      errorRate: this.calculateErrorRate(),
      timestamp: new Date(context.timestamp).toISOString(),
      stackTrace: this.config.logLevel === 'debug' ? error.stack : undefined,
      ...(this.config.includeContext ? { context } : {})
    })

    // Special handling for common snapshot errors
    if (error.message.includes('Snapshot not found')) {
      this.log('warn', '🔍 Snapshot not found - check if ID is correct')
    }

    if (error.message.includes('Storage limit reached')) {
      this.log('warn', '💾 Storage limit reached - consider cleanup')
    }
  }

  onShutdown(context: AgentContext): void {
    const sessionDuration = Date.now() - this.sessionStartTime
    const successRate = this.calculateSuccessRate()

    this.log('info', '🏁 Agent session ended', {
      agentId: context.agentId,
      sessionId: context.requestId,
      sessionDuration: `${sessionDuration}ms`,
      totalRequests: this.metrics.totalRequests,
      totalErrors: this.metrics.totalErrors,
      successRate: `${(successRate * 100).toFixed(1)}%`,
      averageResponseTime: `${this.metrics.averageResponseTime.toFixed(1)}ms`,
      timestamp: new Date(context.timestamp).toISOString(),
      ...(this.config.includeContext ? { context } : {})
    })

    // Log performance summary if metrics are enabled
    if (this.config.enableMetrics && this.metrics.totalRequests > 0) {
      this.logPerformanceSummary()
    }
  }

  /**
   * Get current plugin metrics
   */
  getMetrics(): PerformanceMetrics & { successRate: number; sessionDuration: number } {
    return {
      ...this.metrics,
      successRate: this.calculateSuccessRate(),
      sessionDuration: Date.now() - this.sessionStartTime
    }
  }

  // Private helper methods

  private log(level: string, message: string, data?: any): void {
    if (!this.shouldLog(level)) {
      return
    }

    const timestamp = new Date().toISOString()
    const logMessage = `${this.config.logPrefix} [${timestamp}] ${message}`

    switch (level) {
      case 'debug':
        console.debug(logMessage, data || '')
        break
      case 'info':
        console.log(logMessage, data || '')
        break
      case 'warn':
        console.warn(logMessage, data || '')
        break
      case 'error':
        console.error(logMessage, data || '')
        break
    }
  }

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error']
    const currentLevelIndex = levels.indexOf(this.config.logLevel)
    const messageLevelIndex = levels.indexOf(level)
    
    return messageLevelIndex >= currentLevelIndex
  }

  private extractSnapshotInfo(input: unknown): {
    action?: string
    snapshotId?: string
    hasData: boolean
  } {
    if (!input || typeof input !== 'object') {
      return { hasData: false }
    }

    const request = input as any
    return {
      action: request.action,
      snapshotId: request.snapshotId,
      hasData: !!request.data
    }
  }

  private updateResponseTimeMetrics(responseTime: number): void {
    this.metrics.requestTimes.push(responseTime)
    
    // Keep only last 100 response times for rolling average
    if (this.metrics.requestTimes.length > 100) {
      this.metrics.requestTimes.shift()
    }

    // Recalculate average
    this.metrics.averageResponseTime = 
      this.metrics.requestTimes.reduce((sum, time) => sum + time, 0) / 
      this.metrics.requestTimes.length
  }

  private calculateErrorRate(): number {
    if (this.metrics.totalRequests === 0) return 0
    return this.metrics.totalErrors / this.metrics.totalRequests
  }

  private calculateSuccessRate(): number {
    if (this.metrics.totalRequests === 0) return 1
    return (this.metrics.totalRequests - this.metrics.totalErrors) / this.metrics.totalRequests
  }

  private logPerformanceSummary(): void {
    const summary = {
      requestsPerSecond: this.metrics.totalRequests / (Date.now() - this.sessionStartTime) * 1000,
      errorRate: `${(this.calculateErrorRate() * 100).toFixed(1)}%`,
      averageResponseTime: `${this.metrics.averageResponseTime.toFixed(1)}ms`,
      slowestRequest: Math.max(...this.metrics.requestTimes),
      fastestRequest: Math.min(...this.metrics.requestTimes)
    }

    this.log('info', '📊 Performance Summary', summary)
  }
}