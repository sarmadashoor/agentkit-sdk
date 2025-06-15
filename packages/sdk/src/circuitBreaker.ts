/**
 * CircuitBreaker - Fault tolerance utility for AgentKit SDK
 * Implements circuit breaker pattern with failure tracking, timeout, and half-open state
 */

import { debugLog } from './log'
import { CircuitBreakerError, CircuitBreakerConfigError } from './errors'
import { AsyncLock } from './utils/AsyncLock'

/**
 * State transition event data
 */
export interface StateTransitionEvent {
  circuitName: string
  fromState: CircuitState
  toState: CircuitState
  timestamp: number
  reason: string
  metadata?: Record<string, unknown>
}

/**
 * Circuit breaker observability hooks
 */
export interface CircuitBreakerObservabilityHooks {
  /** Called when circuit opens */
  onCircuitOpen?(event: StateTransitionEvent): void
  /** Called when circuit closes */
  onCircuitClose?(event: StateTransitionEvent): void
  /** Called when circuit transitions to half-open */
  onCircuitHalfOpen?(event: StateTransitionEvent): void
  /** Called when a request is rejected due to open circuit */
  onRequestRejected?(circuitName: string, rejectedCount: number): void
  /** Called on successful request execution */
  onRequestSuccess?(circuitName: string, responseTime: number): void
  /** Called on failed request execution */
  onRequestFailure?(circuitName: string, error: Error, responseTime: number): void
}

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit */
  failureThreshold?: number
  /** Timeout in milliseconds before transitioning to half-open */
  timeout?: number
  /** Whether circuit breaker is enabled (feature flag) */
  enabled?: boolean
  /** Name for logging and metrics */
  name?: string
  /** Enable debug logging */
  debug?: boolean
  /** Number of successful requests needed to close from half-open (default: 1) */
  recoveryThreshold?: number
  /** Maximum time window to track failure rate (ms) */
  failureWindow?: number
  /** Observability hooks for monitoring */
  observabilityHooks?: CircuitBreakerObservabilityHooks
}

export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open'
}

export interface CircuitBreakerStats {
  state: CircuitState
  failureCount: number
  successCount: number
  recoverySuccessCount: number
  lastFailureTime?: number
  lastSuccessTime?: number
  openedAt?: number
  nextAttemptAt?: number
  stateTransitions: number
  currentStateStartTime: number
}

export interface CircuitBreakerMetrics {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  rejectedRequests: number
  stateTransitions: number
  averageResponseTime: number
  uptime: number
}


export class CircuitBreaker {
  private readonly options: Required<Omit<CircuitBreakerOptions, 'observabilityHooks'>>
  private state: CircuitState = CircuitState.CLOSED
  private failureCount = 0
  private successCount = 0
  private lastFailureTime?: number
  private lastSuccessTime?: number
  private openedAt?: number
  private createdAt: number = Date.now()
  
  // Metrics tracking
  private totalRequests = 0
  private rejectedRequests = 0
  private stateTransitions = 0
  private responseTimes: number[] = []

  private readonly observabilityHooks?: CircuitBreakerObservabilityHooks
  private readonly stateTransitionHistory: StateTransitionEvent[] = []
  private recoverySuccessCount = 0
  
  // Memory leak prevention - track active timers
  private activeTimeouts = new Set<NodeJS.Timeout>()
  private isShutdown = false
  
