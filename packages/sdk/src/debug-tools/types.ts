/**
 * Core types for AgentKit SDK debug tools
 */

import { z } from 'zod'

/**
 * Debug levels for granular control
 */
export type DebugLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

/**
 * Plugin execution trace entry
 */
export const PluginExecutionTraceSchema = z.object({
  traceId: z.string(),
  pluginName: z.string(),
  hookName: z.enum(['onInit', 'onSend', 'onReceive', 'onError', 'onShutdown']),
  startTime: z.number(),
  endTime: z.number().optional(),
  duration: z.number().optional(),
  status: z.enum(['pending', 'success', 'error', 'timeout']),
  error: z.string().optional(),
  inputSize: z.number().optional(),
  outputSize: z.number().optional(),
  memoryUsage: z.object({
    heapUsed: z.number(),
    heapTotal: z.number(),
    external: z.number(),
    rss: z.number()
  }).optional(),
  cpuUsage: z.object({
    user: z.number(),
    system: z.number()
  }).optional(),
  callStack: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional()
})

export type PluginExecutionTrace = z.infer<typeof PluginExecutionTraceSchema>

/**
 * Lifecycle timeline entry with enhanced debugging info
 */
export const LifecycleTimelineEntrySchema = z.object({
  id: z.string(),
  requestId: z.string(),
  agentId: z.string(),
  pluginName: z.string(),
  hookName: z.enum(['onInit', 'onSend', 'onReceive', 'onError', 'onShutdown']),
  timestamp: z.number(),
  duration: z.number().optional(),
  status: z.enum(['started', 'completed', 'failed', 'timeout']),
  error: z.string().optional(),
  warningThreshold: z.number(),
  isSlowExecution: z.boolean(),
  executionOrder: z.number(),
  concurrentExecutions: z.number(),
  queueWaitTime: z.number().optional(),
  retryAttempt: z.number().default(0),
  payload: z.object({
    type: z.string(),
    size: z.number(),
    truncated: z.boolean().default(false),
    preview: z.string().optional()
  }).optional(),
  context: z.object({
    agentId: z.string(),
    transportId: z.string(),
    requestId: z.string(),
    timestamp: z.number(),
    metadata: z.record(z.unknown()).optional()
  }),
  performance: z.object({
    cpuTime: z.number().optional(),
    memoryDelta: z.number().optional(),
    blockingTime: z.number().optional()
  }).optional(),
  debugInfo: z.object({
    sourceLocation: z.string().optional(),
    stackTrace: z.array(z.string()).optional(),
    environmentInfo: z.record(z.string()).optional()
  }).optional()
})

export type LifecycleTimelineEntry = z.infer<typeof LifecycleTimelineEntrySchema>

/**
 * Plugin performance snapshot
 */
export const PluginPerformanceSnapshotSchema = z.object({
  pluginName: z.string(),
  snapshotTime: z.number(),
  executionCount: z.number(),
  totalExecutionTime: z.number(),
  averageExecutionTime: z.number(),
  minExecutionTime: z.number(),
  maxExecutionTime: z.number(),
  errorCount: z.number(),
  timeoutCount: z.number(),
  successRate: z.number(),
  memoryUsage: z.object({
    current: z.number(),
    peak: z.number(),
    average: z.number()
  }),
  hookMetrics: z.record(z.object({
    executionCount: z.number(),
    totalTime: z.number(),
    averageTime: z.number(),
    errorCount: z.number()
  })),
  recentExecutions: z.array(PluginExecutionTraceSchema).max(10),
  performance: z.object({
    percentiles: z.object({
      p50: z.number(),
      p90: z.number(),
      p95: z.number(),
      p99: z.number()
    }),
    throughput: z.number(), // executions per second
    concurrency: z.object({
      current: z.number(),
      peak: z.number(),
      average: z.number()
    })
  })
})

export type PluginPerformanceSnapshot = z.infer<typeof PluginPerformanceSnapshotSchema>

/**
 * Debug timeline for SDK operations
 */
export const DebugTimelineSchema = z.object({
  timelineId: z.string(),
  agentId: z.string(),
  startTime: z.number(),
  endTime: z.number().optional(),
  entries: z.array(LifecycleTimelineEntrySchema),
  summary: z.object({
    totalPlugins: z.number(),
    totalExecutions: z.number(),
    totalDuration: z.number(),
    successfulExecutions: z.number(),
    failedExecutions: z.number(),
    timeoutExecutions: z.number(),
    averageDuration: z.number(),
    slowExecutions: z.number()
  }),
  performance: z.object({
    peakMemoryUsage: z.number(),
    totalCpuTime: z.number(),
    maxConcurrency: z.number(),
    throughput: z.number()
  }),
  warnings: z.array(z.object({
    type: z.enum(['slow_execution', 'high_memory', 'timeout', 'error', 'plugin_disabled']),
    message: z.string(),
    timestamp: z.number(),
    pluginName: z.string().optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical'])
  })),
  metadata: z.object({
    sdkVersion: z.string(),
    nodeVersion: z.string(),
    platform: z.string(),
    debugLevel: z.string(),
    environment: z.record(z.string()).optional()
  })
})

export type DebugTimeline = z.infer<typeof DebugTimelineSchema>

/**
 * Execution metrics for performance analysis
 */
export const ExecutionMetricsSchema = z.object({
  requestId: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  totalDuration: z.number(),
  pluginMetrics: z.record(z.object({
    executionTime: z.number(),
    queueWaitTime: z.number(),
    status: z.enum(['success', 'error', 'timeout']),
    error: z.string().optional(),
    memoryUsage: z.number().optional(),
    cpuUsage: z.number().optional()
  })),
  resourceUsage: z.object({
    memory: z.object({
      start: z.number(),
      end: z.number(),
      peak: z.number()
    }),
    cpu: z.object({
      user: z.number(),
      system: z.number()
    })
  }),
  timeline: z.array(z.object({
    timestamp: z.number(),
    event: z.string(),
    pluginName: z.string().optional(),
    details: z.record(z.unknown()).optional()
  }))
})

export type ExecutionMetrics = z.infer<typeof ExecutionMetricsSchema>

/**
 * Graph node for execution visualization
 */
export const GraphNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['plugin', 'hook', 'agent', 'transport', 'event']),
  status: z.enum(['pending', 'running', 'completed', 'error', 'timeout']),
  duration: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
  position: z.object({
    x: z.number(),
    y: z.number()
  }).optional()
})

export type GraphNode = z.infer<typeof GraphNodeSchema>

/**
 * Graph edge for execution flow
 */
export const GraphEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(['calls', 'triggers', 'depends_on', 'contains']),
  weight: z.number().optional(),
  label: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
})

export type GraphEdge = z.infer<typeof GraphEdgeSchema>

/**
 * Complete execution graph
 */
export const ExecutionGraphSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  metadata: z.object({
    requestId: z.string(),
    agentId: z.string(),
    duration: z.number(),
    pluginCount: z.number(),
    status: z.enum(['success', 'partial', 'error'])
  })
})

export type ExecutionGraph = z.infer<typeof ExecutionGraphSchema>