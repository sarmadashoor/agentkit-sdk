/**
 * Plugin Setup Module
 * 
 * Implements example plugins for logging and metrics to demonstrate
 * plugin integration with the AgentKit SDK.
 */

import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'

/**
 * Simple logging plugin that tracks all lifecycle events
 */
export class LoggingPlugin implements AgentKitPlugin {
  public readonly name = 'hello-world-logging-plugin'
  public readonly version = '1.0.0'
  public readonly description = 'Logs all agent lifecycle events for demonstration'
  
  private events: Array<{ event: string; timestamp: number; agentId: string; data?: unknown }> = []
  
  async onInit(context: AgentContext): Promise<void> {
    const event = {
      event: 'init',
      timestamp: Date.now(),
      agentId: context.agentId,
      data: { requestId: context.requestId }
    }
    
    this.events.push(event)
    console.log(`🔌 [${this.name}] Agent initialized: ${context.agentId}`)
  }
  
  async onSend(payload: SendPayload, context: AgentContext): Promise<void> {
    const event = {
      event: 'send',
      timestamp: Date.now(),
      agentId: context.agentId,
      data: { 
        requestId: context.requestId,
        inputType: typeof payload.input,
        hasMetadata: !!payload.metadata 
      }
    }
    
    this.events.push(event)
    console.log(`📨 [${this.name}] Message sent to ${context.agentId} (${typeof payload.input})`)
  }
  
  async onError(error: Error, context: AgentContext): Promise<void> {
    const event = {
      event: 'error',
      timestamp: Date.now(),
      agentId: context.agentId,
      data: { 
        requestId: context.requestId,
        errorMessage: error.message,
        errorType: error.constructor.name
      }
    }
    
    this.events.push(event)
    console.log(`❌ [${this.name}] Error in ${context.agentId}: ${error.message}`)
  }
  
  async onShutdown(context: AgentContext): Promise<void> {
    const event = {
      event: 'shutdown',
      timestamp: Date.now(),
      agentId: context.agentId,
      data: { requestId: context.requestId }
    }
    
    this.events.push(event)
    console.log(`🛑 [${this.name}] Agent shutdown: ${context.agentId}`)
    
    // Print summary of captured events
    this.printEventSummary()
  }
  
  /**
   * Get all captured events
   */
  getEvents() {
    return [...this.events]
  }
  
