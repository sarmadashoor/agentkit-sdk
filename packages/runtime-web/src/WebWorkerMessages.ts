/**
 * Typed WebWorker Messages with Zod Schema Validation
 * 
 * This module provides type-safe communication between the main thread
 * and WebWorkers for plugin execution with comprehensive validation.
 */

import { z } from 'zod'

/**
 * Base message schema for all WebWorker communications
 */
const BaseMessageSchema = z.object({
  id: z.string().uuid().optional(),
  timestamp: z.number().int().positive(),
  type: z.string()
})

/**
 * Plugin execution request message schema
 */
const PluginExecutionRequestSchema = BaseMessageSchema.extend({
  type: z.literal('execute-plugin'),
  payload: z.object({
    pluginCode: z.string().min(1),
    hookName: z.enum(['onInit', 'onSend', 'onReceive', 'onError', 'onShutdown']),
    args: z.array(z.any()),
    pluginName: z.string().min(1),
    timeout: z.number().int().positive().max(30000).default(5000),
    securityOptions: z.object({
      allowEval: z.boolean().default(false),
      allowFunction: z.boolean().default(false),
      allowTimers: z.boolean().default(false),
      allowNetwork: z.boolean().default(false),
      allowDOM: z.boolean().default(false)
    }).default({})
  })
})

/**
 * Plugin execution result message schema
 */
const PluginExecutionResultSchema = BaseMessageSchema.extend({
  type: z.literal('plugin-result'),
  payload: z.object({
    success: z.boolean(),
    result: z.any().optional(),
    error: z.string().optional(),
    duration: z.number().int().min(0),
    memoryUsage: z.number().int().min(0).optional(),
    securityViolations: z.array(z.string()).default([])
  })
})

/**
 * Plugin log message schema
 */
const PluginLogMessageSchema = BaseMessageSchema.extend({
  type: z.literal('plugin-log'),
  payload: z.object({
    level: z.enum(['log', 'warn', 'error', 'info']),
    args: z.array(z.any()),
    pluginName: z.string()
  })
})

/**
 * Worker health check message schema
 */
const HealthCheckMessageSchema = BaseMessageSchema.extend({
  type: z.literal('health-check'),
  payload: z.object({
    status: z.enum(['healthy', 'busy', 'error']),
    activeExecutions: z.number().int().min(0),
    memoryUsage: z.number().int().min(0).optional(),
    uptime: z.number().int().min(0)
  })
})

/**
 * Worker termination message schema
 */
const TerminationMessageSchema = BaseMessageSchema.extend({
  type: z.literal('terminate'),
  payload: z.object({
    reason: z.string(),
    graceful: z.boolean().default(true)
  })
})

/**
 * Error message schema
 */
const ErrorMessageSchema = BaseMessageSchema.extend({
  type: z.literal('error'),
  payload: z.object({
    error: z.string(),
    code: z.string().optional(),
    stack: z.string().optional(),
    context: z.record(z.any()).optional()
  })
})

/**
 * Union schema for all WebWorker messages
 */
export const WebWorkerMessageSchema = z.discriminatedUnion('type', [
  PluginExecutionRequestSchema,
  PluginExecutionResultSchema,
  PluginLogMessageSchema,
  HealthCheckMessageSchema,
  TerminationMessageSchema,
  ErrorMessageSchema
])

/**
 * TypeScript types derived from Zod schemas
 */
export type BaseMessage = z.infer<typeof BaseMessageSchema>
export type PluginExecutionRequest = z.infer<typeof PluginExecutionRequestSchema>
export type PluginExecutionResult = z.infer<typeof PluginExecutionResultSchema>
export type PluginLogMessage = z.infer<typeof PluginLogMessageSchema>
export type HealthCheckMessage = z.infer<typeof HealthCheckMessageSchema>
export type TerminationMessage = z.infer<typeof TerminationMessageSchema>
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>
export type WebWorkerMessage = z.infer<typeof WebWorkerMessageSchema>

/**
 * Message validation utilities
 */
export class WebWorkerMessageValidator {
  /**
   * Validate incoming message from WebWorker
   */
  static validateMessage(data: unknown): WebWorkerMessage {
    try {
      return WebWorkerMessageSchema.parse(data)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid WebWorker message: ${error.errors.map(e => e.message).join(', ')}`)
      }
      throw new Error(`Failed to validate WebWorker message: ${error}`)
    }
  }

  /**
   * Validate plugin execution request
   */
  static validateExecutionRequest(data: unknown): PluginExecutionRequest {
    try {
      return PluginExecutionRequestSchema.parse(data)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid plugin execution request: ${error.errors.map(e => e.message).join(', ')}`)
      }
      throw new Error(`Failed to validate plugin execution request: ${error}`)
    }
  }

  /**
   * Create a typed plugin execution request
   */
  static createExecutionRequest(
    pluginCode: string,
    hookName: PluginExecutionRequest['payload']['hookName'],
    args: any[],
    pluginName: string,
    options: Partial<PluginExecutionRequest['payload']> = {}
  ): PluginExecutionRequest {
    return {
      type: 'execute-plugin',
      timestamp: Date.now(),
      payload: {
        pluginCode,
        hookName,
        args,
        pluginName,
        timeout: options.timeout ?? 5000,
        securityOptions: options.securityOptions ?? {
          allowEval: false,
          allowFunction: false,
          allowTimers: false,
          allowNetwork: false,
          allowDOM: false
        }
      }
    }
  }

  /**
   * Create a typed plugin execution result
   */
  static createExecutionResult(
    success: boolean,
    result?: any,
    error?: string,
    duration: number = 0,
    options: Partial<PluginExecutionResult['payload']> = {}
  ): PluginExecutionResult {
    return {
      type: 'plugin-result',
      timestamp: Date.now(),
      payload: {
        success,
        result,
        error,
        duration,
        memoryUsage: options.memoryUsage,
        securityViolations: options.securityViolations ?? []
      }
    }
  }

  /**
   * Create a typed log message
   */
  static createLogMessage(
    level: PluginLogMessage['payload']['level'],
    args: any[],
    pluginName: string
  ): PluginLogMessage {
    return {
      type: 'plugin-log',
      timestamp: Date.now(),
      payload: {
        level,
        args,
        pluginName
      }
    }
  }

  /**
   * Create a typed health check message
   */
  static createHealthCheck(
    status: HealthCheckMessage['payload']['status'],
    activeExecutions: number,
    uptime: number,
    memoryUsage?: number
  ): HealthCheckMessage {
    return {
      type: 'health-check',
      timestamp: Date.now(),
      payload: {
        status,
        activeExecutions,
        uptime,
        memoryUsage
      }
    }
  }

  /**
   * Create a typed error message
   */
  static createErrorMessage(
    error: string,
    code?: string,
    stack?: string,
    context?: Record<string, any>
  ): ErrorMessage {
    return {
      type: 'error',
      timestamp: Date.now(),
      payload: {
        error,
        code,
        stack,
        context
      }
    }
  }

  /**
   * Create a typed termination message
   */
  static createTerminationMessage(
    reason: string,
    graceful: boolean = true
  ): TerminationMessage {
    return {
      type: 'terminate',
      timestamp: Date.now(),
      payload: {
        reason,
        graceful
      }
    }
  }
}

