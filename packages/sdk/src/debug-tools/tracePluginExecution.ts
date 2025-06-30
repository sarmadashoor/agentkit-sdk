/**
 * Plugin Execution Tracer
 * 
 * Provides fine-grained tracing of plugin execution with comprehensive
 * performance metrics, memory tracking, and execution flow visualization.
 */

import { PluginExecutionTrace } from './types'
import { DebugManager } from './DebugManager'

/**
 * Options for plugin execution tracing
 */
export interface TraceOptions {
  captureMemory?: boolean
  captureCpu?: boolean
  captureCallStack?: boolean
  capturePayload?: boolean
  maxPayloadSize?: number
  includeEnvironment?: boolean
}

/**
 * Plugin execution tracer class
 */
export class PluginExecutionTracer {
  private traces: Map<string, PluginExecutionTrace> = new Map()
  private debugManager: DebugManager
  private defaultOptions: TraceOptions = {
    captureMemory: true,
    captureCpu: true,
    captureCallStack: false,
    capturePayload: true,
    maxPayloadSize: 1024,
    includeEnvironment: false
  }

  constructor(debugManager?: DebugManager) {
    this.debugManager = debugManager || DebugManager.getInstance()
  }

  /**
   * Start tracing a plugin execution
   */
  startTrace(
    pluginName: string,
    hookName: string,
    options: TraceOptions = {}
  ): string {
    const traceId = this.generateTraceId(pluginName, hookName)
    const mergedOptions = { ...this.defaultOptions, ...options }
    
    const trace: PluginExecutionTrace = {
      traceId,
      pluginName,
      hookName: hookName as any,
      startTime: performance.now(),
      status: 'pending',
      memoryUsage: mergedOptions.captureMemory ? this.captureMemoryUsage() : undefined,
      cpuUsage: mergedOptions.captureCpu ? this.captureCpuUsage() : undefined,
      callStack: mergedOptions.captureCallStack ? this.captureCallStack() : undefined,
      metadata: {
        options: mergedOptions,
        environment: mergedOptions.includeEnvironment ? process.env : undefined
      }
    }

    this.traces.set(traceId, trace)
    
    this.debugManager.log('trace', `Started tracing ${pluginName}.${hookName}`, {
      traceId,
      options: mergedOptions
    })

    return traceId
  }

  /**
   * End tracing a plugin execution
   */
  endTrace(
    traceId: string,
    status: 'success' | 'error' | 'timeout' = 'success',
    error?: string,
    result?: any
  ): PluginExecutionTrace | null {
    const trace = this.traces.get(traceId)
    if (!trace) {
      this.debugManager.log('warn', `Trace not found: ${traceId}`)
      return null
    }

    const endTime = performance.now()
    trace.endTime = endTime
    trace.duration = endTime - trace.startTime
    trace.status = status
    trace.error = error

    // Capture final memory and CPU usage
    if (trace.memoryUsage) {
      const endMemory = this.captureMemoryUsage()
      trace.memoryUsage = endMemory
    }

    if (trace.cpuUsage) {
      const endCpu = this.captureCpuUsage()
      trace.cpuUsage = endCpu
    }

    // Capture output size if result is provided
    if (result) {
      trace.outputSize = this.calculateObjectSize(result)
    }

    this.debugManager.log('trace', `Completed tracing ${trace.pluginName}.${trace.hookName}`, {
      traceId,
      duration: trace.duration,
      status,
      memoryUsage: trace.memoryUsage,
      cpuUsage: trace.cpuUsage
    })

    return trace
  }

  /**
   * Get a specific trace
   */
  getTrace(traceId: string): PluginExecutionTrace | null {
    return this.traces.get(traceId) || null
  }

  /**
   * Get all traces for a plugin
   */
  getPluginTraces(pluginName: string): PluginExecutionTrace[] {
    return Array.from(this.traces.values()).filter(trace => trace.pluginName === pluginName)
  }