  /**
   * Print a summary of all captured events
   */
  private printEventSummary(): void {
    console.log(`\n📊 [${this.name}] Event Summary:`)
    console.log(`  • Total events captured: ${this.events.length}`)
    
    const eventCounts = this.events.reduce((acc, event) => {
      acc[event.event] = (acc[event.event] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    Object.entries(eventCounts).forEach(([eventType, count]) => {
      console.log(`  • ${eventType}: ${count}`)
    })
    
    if (this.events.length > 0) {
      const duration = this.events[this.events.length - 1]!.timestamp - this.events[0]!.timestamp
      console.log(`  • Total duration: ${duration}ms`)
    }
    console.log('')
  }
}

/**
 * Metrics plugin that collects fake performance data
 */
export class MetricsPlugin implements AgentKitPlugin {
  public readonly name = 'hello-world-metrics-plugin'
  public readonly version = '1.0.0'
  public readonly description = 'Collects fake performance metrics for demonstration'
  
  private metrics: Array<{ 
    metric: string; 
    value: number; 
    timestamp: number; 
    agentId: string; 
    tags?: Record<string, string> 
  }> = []
  
  async onInit(context: AgentContext): Promise<void> {
    this.recordMetric('agent.init.duration', this.randomLatency(), context.agentId, {
      requestId: context.requestId
    })
    
    this.recordMetric('agent.init.memory', this.randomMemoryUsage(), context.agentId)
    console.log(`📊 [${this.name}] Recorded init metrics for ${context.agentId}`)
  }
  
  async onSend(payload: SendPayload, context: AgentContext): Promise<void> {
    this.recordMetric('agent.message.size', this.getPayloadSize(payload), context.agentId, {
      inputType: typeof payload.input
    })
    
    this.recordMetric('agent.send.latency', this.randomLatency(), context.agentId)
    this.recordMetric('agent.cpu.usage', this.randomCpuUsage(), context.agentId)
    
    console.log(`📊 [${this.name}] Recorded send metrics for ${context.agentId}`)
  }
  
  async onError(error: Error, context: AgentContext): Promise<void> {
    this.recordMetric('agent.error.count', 1, context.agentId, {
      errorType: error.constructor.name,
      requestId: context.requestId
    })
    
    console.log(`📊 [${this.name}] Recorded error metric for ${context.agentId}`)
  }
  
  async onShutdown(context: AgentContext): Promise<void> {
    this.recordMetric('agent.shutdown.duration', this.randomLatency(), context.agentId)
    console.log(`📊 [${this.name}] Recorded shutdown metrics for ${context.agentId}`)
    
    // Print metrics summary
    this.printMetricsSummary()
  }
  
  /**
   * Record a metric with timestamp and optional tags
   */
  private recordMetric(
    metric: string, 
    value: number, 
    agentId: string, 
    tags?: Record<string, string>
  ): void {
    this.metrics.push({
      metric,
      value,
      timestamp: Date.now(),
      agentId,
      ...(tags && { tags })
    })
  }
  
  /**
   * Get all recorded metrics
   */
  getMetrics() {
    return [...this.metrics]
  }
  
  /**
   * Get fake payload size
   */
  private getPayloadSize(payload: SendPayload): number {
    try {
      return JSON.stringify(payload).length
    } catch {
      return 0
    }
  }
  
  /**
   * Generate random latency (10-100ms)
   */
  private randomLatency(): number {
    return Math.floor(Math.random() * 90) + 10
  }
  
  /**
   * Generate random memory usage (1-50MB)
   */
  private randomMemoryUsage(): number {
    return Math.floor(Math.random() * 49) + 1
  }
  
  /**
   * Generate random CPU usage (5-95%)
   */
  private randomCpuUsage(): number {
    return Math.floor(Math.random() * 90) + 5
  }
  
  /**
   * Print a summary of all collected metrics
   */
  private printMetricsSummary(): void {
    console.log(`\n📈 [${this.name}] Metrics Summary:`)
    console.log(`  • Total metrics collected: ${this.metrics.length}`)
    
    // Group metrics by type
    const metricGroups = this.metrics.reduce((acc, metric) => {
      if (!acc[metric.metric]) {
        acc[metric.metric] = []
      }
      acc[metric.metric]!.push(metric.value)
      return acc
    }, {} as Record<string, number[]>)
    
    Object.entries(metricGroups).forEach(([metricName, values]) => {
      const avg = values.reduce((a, b) => a + b, 0) / values.length
      const min = Math.min(...values)
      const max = Math.max(...values)
      
      console.log(`  • ${metricName}:`)
      console.log(`    - Count: ${values.length}`)
      console.log(`    - Average: ${avg.toFixed(2)}`)
      console.log(`    - Range: ${min} - ${max}`)
    })
    console.log('')
  }
}

/**
 * Debug plugin that provides detailed execution tracing
 */
export class DebugPlugin implements AgentKitPlugin {
  public readonly name = 'hello-world-debug-plugin'
  public readonly version = '1.0.0'
  public readonly description = 'Provides detailed execution tracing for debugging'
  
  private traceId: string = Math.random().toString(36).substr(2, 9)
  private startTime: number = Date.now()
  
  async onInit(context: AgentContext): Promise<void> {
    const elapsed = Date.now() - this.startTime
    console.log(`🔍 [${this.name}] [${this.traceId}] INIT START (t=${elapsed}ms) - Agent: ${context.agentId}`)
    
    // Simulate some async work
    await new Promise(resolve => setTimeout(resolve, 5))
    
    const endElapsed = Date.now() - this.startTime
    console.log(`🔍 [${this.name}] [${this.traceId}] INIT END (t=${endElapsed}ms)`)
  }
  
  async onSend(payload: SendPayload, _context: AgentContext): Promise<void> {
    const elapsed = Date.now() - this.startTime
    console.log(`🔍 [${this.name}] [${this.traceId}] SEND START (t=${elapsed}ms) - ${typeof payload.input}`)
    
    // Log payload details (safely)
    try {
      const inputStr = JSON.stringify(payload.input)
      const inputPreview = inputStr.substring(0, 50)
      console.log(`🔍 [${this.name}] [${this.traceId}] Input preview: ${inputPreview}...`)
    } catch {
      console.log(`🔍 [${this.name}] [${this.traceId}] Input preview: <unparseable>`)
    }
    
    const endElapsed = Date.now() - this.startTime
    console.log(`🔍 [${this.name}] [${this.traceId}] SEND END (t=${endElapsed}ms)`)
  }
  
  async onError(error: Error, _context: AgentContext): Promise<void> {
    const elapsed = Date.now() - this.startTime
    console.log(`🔍 [${this.name}] [${this.traceId}] ERROR (t=${elapsed}ms) - ${error.message}`)
    console.log(`🔍 [${this.name}] [${this.traceId}] Error stack preview: ${error.stack?.split('\n')[0] || 'No stack'}`)
  }
  
  async onShutdown(_context: AgentContext): Promise<void> {
    const elapsed = Date.now() - this.startTime
    console.log(`🔍 [${this.name}] [${this.traceId}] SHUTDOWN (t=${elapsed}ms) - Total session duration`)
  }
}

/**
 * Create a standard set of demo plugins
 */
export function createDemoPlugins(): AgentKitPlugin[] {
  return [
    new LoggingPlugin(),
    new MetricsPlugin(),
    new DebugPlugin()
  ]
}

/**
 * Create plugins based on environment or configuration
 */
export function createPluginsForMode(mode: string): AgentKitPlugin[] {
  switch (mode) {
    case 'minimal':
      return [new LoggingPlugin()]
    
    case 'full':
      return createDemoPlugins()
    
    case 'metrics-only':
      return [new MetricsPlugin()]
    
    case 'debug-only':
      return [new DebugPlugin()]
    
    default:
      return createDemoPlugins()
  }
}