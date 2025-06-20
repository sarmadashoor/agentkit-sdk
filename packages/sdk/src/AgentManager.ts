/**
 * Agent Manager - Core Orchestrator
 * 
 * Main orchestrator that coordinates all agent lifecycle, plugin execution,
 * sandboxed operations, and observability features.
 */

import { 
  Agent, 
  Transport, 
  AgentRuntimeHandle,
  ConnectAgentOptions as BaseConnectAgentOptions,
  AgentInput,
  AgentOutput
} from '@agentkit/types'
import { 
  AgentInitError,
  AgentHandleError,
  AgentShutdownError,
  TransportInitError,
  TransportSendError,
  TransportBackpressureError,
  getErrorMessage
} from './errors'
import { PluginVerificationError } from '@agentkit/errors'
import { debugLog } from './log'
import { ObservabilityTracker } from './observability'
import { MetricsCollector } from './observability/MetricsCollector'
import { PluginExecutionTimeline } from './observability/PluginExecutionTimeline'
import { BoundedExecutor } from './boundedExecutor'
import { CircuitBreaker } from './circuitBreaker'
import { Mutex } from './utils/mutex'
import { AsyncLock } from './utils/AsyncLock'
import { BackpressureQueue, BackpressureQueueOptions } from './BackpressureQueue'

// Import the extracted lifecycle modules
import { 
  AgentLifecycle, 
  LifecycleState,
  type LifecycleConfig,
  type LifecycleCallbacks
} from './lifecycle/AgentLifecycle'
import { 
  PluginRunner, 
  type PluginRunnerConfig,
  type PluginObservabilityHooks
} from './lifecycle/PluginRunner'
import { 
  SandboxedExecutor, 
  ExecutorState,
  type ExecutorConfig,
  type ExecutorCallbacks
} from './lifecycle/SandboxedExecutor'
import { 
  AgentObservability,
  type ObservabilityConfig,
  type DebugModeOptions
} from './lifecycle/AgentObservability'

// Re-export the state enum for backward compatibility
export { LifecycleState as AgentState } from './lifecycle/AgentLifecycle'

// Extended ConnectAgentOptions to include plugins and backpressure handling
interface ConnectAgentOptions extends BaseConnectAgentOptions {
  plugins?: any[] // AgentKitPlugin type from types package
  /** Enable backpressure fallback queue (default: true) */
  enableBackpressureQueue?: boolean
  /** Backpressure queue configuration options */
  backpressureQueueOptions?: BackpressureQueueOptions
  /** Enable debug mode with enhanced observability (default: false) */
  enableDebugMode?: boolean
  /** Observability configuration */
  observabilityConfig?: ObservabilityConfig
}

export class AgentManager {
  private agent: Agent
  private transport: Transport
  private options: ConnectAgentOptions
  private registeredScopes: string[]
  private agentId: string // Authoritative agent ID
  
  // Core components
  private observabilityTracker: ObservabilityTracker
  private boundedExecutor: BoundedExecutor
  private circuitBreaker?: CircuitBreaker
  private backpressureQueue?: BackpressureQueue
  private stateLock = new AsyncLock() // For state synchronization
  
  // Lifecycle modules
  private lifecycle: AgentLifecycle
  private pluginRunner: PluginRunner
  private executor: SandboxedExecutor
  private observability: AgentObservability

