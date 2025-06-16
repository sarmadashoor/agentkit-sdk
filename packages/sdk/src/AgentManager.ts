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
import { debugLog } from './log'
import { validateAgentConfig, validateTransportConfig } from './validation'
import { ObservabilityTracker } from './observability'
import { MetricsCollector } from './observability/MetricsCollector'
import { PluginExecutionTimeline } from './observability/PluginExecutionTimeline'
import { BoundedExecutor } from './boundedExecutor'
import { CircuitBreaker } from './circuitBreaker'
import { PluginManager, AgentKitPlugin, AgentContext, SendPayload } from './plugins'
import { Mutex } from './utils/mutex'
import { SharedAsyncLock } from './utils/AsyncLock'
import { guardAgainstRecursivePluginCalls } from './plugins/PluginExecutionContext'
import { BackpressureQueue, BackpressureQueueOptions } from './BackpressureQueue'
import { 
  DebugManager, 
  LifecycleTimelineLogger, 
  PluginExecutionTracer,
  GraphvizGenerator,
  HotReloadManager,
  createPluginDevelopmentWrapper,
  measurePluginPerformance,
  isDebugModeEnabled,
  createDebugContext,
  logPluginStart,
  logPluginSuccess,
  logPluginError,
  logPluginTimeout,
  type DebugTimeline,
  type PluginPerformanceReport,
  type DebugSnapshot
} from './debug-tools'

// Agent lifecycle states - replaces boolean flags for better state management
export enum AgentState {
  IDLE = 'idle',           // Initial state, not yet initialized
  ACTIVE = 'active',       // Initialized and ready for operations
  SHUTTING_DOWN = 'shutting_down', // Shutdown initiated, rejecting new operations
  TERMINATED = 'terminated' // Fully shutdown, cannot be reused
}

// Extended ConnectAgentOptions to include plugins and backpressure handling
interface ConnectAgentOptions extends BaseConnectAgentOptions {
  plugins?: AgentKitPlugin[]
  /** Enable backpressure fallback queue (default: true) */
  enableBackpressureQueue?: boolean
  /** Backpressure queue configuration options */
  backpressureQueueOptions?: BackpressureQueueOptions
  /** Enable debug mode with enhanced observability (default: false) */
  enableDebugMode?: boolean
  /** Observability configuration */
  observabilityConfig?: {
    enableMetricsCollection?: boolean
    enableTimelineDebug?: boolean
    performanceThreshold?: number
    enableConsoleWarnings?: boolean
  }
}

export class AgentManager {
  private agent: Agent
  private transport: Transport
  private options: ConnectAgentOptions
  private state: AgentState = AgentState.IDLE
  private registeredScopes: string[]
  private agentId: string // Authoritative agent ID
  private cleanupCalled = false // Prevent multiple cleanup calls
  private observabilityTracker: ObservabilityTracker
  private boundedExecutor: BoundedExecutor // Always use bounded executor for concurrency control
  private circuitBreaker?: CircuitBreaker
  private pluginManager: PluginManager
  private backpressureQueue?: BackpressureQueue
  private metricsCollector?: MetricsCollector
  private timeline?: PluginExecutionTimeline
  private debugModeEnabled: boolean
  
  // Enhanced debug tools
  private debugManager?: DebugManager
  private timelineLogger?: LifecycleTimelineLogger
  private pluginTracer?: PluginExecutionTracer
  private graphvizGenerator?: GraphvizGenerator
  private hotReloadManager?: HotReloadManager
  private debug = createDebugContext('AgentManager')
  
  // Critical section protection - using shared AsyncLock for send/shutdown coordination
  private stateLock = SharedAsyncLock.getInstance() // Protects state transitions and send operations

