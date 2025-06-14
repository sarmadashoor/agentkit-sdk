import { 
  Agent, 
  Transport, 
  AgentRuntimeHandle,
  ConnectAgentOptions
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

export class AgentManager {
  private agent: Agent
  private transport: Transport
  private options: ConnectAgentOptions
  private isInitialized = false
  private isShutdown = false
  private registeredScopes: string[]
  private agentId: string // Authoritative agent ID
  private sendQueue: Promise<void> = Promise.resolve() // Concurrency protection
  private cleanupCalled = false // Prevent multiple cleanup calls

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

    debugLog.lifecycle('constructed', 'AgentManager', {
      agentId: this.agentId,
      factoryAgentId: agent.id,
      transportId: transport.id,
      hasOnOutput: !!options.onOutput,
      registeredScopes,
      requestedScopes: options.scope || []
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

    debugLog.lifecycle('initializing', 'AgentManager', {
      agentId: this.agentId,
      transportId: this.transport.id
    }, this.options.debug)

    try {
      // Initialize transport first
      debugLog.lifecycle('init start', 'Transport', { 
        transportId: this.transport.id,
        config: this.transport.config
      }, this.options.debug)

      const transportConfig = validateTransportConfig(this.transport.config, this.options.debug)
      await this.transport.init(transportConfig)

      debugLog.lifecycle('init complete', 'Transport', { 
        transportId: this.transport.id 
      }, this.options.debug)

    } catch (error) {
      debugLog.error('transport initialization', error as Error, this.options.debug)
      const transportError = new TransportInitError(
        `Failed to initialize transport "${this.transport.id}": ${getErrorMessage(error)}`,
        { 
          cause: error instanceof Error ? error : new Error(String(error)),
          context: { 
            transportId: this.transport.id, 
            transportName: this.transport.name,
            config: this.transport.config
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
        config: agentConfig
      }, this.options.debug)

      const validatedConfig = validateAgentConfig(agentConfig, this.options.debug)
      await this.agent.init(validatedConfig)

      debugLog.lifecycle('init complete', 'Agent', {
        agentId: this.agentId
      }, this.options.debug)

    } catch (error) {
      debugLog.error('agent initialization', error as Error, this.options.debug)
      const agentError = new AgentInitError(
        `Failed to initialize agent "${this.agentId}": ${getErrorMessage(error)}`,
        { 
          cause: error instanceof Error ? error : new Error(String(error)),
          context: { 
            agentId: this.agentId, 
            agentName: this.agent.name,
            version: this.agent.version,
            scope: this.options.scope,
            techStack: this.options.techStack
          }
        }
      )
      this.callOnError(agentError)
      throw agentError
    }

    this.isInitialized = true
    debugLog.lifecycle('initialized', 'AgentManager', undefined, this.options.debug)
    
    // Call onInit lifecycle hook
    this.callOnInit()
  }

  async send(input: unknown): Promise<void> {
    if (this.isShutdown) {
      throw new AgentHandleError('AgentManager has been shutdown', {
        context: { agentId: this.agentId, transportId: this.transport.id }
      })
    }

    if (!this.isInitialized) {
      throw new AgentHandleError('AgentManager not initialized. Call initialize() first.', {
        context: { agentId: this.agentId, transportId: this.transport.id }
      })
    }

    // Queue this send operation to prevent race conditions, but isolate errors
    this.sendQueue = this.sendQueue
      .catch(() => {}) // Prevent error propagation from previous operations
      .then(async () => {
        // Check again after waiting in queue
        if (this.isShutdown) {
          throw new AgentHandleError('AgentManager has been shutdown', {
            context: { agentId: this.agentId, transportId: this.transport.id }
          })
        }

        await this.processSendOperation(input)
      })

    return this.sendQueue
  }

  private async processSendOperation(input: unknown): Promise<void> {
    debugLog.operation('send start', { 
      agentId: this.agentId,
      transportId: this.transport.id,
      inputType: typeof input,
      concurrencyProtected: true
    }, this.options.debug)

    let output: unknown

    try {
      // Process input through agent
      debugLog.lifecycle('handle start', 'Agent', {
        agentId: this.agentId,
        inputType: typeof input
      }, this.options.debug)

      output = await this.agent.handle(input)

      debugLog.lifecycle('handle complete', 'Agent', {
        agentId: this.agentId,
        outputType: typeof output
      }, this.options.debug)

    } catch (error) {
      debugLog.error('agent handle operation', error as Error, this.options.debug)
      const handleError = new AgentHandleError(
        `Agent "${this.agentId}" failed to handle input: ${getErrorMessage(error)}`,
        { 
          cause: error instanceof Error ? error : new Error(String(error)),
          context: { 
            agentId: this.agentId,
            inputType: typeof input,
            input: this.options.debug ? input : '[input hidden in non-debug mode]'
          }
        }
      )
      this.callOnError(handleError)
      throw handleError
    }

    try {
      // Send output through transport
      debugLog.lifecycle('send start', 'Transport', {
        transportId: this.transport.id,
        outputType: typeof output
      }, this.options.debug)

      await this.transport.send(output)

      debugLog.lifecycle('send complete', 'Transport', {
        transportId: this.transport.id
      }, this.options.debug)

    } catch (error) {
      debugLog.error('transport send operation', error as Error, this.options.debug)
      const sendError = new TransportSendError(
        `Transport "${this.transport.id}" failed to send output: ${getErrorMessage(error)}`,
        { 
          cause: error instanceof Error ? error : new Error(String(error)),
          context: { 
            transportId: this.transport.id,
            outputType: typeof output,
            output: this.options.debug ? output : '[output hidden in non-debug mode]'
          }
        }
      )
      this.callOnError(sendError)
      throw sendError
    }

    // Call onOutput callback if provided
    if (this.options.onOutput) {
      try {
        debugLog.operation('onOutput callback', { agentId: this.agentId }, this.options.debug)
        this.options.onOutput(output)
      } catch (error) {
        // Don't fail the entire operation for callback errors, but log them
        debugLog.error('onOutput callback', error as Error, this.options.debug)
        // In debug mode, we could optionally warn the developer
        if (this.options.debug) {
          console.warn(`[AgentKit] onOutput callback failed: ${getErrorMessage(error)}`)
        }
      }
    }

    debugLog.operation('send complete', { 
      agentId: this.agentId,
      transportId: this.transport.id,
      concurrencyProtected: true
    }, this.options.debug)
  }

  async shutdown(): Promise<void> {
    if (this.isShutdown) {
      debugLog.operation('shutdown (already shutdown)', { agentId: this.agentId }, this.options.debug)
      return // Already shutdown
    }

    if (!this.isInitialized) {
      throw new AgentShutdownError('AgentManager not initialized', {
        context: { agentId: this.agentId, transportId: this.transport.id }
      })
    }

    debugLog.lifecycle('shutdown start', 'AgentManager', {
      agentId: this.agentId,
      transportId: this.transport.id
    }, this.options.debug)

    try {
      // Shutdown agent
      debugLog.lifecycle('shutdown start', 'Agent', { agentId: this.agentId }, this.options.debug)
      await this.agent.shutdown()
      debugLog.lifecycle('shutdown complete', 'Agent', { agentId: this.agentId }, this.options.debug)

    } catch (error) {
      debugLog.error('agent shutdown', error as Error, this.options.debug)
      const shutdownError = new AgentShutdownError(
        `Agent "${this.agentId}" failed to shutdown: ${getErrorMessage(error)}`,
        { 
          cause: error instanceof Error ? error : new Error(String(error)),
          context: { agentId: this.agentId, agentName: this.agent.name }
        }
      )
      this.callOnError(shutdownError)
      
      // Mark as shutdown and call cleanup even if agent shutdown failed
      this.isShutdown = true
      this.isInitialized = false
      
      // Call onShutdown and onCleanup hooks even on failure
      this.callOnShutdown()
      this.callOnCleanup()
      
      throw shutdownError
    }
    
    // Transport doesn't have shutdown in the interface, but we mark manager as shutdown
    this.isShutdown = true
    this.isInitialized = false

    debugLog.lifecycle('shutdown complete', 'AgentManager', undefined, this.options.debug)
    
    // Call onShutdown lifecycle hook
    this.callOnShutdown()
    
    // Call onCleanup lifecycle hook after successful shutdown
    this.callOnCleanup()
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
          console.warn(`[AgentKit] onInit hook failed: ${getErrorMessage(error)}`)
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
          console.warn(`[AgentKit] onShutdown hook failed: ${getErrorMessage(error)}`)
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
          console.warn(`[AgentKit] onError hook failed: ${getErrorMessage(error)}`)
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
          console.log(`[AgentKit:DEBUG] Cleanup hook fired for agent: ${this.agentId}`)
        }
      } catch (error) {
        debugLog.error('onCleanup hook', error as Error, this.options.debug)
        // Don't throw - hooks should not break the main flow
        if (this.options.debug) {
          console.warn(`[AgentKit] onCleanup hook failed: ${getErrorMessage(error)}`)
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
      console.warn(`[AgentKit] ${message}`)
    } else {
      debugLog.operation('scope check', { 
        status: 'all requested scopes supported',
        requestedScopes,
        supportedScopes 
      }, this.options.debug)
    }
  }
}