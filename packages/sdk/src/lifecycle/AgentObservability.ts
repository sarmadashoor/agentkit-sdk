/**
 * Agent Observability Manager
 * 
 * Handles metrics collection, timeline debugging, performance monitoring,
 * and enhanced debugging features for AgentKit SDK.
 */

import { AgentKitPlugin } from '@agentkit/types'
import { MetricsCollector } from '../observability/MetricsCollector'
import { PluginExecutionTimeline } from '../observability/PluginExecutionTimeline'
import { 
  DebugManager, 
  LifecycleTimelineLogger, 
  PluginExecutionTracer,
  GraphvizGenerator,
  HotReloadManager,
  createPluginDevelopmentWrapper,
  measurePluginPerformance,
  type DebugTimeline,
  type PluginPerformanceReport,
  type DebugSnapshot
} from '../debug-tools'

export interface ObservabilityConfig {
  enableMetricsCollection?: boolean
  enableTimelineDebug?: boolean
  performanceThreshold?: number
  enableConsoleWarnings?: boolean
}

export interface DebugModeOptions {
  verbose?: boolean
  graph?: boolean
  level?: 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
  hotReload?: boolean
}

export class AgentObservability {
  private metricsCollector?: MetricsCollector
  private timeline?: PluginExecutionTimeline
  private debugModeEnabled: boolean = false
  
  // Enhanced debug tools
  private debugManager?: DebugManager
  private timelineLogger?: LifecycleTimelineLogger
  private pluginTracer?: PluginExecutionTracer
  private graphvizGenerator?: GraphvizGenerator
  private hotReloadManager?: HotReloadManager
  
  constructor(
    private agentId: string,
    private config: ObservabilityConfig = {},
    private debug: any // Logger instance
  ) {}

  /**
   * Initialize observability components
   */
  initialize(): void {
    if (this.config.enableMetricsCollection) {
      this.metricsCollector = new MetricsCollector()
    }

    if (this.config.enableTimelineDebug) {
      this.timeline = new PluginExecutionTimeline({
        warningThreshold: this.config.performanceThreshold,
        enableConsoleWarnings: this.config.enableConsoleWarnings
      })
    }
  }

  /**
   * Initialize enhanced debug tools
   */
  private initializeDebugTools(): void {
    if (this.debug && typeof this.debug.info === 'function') {
      this.debug.info('Initializing enhanced debug tools')
    }
    
    // Initialize debug manager
    this.debugManager = DebugManager.getInstance({
      enabled: true,
      level: process.env.DEBUG_LEVEL as any || 'info',
      verbose: process.env.DEBUG_VERBOSE === 'true',
      enableConsoleOutput: true,
      enableGraphOutput: process.env.DEBUG_GRAPH === 'true',
      performanceThreshold: this.config.performanceThreshold || 100
    })
    
    // Initialize timeline logger
    this.timelineLogger = new LifecycleTimelineLogger({
      enableConsoleOutput: true,
      enableTableOutput: true,
      performanceThreshold: this.config.performanceThreshold || 100,
      outputFormat: 'table'
    })
    
    // Initialize plugin tracer
    this.pluginTracer = new PluginExecutionTracer(this.debugManager)
    
    // Initialize Graphviz generator
    this.graphvizGenerator = new GraphvizGenerator(this.debugManager)
    
    // Initialize hot reload manager in development
    if (process.env.NODE_ENV === 'development') {
      this.hotReloadManager = new HotReloadManager({
        enabled: true,
        onReload: (filePath, pluginName) => {
          if (this.debug && typeof this.debug.info === 'function') {
            this.debug.info(`Plugin hot reloaded: ${pluginName}`, { filePath })
          }
        },
        onError: (error, filePath) => {
          if (this.debug && typeof this.debug.error === 'function') {
            this.debug.error(`Hot reload failed: ${filePath}`, { error })
          }
        }
      })
    }
    
    // Initialize debug timeline
    this.debugManager.initializeTimeline(this.agentId)
    
    if (this.debug && typeof this.debug.info === 'function') {
      this.debug.info('Enhanced debug tools initialized successfully')
    }
  }

