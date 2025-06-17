/**
 * AgentKit SDK Debug Tools
 * 
 * World-class developer experience with runtime visibility, debugging primitives,
 * and comprehensive observability for plugin development and troubleshooting.
 * 
 * Inspired by Stripe's SDK debugging capabilities.
 */

export { tracePluginExecution } from './tracePluginExecution'
export { logLifecycleTimeline, LifecycleTimelineLogger, createTimelineLogger } from './logLifecycleTimeline'
export { snapshotPluginPerf } from './snapshotPluginPerf'
export { 
  TraceOutputFormatter, 
  getTraceFormatter, 
  logTrace, 
  logPluginStart, 
  logPluginSuccess, 
  logPluginError, 
  logPluginTimeout 
} from './TraceOutputFormatter'
export {
  isDebugBuildEnabled,
  devOnly,
  debugOnly,
  noop,
  importDebugModule,
  BUILD_CONSTANTS,
  assertDebugMode,
  debugConsole
} from './buildGuards'
export { DebugManager, type DebugConfig, type DebugSnapshot } from './DebugManager'
export { HotReloadManager, createHotReloadManager, type HotReloadConfig } from './HotReloadManager'
export { GraphvizGenerator } from './GraphvizGenerator'
export { type ExecutionGraph } from './types'

// Debug mode utilities
export { 
  enableGlobalDebugMode, 
  disableGlobalDebugMode, 
  isDebugModeEnabled,
  setDebugLevel,
  createDebugContext,
  debugTrace,
  debugPerformance,
  type DebugLevel
} from './debugMode'

// Plugin development helpers
export {
  createPluginDevelopmentWrapper,
  measurePluginPerformance,
  validatePluginContract,
  type PluginPerformanceReport,
  type PluginValidationResult
} from './pluginDevelopment'

// Plugin execution tracer
export class PluginExecutionTracer {
  constructor(private debugManager: import('./DebugManager').DebugManager) {}
  
  getPluginTraces(pluginName: string) {
    return this.debugManager.getTimeline()?.entries.filter((e: any) => e.pluginName === pluginName) || []
  }
  
  getCompletedTraces() {
    return this.debugManager.getTimeline()?.entries || []
  }
  
  clearTraces() {
    this.debugManager.reset()
  }
}

// Export types for external use
export type {
  PluginExecutionTrace,
  LifecycleTimelineEntry,
  PluginPerformanceSnapshot,
  DebugTimeline,
  ExecutionMetrics
} from './types'