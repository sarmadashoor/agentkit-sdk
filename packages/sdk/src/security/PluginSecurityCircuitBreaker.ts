/**
 * Plugin Security Circuit Breaker
 * 
 * Implements circuit breaker pattern specifically for plugin security violations.
 * Automatically disables plugins that exhibit suspicious behavior or repeated
 * security violations to protect the overall system integrity.
 * 
 * @security This module implements critical security boundaries
 */

import { EventEmitter } from 'events'

/**
 * Security violation types tracked by the circuit breaker
 */
export type SecurityViolationType = 
  | 'forbidden-api-access'
  | 'prototype-pollution'
  | 'eval-usage'
  | 'memory-limit-exceeded'
  | 'timeout-exceeded'
  | 'static-analysis-failure'
  | 'execution-error'
  | 'suspicious-code-pattern'

/**
 * Security violation event data
 */
export interface SecurityViolationEvent {
  pluginName: string
  violationType: SecurityViolationType
  message: string
  timestamp: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  metadata?: Record<string, any>
}

/**
 * Circuit breaker state
 */
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

/**
 * Plugin security statistics
 */
export interface PluginSecurityStats {
  totalViolations: number
  violationsByType: Record<SecurityViolationType, number>
  lastViolationTime: number
  consecutiveViolations: number
  isBlocked: boolean
  circuitBreakerState: CircuitBreakerState
  riskScore: number
}

/**
 * Circuit breaker configuration
 */
export interface SecurityCircuitBreakerConfig {
  /** Maximum violations before opening circuit */
  maxViolations: number
  /** Time window for violation counting (ms) */
  violationWindow: number
  /** Time to wait before attempting recovery (ms) */
  recoveryTimeout: number
  /** Maximum consecutive violations before permanent block */
  maxConsecutiveViolations: number
  /** Enable automatic plugin blocking */
  enableAutoBlocking: boolean
  /** Risk score threshold for blocking (0-100) */
  riskScoreThreshold: number
}

/**
 * Default circuit breaker configuration
 */
const DEFAULT_CONFIG: SecurityCircuitBreakerConfig = {
  maxViolations: 5,
  violationWindow: 60000, // 1 minute
  recoveryTimeout: 300000, // 5 minutes
  maxConsecutiveViolations: 3,
  enableAutoBlocking: true,
  riskScoreThreshold: 75
}

/**
 * Security circuit breaker for plugin execution
 */
export class PluginSecurityCircuitBreaker extends EventEmitter {
  private config: SecurityCircuitBreakerConfig
  private pluginStats = new Map<string, PluginSecurityStats>()
  private pluginStates = new Map<string, CircuitBreakerState>()
  private recoveryTimers = new Map<string, NodeJS.Timeout>()
  private blockedPlugins = new Set<string>()