  constructor(
    agent: Agent, 
    transport: Transport, 
    options: ConnectAgentOptions,
    registeredScopes: string[] = [],
    agentId?: string
  ) {
    this.agent = agent
    this.transport = transport
    this.options = options
    this.registeredScopes = registeredScopes
    // Use provided agentId or fall back to agent.id for backward compatibility
    this.agentId = agentId || agent.id
    this.debugModeEnabled = options.enableDebugMode || isDebugModeEnabled()
    
    // Initialize observability tracker
    this.observabilityTracker = new ObservabilityTracker(
      options.observability || {},
      options.debug || false
    )
    
    // Initialize metrics collector if enabled
    if (options.observabilityConfig?.enableMetricsCollection !== false) {
      this.metricsCollector = new MetricsCollector({
        platform: typeof window !== 'undefined' ? 'browser' : 'node'
      })
    }
    
    // Initialize plugin execution timeline if enabled
    if (options.observabilityConfig?.enableTimelineDebug !== false) {
      this.timeline = new PluginExecutionTimeline({
        platform: typeof window !== 'undefined' ? 'browser' : 'node',
        warningThreshold: options.observabilityConfig?.performanceThreshold,
        enableConsoleWarnings: options.observabilityConfig?.enableConsoleWarnings !== false
      })
    }
    
    // Initialize enhanced debug tools if debug mode is enabled
    if (this.debugModeEnabled) {
      this.initializeDebugTools()
    }
    
    // Always initialize bounded executor for concurrency control and backpressure
    // Use provided limits or sensible defaults
    this.boundedExecutor = new BoundedExecutor(
      options.resourceLimits || {
        maxConcurrentRequests: 10,
        maxQueueSize: 50,
        requestTimeoutMs: 30000,
        maxPayloadSize: 1024 * 1024 // 1MB
      },
      undefined, // observabilityHooks - can be added later if needed
      options.debug || false
    )
    
    // Initialize circuit breaker if enabled via feature flags
    if (options.features?.enableCircuitBreaker) {
      this.circuitBreaker = new CircuitBreaker({
        ...options.circuitBreaker,
        enabled: true,
        name: `circuit-breaker-${this.agentId}-${this.transport.id}`,
        debug: options.debug || false,
        observabilityHooks: {
          onCircuitOpen: (event) => {
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
          onCircuitClose: (event) => {
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
          onCircuitHalfOpen: (event) => {
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
          onRequestRejected: (circuitName, rejectedCount) => {
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
    
    // Initialize plugin manager with observability hooks
    this.pluginManager = new PluginManager({
      debug: options.debug || false,
      observabilityHooks: {
        onPluginStart: (pluginName: string, hookName: string) => {
          this.timeline?.startExecution(hookName, pluginName)
          // Log visual trace output
          if (this.debugModeEnabled) {
            logPluginStart(pluginName, hookName)
          }
        },
        onPluginSuccess: (pluginName: string, hookName: string, duration: number) => {
          this.timeline?.addExecution(hookName, pluginName, duration, 'success')
          this.metricsCollector?.recordPluginExecution(pluginName, hookName, duration, true)
          // Log visual trace output
          if (this.debugModeEnabled) {
            logPluginSuccess(pluginName, hookName, duration)
          }
        },
        onPluginError: (pluginName: string, hookName: string, error: Error) => {
          const duration = Date.now() // Fallback duration
          this.timeline?.addExecution(hookName, pluginName, duration, 'error', error.message)
          this.metricsCollector?.recordPluginExecution(pluginName, hookName, duration, false)
          // Log visual trace output
          if (this.debugModeEnabled) {
            logPluginError(pluginName, hookName, error.message, duration)
          }
        },
        onPluginTimeout: (pluginName: string, hookName: string, timeout: number) => {
          this.timeline?.addExecution(hookName, pluginName, timeout, 'timeout')
          this.metricsCollector?.recordPluginExecution(pluginName, hookName, timeout, false, true)
          // Log visual trace output
          if (this.debugModeEnabled) {
            logPluginTimeout(pluginName, hookName, timeout)
          }
        }
      }
    })
    
    // Register plugins if provided
    if (options.plugins) {
      for (const plugin of options.plugins) {
        this.pluginManager.register(plugin)
      }
    }
    
    // Initialize backpressure queue if enabled
    if (options.enableBackpressureQueue !== false) { // Default to enabled
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
              totalProcessingTime: 0 // Could track this if needed
            })
          }
        }
      )
    }

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
    this.checkScopeCompatibility()
  }

  async initialize(): Promise<void> {
    return this.stateLock.lock(async () => {
      // Check state under lock
      if (this.state === AgentState.ACTIVE) {
        throw new AgentInitError('AgentManager is already initialized', {
          context: { agentId: this.agentId, transportId: this.transport.id, currentState: this.state }
        })
      }

      if (this.state === AgentState.SHUTTING_DOWN || this.state === AgentState.TERMINATED) {
        throw new AgentInitError('AgentManager has been shutdown and cannot be reinitialized', {
          context: { agentId: this.agentId, transportId: this.transport.id, currentState: this.state }
        })
      }

    // Track initialization with observability and metrics
    const startTime = Date.now()
    const result = await this.observabilityTracker.trackRequest(
      'init',
      this.agentId,
      this.transport.id,
      async (requestId) => {
        debugLog.lifecycle('initializing', 'AgentManager', {
          agentId: this.agentId,
          transportId: this.transport.id,
          requestId
        }, this.options.debug)

        try {
          // Initialize transport first
          debugLog.lifecycle('init start', 'Transport', { 
            transportId: this.transport.id,
            config: this.transport.config,
            requestId
          }, this.options.debug)

          const transportConfig = validateTransportConfig(this.transport.config, this.options.debug)
          await this.transport.init(transportConfig)

          debugLog.lifecycle('init complete', 'Transport', { 
            transportId: this.transport.id,
            requestId
          }, this.options.debug)

        } catch (error) {
          debugLog.error('transport initialization', error as Error, this.options.debug)
          
          // Track the specific error phase
          this.observabilityTracker.trackError(
            error as Error,
            'init',
            this.agentId,
            this.transport.id,
            { phase: 'transport', requestId }
          )

          const transportError = new TransportInitError(
            `Failed to initialize transport "${this.transport.id}": ${getErrorMessage(error)}`,
            { 
              cause: error instanceof Error ? error : new Error(String(error)),
              context: { 
                transportId: this.transport.id, 
                transportName: this.transport.name,
                config: this.transport.config,
                requestId
              }
            }
          )
          this.callOnError(transportError)
          throw transportError
        }

        try {
          // Then initialize agent
          const agentConfig = {
            scope: this.options.scope,
            techStack: this.options.techStack
          }

          debugLog.lifecycle('init start', 'Agent', {
            agentId: this.agentId,
            config: agentConfig,
            requestId
          }, this.options.debug)

          const validatedConfig = validateAgentConfig(agentConfig, this.options.debug)
          await this.agent.init(validatedConfig)

          debugLog.lifecycle('init complete', 'Agent', {
            agentId: this.agentId,
            requestId
          }, this.options.debug)

        } catch (error) {
          debugLog.error('agent initialization', error as Error, this.options.debug)
          
          // Track the specific error phase
          this.observabilityTracker.trackError(
            error as Error,
            'init',
            this.agentId,
            this.transport.id,
            { phase: 'agent', requestId }
          )

          const agentError = new AgentInitError(
            `Failed to initialize agent "${this.agentId}": ${getErrorMessage(error)}`,
            { 
              cause: error instanceof Error ? error : new Error(String(error)),
              context: { 
                agentId: this.agentId, 
                agentName: this.agent.name,
                version: this.agent.version,
                scope: this.options.scope,
                techStack: this.options.techStack,
                requestId
              }
            }
          )
          this.callOnError(agentError)
          throw agentError
        }

        // Atomically transition to active state
        this.state = AgentState.ACTIVE
        debugLog.lifecycle('initialized', 'AgentManager', { requestId, newState: this.state }, this.options.debug)
        
        // Call plugin onInit hooks
        await this.callPluginHook('onInit', {
          agentId: this.agentId,
          transportId: this.transport.id,
          requestId,
          timestamp: Date.now()
        })
        
        // Call onInit lifecycle hook
        this.callOnInit()
        
        // Expose timeline globally if debug mode is enabled
        this.exposeTimelineGlobally()
      },
      {
        agentName: this.agent.name,
        transportName: this.transport.name,
        hasScope: !!(this.options.scope && this.options.scope.length > 0)
      }
    )
    
    // Record initialization metrics
    const duration = Date.now() - startTime
    this.metricsCollector?.recordInitLatency(duration)
    
    return result
    }) // Close stateLock.lock
  }

  async send(input: AgentInput): Promise<void> {
    // Guard against recursive plugin calls
    guardAgainstRecursivePluginCalls('AgentManager.send')
    
    // Use shared AsyncLock to prevent race conditions with shutdown
    return this.stateLock.lock(async () => {
      // Check state under lock to prevent race conditions
      if (this.state === AgentState.SHUTTING_DOWN || this.state === AgentState.TERMINATED) {
        throw new AgentShutdownError('AgentManager has been shutdown', {
          context: { agentId: this.agentId, transportId: this.transport.id, currentState: this.state }
        })
      }

      if (this.state !== AgentState.ACTIVE) {
        throw new AgentHandleError('AgentManager not initialized. Call initialize() first.', {
          context: { agentId: this.agentId, transportId: this.transport.id, currentState: this.state }
        })
      }

      // State is safe, proceed with bounded execution
      return this.executeSendOperation(input)
    })
  }

  /**
   * Internal send operation that's called after state validation
   */
  private async executeSendOperation(input: AgentInput): Promise<void> {
    // Use bounded executor for all send operations with proper concurrency control
    return this.boundedExecutor.execute(
      `send-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      async () => {
        // Double-check state after waiting in queue
        if (this.state !== AgentState.ACTIVE) {
          throw new AgentShutdownError('AgentManager has been shutdown during operation', {
            context: { agentId: this.agentId, transportId: this.transport.id, currentState: this.state }
          })
        }

        // Wrap with circuit breaker if enabled
        const operationFn = async () => {
          const startTime = Date.now()
          const result = await this.observabilityTracker.trackRequest(
            'send',
            this.agentId,
            this.transport.id,
            async (requestId) => {
              await this.processSendOperation(input, requestId)
            },
            {
              inputType: typeof input,
              hasInput: input !== undefined && input !== null
            }
          )
          
          // Record send metrics
          const duration = Date.now() - startTime
          this.metricsCollector?.recordSendLatency(duration)
          
          return result
        }
        
        if (this.circuitBreaker) {
          return this.circuitBreaker.execute(operationFn)
        }
        
        return operationFn()
      },
      input // Pass input as payload for size validation
    )
  }

  private async processSendOperation(input: AgentInput, requestId: string): Promise<void> {
    debugLog.operation('send start', { 
      agentId: this.agentId,
      transportId: this.transport.id,
      inputType: typeof input,
      concurrencyProtected: true,
      requestId
    }, this.options.debug)

    // Call plugin onSend hooks
    await this.callPluginHook('onSend', {
      input,
      metadata: {}
    }, {
      agentId: this.agentId,
      transportId: this.transport.id,
      requestId,
      timestamp: Date.now()
    })

    let output: AgentOutput

    try {
      // Process input through agent
      debugLog.lifecycle('handle start', 'Agent', {
        agentId: this.agentId,
        inputType: typeof input,
        requestId
      }, this.options.debug)

      output = await this.agent.handle(input)

      debugLog.lifecycle('handle complete', 'Agent', {
        agentId: this.agentId,
        outputType: typeof output,
        requestId
      }, this.options.debug)

    } catch (error) {
      debugLog.error('agent handle operation', error as Error, this.options.debug)
      
      // Track the specific error phase
      this.observabilityTracker.trackError(
        error as Error,
        'handle',
        this.agentId,
        this.transport.id,
        { phase: 'handle', requestId, inputType: typeof input }
      )

      const handleError = new AgentHandleError(
        `Agent "${this.agentId}" failed to handle input: ${getErrorMessage(error)}`,
        { 
          cause: error instanceof Error ? error : new Error(String(error)),
          context: { 
            agentId: this.agentId,
            inputType: typeof input,
            input: this.options.debug ? input : '[input hidden in non-debug mode]',
            requestId
          }
        }
      )
      
      // Call plugin onError hooks
      await this.callPluginHook('onError', handleError, {
        agentId: this.agentId,
        transportId: this.transport.id,
        requestId,
        timestamp: Date.now()
      })
      
      this.callOnError(handleError)
      throw handleError
    }

    try {
      // Check transport backpressure before sending
      if (!this.transport.canAcceptMore()) {
        // Emit backpressure detected event
        this.observabilityTracker.emitBackpressureDetected({
          agentId: this.agentId,
          transportId: this.transport.id,
          timestamp: Date.now(),
          requestId,
          transportStatus: this.transport.getStatus?.()
        })
        
        if (this.backpressureQueue) {
          // Use fallback queue for retry with exponential backoff
          debugLog.operation('using backpressure fallback queue', {
            transportId: this.transport.id,
            requestId,
            queueSize: this.backpressureQueue.getQueueSize()
          }, this.options.debug)
          
          await this.backpressureQueue.enqueue(output)
          
          debugLog.operation('queued for backpressure retry', {
            transportId: this.transport.id,
            requestId,
            newQueueSize: this.backpressureQueue.getQueueSize()
          }, this.options.debug)
          
          return // Successfully queued, will be retried later
        } else {
          // No fallback queue - throw error immediately
          const backpressureError = new TransportBackpressureError(
            this.transport.id,
            `Transport "${this.transport.id}" is under backpressure and cannot accept more messages`,
            undefined, // currentLoad unknown
            undefined  // maxCapacity unknown
          )
          
          debugLog.warn('transport backpressure detected, no fallback queue', {
            transportId: this.transport.id,
            requestId
          }, this.options.debug)
          
          // Track backpressure as an error
          this.observabilityTracker.trackError(
            backpressureError,
            'send',
            this.agentId,
            this.transport.id,
            { phase: 'backpressure', requestId, outputType: typeof output }
          )
          
          throw backpressureError
        }
      }

      // Send output through transport
      debugLog.lifecycle('send start', 'Transport', {
        transportId: this.transport.id,
        outputType: typeof output,
        requestId
      }, this.options.debug)

      await this.transport.send(output)

      debugLog.lifecycle('send complete', 'Transport', {
        transportId: this.transport.id,
        requestId
      }, this.options.debug)

    } catch (error) {
      debugLog.error('transport send operation', error as Error, this.options.debug)
      
      // Track the specific error phase
      this.observabilityTracker.trackError(
        error as Error,
        'send',
        this.agentId,
        this.transport.id,
        { phase: 'send', requestId, outputType: typeof output }
      )

      const sendError = new TransportSendError(
        `Transport "${this.transport.id}" failed to send output: ${getErrorMessage(error)}`,
        { 
          cause: error instanceof Error ? error : new Error(String(error)),
          context: { 
            transportId: this.transport.id,
            outputType: typeof output,
            output: this.options.debug ? output : '[output hidden in non-debug mode]',
            requestId
          }
        }
      )
      
      // Call plugin onError hooks
      await this.callPluginHook('onError', sendError, {
        agentId: this.agentId,
        transportId: this.transport.id,
        requestId,
        timestamp: Date.now()
      })
      
      this.callOnError(sendError)
      throw sendError
    }

    // Call onOutput callback if provided
    if (this.options.onOutput) {
      try {
        debugLog.operation('onOutput callback', { agentId: this.agentId, requestId }, this.options.debug)
        this.options.onOutput(output)
      } catch (error) {
        // Don't fail the entire operation for callback errors, but log them
        debugLog.error('onOutput callback', error as Error, this.options.debug)
        // In debug mode, we could optionally warn the developer
        if (this.options.debug) {
          debugLog.warn('onOutput callback failed', { error: getErrorMessage(error) }, this.options.debug)
        }
      }
    }

    debugLog.operation('send complete', { 
      agentId: this.agentId,
      transportId: this.transport.id,
      concurrencyProtected: true,
      requestId
    }, this.options.debug)
  }

  async shutdown(): Promise<void> {
    // Guard against recursive plugin calls
    guardAgainstRecursivePluginCalls('AgentManager.shutdown')
    
    // Use shared AsyncLock to ensure atomic shutdown operation and prevent race with send
    return this.stateLock.lock(async () => {
      // Check current state under lock
      if (this.state === AgentState.SHUTTING_DOWN || this.state === AgentState.TERMINATED) {
        debugLog.operation('shutdown (already shutdown)', { 
          agentId: this.agentId, 
          currentState: this.state 
        }, this.options.debug)
        return // Already shutdown or shutting down
      }

      if (this.state === AgentState.IDLE) {
        throw new AgentShutdownError('AgentManager not initialized', {
          context: { agentId: this.agentId, transportId: this.transport.id, currentState: this.state }
        })
      }

      // Atomically transition to shutting down state - this will block new send operations
      this.state = AgentState.SHUTTING_DOWN
      debugLog.lifecycle('state transition', 'AgentManager', { 
        agentId: this.agentId, 
        newState: this.state 
      }, this.options.debug)

      // Proceed with shutdown under lock protection
      return this.executeShutdownOperation()
    })
  }

  /**
   * Internal shutdown operation that's called after state validation
   */
  private async executeShutdownOperation(): Promise<void> {
    // Track shutdown with observability and metrics
    const startTime = Date.now()
    const result = await this.observabilityTracker.trackRequest(
      'shutdown',
      this.agentId,
      this.transport.id,
      async (requestId) => {
        debugLog.lifecycle('shutdown start', 'AgentManager', {
          agentId: this.agentId,
          transportId: this.transport.id,
          requestId
        }, this.options.debug)

        // State already set to SHUTTING_DOWN in shutdown() method

        // Shutdown bounded executor to reject queued operations and wait for active ones
        debugLog.lifecycle('shutdown start', 'BoundedExecutor', { 
          activeRequests: this.boundedExecutor.getStats().activeRequests,
          queuedRequests: this.boundedExecutor.getStats().queuedRequests,
          requestId 
        }, this.options.debug)
        
        await this.boundedExecutor.shutdown()
        
        debugLog.lifecycle('shutdown complete', 'BoundedExecutor', { 
          requestId 
        }, this.options.debug)

        // Shutdown circuit breaker if it exists
        if (this.circuitBreaker) {
          debugLog.lifecycle('shutdown start', 'CircuitBreaker', { 
            circuitBreakerName: this.circuitBreaker.getStats().state,
            requestId 
          }, this.options.debug)
          
          this.circuitBreaker.shutdown()
          
          debugLog.lifecycle('shutdown complete', 'CircuitBreaker', { 
            requestId 
          }, this.options.debug)
        }

        // Shutdown plugin manager
        debugLog.lifecycle('shutdown start', 'PluginManager', { 
          pluginCount: this.pluginManager.getPlugins().length,
          requestId 
        }, this.options.debug)
        
        this.pluginManager.shutdown()
        
        debugLog.lifecycle('shutdown complete', 'PluginManager', { 
          requestId 
        }, this.options.debug)

        // Shutdown backpressure queue if it exists
        if (this.backpressureQueue) {
          debugLog.lifecycle('shutdown start', 'BackpressureQueue', { 
            queueSize: this.backpressureQueue.getQueueSize(),
            stats: this.backpressureQueue.getStats(),
            requestId 
          }, this.options.debug)
          
          this.backpressureQueue.shutdown()
          
          debugLog.lifecycle('shutdown complete', 'BackpressureQueue', { 
            requestId 
          }, this.options.debug)
        }

        // Shutdown observability tracker
        debugLog.lifecycle('shutdown start', 'ObservabilityTracker', { 
          requestId 
        }, this.options.debug)
        
        this.observabilityTracker.shutdown()
        
        debugLog.lifecycle('shutdown complete', 'ObservabilityTracker', { 
          requestId 
        }, this.options.debug)

        try {
          // Shutdown transport if it has a shutdown method
          if ('shutdown' in this.transport && typeof this.transport.shutdown === 'function') {
            debugLog.lifecycle('shutdown start', 'Transport', { 
              transportId: this.transport.id, 
              requestId 
            }, this.options.debug)
            
            await (this.transport as any).shutdown()
            
            debugLog.lifecycle('shutdown complete', 'Transport', { 
              transportId: this.transport.id, 
              requestId 
            }, this.options.debug)
          }

          // Shutdown agent
          debugLog.lifecycle('shutdown start', 'Agent', { 
            agentId: this.agentId, 
            requestId 
          }, this.options.debug)
          
          await this.agent.shutdown()
          
          debugLog.lifecycle('shutdown complete', 'Agent', { 
            agentId: this.agentId, 
            requestId 
          }, this.options.debug)

        } catch (error) {
          debugLog.error('agent shutdown', error as Error, this.options.debug)
          
          // Track the specific error phase
          this.observabilityTracker.trackError(
            error as Error,
            'shutdown',
            this.agentId,
            this.transport.id,
            { phase: 'shutdown', requestId }
          )

          const shutdownError = new AgentShutdownError(
            `Agent "${this.agentId}" failed to shutdown: ${getErrorMessage(error)}`,
            { 
              cause: error instanceof Error ? error : new Error(String(error)),
              context: { 
                agentId: this.agentId, 
                agentName: this.agent.name,
                requestId
              }
            }
          )
          this.callOnError(shutdownError)
          
          // Mark as terminated and call cleanup even if agent shutdown failed
          this.state = AgentState.TERMINATED
          
          // Call onShutdown and onCleanup hooks even on failure
          this.callOnShutdown()
          this.callOnCleanup()
          
          throw shutdownError
        }
        
        // Finalize shutdown state
        this.state = AgentState.TERMINATED

        debugLog.lifecycle('shutdown complete', 'AgentManager', { 
          requestId, 
          finalState: this.state 
        }, this.options.debug)
        
        // Call plugin onShutdown hooks
        await this.callPluginHook('onShutdown', {
          agentId: this.agentId,
          transportId: this.transport.id,
          requestId,
          timestamp: Date.now()
        })
        
        // Call onShutdown lifecycle hook
        this.callOnShutdown()
        
        // Call onCleanup lifecycle hook after successful shutdown
        this.callOnCleanup()
      },
      {
        agentName: this.agent.name,
        transportName: this.transport.name,
        wasInitialized: this.state === AgentState.ACTIVE
      }
    )
    
    // Record shutdown metrics
    const duration = Date.now() - startTime
    this.metricsCollector?.recordShutdownLatency(duration)
    this.timeline?.finalize()
    
    return result
  }

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

  // Utility methods for debugging and testing
  getState(): { state: AgentState; agentId: string; transportId: string; 
                initialized: boolean; shutdown: boolean } {
    return {
      state: this.state,
      agentId: this.agentId,
      transportId: this.transport.id,
      // Backward compatibility flags
      initialized: this.state === AgentState.ACTIVE,
      shutdown: this.state === AgentState.SHUTTING_DOWN || this.state === AgentState.TERMINATED
    }
  }

  /**
   * Get transport status including backpressure information
   */
  getTransportStatus() {
    if (typeof this.transport.getStatus === 'function') {
      return this.transport.getStatus()
    }
    
    // Fallback for transports without getStatus
    const canAcceptMore = typeof this.transport.canAcceptMore === 'function' ?
      this.transport.canAcceptMore() : true
    
    return {
      canAcceptMore,
      queueSize: 0, // Unknown
      maxQueueSize: undefined,
      isHealthy: this.state === AgentState.ACTIVE,
      healthMessage: this.state === AgentState.ACTIVE ? 'Transport operational' : 'Transport not ready'
    }
  }

  // Lifecycle hook helpers - wrapped in try/catch to avoid cascading failures
  private callOnInit(): void {
    if (this.options.onInit) {
      try {
        debugLog.lifecycle('calling onInit hook', 'AgentManager', { agentId: this.agentId }, this.options.debug)
        this.options.onInit(this.agentId)
      } catch (error) {
        debugLog.error('onInit hook', error as Error, this.options.debug)
        // Don't throw - hooks should not break the main flow
        if (this.options.debug) {
          debugLog.warn('onInit hook failed', { error: getErrorMessage(error) }, this.options.debug)
        }
      }
    }
  }

  private callOnShutdown(): void {
    if (this.options.onShutdown) {
      try {
        debugLog.lifecycle('calling onShutdown hook', 'AgentManager', { agentId: this.agentId }, this.options.debug)
        this.options.onShutdown(this.agentId)
      } catch (error) {
        debugLog.error('onShutdown hook', error as Error, this.options.debug)
        // Don't throw - hooks should not break the main flow
        if (this.options.debug) {
          debugLog.warn('onShutdown hook failed', { error: getErrorMessage(error) }, this.options.debug)
        }
      }
    }
  }

  private callOnError(err: Error): void {
    if (this.options.onError) {
      try {
        debugLog.lifecycle('calling onError hook', 'AgentManager', { 
          agentId: this.agentId, 
          errorType: err.constructor.name,
          errorMessage: err.message 
        }, this.options.debug)
        this.options.onError(err)
      } catch (error) {
        debugLog.error('onError hook', error as Error, this.options.debug)
        // Don't throw - hooks should not break the main flow
        if (this.options.debug) {
          debugLog.warn('onError hook failed', { error: getErrorMessage(error) }, this.options.debug)
        }
      }
    }
  }

  private callOnCleanup(): void {
    if (this.options.onCleanup && !this.cleanupCalled) {
      this.cleanupCalled = true // Prevent multiple cleanup calls
      try {
        debugLog.lifecycle('calling onCleanup hook', 'AgentManager', { agentId: this.agentId }, this.options.debug)
        this.options.onCleanup(this.agentId)
        if (this.options.debug) {
          debugLog.lifecycle('cleanup hook fired', 'AgentManager', { agentId: this.agentId }, this.options.debug)
        }
      } catch (error) {
        debugLog.error('onCleanup hook', error as Error, this.options.debug)
        // Don't throw - hooks should not break the main flow
        if (this.options.debug) {
          debugLog.warn('onCleanup hook failed', { error: getErrorMessage(error) }, this.options.debug)
        }
      }
    }
  }

  private checkScopeCompatibility(): void {
    if (!this.options.debug || !this.options.scope || this.options.scope.length === 0) {
      return
    }

    const requestedScopes = this.options.scope
    const supportedScopes = this.registeredScopes

    // If no registered scopes, assume all scopes are supported
    if (supportedScopes.length === 0) {
      debugLog.operation('scope check', { 
        note: 'No registered scopes - assuming all scopes supported',
        requestedScopes 
      }, this.options.debug)
      return
    }

    // Check for unsupported scopes
    const unsupportedScopes = requestedScopes.filter(scope => !supportedScopes.includes(scope))
    
    if (unsupportedScopes.length > 0) {
      const message = `Scope mismatch: requested [${requestedScopes.join(', ')}] but agent only supports [${supportedScopes.join(', ')}]`
      debugLog.warn(message, { 
        agentId: this.agentId,
        requestedScopes,
        supportedScopes,
        unsupportedScopes 
      })
      debugLog.warn(message, {}, this.options.debug)
    } else {
      debugLog.operation('scope check', { 
        status: 'all requested scopes supported',
        requestedScopes,
        supportedScopes 
      }, this.options.debug)
    }
  }

  /**
   * Helper method to call plugin hooks safely
   */
  private async callPluginHook(hookName: 'onInit' | 'onShutdown', context: AgentContext): Promise<void>
  private async callPluginHook(hookName: 'onSend', payload: SendPayload, context: AgentContext): Promise<void>  
  private async callPluginHook(hookName: 'onError', error: Error, context: AgentContext): Promise<void>
  private async callPluginHook(hookName: string, ...args: unknown[]): Promise<void> {
    try {
      let results
      if (hookName === 'onSend' && args.length === 2) {
        results = await this.pluginManager.executeHook('onSend', args[0] as SendPayload, args[1] as AgentContext)
      } else if (hookName === 'onError' && args.length === 2) {
        results = await this.pluginManager.executeHook('onError', args[0] as Error, args[1] as AgentContext)
      } else if ((hookName === 'onInit' || hookName === 'onShutdown') && args.length === 1) {
        results = await this.pluginManager.executeHook(hookName as 'onInit' | 'onShutdown', args[0] as AgentContext)
      } else {
        // Fallback - should not happen with proper typing
        throw new Error(`Invalid plugin hook call: ${hookName} with ${args.length} arguments`)
      }
      
      // Log any plugin failures for debugging
      const failures = results.filter(r => !r.success)
      if (failures.length > 0 && this.options.debug) {
        failures.forEach(failure => {
          debugLog.warn('Plugin hook failed', { pluginName: failure.pluginName, hookName: failure.hookName, error: failure.error }, this.options.debug)
        })
      }
    } catch (error) {
      // Plugin execution should not break the main flow
      debugLog.error('plugin hook execution', error as Error, this.options.debug)
      if (this.options.debug) {
        debugLog.warn('Plugin hook failed', { hookName, error }, this.options.debug)
      }
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
  private exposeTimelineGlobally(): void {
    if (this.debugModeEnabled && typeof window !== 'undefined' && this.timeline) {
      (window as any).__AGENTKIT_TIMELINE__ = this.timeline.exportForBrowser()
      console.log('🔍 AgentKit Timeline exposed as window.__AGENTKIT_TIMELINE__')
      console.log('📊 Use window.__AGENTKIT_TIMELINE__.printTimeline() to view execution timeline')
    }
  }

  /**
   * Initialize enhanced debug tools
   */
  private initializeDebugTools(): void {
    this.debug.info('Initializing enhanced debug tools')
    
    // Initialize debug manager
    this.debugManager = DebugManager.getInstance({
      enabled: true,
      level: process.env.DEBUG_LEVEL as any || 'info',
      verbose: process.env.DEBUG_VERBOSE === 'true',
      enableConsoleOutput: true,
      enableGraphOutput: process.env.DEBUG_GRAPH === 'true',
      performanceThreshold: this.options.observabilityConfig?.performanceThreshold || 100
    })
    
    // Initialize timeline logger
    this.timelineLogger = new LifecycleTimelineLogger({
      enableConsoleOutput: true,
      enableTableOutput: true,
      performanceThreshold: this.options.observabilityConfig?.performanceThreshold || 100,
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
          this.debug.info(`Plugin hot reloaded: ${pluginName}`, { filePath })
        },
        onError: (error, filePath) => {
          this.debug.error(`Hot reload failed: ${filePath}`, { error })
        }
      })
    }
    
    // Initialize debug timeline
    this.debugManager.initializeTimeline(this.agentId)
    
    this.debug.info('Enhanced debug tools initialized successfully')
  }

  /**
   * Enable debug mode with enhanced features
   */
  enableDebugMode(options: {
    verbose?: boolean
    graph?: boolean
    level?: 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
    hotReload?: boolean
  } = {}): void {
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
    
    this.debug.info('Debug mode enabled with enhanced features', options)
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
    this.debug.info('Debug data cleared')
  }

  /**
   * Register plugin for hot reload (development mode)
   */
  registerPluginForHotReload(pluginName: string, filePath: string): void {
    if (!this.hotReloadManager) {
      this.debug.warn('Hot reload manager not available (requires development mode)')
      return
    }
    
    this.hotReloadManager.registerPlugin(pluginName, filePath)
    this.debug.info(`Registered plugin for hot reload: ${pluginName}`, { filePath })
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
      performanceThreshold: this.options.observabilityConfig?.performanceThreshold || 100
    })
    
    return wrapper.getWrappedPlugin()
  }
}