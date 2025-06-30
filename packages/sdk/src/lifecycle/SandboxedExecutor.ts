/**
 * Sandboxed Executor Manager
 * 
 * Handles secure execution of send operations with concurrency control,
 * circuit breaker integration, and backpressure handling.
 */

import { Agent, Transport, AgentInput, AgentOutput } from '@agentkit/types'
import { 
  AgentHandleError,
  AgentShutdownError,
  TransportSendError,
  TransportBackpressureError,
  getErrorMessage
} from '../errors'
import { debugLog } from '../log'
import { ObservabilityTracker } from '../observability'
import { MetricsCollector } from '../observability/MetricsCollector'
import { BoundedExecutor } from '../boundedExecutor'
import { CircuitBreaker } from '../circuitBreaker'
import { BackpressureQueue } from '../BackpressureQueue'
import { AsyncLock } from '../utils/AsyncLock'
import { guardAgainstRecursivePluginCalls } from '../plugins/PluginExecutionContext'

export enum ExecutorState {
  IDLE = 'idle',
  ACTIVE = 'active',
  SHUTTING_DOWN = 'shutting_down',
  TERMINATED = 'terminated'
}

export interface ExecutorConfig {
  agentId: string
  transportId: string
  debug?: boolean
}

export interface ExecutorCallbacks {
  onPluginHook: (hookName: string, ...args: unknown[]) => Promise<void>
  onError: (error: Error) => void
  onOutput?: (output: AgentOutput) => void
}

export class SandboxedExecutor {
  private boundedExecutor: BoundedExecutor
  private circuitBreaker?: CircuitBreaker
  private backpressureQueue?: BackpressureQueue
  private observabilityTracker: ObservabilityTracker
  private metricsCollector?: MetricsCollector
  private stateLock: AsyncLock
  private state: ExecutorState = ExecutorState.IDLE
  
  constructor(
    private agent: Agent,
    private transport: Transport,
    private config: ExecutorConfig,
    private callbacks: ExecutorCallbacks,
    boundedExecutor: BoundedExecutor,
    observabilityTracker: ObservabilityTracker,
    stateLock: AsyncLock,
    circuitBreaker?: CircuitBreaker,
    backpressureQueue?: BackpressureQueue,
    metricsCollector?: MetricsCollector
  ) {
    this.boundedExecutor = boundedExecutor
    this.circuitBreaker = circuitBreaker
    this.backpressureQueue = backpressureQueue
    this.observabilityTracker = observabilityTracker
    this.metricsCollector = metricsCollector
    this.stateLock = stateLock
  }

  /**
   * Set executor state
   */
  setState(state: ExecutorState): void {
    this.state = state
  }

  /**
   * Get executor state
   */
  getState(): ExecutorState {
    return this.state
  }

  /**
   * Execute send operation with state validation and concurrency control
   */
  async send(input: AgentInput): Promise<void> {
    // Guard against recursive plugin calls
    guardAgainstRecursivePluginCalls('SandboxedExecutor.send')
    
    // Check state first without holding lock (fast path)
    if (this.state === ExecutorState.SHUTTING_DOWN || this.state === ExecutorState.TERMINATED) {
      throw new AgentShutdownError('SandboxedExecutor has been shutdown', {
        context: { 
          agentId: this.config.agentId, 
          transportId: this.config.transportId, 
          currentState: this.state 
        }
      })
    }

    if (this.state !== ExecutorState.ACTIVE) {
      throw new AgentHandleError('SandboxedExecutor not initialized. Set state to ACTIVE first.', {
        context: { 
          agentId: this.config.agentId, 
          transportId: this.config.transportId, 
          currentState: this.state 
        }
      })
    }

    // Proceed with bounded execution without holding stateLock
    return this.executeSendOperation(input)
  }