  // ===== OBSERVABILITY PUBLIC API =====

  /**
   * Get comprehensive metrics in Prometheus-compatible format
   */
  getMetrics() {
    return this.metricsCollector?.getMetrics()
  }

  /**
   * Get plugin execution timeline for debugging
   */
  getDebugTimeline() {
    return this.timeline?.getTimeline()
  }

  /**
   * Export metrics in Prometheus text format
   */
  exportPrometheusMetrics(): string {
    return this.metricsCollector?.exportPrometheusMetrics() || ''
  }

  /**
   * Print timeline to console for debugging
   */
  printTimeline(): void {
    this.timeline?.printTimeline()
  }

  /**
   * Get performance statistics for plugin analysis
   */
  getPerformanceStats() {
    return this.timeline?.getPerformanceStats()
  }

  /**
   * Expose timeline globally for browser debugging (if enabled)
   */
  exposeTimelineGlobally(): void {
    if (this.debugModeEnabled && typeof window !== 'undefined' && this.timeline) {
      (window as any).__AGENTKIT_TIMELINE__ = this.timeline.exportForBrowser()
      console.log('🔍 AgentKit Timeline exposed as window.__AGENTKIT_TIMELINE__')
      console.log('📊 Use window.__AGENTKIT_TIMELINE__.printTimeline() to view execution timeline')
    }
  }

  /**
   * Enable debug mode with enhanced features
   */
  enableDebugMode(options: DebugModeOptions = {}): void {
    this.debugModeEnabled = true
    
    if (!this.debugManager) {
      this.initializeDebugTools()
    }
    
    if (this.debugManager) {
      this.debugManager.enable({
        verbose: options.verbose,
        enableGraphOutput: options.graph,
        level: options.level || 'info'
      })
    }
    
    if (options.hotReload && !this.hotReloadManager && process.env.NODE_ENV === 'development') {
      this.hotReloadManager = new HotReloadManager({ enabled: true })
    }
    
    if (this.debug && typeof this.debug.info === 'function') {
      this.debug.info('Debug mode enabled with enhanced features', options)
    }
  }

  /**
   * Get debug timeline with comprehensive execution data
   */
  getEnhancedDebugTimeline(): DebugTimeline | null {
    return this.debugManager?.getTimeline() || null
  }

  /**
   * Get plugin performance report
   */
  getPluginPerformanceReport(pluginName?: string): PluginPerformanceReport[] {
    if (!this.pluginTracer) {
      throw new Error('Debug mode must be enabled to generate performance reports')
    }
    
    if (pluginName) {
      const traces = this.pluginTracer.getPluginTraces(pluginName)
      const report = measurePluginPerformance(pluginName, 'combined', () => Promise.resolve(), 1)
      return [report] as any // Simplified for now
    }
    
    // Get reports for all plugins
    const allTraces = this.pluginTracer.getCompletedTraces()
    const pluginNames = [...new Set(allTraces.map(t => t.pluginName))]
    
    return pluginNames.map((name: string) => {
      // Simplified report generation
      return {
        pluginName: name,
        reportTime: Date.now(),
        executionMetrics: {
          totalExecutions: 0,
          averageExecutionTime: 0,
          minExecutionTime: 0,
          maxExecutionTime: 0,
          successRate: 0,
          errorRate: 0,
          timeoutRate: 0
        },
        performanceGrade: 'B' as const,
        recommendations: [],
        warnings: [],
        memoryMetrics: {
          averageMemoryUsage: 0,
          peakMemoryUsage: 0,
          memoryLeakDetected: false,
          memoryEfficiencyScore: 80
        },
        hookBreakdown: {},
        comparisonData: {
          percentile: 50,
          vsAveragePlugin: {
            speedMultiplier: 1,
            reliabilityDifference: 0,
            memoryEfficiency: 1
          }
        }
      }
    })
  }