/**
 * Type guards for message types
 */
export const isPluginExecutionRequest = (msg: WebWorkerMessage): msg is PluginExecutionRequest =>
  msg.type === 'execute-plugin'

export const isPluginExecutionResult = (msg: WebWorkerMessage): msg is PluginExecutionResult =>
  msg.type === 'plugin-result'

export const isPluginLogMessage = (msg: WebWorkerMessage): msg is PluginLogMessage =>
  msg.type === 'plugin-log'

export const isHealthCheckMessage = (msg: WebWorkerMessage): msg is HealthCheckMessage =>
  msg.type === 'health-check'

export const isTerminationMessage = (msg: WebWorkerMessage): msg is TerminationMessage =>
  msg.type === 'terminate'

export const isErrorMessage = (msg: WebWorkerMessage): msg is ErrorMessage =>
  msg.type === 'error'

/**
 * WebWorker message handler interface
 */
export interface WebWorkerMessageHandler {
  onExecutionRequest?(request: PluginExecutionRequest): Promise<void>
  onExecutionResult?(result: PluginExecutionResult): void
  onLogMessage?(log: PluginLogMessage): void
  onHealthCheck?(health: HealthCheckMessage): void
  onTermination?(termination: TerminationMessage): void
  onError?(error: ErrorMessage): void
}

/**
 * Utility class for handling WebWorker communication
 */
export class WebWorkerCommunicator {
  private handlers: WebWorkerMessageHandler = {}
  private worker?: Worker

  constructor(worker?: Worker) {
    this.worker = worker
    if (worker) {
      worker.onmessage = this.handleMessage.bind(this)
      worker.onerror = this.handleWorkerError.bind(this)
    }
  }

  /**
   * Register message handlers
   */
  setHandlers(handlers: WebWorkerMessageHandler): void {
    this.handlers = { ...this.handlers, ...handlers }
  }

  /**
   * Send a typed message to the worker
   */
  sendMessage(message: WebWorkerMessage): void {
    if (!this.worker) {
      throw new Error('No worker instance available')
    }

    // Validate the message before sending
    const validatedMessage = WebWorkerMessageValidator.validateMessage(message)
    this.worker.postMessage(validatedMessage)
  }

  /**
   * Handle incoming messages from worker
   */
  private async handleMessage(event: MessageEvent): Promise<void> {
    try {
      const message = WebWorkerMessageValidator.validateMessage(event.data)

      switch (message.type) {
        case 'execute-plugin':
          await this.handlers.onExecutionRequest?.(message)
          break
        case 'plugin-result':
          this.handlers.onExecutionResult?.(message)
          break
        case 'plugin-log':
          this.handlers.onLogMessage?.(message)
          break
        case 'health-check':
          this.handlers.onHealthCheck?.(message)
          break
        case 'terminate':
          this.handlers.onTermination?.(message)
          break
        case 'error':
          this.handlers.onError?.(message)
          break
        default:
          console.warn('Unknown message type received:', (message as any).type)
      }
    } catch (error) {
      console.error('Failed to handle WebWorker message:', error)
      
      // Send error back to worker if possible
      if (this.worker) {
        try {
          const errorMessage = WebWorkerMessageValidator.createErrorMessage(
            `Message handling failed: ${error}`,
            'MESSAGE_HANDLER_ERROR'
          )
          this.worker.postMessage(errorMessage)
        } catch (sendError) {
          console.error('Failed to send error message to worker:', sendError)
        }
      }
    }
  }

  /**
   * Handle worker errors
   */
  private handleWorkerError(error: ErrorEvent): void {
    const errorMessage = WebWorkerMessageValidator.createErrorMessage(
      error.message,
      'WORKER_ERROR',
      undefined,
      {
        filename: error.filename,
        lineno: error.lineno,
        colno: error.colno
      }
    )

    this.handlers.onError?.(errorMessage)
  }

  /**
   * Terminate the worker
   */
  terminate(reason: string = 'Manual termination'): void {
    if (this.worker) {
      const terminationMessage = WebWorkerMessageValidator.createTerminationMessage(reason)
      this.worker.postMessage(terminationMessage)
      this.worker.terminate()
      this.worker = undefined
    }
  }
}