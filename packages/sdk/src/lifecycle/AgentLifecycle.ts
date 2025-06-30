/**
 * Agent Lifecycle Manager
 * 
 * Handles agent and transport initialization, shutdown, state management,
 * and lifecycle hooks for AgentKit SDK.
 */

import { Agent, Transport, AgentConfig, TransportConfig } from '@agentkit/types'
import { 
  AgentInitError,
  AgentShutdownError,
  TransportInitError,
  getErrorMessage
} from '../errors'
import { debugLog } from '../log'
import { validateAgentConfig, validateTransportConfig } from '../validation'
import { ObservabilityTracker } from '../observability'
import { MetricsCollector } from '../observability/MetricsCollector'
import { BoundedExecutor } from '../boundedExecutor'
import { CircuitBreaker } from '../circuitBreaker'
import { BackpressureQueue } from '../BackpressureQueue'
import { AsyncLock } from '../utils/AsyncLock'
import { guardAgainstRecursivePluginCalls } from '../plugins/PluginExecutionContext'
import { ScopeValidator } from './ScopeValidator'

export enum LifecycleState {
  IDLE = 'idle',
  ACTIVE = 'active', 
  SHUTTING_DOWN = 'shutting_down',
  TERMINATED = 'terminated'
}

export interface LifecycleConfig {
  agentId: string
  scope?: string[]
  techStack?: string[]
  debug?: boolean
}

export interface LifecycleCallbacks {
  onInit?: (agentId: string) => void
  onShutdown?: (agentId: string) => void
  onError?: (error: Error) => void
  onCleanup?: (agentId: string) => void
  onPluginHook?: (hookName: string, ...args: unknown[]) => Promise<void>
  onExposeTimeline?: () => void
}

export class AgentLifecycle {
  private state: LifecycleState = LifecycleState.IDLE
  private cleanupCalled = false
  private registeredScopes: string[]

  constructor(
    private agent: Agent,
    private transport: Transport,
    private config: LifecycleConfig,
    private callbacks: LifecycleCallbacks,
    private observabilityTracker: ObservabilityTracker,
    private stateLock: AsyncLock,
    registeredScopes: string[] = [],
    private boundedExecutor?: BoundedExecutor,
    private circuitBreaker?: CircuitBreaker,
    private backpressureQueue?: BackpressureQueue,
    private metricsCollector?: MetricsCollector
  ) {
    this.registeredScopes = registeredScopes
  }

  /**
   * Get current lifecycle state
   */
  getState(): LifecycleState {
    return this.state
  }

  /**
   * Set lifecycle state
   */
  setState(state: LifecycleState): void {
    this.state = state
  }

  /**
   * Get state information for debugging
   */
  getStateInfo(): { 
    state: LifecycleState
    agentId: string
    transportId: string
    initialized: boolean
    shutdown: boolean 
  } {
    return {
      state: this.state,
      agentId: this.config.agentId,
      transportId: this.transport.id,
      // Backward compatibility flags
      initialized: this.state === LifecycleState.ACTIVE,
      shutdown: this.state === LifecycleState.SHUTTING_DOWN || this.state === LifecycleState.TERMINATED
    }
  }