  /**
   * Generate Graphviz execution graph
   */
  generateExecutionGraph(format: 'dot' | 'svg' = 'dot'): string | Promise<string> {
    if (!this.graphvizGenerator || !this.timelineLogger) {
      throw new Error('Debug mode must be enabled to generate execution graphs')
    }
    
    const timeline = this.timelineLogger.getTimeline()
    const graphDot = this.graphvizGenerator.generateFromTimeline(timeline.entries)
    
    if (format === 'svg') {
      return this.graphvizGenerator.exportAsSVG(graphDot)
    }
    
    return graphDot
  }

  /**
   * Display debug timeline in console
   */
  displayDebugTimeline(format: 'table' | 'tree' | 'json' = 'table'): void {
    if (!this.timelineLogger) {
      throw new Error('Debug mode must be enabled to display timeline')
    }
    
    switch (format) {
      case 'table':
        this.timelineLogger.displayTable()
        break
      case 'tree':
        this.timelineLogger.displayTree()
        break
      case 'json':
        console.log(this.timelineLogger.exportJSON())
        break
    }
  }

  /**
   * Get debug snapshot with all debug information
   */
  getDebugSnapshot(): DebugSnapshot | null {
    return this.debugManager?.createSnapshot() || null
  }

  /**
   * Export debug data as JSON
   */
  exportDebugData(): string {
    if (!this.debugManager) {
      throw new Error('Debug mode must be enabled to export debug data')
    }
    
    return this.debugManager.exportDebugData()
  }

  /**
   * Clear debug data
   */
  clearDebugData(): void {
    this.debugManager?.reset()
    this.pluginTracer?.clearTraces()
    this.timelineLogger?.clear()
    if (this.debug && typeof this.debug.info === 'function') {
      this.debug.info('Debug data cleared')
    }
  }

  /**
   * Register plugin for hot reload (development mode)
   */
  registerPluginForHotReload(pluginName: string, filePath: string): void {
    if (!this.hotReloadManager) {
      if (this.debug && typeof this.debug.warn === 'function') {
        this.debug.warn('Hot reload manager not available (requires development mode)')
      }
      return
    }
    
    this.hotReloadManager.registerPlugin(pluginName, filePath)
    if (this.debug && typeof this.debug.info === 'function') {
      this.debug.info(`Registered plugin for hot reload: ${pluginName}`, { filePath })
    }
  }

  /**
   * Wrap plugin with development features
   */
  wrapPluginForDevelopment(plugin: AgentKitPlugin): AgentKitPlugin {
    if (!this.debugModeEnabled) {
      return plugin
    }
    
    const wrapper = createPluginDevelopmentWrapper(plugin.name, plugin, {
      enablePerformanceMonitoring: true,
      enableMemoryTracking: true,
      enableErrorTracking: true,
      enableDebugLogs: true,
      performanceThreshold: this.config.performanceThreshold || 100
    })
    
    return wrapper.getWrappedPlugin()
  }

  // ===== GETTERS =====

  get isDebugModeEnabled(): boolean {
    return this.debugModeEnabled
  }

  get metricsCollectorInstance(): MetricsCollector | undefined {
    return this.metricsCollector
  }

  get timelineInstance(): PluginExecutionTimeline | undefined {
    return this.timeline
  }

  get debugManagerInstance(): DebugManager | undefined {
    return this.debugManager
  }

  get timelineLoggerInstance(): LifecycleTimelineLogger | undefined {
    return this.timelineLogger
  }

  get pluginTracerInstance(): PluginExecutionTracer | undefined {
    return this.pluginTracer
  }

  // ===== CLEANUP =====

  /**
   * Cleanup observability resources
   */
  cleanup(): void {
    // Finalize timeline before cleanup
    this.timeline?.finalize()
    
    // Clean up hot reload manager if it has a cleanup method
    if (this.hotReloadManager && 'shutdown' in this.hotReloadManager && typeof this.hotReloadManager.shutdown === 'function') {
      this.hotReloadManager.shutdown()
    }
    this.debugManager?.reset()
    this.pluginTracer?.clearTraces()
    this.timelineLogger?.clear()
  }
}