  constructor(
    agent: Agent,
    transport: Transport,
    options: ConnectAgentOptions,
    registeredScopes: string[],
    agentId: string
  ) {
    this.agent = agent
    this.transport = transport
    this.options = options
    this.registeredScopes = registeredScopes
    this.agentId = agentId

    // Initialize observability tracker with user-provided hooks
    this.observabilityTracker = new ObservabilityTracker(
      options.observability || {},
      options.debug || false
    )

    // Initialize bounded executor for concurrency control
    this.boundedExecutor = new BoundedExecutor({
      maxConcurrentRequests: 10,
      maxQueueSize: 100,
      requestTimeoutMs: 30000,
      maxPayloadSize: 1024 * 1024
    }, undefined, options.debug || false)

    // Initialize circuit breaker if enabled  
    if (options.circuitBreaker !== undefined) {
      this.circuitBreaker = new CircuitBreaker({
        name: `${this.agentId}-transport`,
        failureThreshold: 5,
        timeout: 30000,
        enabled: true,
        debug: options.debug || false,
        observabilityHooks: {
          onCircuitOpen: (event: any) => {
            this.observabilityTracker.emitCircuitBreakerStateChange({
              agentId: this.agentId,
              transportId: this.transport.id,
              circuitName: event.circuitName,
              fromState: event.fromState,
              toState: event.toState,
              timestamp: event.timestamp,
              reason: event.reason,
              metadata: event.metadata
            })
          },
          onCircuitClose: (event: any) => {
            this.observabilityTracker.emitCircuitBreakerStateChange({
              agentId: this.agentId,
              transportId: this.transport.id,
              circuitName: event.circuitName,
              fromState: event.fromState,
              toState: event.toState,
              timestamp: event.timestamp,
              reason: event.reason,
              metadata: event.metadata
            })
          },
          onCircuitHalfOpen: (event: any) => {
            this.observabilityTracker.emitCircuitBreakerStateChange({
              agentId: this.agentId,
              transportId: this.transport.id,
              circuitName: event.circuitName,
              fromState: event.fromState,
              toState: event.toState,
              timestamp: event.timestamp,
              reason: event.reason,
              metadata: event.metadata
            })
          },
          onRequestRejected: (circuitName: any, rejectedCount: any) => {
            this.observabilityTracker.emitCircuitBreakerRequestRejected({
              agentId: this.agentId,
              transportId: this.transport.id,
              circuitName,
              timestamp: Date.now(),
              rejectedCount,
              nextAttemptAt: this.circuitBreaker?.getStats().nextAttemptAt
            })
          }
        }
      })
    }

    // Initialize backpressure queue if enabled
    if (options.enableBackpressureQueue !== false) {
      this.backpressureQueue = new BackpressureQueue(
        this.transport,
        {
          debug: options.debug || false,
          ...options.backpressureQueueOptions
        },
        {
          onItemEnqueued: (item) => {
            this.observabilityTracker.emitBackpressureQueueEnqueued({
              agentId: this.agentId,
              transportId: this.transport.id,
              timestamp: Date.now(),
              itemId: item.id,
              queueSize: this.backpressureQueue!.getQueueSize(),
              attempts: item.attempts
            })
          },
          onItemProcessed: (item, processingTime) => {
            this.observabilityTracker.emitBackpressureQueueProcessed({
              agentId: this.agentId,
              transportId: this.transport.id,
              timestamp: Date.now(),
              itemId: item.id,
              queueSize: this.backpressureQueue!.getQueueSize(),
              processingTime,
              attempts: item.attempts
            })
          },
          onItemFailed: (item, error, willRetry) => {
            this.observabilityTracker.emitBackpressureQueueFailed({
              agentId: this.agentId,
              transportId: this.transport.id,
              timestamp: Date.now(),
              itemId: item.id,
              queueSize: this.backpressureQueue!.getQueueSize(),
              attempts: item.attempts,
              error,
              willRetry,
              maxRetries: options.backpressureQueueOptions?.maxRetries ?? 5
            })
          },
          onBackpressureResolved: (queueSize) => {
            this.observabilityTracker.emitBackpressureResolved({
              agentId: this.agentId,
              transportId: this.transport.id,
              timestamp: Date.now(),
              queueSize,
              totalProcessingTime: 0
            })
          }
        }
      )
    }

    // Initialize observability module
    this.observability = new AgentObservability(
      this.agentId,
      options.observabilityConfig || {},
      debugLog // Pass debug logger
    )
    this.observability.initialize()

    // Initialize plugin runner with observability hooks
    const pluginObservabilityHooks: PluginObservabilityHooks = {
      onPluginStart: (pluginName: string, hookName: string) => {
        // Timeline tracking handled by completion hooks (onPluginSuccess/onPluginError)
        if (this.observability.isDebugModeEnabled) {
          // Debug logging handled by PluginRunner
        }
      },
      onPluginSuccess: (pluginName: string, hookName: string, duration: number) => {
        this.observability.timelineInstance?.addExecution(hookName, pluginName, duration, 'success')
        this.observability.metricsCollectorInstance?.recordPluginExecution(pluginName, hookName, duration, true)
      },
      onPluginError: (pluginName: string, hookName: string, error: Error, duration: number) => {
        this.observability.timelineInstance?.addExecution(hookName, pluginName, duration, 'error', error.message)
        this.observability.metricsCollectorInstance?.recordPluginExecution(pluginName, hookName, duration, false)
      },
      onPluginTimeout: (pluginName: string, hookName: string, timeout: number) => {
        this.observability.timelineInstance?.addExecution(hookName, pluginName, timeout, 'timeout')
        this.observability.metricsCollectorInstance?.recordPluginExecution(pluginName, hookName, timeout, false, true)
      }
    }

    this.pluginRunner = new PluginRunner(
      {
        agentId: this.agentId,
        transportId: this.transport.id,
        verify: options.verify,
        debug: options.debug,
        debugModeEnabled: this.observability.isDebugModeEnabled
      },
      options.plugins || [],
      pluginObservabilityHooks
    )

    // Initialize lifecycle manager
    const lifecycleCallbacks: LifecycleCallbacks = {
      onInit: options.onInit,
      onShutdown: options.onShutdown,
      onError: options.onError,
      onCleanup: options.onCleanup,
      onPluginHook: async (hookName: string, ...args: any[]) => {
        if (hookName === 'onInit' || hookName === 'onShutdown') {
          return this.pluginRunner.callPluginHook(hookName as any, args[0])
        } else if (hookName === 'onSend' || hookName === 'onError') {
          return this.pluginRunner.callPluginHook(hookName as any, args[0], args[1])
        } else {
          return this.pluginRunner.callPluginHook(hookName as any, ...args)
        }
      },
      onExposeTimeline: () => this.observability.exposeTimelineGlobally()
    }

    this.lifecycle = new AgentLifecycle(
      this.agent,
      this.transport,
      {
        agentId: this.agentId,
        scope: Array.isArray(options.scope) ? options.scope : (options.scope ? [options.scope] : undefined),
        techStack: options.techStack ? [options.techStack] : undefined,
        debug: options.debug
      },
      lifecycleCallbacks,
      this.observabilityTracker,
      this.stateLock,
      this.registeredScopes,
      this.boundedExecutor,
      this.circuitBreaker,
      this.backpressureQueue,
      this.observability.metricsCollectorInstance
    )

    // Initialize sandboxed executor
    const executorCallbacks: ExecutorCallbacks = {
      onPluginHook: async (hookName: string, ...args: any[]) => {
        if (hookName === 'onInit' || hookName === 'onShutdown') {
          return this.pluginRunner.callPluginHook(hookName as any, args[0])
        } else if (hookName === 'onSend' || hookName === 'onError') {
          return this.pluginRunner.callPluginHook(hookName as any, args[0], args[1])
        } else {
          return this.pluginRunner.callPluginHook(hookName as any, ...args)
        }
      },
      onError: (error: Error) => options.onError?.(error),
      onOutput: options.onOutput
    }

    this.executor = new SandboxedExecutor(
      this.agent,
      this.transport,
      {
        agentId: this.agentId,
        transportId: this.transport.id,
        debug: options.debug
      },
      executorCallbacks,
      this.boundedExecutor,
      this.observabilityTracker,
      this.stateLock,
      this.circuitBreaker,
      this.backpressureQueue,
      this.observability.metricsCollectorInstance
    )

    debugLog.lifecycle('constructed', 'AgentManager', {
      agentId: this.agentId,
      factoryAgentId: agent.id,
      transportId: transport.id,
      hasOnOutput: !!options.onOutput,
      registeredScopes,
      requestedScopes: options.scope || [],
      hasObservabilityHooks: this.observabilityTracker.hasHooks()
    }, options.debug)
    
    // Log scope mismatch in debug mode
    this.lifecycle.checkScopeCompatibility()
  }