  /**
   * Internal send operation that's called after state validation
   */
  private async executeSendOperation(input: AgentInput): Promise<void> {
    // Use bounded executor for all send operations with proper concurrency control
    return this.boundedExecutor.execute(
      `send-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      async () => {
        // Use stateLock for state check after dequeuing to ensure atomicity
        return this.stateLock.lock(async () => {
          // Double-check state after waiting in queue
          if (this.state !== ExecutorState.ACTIVE) {
            throw new AgentShutdownError('SandboxedExecutor has been shutdown during operation', {
              context: { 
                agentId: this.config.agentId, 
                transportId: this.config.transportId, 
                currentState: this.state 
              }
            })
          }

          // Wrap with circuit breaker if enabled
          const operationFn = async () => {
            const startTime = Date.now()
            const result = await this.observabilityTracker.trackRequest(
              'send',
              this.config.agentId,
              this.config.transportId,
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
        }) // Close stateLock.lock
      },
      input // Pass input as payload for size validation
    )
  }

  /**
   * Process the core send operation
   */
  private async processSendOperation(input: AgentInput, requestId: string): Promise<void> {
    debugLog.operation('send start', { 
      agentId: this.config.agentId,
      transportId: this.config.transportId,
      inputType: typeof input,
      concurrencyProtected: true,
      requestId
    }, this.config.debug)

    // Call plugin onSend hooks
    await this.callbacks.onPluginHook('onSend', {
      input,
      metadata: {}
    }, {
      agentId: this.config.agentId,
      transportId: this.config.transportId,
      requestId,
      timestamp: Date.now()
    })

    let output: AgentOutput

    try {
      // Process input through agent
      debugLog.lifecycle('handle start', 'Agent', {
        agentId: this.config.agentId,
        inputType: typeof input,
        requestId
      }, this.config.debug)

      output = await this.agent.handle(input)

      debugLog.lifecycle('handle complete', 'Agent', {
        agentId: this.config.agentId,
        outputType: typeof output,
        requestId
      }, this.config.debug)

    } catch (error) {
      debugLog.error('agent handle operation', error as Error, this.config.debug)
      
      // Track the specific error phase
      this.observabilityTracker.trackError(
        error as Error,
        'handle',
        this.config.agentId,
        this.config.transportId,
        { phase: 'handle', requestId, inputType: typeof input }
      )

      const handleError = new AgentHandleError(
        `Agent "${this.config.agentId}" failed to handle input: ${getErrorMessage(error)}`,
        { 
          cause: error instanceof Error ? error : new Error(String(error)),
          context: { 
            agentId: this.config.agentId,
            inputType: typeof input,
            input: this.config.debug ? input : '[input hidden in non-debug mode]',
            requestId
          }
        }
      )
      
      // Call plugin onError hooks
      await this.callbacks.onPluginHook('onError', handleError, {
        agentId: this.config.agentId,
        transportId: this.config.transportId,
        requestId,
        timestamp: Date.now()
      })
      
      this.callbacks.onError(handleError)
      throw handleError
    }

    try {
      // Check transport backpressure before sending
      if (this.transport.canAcceptMore && !this.transport.canAcceptMore()) {
        // Emit backpressure detected event
        this.observabilityTracker.emitBackpressureDetected({
          agentId: this.config.agentId,
          transportId: this.config.transportId,
          timestamp: Date.now(),
          requestId,
          transportStatus: this.transport.getStatus?.()
        })
        
        if (this.backpressureQueue) {
          // Use fallback queue for retry with exponential backoff
          debugLog.operation('using backpressure fallback queue', {
            transportId: this.config.transportId,
            requestId,
            queueSize: this.backpressureQueue.getQueueSize()
          }, this.config.debug)
          
          await this.backpressureQueue.enqueue(output)
          
          debugLog.operation('queued for backpressure retry', {
            transportId: this.config.transportId,
            requestId,
            newQueueSize: this.backpressureQueue.getQueueSize()
          }, this.config.debug)
          
          return // Successfully queued, will be retried later
        } else {
          // No fallback queue - throw error immediately
          const backpressureError = new TransportBackpressureError(
            this.config.transportId,
            `Transport "${this.config.transportId}" is under backpressure and cannot accept more messages`,
            undefined, // currentLoad unknown
            undefined  // maxCapacity unknown
          )
          
          debugLog.warn('transport backpressure detected, no fallback queue', {
            transportId: this.config.transportId,
            requestId
          }, this.config.debug)
          
          // Track backpressure as an error
          this.observabilityTracker.trackError(
            backpressureError,
            'send',
            this.config.agentId,
            this.config.transportId,
            { phase: 'backpressure', requestId, outputType: typeof output }
          )
          
          throw backpressureError
        }
      }

      // Send output through transport
      debugLog.lifecycle('send start', 'Transport', {
        transportId: this.config.transportId,
        outputType: typeof output,
        requestId
      }, this.config.debug)

      await this.transport.send(output)

      debugLog.lifecycle('send complete', 'Transport', {
        transportId: this.config.transportId,
        requestId
      }, this.config.debug)

    } catch (error) {
      debugLog.error('transport send operation', error as Error, this.config.debug)
      
      // Track the specific error phase
      this.observabilityTracker.trackError(
        error as Error,
        'send',
        this.config.agentId,
        this.config.transportId,
        { phase: 'send', requestId, outputType: typeof output }
      )

      const sendError = new TransportSendError(
        `Transport "${this.config.transportId}" failed to send output: ${getErrorMessage(error)}`,
        { 
          cause: error instanceof Error ? error : new Error(String(error)),
          context: { 
            transportId: this.config.transportId,
            outputType: typeof output,
            output: this.config.debug ? output : '[output hidden in non-debug mode]',
            requestId
          }
        }
      )
      
      // Call plugin onError hooks
      await this.callbacks.onPluginHook('onError', sendError, {
        agentId: this.config.agentId,
        transportId: this.config.transportId,
        requestId,
        timestamp: Date.now()
      })
      
      this.callbacks.onError(sendError)
      throw sendError
    }

    // Call onOutput callback if provided
    if (this.callbacks.onOutput) {
      try {
        debugLog.operation('onOutput callback', { 
          agentId: this.config.agentId, 
          requestId 
        }, this.config.debug)
        this.callbacks.onOutput(output)
      } catch (error) {
        // Don't fail the entire operation for callback errors, but log them
        debugLog.error('onOutput callback', error as Error, this.config.debug)
        // In debug mode, we could optionally warn the developer
        if (this.config.debug) {
          debugLog.warn('onOutput callback failed', { 
            error: getErrorMessage(error) 
          }, this.config.debug)
        }
      }
    }

    debugLog.operation('send complete', { 
      agentId: this.config.agentId,
      transportId: this.config.transportId,
      concurrencyProtected: true,
      requestId
    }, this.config.debug)
  }

  /**
   * Get bounded executor instance
   */
  getBoundedExecutor(): BoundedExecutor {
    return this.boundedExecutor
  }

  /**
   * Get circuit breaker instance
   */
  getCircuitBreaker(): CircuitBreaker | undefined {
    return this.circuitBreaker
  }

  /**
   * Get backpressure queue instance
   */
  getBackpressureQueue(): BackpressureQueue | undefined {
    return this.backpressureQueue
  }
}