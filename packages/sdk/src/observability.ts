/**
 * Observability utilities for AgentKit SDK
 * Provides safe hook execution and request tracking
 */

import { RequestMetadata, ErrorContext, ObservabilityHooks } from '@agentkit/types'
import { debugLog } from './log'

/**
 * Generate a unique request ID (simple UUID v4 implementation)
 */
export function generateRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * Create current timestamp in ISO format
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString()
}

/**
 * Safely execute an observability hook, catching any errors
 */
export function safeHookExecution(
  hookName: string,
  hookFn: (() => void) | undefined,
  agentId: string,
  debug: boolean = false
): void {
  if (!hookFn) return

  try {
    hookFn()
  } catch (error) {
    debugLog.error(`observability hook: ${hookName}`, error as Error, debug)
    if (debug) {
      console.warn(`[AgentKit] Observability hook '${hookName}' failed for agent ${agentId}: ${(error as Error).message}`)
    }
    // Intentionally swallow the error to prevent disruption
  }
}

/**
 * Observability tracker for request lifecycle
 */
export class ObservabilityTracker {
  private hooks: ObservabilityHooks
  private debug: boolean

  constructor(hooks: ObservabilityHooks = {}, debug: boolean = false) {
    this.hooks = hooks
    this.debug = debug
  }

  /**
   * Create request metadata for the current operation
   */
  private createRequestMetadata(
    requestId: string,
    operation: 'init' | 'send' | 'shutdown',
    agentId: string,
    transportId: string,
    context?: Record<string, unknown>
  ): RequestMetadata {
    return {
      requestId,
      operation,
      agentId,
      transportId,
      timestamp: getCurrentTimestamp(),
      context
    }
  }

  /**
   * Track a request from start to finish
   */
  async trackRequest<T>(
    operation: 'init' | 'send' | 'shutdown',
    agentId: string,
    transportId: string,
    requestFn: (requestId: string) => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<T> {
    const requestId = generateRequestId()
    const startTime = Date.now()

    // Call onRequestStart hook
    const startMetadata = this.createRequestMetadata(requestId, operation, agentId, transportId, context)
    safeHookExecution(
      'onRequestStart',
      () => this.hooks.onRequestStart?.(startMetadata),
      agentId,
      this.debug
    )

    try {
      // Execute the actual request
      const result = await requestFn(requestId)

      // Call onRequestEnd hook on success
      const endTime = Date.now()
      const duration = endTime - startTime
      const endMetadata = this.createRequestMetadata(requestId, operation, agentId, transportId, context)
      
      safeHookExecution(
        'onRequestEnd',
        () => this.hooks.onRequestEnd?.(endMetadata, duration),
        agentId,
        this.debug
      )

      return result
    } catch (error) {
      // Call onError hook on failure
      const errorContext: ErrorContext = {
        requestId,
        operation,
        agentId,
        transportId,
        timestamp: getCurrentTimestamp(),
        phase: this.getErrorPhase(operation),
        error: error as Error,
        context
      }

      safeHookExecution(
        'onError',
        () => this.hooks.onError?.(error as Error, errorContext),
        agentId,
        this.debug
      )

      // Re-throw the original error
      throw error
    }
  }

  /**
   * Track an error that occurred outside of a tracked request
   */
  trackError(
    error: Error,
    phase: 'init' | 'handle' | 'send' | 'shutdown' | 'cleanup',
    agentId: string,
    transportId: string,
    context?: Record<string, unknown>
  ): void {
    const errorContext: ErrorContext = {
      agentId,
      transportId,
      timestamp: getCurrentTimestamp(),
      phase,
      error,
      context
    }

    safeHookExecution(
      'onError',
      () => this.hooks.onError?.(error, errorContext),
      agentId,
      this.debug
    )
  }

  /**
   * Determine the error phase based on operation
   */
  private getErrorPhase(operation: string): 'init' | 'handle' | 'send' | 'shutdown' | 'cleanup' {
    switch (operation) {
      case 'init': return 'init'
      case 'send': return 'send' // Could be 'handle' or 'send' within this operation
      case 'shutdown': return 'shutdown'
      default: return 'cleanup'
    }
  }

  /**
   * Check if any hooks are configured
   */
  hasHooks(): boolean {
    return !!(this.hooks.onRequestStart || this.hooks.onRequestEnd || this.hooks.onError)
  }
}