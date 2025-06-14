/**
 * CircuitBreaker - Fault tolerance utility for AgentKit SDK
 * Implements circuit breaker pattern with failure tracking, timeout, and half-open state
 */

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit */
  failureThreshold?: number
  /** Timeout in milliseconds before transitioning to half-open */
  timeout?: number
  /** Whether circuit breaker is enabled (feature flag) */
  enabled?: boolean
  /** Name for logging and metrics */
  name?: string
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
  lastFailureTime?: number
  lastSuccessTime?: number
  openedAt?: number
  nextAttemptAt?: number
}

export class CircuitBreakerError extends Error {
  readonly code = 'CIRCUIT_BREAKER_OPEN' as const
  readonly category = 'resource' as const
  readonly state: CircuitState
  readonly stats: CircuitBreakerStats

  constructor(name: string, stats: CircuitBreakerStats) {
    super(`Circuit breaker '${name}' is open. Next attempt at ${new Date(stats.nextAttemptAt!).toISOString()}`)
    this.name = 'CircuitBreakerError'
    this.state = stats.state
    this.stats = stats
  }
}

export class CircuitBreaker {
  private readonly options: Required<CircuitBreakerOptions>
  private state: CircuitState = CircuitState.CLOSED
  private failureCount = 0
  private successCount = 0
  private lastFailureTime?: number
  private lastSuccessTime?: number
  private openedAt?: number

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      timeout: options.timeout ?? 60000, // 60 seconds
      enabled: options.enabled ?? false,
      name: options.name ?? 'default'
    }

    this.validateOptions()
  }

  private validateOptions(): void {
    if (this.options.failureThreshold < 1) {
      throw new Error('failureThreshold must be >= 1')
    }
    if (this.options.timeout < 1) {
      throw new Error('timeout must be >= 1')
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
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      openedAt: this.openedAt,
      nextAttemptAt: this.getNextAttemptTime()
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
   * Transition circuit to OPEN state
   */
  private openCircuit(): void {
    this.state = CircuitState.OPEN
    this.openedAt = Date.now()
  }

  /**
   * Transition circuit to HALF_OPEN state
   */
  private halfOpenCircuit(): void {
    this.state = CircuitState.HALF_OPEN
  }

  /**
   * Transition circuit to CLOSED state (reset)
   */
  private closeCircuit(): void {
    this.state = CircuitState.CLOSED
    this.failureCount = 0
    this.openedAt = undefined
  }

  /**
   * Record a successful operation
   */
  private recordSuccess(): void {
    this.successCount++
    this.lastSuccessTime = Date.now()

    if (this.state === CircuitState.HALF_OPEN) {
      // Success in half-open state closes the circuit
      this.closeCircuit()
    }
  }

  /**
   * Record a failed operation
   */
  private recordFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.state === CircuitState.HALF_OPEN) {
      // Failure in half-open state opens the circuit again
      this.openCircuit()
    } else if (this.state === CircuitState.CLOSED && this.failureCount >= this.options.failureThreshold) {
      // Too many failures in closed state opens the circuit
      this.openCircuit()
    }
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // If circuit breaker is disabled, execute directly
    if (!this.options.enabled) {
      return fn()
    }

    // Check if we should attempt reset from OPEN to HALF_OPEN
    if (this.shouldAttemptReset()) {
      this.halfOpenCircuit()
    }

    // If circuit is open, reject immediately
    if (this.state === CircuitState.OPEN) {
      throw new CircuitBreakerError(this.options.name, this.getStats())
    }

    try {
      const result = await fn()
      this.recordSuccess()
      return result
    } catch (error) {
      this.recordFailure()
      throw error
    }
  }

  /**
   * Manually reset the circuit breaker to closed state
   */
  reset(): void {
    this.closeCircuit()
    this.successCount = 0
    this.lastFailureTime = undefined
    this.lastSuccessTime = undefined
  }

  /**
   * Manually open the circuit breaker
   */
  forceOpen(): void {
    this.openCircuit()
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
}