  /**
   * Initialize the agent manager and all its components
   */
  async initialize(): Promise<void> {
    // Initialize plugins first
    await this.pluginRunner.initialize()
    
    // Set executor state to match lifecycle state
    this.executor.setState(ExecutorState.IDLE)
    
    // Initialize lifecycle (agent, transport)
    await this.lifecycle.initialize()
    
    // Update executor state to active
    this.executor.setState(ExecutorState.ACTIVE)
  }

  /**
   * Send input through the agent processing pipeline
   */
  async send(input: AgentInput): Promise<void> {
    return this.executor.send(input)
  }

  /**
   * Shutdown the agent manager and all its components
   */
  async shutdown(): Promise<void> {
    // Set executor state to shutting down
    this.executor.setState(ExecutorState.SHUTTING_DOWN)
    
    // Shutdown lifecycle (will handle agent, transport, and other components)
    await this.lifecycle.shutdown()
    
    // Cleanup plugin runner
    await this.pluginRunner.cleanup()
    
    // Cleanup observability
    this.observability.cleanup()
    
    // Set executor state to terminated
    this.executor.setState(ExecutorState.TERMINATED)
  }

  /**
   * Create runtime handle for external use
   */
  createRuntimeHandle(): AgentRuntimeHandle {
    return {
      send: this.send.bind(this),
      shutdown: this.shutdown.bind(this),
      metadata: {
        agentId: this.agentId,
        transportId: this.transport.id,
        registeredScopes: this.registeredScopes,
        requestedScopes: this.options.scope || []
      }
    }
  }