  /**
   * Get all active traces
   */
  getActiveTraces(): PluginExecutionTrace[] {
    return Array.from(this.traces.values()).filter(trace => trace.status === 'pending')
  }

  /**
   * Get all completed traces
   */
  getCompletedTraces(): PluginExecutionTrace[] {
    return Array.from(this.traces.values()).filter(trace => trace.status !== 'pending')
  }

  /**
   * Clear all traces
   */
  clearTraces(): void {
    this.traces.clear()
    this.debugManager.log('debug', 'Cleared all plugin execution traces')
  }

  /**
   * Get trace summary statistics
   */
  getTraceSummary(): {
    totalTraces: number
    activeTraces: number
    completedTraces: number
    successfulTraces: number
    errorTraces: number
    timeoutTraces: number
    averageDuration: number
    totalDuration: number
  } {
    const allTraces = Array.from(this.traces.values())
    const completedTraces = allTraces.filter(t => t.status !== 'pending')
    
    return {
      totalTraces: allTraces.length,
      activeTraces: allTraces.filter(t => t.status === 'pending').length,
      completedTraces: completedTraces.length,
      successfulTraces: allTraces.filter(t => t.status === 'success').length,
      errorTraces: allTraces.filter(t => t.status === 'error').length,
      timeoutTraces: allTraces.filter(t => t.status === 'timeout').length,
      averageDuration: completedTraces.length > 0 
        ? completedTraces.reduce((sum, t) => sum + (t.duration || 0), 0) / completedTraces.length 
        : 0,
      totalDuration: completedTraces.reduce((sum, t) => sum + (t.duration || 0), 0)
    }
  }

  /**
   * Export traces as JSON
   */
  exportTraces(): string {
    const summary = this.getTraceSummary()
    const traces = Array.from(this.traces.values())
    
    return JSON.stringify({
      summary,
      traces,
      exportTime: Date.now(),
      exportedBy: 'AgentKit SDK Plugin Execution Tracer'
    }, null, 2)
  }

  private generateTraceId(pluginName: string, hookName: string): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 9)
    return `trace-${pluginName}-${hookName}-${timestamp}-${random}`
  }

  private captureMemoryUsage() {
    const usage = process.memoryUsage()
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss
    }
  }

  private captureCpuUsage() {
    const usage = process.cpuUsage()
    return {
      user: usage.user,
      system: usage.system
    }
  }

  private captureCallStack(): string[] {
    const stack = new Error().stack
    if (!stack) {return []}
    
    return stack
      .split('\n')
      .slice(1) // Remove the 'Error' line
      .map(line => line.trim())
      .filter(line => line.startsWith('at '))
      .slice(0, 10) // Limit to 10 stack frames
  }

  private calculateObjectSize(obj: any): number {
    try {
      return JSON.stringify(obj).length
    } catch {
      return 0
    }
  }
}

/**
 * Trace a plugin execution with automatic start/end
 */
export async function tracePluginExecution<T>(
  pluginName: string,
  hookName: string,
  fn: () => Promise<T> | T,
  options: TraceOptions = {}
): Promise<{ result: T; trace: PluginExecutionTrace | null }> {
  const tracer = new PluginExecutionTracer()
  const traceId = tracer.startTrace(pluginName, hookName, options)
  
  try {
    const result = await fn()
    const trace = tracer.endTrace(traceId, 'success', undefined, result)
    return { result, trace }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    tracer.endTrace(traceId, 'error', errorMessage)
    throw error
  }
}

/**
 * Decorator for automatic plugin execution tracing
 */
export function traceExecution(
  options: TraceOptions = {}
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value
    const pluginName = target.constructor.name
    
    descriptor.value = async function (...args: any[]) {
      return tracePluginExecution(
        pluginName,
        propertyKey,
        () => originalMethod.apply(this, args),
        options
      ).then(({ result }) => result)
    }
    
    return descriptor
  }
}

// Global tracer instance
export const globalTracer = new PluginExecutionTracer()