  constructor(config: Partial<SecurityCircuitBreakerConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Record a security violation for a plugin
   */
  recordViolation(violation: SecurityViolationEvent): void {
    const pluginName = violation.pluginName
    const currentTime = Date.now()

    // Initialize plugin stats if not exists
    if (!this.pluginStats.has(pluginName)) {
      this.pluginStats.set(pluginName, {
        totalViolations: 0,
        violationsByType: {} as Record<SecurityViolationType, number>,
        lastViolationTime: 0,
        consecutiveViolations: 0,
        isBlocked: false,
        circuitBreakerState: 'CLOSED',
        riskScore: 0
      })
      this.pluginStates.set(pluginName, 'CLOSED')
    }

    const stats = this.pluginStats.get(pluginName)!

    // Update violation counts
    stats.totalViolations++
    stats.violationsByType[violation.violationType] = 
      (stats.violationsByType[violation.violationType] || 0) + 1
    stats.lastViolationTime = currentTime

    // Check if violations are consecutive
    if (currentTime - stats.lastViolationTime < this.config.violationWindow) {
      stats.consecutiveViolations++
    } else {
      stats.consecutiveViolations = 1
    }

    // Calculate risk score
    stats.riskScore = this.calculateRiskScore(stats, violation)

    // Emit violation event
    this.emit('securityViolation', violation)

    // Check if we should open the circuit breaker
    if (this.shouldOpenCircuit(stats, violation)) {
      this.openCircuit(pluginName)
    }

    // Check if plugin should be permanently blocked
    if (this.shouldBlockPlugin(stats, violation)) {
      this.blockPlugin(pluginName)
    }

    // Log security event
    console.warn(`[SecurityCircuitBreaker] ${violation.severity.toUpperCase()} violation from plugin ${pluginName}: ${violation.message}`)
  }

  /**
   * Check if a plugin is allowed to execute
   */
  isPluginAllowed(pluginName: string): boolean {
    // Check if plugin is permanently blocked
    if (this.blockedPlugins.has(pluginName)) {
      return false
    }

    // Check circuit breaker state
    const state = this.pluginStates.get(pluginName) || 'CLOSED'
    return state !== 'OPEN'
  }

  /**
   * Get security statistics for a plugin
   */
  getPluginStats(pluginName: string): PluginSecurityStats | null {
    return this.pluginStats.get(pluginName) || null
  }

  /**
   * Get all plugin security statistics
   */
  getAllStats(): Map<string, PluginSecurityStats> {
    return new Map(this.pluginStats)
  }

  /**
   * Reset circuit breaker for a plugin (admin operation)
   */
  resetPlugin(pluginName: string): void {
    this.pluginStats.delete(pluginName)
    this.pluginStates.set(pluginName, 'CLOSED')
    this.blockedPlugins.delete(pluginName)
    
    // Clear recovery timer
    const timer = this.recoveryTimers.get(pluginName)
    if (timer) {
      clearTimeout(timer)
      this.recoveryTimers.delete(pluginName)
    }

    this.emit('pluginReset', { pluginName })
    console.info(`[SecurityCircuitBreaker] Plugin ${pluginName} has been reset`)
  }

  /**
   * Calculate risk score for a plugin based on violations
   */
  private calculateRiskScore(stats: PluginSecurityStats, violation: SecurityViolationEvent): number {
    let score = 0

    // Base score from violation count
    score += Math.min(stats.totalViolations * 10, 50)

    // Severity multiplier
    const severityMultipliers = {
      low: 1,
      medium: 1.5,
      high: 2,
      critical: 3
    }
    score *= severityMultipliers[violation.severity]

    // Consecutive violations penalty
    score += stats.consecutiveViolations * 5

    // Critical violation types get extra penalty
    const criticalTypes: SecurityViolationType[] = [
      'prototype-pollution',
      'eval-usage',
      'forbidden-api-access'
    ]
    if (criticalTypes.includes(violation.violationType)) {
      score += 20
    }

    // Recent violations penalty
    const timeSinceLastViolation = Date.now() - stats.lastViolationTime
    if (timeSinceLastViolation < 60000) { // Within 1 minute
      score += 15
    }

    return Math.min(Math.round(score), 100)
  }

  /**
   * Determine if circuit should be opened
   */
  private shouldOpenCircuit(stats: PluginSecurityStats, violation: SecurityViolationEvent): boolean {
    // Critical violations immediately open circuit
    if (violation.severity === 'critical') {
      return true
    }

    // Too many violations in window
    if (stats.totalViolations >= this.config.maxViolations) {
      return true
    }

    // High risk score
    if (stats.riskScore >= this.config.riskScoreThreshold) {
      return true
    }

    return false
  }

  /**
   * Determine if plugin should be permanently blocked
   */
  private shouldBlockPlugin(stats: PluginSecurityStats, violation: SecurityViolationEvent): boolean {
    if (!this.config.enableAutoBlocking) {
      return false
    }

    // Too many consecutive violations
    if (stats.consecutiveViolations >= this.config.maxConsecutiveViolations) {
      return true
    }

    // Critical security violations
    const blockingTypes: SecurityViolationType[] = [
      'prototype-pollution',
      'eval-usage'
    ]
    if (blockingTypes.includes(violation.violationType) && violation.severity === 'critical') {
      return true
    }

    return false
  }

  /**
   * Open circuit for a plugin
   */
  private openCircuit(pluginName: string): void {
    this.pluginStates.set(pluginName, 'OPEN')
    
    const stats = this.pluginStats.get(pluginName)!
    stats.circuitBreakerState = 'OPEN'

    // Set recovery timer
    const timer = setTimeout(() => {
      this.attemptRecovery(pluginName)
    }, this.config.recoveryTimeout)
    
    this.recoveryTimers.set(pluginName, timer)

    this.emit('circuitOpened', { pluginName, stats })
    console.warn(`[SecurityCircuitBreaker] Circuit opened for plugin ${pluginName}`)
  }

  /**
   * Attempt circuit recovery
   */
  private attemptRecovery(pluginName: string): void {
    const currentState = this.pluginStates.get(pluginName)
    if (currentState !== 'OPEN') {
      return
    }

    // Move to half-open state
    this.pluginStates.set(pluginName, 'HALF_OPEN')
    
    const stats = this.pluginStats.get(pluginName)!
    stats.circuitBreakerState = 'HALF_OPEN'

    this.emit('circuitHalfOpen', { pluginName })
    console.info(`[SecurityCircuitBreaker] Circuit half-open for plugin ${pluginName}`)
  }

  /**
   * Permanently block a plugin
   */
  private blockPlugin(pluginName: string): void {
    this.blockedPlugins.add(pluginName)
    
    const stats = this.pluginStats.get(pluginName)!
    stats.isBlocked = true

    this.emit('pluginBlocked', { pluginName, stats })
    console.error(`[SecurityCircuitBreaker] Plugin ${pluginName} has been permanently blocked`)
  }

  /**
   * Get circuit breaker statistics
   */
  getGlobalStats(): {
    totalPlugins: number
    blockedPlugins: number
    openCircuits: number
    totalViolations: number
    violationsByType: Record<SecurityViolationType, number>
  } {
    const totalViolations = Array.from(this.pluginStats.values())
      .reduce((sum, stats) => sum + stats.totalViolations, 0)

    const violationsByType: Record<SecurityViolationType, number> = {} as any
    for (const stats of this.pluginStats.values()) {
      for (const [type, count] of Object.entries(stats.violationsByType)) {
        violationsByType[type as SecurityViolationType] = 
          (violationsByType[type as SecurityViolationType] || 0) + count
      }
    }

    return {
      totalPlugins: this.pluginStats.size,
      blockedPlugins: this.blockedPlugins.size,
      openCircuits: Array.from(this.pluginStates.values()).filter(state => state === 'OPEN').length,
      totalViolations,
      violationsByType
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    // Clear all timers
    for (const timer of this.recoveryTimers.values()) {
      clearTimeout(timer)
    }
    this.recoveryTimers.clear()

    // Clear all data
    this.pluginStats.clear()
    this.pluginStates.clear()
    this.blockedPlugins.clear()

    // Remove all listeners
    this.removeAllListeners()
  }
}