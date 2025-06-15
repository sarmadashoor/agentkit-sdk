/**
 * Plugin Execution Context Tracker
 * Prevents recursive plugin calls and tracks execution state
 */

import { RecursivePluginCallError } from '../errors'
import { debugLog } from '../log'

/**
 * Execution context for a plugin hook
 */
interface PluginExecutionContext {
  pluginName: string
  hookName: string
  startTime: number
  executionId: string
}

/**
 * Global plugin execution context manager
 * Prevents recursive calls and tracks active plugin executions
 */
class PluginExecutionContextManager {
  private activeExecutions = new Map<string, PluginExecutionContext>()
  private executionStack: string[] = []
  private globalLock = false

  /**
   * Start tracking execution of a plugin hook
   */
  startExecution(pluginName: string, hookName: string): string {
    const executionId = `${pluginName}:${hookName}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`
    
    const context: PluginExecutionContext = {
      pluginName,
      hookName,
      startTime: Date.now(),
      executionId
    }

    this.activeExecutions.set(executionId, context)
    this.executionStack.push(executionId)

    debugLog.operation('plugin execution context started', {
      pluginName,
      hookName,
      executionId,
      stackDepth: this.executionStack.length
    }, true)

    return executionId
  }

  /**
   * End tracking execution of a plugin hook
   */
  endExecution(executionId: string): void {
    const context = this.activeExecutions.get(executionId)
    if (!context) {
      debugLog.warn('Attempted to end unknown plugin execution', { executionId }, true)
      return
    }

    const duration = Date.now() - context.startTime
    
    debugLog.operation('plugin execution context ended', {
      pluginName: context.pluginName,
      hookName: context.hookName,
      executionId,
      duration,
      stackDepth: this.executionStack.length
    }, true)

    this.activeExecutions.delete(executionId)
    
    // Remove from stack
    const stackIndex = this.executionStack.indexOf(executionId)
    if (stackIndex !== -1) {
      this.executionStack.splice(stackIndex, 1)
    }
  }

  /**
   * Check if SDK methods are being called from within a plugin execution
   * Throws RecursivePluginCallError if recursive call detected
   */
  checkForRecursiveCall(sdkMethod: string): void {
    if (this.executionStack.length === 0) {
      return // No active plugin executions, safe to proceed
    }

    // Get the currently executing plugin context
    const currentExecutionId = this.executionStack[this.executionStack.length - 1]
    const currentContext = this.activeExecutions.get(currentExecutionId)
    
    if (!currentContext) {
      debugLog.warn('Plugin execution context inconsistency detected', {
        currentExecutionId,
        stackLength: this.executionStack.length
      }, true)
      return
    }

    // Recursive call detected!
    const error = new RecursivePluginCallError(
      currentContext.pluginName,
      currentContext.hookName,
      sdkMethod,
      {
        context: {
          executionId: currentExecutionId,
          sdkMethod,
          stackDepth: this.executionStack.length,
          executionStack: this.executionStack.map(id => {
            const ctx = this.activeExecutions.get(id)
            return ctx ? `${ctx.pluginName}:${ctx.hookName}` : 'unknown'
          })
        }
      }
    )

    debugLog.error('Recursive plugin call detected', error, true)
    throw error
  }

  /**
   * Check if a specific plugin is currently executing
   */
  isPluginExecuting(pluginName: string): boolean {
    return Array.from(this.activeExecutions.values()).some(ctx => ctx.pluginName === pluginName)
  }

  /**
   * Get currently executing plugins
   */
  getActiveExecutions(): PluginExecutionContext[] {
    return Array.from(this.activeExecutions.values())
  }

  /**
   * Get the current execution stack depth
   */
  getExecutionDepth(): number {
    return this.executionStack.length
  }

  /**
   * Set global lock to prevent any plugin execution
   * Used during shutdown or critical operations
   */
  setGlobalLock(locked: boolean): void {
    this.globalLock = locked
    
    if (locked) {
      debugLog.operation('plugin execution globally locked', {
        activeExecutions: this.activeExecutions.size
      }, true)
    } else {
      debugLog.operation('plugin execution globally unlocked', {}, true)
    }
  }

  /**
   * Check if plugin execution is globally locked
   */
  isGloballyLocked(): boolean {
    return this.globalLock
  }

  /**
   * Clear all execution contexts (for testing/cleanup)
   */
  reset(): void {
    debugLog.operation('plugin execution context reset', {
      clearedExecutions: this.activeExecutions.size,
      clearedStackItems: this.executionStack.length
    }, true)

    this.activeExecutions.clear()
    this.executionStack.length = 0
    this.globalLock = false
  }

  /**
   * Get execution statistics
   */
  getStats() {
    return {
      activeExecutions: this.activeExecutions.size,
      stackDepth: this.executionStack.length,
      globallyLocked: this.globalLock,
      executionContexts: Array.from(this.activeExecutions.values()).map(ctx => ({
        pluginName: ctx.pluginName,
        hookName: ctx.hookName,
        duration: Date.now() - ctx.startTime
      }))
    }
  }
}

/**
 * Singleton instance of the plugin execution context manager
 */
export const pluginExecutionContext = new PluginExecutionContextManager()

/**
 * Decorator function to wrap plugin execution with context tracking
 */
export function withPluginExecutionContext<T extends unknown[], R>(
  pluginName: string,
  hookName: string,
  fn: (...args: T) => Promise<R> | R
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const executionId = pluginExecutionContext.startExecution(pluginName, hookName)
    
    try {
      const result = await Promise.resolve(fn(...args))
      return result
    } finally {
      pluginExecutionContext.endExecution(executionId)
    }
  }
}

/**
 * Guard function to prevent recursive SDK calls
 * Call this at the beginning of any SDK method that plugins might try to call
 */
export function guardAgainstRecursivePluginCalls(sdkMethod: string): void {
  pluginExecutionContext.checkForRecursiveCall(sdkMethod)
}