  /**
   * Initialize agent and transport
   * Note: This method expects stateLock to already be held by the caller (AgentManager)
   */
  async initialize(): Promise<void> {
      // Check state under lock
      if (this.state === LifecycleState.ACTIVE) {
        throw new AgentInitError('AgentLifecycle is already initialized', {
          context: { 
            agentId: this.config.agentId, 
            transportId: this.transport.id, 
            currentState: this.state 
          }
        })
      }

      if (this.state === LifecycleState.SHUTTING_DOWN || this.state === LifecycleState.TERMINATED) {
        throw new AgentInitError('AgentLifecycle has been shutdown and cannot be reinitialized', {
          context: { 
            agentId: this.config.agentId, 
            transportId: this.transport.id, 
            currentState: this.state 
          }
        })
      }

      // Track initialization with observability and metrics
      const startTime = Date.now()
      const result = await this.observabilityTracker.trackRequest(
        'init',
        this.config.agentId,
        this.transport.id,
        async (requestId) => {
          debugLog.lifecycle('initializing', 'AgentLifecycle', {
            agentId: this.config.agentId,
            transportId: this.transport.id,
            requestId
          }, this.config.debug)

          try {
            // Initialize transport first
            debugLog.lifecycle('init start', 'Transport', { 
              transportId: this.transport.id,
              config: this.transport.config,
              requestId
            }, this.config.debug)

            const transportConfig = validateTransportConfig(this.transport.config, this.config.debug)
            await this.transport.init(transportConfig)

            debugLog.lifecycle('init complete', 'Transport', { 
              transportId: this.transport.id,
              requestId
            }, this.config.debug)

          } catch (error) {
            debugLog.error('transport initialization', error as Error, this.config.debug)
            
            // Track the specific error phase
            this.observabilityTracker.trackError(
              error as Error,
              'init',
              this.config.agentId,
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
            const agentConfig: AgentConfig = {
              scope: this.config.scope,
              techStack: Array.isArray(this.config.techStack) ? this.config.techStack[0] : this.config.techStack
            }

            debugLog.lifecycle('init start', 'Agent', {
              agentId: this.config.agentId,
              config: agentConfig,
              requestId
            }, this.config.debug)

            const validatedConfig = validateAgentConfig(agentConfig, this.config.debug)
            await this.agent.init(validatedConfig)

            debugLog.lifecycle('init complete', 'Agent', {
              agentId: this.config.agentId,
              requestId
            }, this.config.debug)

          } catch (error) {
            debugLog.error('agent initialization', error as Error, this.config.debug)
            
            // Track the specific error phase
            this.observabilityTracker.trackError(
              error as Error,
              'init',
              this.config.agentId,
              this.transport.id,
              { phase: 'agent', requestId }
            )

            const agentError = new AgentInitError(
              `Failed to initialize agent "${this.config.agentId}": ${getErrorMessage(error)}`,
              { 
                cause: error instanceof Error ? error : new Error(String(error)),
                context: { 
                  agentId: this.config.agentId, 
                  agentName: this.agent.name,
                  version: this.agent.version,
                  scope: this.config.scope,
                  techStack: this.config.techStack,
                  requestId
                }
              }
            )
            this.callOnError(agentError)
            throw agentError
          }

          // Atomically transition to active state
          this.state = LifecycleState.ACTIVE
          debugLog.lifecycle('initialized', 'AgentLifecycle', { 
            requestId, 
            newState: this.state 
          }, this.config.debug)
          
          // Call plugin onInit hooks
          await this.callbacks.onPluginHook?.('onInit', {
            agentId: this.config.agentId,
            transportId: this.transport.id,
            requestId,
            timestamp: Date.now()
          })
          
          // Call onInit lifecycle hook
          this.callOnInit()
          
          // Expose timeline globally if debug mode is enabled
          this.callbacks.onExposeTimeline?.()
        },
        {
          agentName: this.agent.name,
          transportName: this.transport.name,
          hasScope: !!(this.config.scope && this.config.scope.length > 0)
        }
      )
      
    // Record initialization metrics
    const duration = Date.now() - startTime
    this.metricsCollector?.recordInitLatency(duration)
    
    return result
  }

  /**
   * Shutdown agent and transport
   * Note: This method expects stateLock to already be held by the caller (AgentManager)
   */
  async shutdown(): Promise<void> {
    // Guard against recursive plugin calls
    guardAgainstRecursivePluginCalls('AgentLifecycle.shutdown')
      // Check current state under lock
      if (this.state === LifecycleState.SHUTTING_DOWN || this.state === LifecycleState.TERMINATED) {
        debugLog.operation('shutdown (already shutdown)', { 
          agentId: this.config.agentId, 
          currentState: this.state 
        }, this.config.debug)
        return // Already shutdown or shutting down
      }

      if (this.state === LifecycleState.IDLE) {
        throw new AgentShutdownError('AgentLifecycle not initialized', {
          context: { 
            agentId: this.config.agentId, 
            transportId: this.transport.id, 
            currentState: this.state 
          }
        })
      }

      // Atomically transition to shutting down state - this will block new send operations
      this.state = LifecycleState.SHUTTING_DOWN
      debugLog.lifecycle('state transition', 'AgentLifecycle', { 
        agentId: this.config.agentId, 
        newState: this.state 
      }, this.config.debug)

    // Proceed with shutdown (lock already held by caller)
    return this.executeShutdownOperation()
  }

  /**
   * Internal shutdown operation that's called after state validation
   */
  private async executeShutdownOperation(): Promise<void> {
    // Track shutdown with observability and metrics
    const startTime = Date.now()
    const result = await this.observabilityTracker.trackRequest(
      'shutdown',
      this.config.agentId,
      this.transport.id,
      async (requestId) => {
        debugLog.lifecycle('shutdown start', 'AgentLifecycle', {
          agentId: this.config.agentId,
          transportId: this.transport.id,
          requestId
        }, this.config.debug)

        // Shutdown bounded executor to reject queued operations and wait for active ones
        if (this.boundedExecutor) {
          debugLog.lifecycle('shutdown start', 'BoundedExecutor', { 
            activeRequests: this.boundedExecutor.getStats().activeRequests,
            queuedRequests: this.boundedExecutor.getStats().queuedRequests,
            requestId 
          }, this.config.debug)
          
          await this.boundedExecutor.shutdown()
          
          debugLog.lifecycle('shutdown complete', 'BoundedExecutor', { 
            requestId 
          }, this.config.debug)
        }

        // Shutdown circuit breaker if it exists
        if (this.circuitBreaker) {
          debugLog.lifecycle('shutdown start', 'CircuitBreaker', { 
            circuitBreakerName: this.circuitBreaker.getStats().state,
            requestId 
          }, this.config.debug)
          
          this.circuitBreaker.shutdown()
          
          debugLog.lifecycle('shutdown complete', 'CircuitBreaker', { 
            requestId 
          }, this.config.debug)
        }

        // Shutdown backpressure queue if it exists
        if (this.backpressureQueue) {
          debugLog.lifecycle('shutdown start', 'BackpressureQueue', { 
            queueSize: this.backpressureQueue.getQueueSize(),
            stats: this.backpressureQueue.getStats(),
            requestId 
          }, this.config.debug)
          
          await this.backpressureQueue.shutdown()
          
          debugLog.lifecycle('shutdown complete', 'BackpressureQueue', { 
            requestId 
          }, this.config.debug)
        }

        // Note: ObservabilityTracker shutdown moved outside trackRequest callback
        // to prevent clearing hooks before onRequestEnd can be called

        try {
          // Shutdown transport if it has a shutdown method
          if ('shutdown' in this.transport && typeof this.transport.shutdown === 'function') {
            debugLog.lifecycle('shutdown start', 'Transport', { 
              transportId: this.transport.id, 
              requestId 
            }, this.config.debug)
            
            await (this.transport as any).shutdown()
            
            debugLog.lifecycle('shutdown complete', 'Transport', { 
              transportId: this.transport.id, 
              requestId 
            }, this.config.debug)
          }

          // Shutdown agent
          debugLog.lifecycle('shutdown start', 'Agent', { 
            agentId: this.config.agentId, 
            requestId 
          }, this.config.debug)
          
          await this.agent.shutdown()
          
          debugLog.lifecycle('shutdown complete', 'Agent', { 
            agentId: this.config.agentId, 
            requestId 
          }, this.config.debug)

        } catch (error) {
          debugLog.error('agent shutdown', error as Error, this.config.debug)
          
          // Track the specific error phase
          this.observabilityTracker.trackError(
            error as Error,
            'shutdown',
            this.config.agentId,
            this.transport.id,
            { phase: 'shutdown', requestId }
          )

          const shutdownError = new AgentShutdownError(
            `Agent "${this.config.agentId}" failed to shutdown: ${getErrorMessage(error)}`,
            { 
              cause: error instanceof Error ? error : new Error(String(error)),
              context: { 
                agentId: this.config.agentId, 
                agentName: this.agent.name,
                requestId
              }
            }
          )
          this.callOnError(shutdownError)
          
          // Mark as terminated and call cleanup even if agent shutdown failed
          this.state = LifecycleState.TERMINATED
          
          // Call onShutdown and onCleanup hooks even on failure
          this.callOnShutdown()
          this.callOnCleanup()
          
          throw shutdownError
        }
        
        // Finalize shutdown state
        this.state = LifecycleState.TERMINATED

        debugLog.lifecycle('shutdown complete', 'AgentLifecycle', { 
          requestId, 
          finalState: this.state 
        }, this.config.debug)
        
        // Call plugin onShutdown hooks
        await this.callbacks.onPluginHook?.('onShutdown', {
          agentId: this.config.agentId,
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
        wasInitialized: this.state === LifecycleState.ACTIVE
      }
    )
    
    // Shutdown observability tracker after tracking is complete
    debugLog.lifecycle('shutdown start', 'ObservabilityTracker', { 
      agentId: this.config.agentId,
      transportId: this.transport.id
    }, this.config.debug)
    
    this.observabilityTracker.shutdown()
    
    debugLog.lifecycle('shutdown complete', 'ObservabilityTracker', { 
      agentId: this.config.agentId,
      transportId: this.transport.id
    }, this.config.debug)
    
    // Record shutdown metrics
    const duration = Date.now() - startTime
    this.metricsCollector?.recordShutdownLatency(duration)
    
    return result
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
      isHealthy: this.state === LifecycleState.ACTIVE,
      healthMessage: this.state === LifecycleState.ACTIVE ? 'Transport operational' : 'Transport not ready'
    }
  }

  // ===== PRIVATE LIFECYCLE HOOK HELPERS =====

  /**
   * Lifecycle hook helpers - wrapped in try/catch to avoid cascading failures
   */
  private callOnInit(): void {
    if (this.callbacks.onInit) {
      try {
        debugLog.lifecycle('calling onInit hook', 'AgentLifecycle', { 
          agentId: this.config.agentId 
        }, this.config.debug)
        this.callbacks.onInit(this.config.agentId)
      } catch (error) {
        debugLog.error('onInit hook', error as Error, this.config.debug)
        // Don't throw - hooks should not break the main flow
        if (this.config.debug) {
          debugLog.warn('onInit hook failed', { 
            error: getErrorMessage(error) 
          }, this.config.debug)
        }
      }
    }
  }

  private callOnShutdown(): void {
    if (this.callbacks.onShutdown) {
      try {
        debugLog.lifecycle('calling onShutdown hook', 'AgentLifecycle', { 
          agentId: this.config.agentId 
        }, this.config.debug)
        this.callbacks.onShutdown(this.config.agentId)
      } catch (error) {
        debugLog.error('onShutdown hook', error as Error, this.config.debug)
        // Don't throw - hooks should not break the main flow
        if (this.config.debug) {
          debugLog.warn('onShutdown hook failed', { 
            error: getErrorMessage(error) 
          }, this.config.debug)
        }
      }
    }
  }

  private callOnError(err: Error): void {
    if (this.callbacks.onError) {
      try {
        debugLog.lifecycle('calling onError hook', 'AgentLifecycle', { 
          agentId: this.config.agentId, 
          errorType: err.constructor.name,
          errorMessage: err.message 
        }, this.config.debug)
        this.callbacks.onError(err)
      } catch (error) {
        debugLog.error('onError hook', error as Error, this.config.debug)
        // Don't throw - hooks should not break the main flow
        if (this.config.debug) {
          debugLog.warn('onError hook failed', { 
            error: getErrorMessage(error) 
          }, this.config.debug)
        }
      }
    }
  }

  private callOnCleanup(): void {
    if (this.callbacks.onCleanup && !this.cleanupCalled) {
      this.cleanupCalled = true // Prevent multiple cleanup calls
      try {
        debugLog.lifecycle('calling onCleanup hook', 'AgentLifecycle', { 
          agentId: this.config.agentId 
        }, this.config.debug)
        this.callbacks.onCleanup(this.config.agentId)
        if (this.config.debug) {
          debugLog.lifecycle('cleanup hook fired', 'AgentLifecycle', { 
            agentId: this.config.agentId 
          }, this.config.debug)
        }
      } catch (error) {
        debugLog.error('onCleanup hook', error as Error, this.config.debug)
        // Don't throw - hooks should not break the main flow
        if (this.config.debug) {
          debugLog.warn('onCleanup hook failed', { 
            error: getErrorMessage(error) 
          }, this.config.debug)
        }
      }
    }
  }

  /**
   * Check scope compatibility for debugging
   */
  checkScopeCompatibility(): void {
    if (!this.config.debug) {
      return
    }
    
    ScopeValidator.validateScopes(
      this.config.scope,
      this.registeredScopes,
      this.config.agentId,
      this.config.debug
    )
  }
}