  // ===== STATE AND STATUS METHODS =====

  /**
   * Get current state information
   */
  getState(): { 
    state: LifecycleState
    agentId: string
    transportId: string
    initialized: boolean
    shutdown: boolean 
  } {
    return this.lifecycle.getStateInfo()
  }

  /**
   * Get transport status including backpressure information
   */
  getTransportStatus() {
    return this.lifecycle.getTransportStatus()
  }

  // ===== OBSERVABILITY PUBLIC API =====

  /**
   * Get comprehensive metrics in Prometheus-compatible format
   */
  getMetrics() {
    return this.observability.getMetrics()
  }

  /**
   * Get plugin execution timeline for debugging
   */
  getDebugTimeline() {
    return this.observability.getDebugTimeline()
  }

  /**
   * Export metrics in Prometheus text format
   */
  exportPrometheusMetrics(): string {
    return this.observability.exportPrometheusMetrics()
  }

  /**
   * Print timeline to console for debugging
   */
  printTimeline(): void {
    this.observability.printTimeline()
  }

  /**
   * Get performance statistics for plugin analysis
   */
  getPerformanceStats() {
    return this.observability.getPerformanceStats()
  }

  /**
   * Enable debug mode with enhanced features
   */
  enableDebugMode(options: DebugModeOptions = {}): void {
    this.observability.enableDebugMode(options)
  }

  /**
   * Get debug timeline with comprehensive execution data
   */
  getEnhancedDebugTimeline() {
    return this.observability.getEnhancedDebugTimeline()
  }

  /**
   * Get plugin performance report
   */
  getPluginPerformanceReport(pluginName?: string) {
    return this.observability.getPluginPerformanceReport(pluginName)
  }

  /**
   * Generate Graphviz execution graph
   */
  generateExecutionGraph(format: 'dot' | 'svg' = 'dot') {
    return this.observability.generateExecutionGraph(format)
  }

  /**
   * Display debug timeline in console
   */
  displayDebugTimeline(format: 'table' | 'tree' | 'json' = 'table'): void {
    this.observability.displayDebugTimeline(format)
  }

  /**
   * Get debug snapshot with all debug information
   */
  getDebugSnapshot() {
    return this.observability.getDebugSnapshot()
  }

  /**
   * Export debug data as JSON
   */
  exportDebugData(): string {
    return this.observability.exportDebugData()
  }

  /**
   * Clear debug data
   */
  clearDebugData(): void {
    this.observability.clearDebugData()
  }

  /**
   * Register plugin for hot reload (development mode)
   */
  registerPluginForHotReload(pluginName: string, filePath: string): void {
    this.observability.registerPluginForHotReload(pluginName, filePath)
  }

  /**
   * Wrap plugin with development features
   */
  wrapPluginForDevelopment(plugin: any) {
    return this.observability.wrapPluginForDevelopment(plugin)
  }
}