  // Atomic state management - prevents race conditions in concurrent scenarios
  private readonly stateLock = new AsyncLock()

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      timeout: options.timeout ?? 60000, // 60 seconds
      enabled: options.enabled ?? false,
      name: options.name ?? 'default',
      debug: options.debug ?? false,
      recoveryThreshold: options.recoveryThreshold ?? 1,
      failureWindow: options.failureWindow ?? 300000 // 5 minutes
    }
    
    this.observabilityHooks = options.observabilityHooks
    this.validateOptions()
  }

  private validateOptions(): void {
    if (this.options.failureThreshold < 1) {
      throw new CircuitBreakerConfigError('failureThreshold', 'must be >= 1', {
        context: { value: this.options.failureThreshold }
      })
    }
    if (this.options.timeout < 1) {
      throw new CircuitBreakerConfigError('timeout', 'must be >= 1', {
        context: { value: this.options.timeout }
      })
    }
    if (this.options.recoveryThreshold < 1) {
      throw new CircuitBreakerConfigError('recoveryThreshold', 'must be >= 1', {
        context: { value: this.options.recoveryThreshold }
      })
    }
    if (this.options.failureWindow < 1) {
      throw new CircuitBreakerConfigError('failureWindow', 'must be >= 1', {
        context: { value: this.options.failureWindow }
      })
    }
  }

  /**
   * Check if circuit breaker is enabled
   */
  isEnabled(): boolean {
    return this.options.enabled
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    const lastTransition = this.stateTransitionHistory[this.stateTransitionHistory.length - 1]
    
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      recoverySuccessCount: this.recoverySuccessCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      openedAt: this.openedAt,
      nextAttemptAt: this.getNextAttemptTime(),
      stateTransitions: this.stateTransitions,
      currentStateStartTime: lastTransition?.timestamp || this.createdAt
    }
  }

  /**
   * Get the next time a request can be attempted
   */
  private getNextAttemptTime(): number | undefined {
    if (this.state !== CircuitState.OPEN || !this.openedAt) {
      return undefined
    }
    return this.openedAt + this.options.timeout
  }

  /**
   * Check if the circuit should transition from OPEN to HALF_OPEN
   */
  private shouldAttemptReset(): boolean {
    if (this.state !== CircuitState.OPEN || !this.openedAt) {
      return false
    }
    return Date.now() >= this.openedAt + this.options.timeout
  }

  /**
   * Transition circuit to OPEN state (atomic operation)
   */
  private async openCircuit(reason: string = 'failure threshold exceeded'): Promise<void> {
    await this.stateLock.lock(async () => {
      // Double-check state hasn't changed while waiting for lock
      if (this.state === CircuitState.OPEN) {
        return // Already open, no need to transition
      }
      
      const previousState = this.state
      this.state = CircuitState.OPEN
      this.openedAt = Date.now()
      this.stateTransitions++
      this.recoverySuccessCount = 0 // Reset recovery counter
      
      const event: StateTransitionEvent = {
        circuitName: this.options.name,
        fromState: previousState,
        toState: this.state,
        timestamp: this.openedAt,
        reason,
        metadata: {
          failureCount: this.failureCount,
          threshold: this.options.failureThreshold
        }
      }
      
      this.stateTransitionHistory.push(event)
      this.observabilityHooks?.onCircuitOpen?.(event)
      
      debugLog.operation('circuit breaker opened', {
        name: this.options.name,
        previousState,
        newState: this.state,
        failureCount: this.failureCount,
        threshold: this.options.failureThreshold,
        reason
      }, this.options.debug)
      
      debugLog.warn('CircuitBreaker opened', {
        name: this.options.name,
        reason,
        failureCount: this.failureCount
      }, this.options.debug)
    })
  }

  /**
   * Transition circuit to HALF_OPEN state (atomic operation)
   */
  private async halfOpenCircuit(reason: string = 'timeout expired'): Promise<void> {
    await this.stateLock.lock(async () => {
      // Double-check state is still OPEN and timeout has passed
      if (this.state !== CircuitState.OPEN || !this.shouldAttemptReset()) {
        return // State changed or timeout not reached yet
      }
      
      const previousState = this.state
      const now = Date.now()
      this.state = CircuitState.HALF_OPEN
      this.stateTransitions++
      this.recoverySuccessCount = 0
      
      const event: StateTransitionEvent = {
        circuitName: this.options.name,
        fromState: previousState,
        toState: this.state,
        timestamp: now,
        reason,
        metadata: {
          timeOpen: this.openedAt ? now - this.openedAt : 0
        }
      }
      
      this.stateTransitionHistory.push(event)
      this.observabilityHooks?.onCircuitHalfOpen?.(event)
      
      debugLog.operation('circuit breaker half-open', {
        name: this.options.name,
        previousState,
        newState: this.state,
        timeOpen: this.openedAt ? now - this.openedAt : 0,
        reason
      }, this.options.debug)
      
      debugLog.lifecycle('half-open', 'CircuitBreaker', {
        name: this.options.name,
        reason
      }, this.options.debug)
    })
  }

  /**
   * Transition circuit to CLOSED state (reset) - atomic operation
   */
  private async closeCircuit(reason: string = 'recovery successful'): Promise<void> {
    await this.stateLock.lock(async () => {
      // Double-check we're in a state that can transition to CLOSED
      if (this.state === CircuitState.CLOSED) {
        return // Already closed, no need to transition
      }
      
      const previousState = this.state
      const now = Date.now()
      this.state = CircuitState.CLOSED
      this.failureCount = 0
      this.openedAt = undefined
      this.stateTransitions++
      this.recoverySuccessCount = 0
      
      const event: StateTransitionEvent = {
        circuitName: this.options.name,
        fromState: previousState,
        toState: this.state,
        timestamp: now,
        reason,
        metadata: {
          successCount: this.successCount,
          recoverySuccessCount: this.recoverySuccessCount
        }
      }
      
      this.stateTransitionHistory.push(event)
      this.observabilityHooks?.onCircuitClose?.(event)
      
      debugLog.operation('circuit breaker closed', {
        name: this.options.name,
        previousState,
        newState: this.state,
        successCount: this.successCount,
        reason
      }, this.options.debug)
      
      debugLog.lifecycle('closed', 'CircuitBreaker', {
        name: this.options.name,
        reason
      }, this.options.debug)
    })
  }

  /**
   * Record a successful operation (atomic operation)
   */
  private async recordSuccess(responseTime?: number): Promise<void> {
    await this.stateLock.lock(async () => {
      this.successCount++
      this.lastSuccessTime = Date.now()
      
      if (responseTime !== undefined) {
        this.responseTimes.push(responseTime)
        // Keep only last 100 response times for average calculation
        if (this.responseTimes.length > 100) {
          this.responseTimes.shift()
        }
        
        this.observabilityHooks?.onRequestSuccess?.(this.options.name, responseTime)
      }

      if (this.state === CircuitState.HALF_OPEN) {
        this.recoverySuccessCount++
        
        // Only close if we've reached the recovery threshold
        if (this.recoverySuccessCount >= this.options.recoveryThreshold) {
          await this.closeCircuit(`recovery threshold reached (${this.recoverySuccessCount}/${this.options.recoveryThreshold})`)
        }
      }
    })
  }

  /**
   * Record a failed operation (atomic operation)
   */
  private async recordFailure(error: Error, responseTime?: number): Promise<void> {
    await this.stateLock.lock(async () => {
      this.failureCount++
      this.lastFailureTime = Date.now()
      
      if (responseTime !== undefined) {
        this.responseTimes.push(responseTime)
        // Keep only last 100 response times for average calculation
        if (this.responseTimes.length > 100) {
          this.responseTimes.shift()
        }
        
        this.observabilityHooks?.onRequestFailure?.(this.options.name, error, responseTime)
      }

      if (this.state === CircuitState.HALF_OPEN) {
        // Failure in half-open state opens the circuit again
        await this.openCircuit('failure during recovery attempt')
      } else if (this.state === CircuitState.CLOSED && this.failureCount >= this.options.failureThreshold) {
        // Too many failures in closed state opens the circuit
        await this.openCircuit(`failure threshold exceeded (${this.failureCount}/${this.options.failureThreshold})`)
      }
    })
  }

  /**
   * Execute a function with circuit breaker protection (with atomic state management)
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // If circuit breaker is disabled, execute directly
    if (!this.options.enabled) {
      return fn()
    }

    // Check if circuit breaker has been shutdown
    if (this.isShutdown) {
      throw new CircuitBreakerError(this.options.name, {
        context: { reason: 'circuit breaker has been shutdown' }
      })
    }

    // Atomic check and potential state transition from OPEN to HALF_OPEN
    const canExecute = await this.stateLock.lock(async () => {
      this.totalRequests++
      
      // Check if we should attempt reset from OPEN to HALF_OPEN
      if (this.shouldAttemptReset()) {
        await this.halfOpenCircuit('timeout expired, attempting recovery')
      }

      // If circuit is open, reject immediately
      if (this.state === CircuitState.OPEN) {
        this.rejectedRequests++
        
        this.observabilityHooks?.onRequestRejected?.(this.options.name, this.rejectedRequests)
        
        debugLog.operation('circuit breaker request rejected', {
          name: this.options.name,
          state: this.state,
          rejectedRequests: this.rejectedRequests,
          totalRequests: this.totalRequests
        }, this.options.debug)
        
        return false // Cannot execute
      }
      
      return true // Can execute
    })

    // If circuit is open, throw error outside the lock
    if (!canExecute) {
      throw new CircuitBreakerError(this.options.name, {
        context: { 
          stats: this.getStats(),
          nextAttemptAt: this.getNextAttemptTime()
        }
      })
    }

    const startTime = Date.now()
    
    try {
      const result = await fn()
      const responseTime = Date.now() - startTime
      await this.recordSuccess(responseTime)
      
      debugLog.operation('circuit breaker request success', {
        name: this.options.name,
        state: this.state,
        responseTime,
        successCount: this.successCount
      }, this.options.debug)
      
      return result
    } catch (error) {
      const responseTime = Date.now() - startTime
      const errorObj = error instanceof Error ? error : new Error(String(error))
      await this.recordFailure(errorObj, responseTime)
      
      debugLog.operation('circuit breaker request failed', {
        name: this.options.name,
        state: this.state,
        responseTime,
        failureCount: this.failureCount,
        error: errorObj.message
      }, this.options.debug)
      
      throw error
    }
  }

  /**
   * Manually reset the circuit breaker to closed state (atomic)
   */
  async reset(): Promise<void> {
    await this.stateLock.lock(async () => {
      await this.closeCircuit('manual reset')
      this.successCount = 0
      this.lastFailureTime = undefined
      this.lastSuccessTime = undefined
    })
  }

  /**
   * Manually open the circuit breaker (atomic)
   */
  async forceOpen(): Promise<void> {
    await this.openCircuit('manually forced open')
  }

  /**
   * Check if the circuit breaker allows requests
   */
  canExecute(): boolean {
    if (!this.options.enabled) {
      return true
    }

    if (this.shouldAttemptReset()) {
      return true // Will transition to half-open on next execute
    }

    return this.state !== CircuitState.OPEN
  }

  /**
   * Get comprehensive metrics for monitoring and alerting
   */
  getMetrics(): CircuitBreakerMetrics {
    const averageResponseTime = this.responseTimes.length > 0
      ? this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length
      : 0
    
    const uptime = Date.now() - this.createdAt
    
    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successCount,
      failedRequests: this.totalRequests - this.successCount - this.rejectedRequests,
      rejectedRequests: this.rejectedRequests,
      stateTransitions: this.stateTransitions,
      averageResponseTime,
      uptime
    }
  }

  /**
   * Get state transition history for debugging and analysis
   */
  getStateTransitionHistory(): ReadonlyArray<StateTransitionEvent> {
    return [...this.stateTransitionHistory]
  }

  /**
   * Get the current state with detailed information
   */
  getCurrentState(): {
    state: CircuitState
    timeInCurrentState: number
    canExecute: boolean
    nextAttemptIn?: number
  } {
    const now = Date.now()
    const lastTransition = this.stateTransitionHistory[this.stateTransitionHistory.length - 1]
    const timeInCurrentState = lastTransition ? now - lastTransition.timestamp : now - this.createdAt
    
    let nextAttemptIn: number | undefined
    if (this.state === CircuitState.OPEN && this.openedAt) {
      const nextAttemptAt = this.openedAt + this.options.timeout
      nextAttemptIn = Math.max(0, nextAttemptAt - now)
    }
    
    return {
      state: this.state,
      timeInCurrentState,
      canExecute: this.canExecute(),
      nextAttemptIn
    }
  }

  /**
   * Shutdown the circuit breaker and clean up all resources
   * CRITICAL: This prevents timer leaks by clearing all active timeouts
   */
  shutdown(): void {
    if (this.isShutdown) {
      return // Already shutdown, idempotent
    }

    this.isShutdown = true
    
    // Clear all active timeouts to prevent memory leaks
    for (const timeout of this.activeTimeouts) {
      clearTimeout(timeout)
    }
    this.activeTimeouts.clear()
    
    // Clear response times array to release memory
    this.responseTimes.length = 0
    
    // Clear state transition history to release memory
    this.stateTransitionHistory.length = 0
    
    debugLog.operation('circuit breaker shutdown', {
      name: this.options.name,
      state: this.state,
      clearedTimeouts: this.activeTimeouts.size
    }, this.options.debug)
    
    debugLog.lifecycle('shutdown complete', 'CircuitBreaker', {
      name: this.options.name
    }, this.options.debug)
  }

  /**
   * Helper method to create tracked timeouts that will be cleaned up on shutdown
   */
  private createTrackedTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    const timeout = setTimeout(() => {
      // Remove from tracking set when timeout fires
      this.activeTimeouts.delete(timeout)
      if (!this.isShutdown) {
        callback()
      }
    }, delay)
    
    // Track the timeout for cleanup
    this.activeTimeouts.add(timeout)
    return timeout
  }
}