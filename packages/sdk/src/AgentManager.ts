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
  getErrorMessage
} from './errors'
import { debugLog } from './log'
import { validateAgentConfig, validateTransportConfig } from './validation'
import { ObservabilityTracker } from './observability'
import { BoundedExecutor } from './boundedExecutor'
import { CircuitBreaker } from './circuitBreaker'
import { PluginManager, AgentKitPlugin, AgentContext, SendPayload } from './plugins'
import { Mutex } from './utils/mutex'

// Extended ConnectAgentOptions to include plugins
interface ConnectAgentOptions extends BaseConnectAgentOptions {
  plugins?: AgentKitPlugin[]
}

export class AgentManager {
  private agent: Agent
  private transport: Transport
  private options: ConnectAgentOptions
  private isInitialized = false
  private isShutdown = false
  private registeredScopes: string[]
  private agentId: string // Authoritative agent ID
  private cleanupCalled = false // Prevent multiple cleanup calls
  private observabilityTracker: ObservabilityTracker
  private boundedExecutor: BoundedExecutor // Always use bounded executor for concurrency control
  private circuitBreaker?: CircuitBreaker
  private pluginManager: PluginManager
  
  // Critical section protection
  private stateMutex = new Mutex() // Protects state transitions (init/shutdown)
  private sendMutex = new Mutex() // Protects send operations

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
    
    // Initialize observability tracker
    this.observabilityTracker = new ObservabilityTracker(
      options.observability || {},
      options.debug || false
    )
    
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
        debug: options.debug || false
      })
    }
    
    // Initialize plugin manager
    this.pluginManager = new PluginManager({
      debug: options.debug || false
    })
    
    // Register plugins if provided
    if (options.plugins) {
      for (const plugin of options.plugins) {
        this.pluginManager.register(plugin)
      }
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
    if (this.isInitialized) {
      throw new AgentInitError('AgentManager is already initialized', {
        context: { agentId: this.agentId, transportId: this.transport.id }
      })
    }

    if (this.isShutdown) {
      throw new AgentInitError('AgentManager has been shutdown and cannot be reinitialized', {
        context: { agentId: this.agentId, transportId: this.transport.id }
      })
    }

    // Track initialization with observability
    return this.observabilityTracker.trackRequest(
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

        this.isInitialized = true
        debugLog.lifecycle('initialized', 'AgentManager', { requestId }, this.options.debug)
        
        // Call plugin onInit hooks
        await this.callPluginHook('onInit', {
          agentId: this.agentId,
          transportId: this.transport.id,
          requestId,
          timestamp: Date.now()
        })
        
        // Call onInit lifecycle hook
        this.callOnInit()
      },
      {
        agentName: this.agent.name,
        transportName: this.transport.name,
        hasScope: !!(this.options.scope && this.options.scope.length > 0)
      }
    )
  }

  async send(input: AgentInput): Promise<void> {
    // Atomic state check with mutex protection
    return this.sendMutex.withLock(async () => {
      // Double-check state under lock to prevent race conditions
      if (this.isShutdown) {
        throw new AgentShutdownError('AgentManager has been shutdown', {
          context: { agentId: this.agentId, transportId: this.transport.id }
        })
      }

      if (!this.isInitialized) {
        throw new AgentHandleError('AgentManager not initialized. Call initialize() first.', {
          context: { agentId: this.agentId, transportId: this.transport.id }
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
        // Double-check shutdown status after waiting in queue
        if (this.isShutdown) {
          throw new AgentShutdownError('AgentManager has been shutdown during operation', {
            context: { agentId: this.agentId, transportId: this.transport.id }
          })
        }

        // Wrap with circuit breaker if enabled
        const operationFn = async () => {
          return this.observabilityTracker.trackRequest(
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
    // Use mutex to ensure atomic shutdown operation
    return this.stateMutex.withLock(async () => {
      // Double-check shutdown state under lock
      if (this.isShutdown) {
        debugLog.operation('shutdown (already shutdown)', { agentId: this.agentId }, this.options.debug)
        return // Already shutdown
      }

      if (!this.isInitialized) {
        throw new AgentShutdownError('AgentManager not initialized', {
          context: { agentId: this.agentId, transportId: this.transport.id }
        })
      }

      // Proceed with shutdown under lock protection
      return this.executeShutdownOperation()
    })
  }

  /**
   * Internal shutdown operation that's called after state validation
   */
  private async executeShutdownOperation(): Promise<void> {
    // Track shutdown with observability
    return await this.observabilityTracker.trackRequest(
      'shutdown',
      this.agentId,
      this.transport.id,
      async (requestId) => {
        debugLog.lifecycle('shutdown start', 'AgentManager', {
          agentId: this.agentId,
          transportId: this.transport.id,
          requestId
        }, this.options.debug)

        // Mark as shutdown first to prevent new operations
        this.isShutdown = true

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
          
          // Mark as shutdown and call cleanup even if agent shutdown failed
          this.isInitialized = false
          
          // Call onShutdown and onCleanup hooks even on failure
          this.callOnShutdown()
          this.callOnCleanup()
          
          throw shutdownError
        }
        
        // Finalize shutdown state
        this.isInitialized = false

        debugLog.lifecycle('shutdown complete', 'AgentManager', { requestId }, this.options.debug)
        
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
        wasInitialized: this.isInitialized
      }
    )
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
  getState(): { initialized: boolean; shutdown: boolean; agentId: string; transportId: string } {
    return {
      initialized: this.isInitialized,
      shutdown: this.isShutdown,
      agentId: this.agentId,
      transportId: this.transport.id
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
      isHealthy: this.isInitialized && !this.isShutdown,
      healthMessage: this.isInitialized ? 'Transport operational' : 'Transport not ready'
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
}