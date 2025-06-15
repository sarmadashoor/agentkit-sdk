import { AgentKitPlugin, AgentContext, SendPayload } from './types'
import { AgentKitError } from '../errors'

/**
 * LoggingPlugin - Example plugin that logs all lifecycle hooks
 * Useful for debugging and monitoring AgentKit operations
 */
export class LoggingPlugin implements AgentKitPlugin {
  readonly name = 'logging-plugin'
  readonly version = '1.0.0'
  readonly description = 'Logs all AgentKit lifecycle events to the console'

  private logPrefix = '[AgentKit:LoggingPlugin]'

  constructor(private options: { 
    logLevel?: 'debug' | 'info' | 'warn' | 'error'
    includePayload?: boolean
    includeContext?: boolean
  } = {}) {
    this.options = {
      logLevel: 'info',
      includePayload: false,
      includeContext: true,
      ...options
    }
  }

  onInit(context: AgentContext): void {
    this.log('info', 'Agent initialized', {
      agentId: context.agentId,
      transportId: context.transportId,
      ...(this.options.includeContext ? { context } : {})
    })
  }

  onSend(payload: SendPayload, context: AgentContext): void {
    this.log('info', 'Sending data to agent', {
      agentId: context.agentId,
      inputType: typeof payload.input,
      ...(this.options.includePayload ? { payload } : {}),
      ...(this.options.includeContext ? { context } : {})
    })
  }

  onError(error: Error | AgentKitError, context: AgentContext): void {
    this.log('error', 'Agent operation failed', {
      agentId: context.agentId,
      errorMessage: error.message,
      errorType: error.constructor.name,
      ...(this.options.includeContext ? { context } : {}),
      error
    })
  }

  onShutdown(context: AgentContext): void {
    this.log('info', 'Agent shutting down', {
      agentId: context.agentId,
      transportId: context.transportId,
      ...(this.options.includeContext ? { context } : {})
    })
  }

  private log(level: string, message: string, data: any): void {
    const timestamp = new Date().toISOString()
    const logMessage = `${this.logPrefix} [${timestamp}] ${message}`
    
    switch (level) {
      case 'debug':
        if (this.options.logLevel === 'debug') {
          console.debug(logMessage, data)
        }
        break
      case 'info':
        if (['debug', 'info'].includes(this.options.logLevel!)) {
          console.log(logMessage, data)
        }
        break
      case 'warn':
        if (['debug', 'info', 'warn'].includes(this.options.logLevel!)) {
          console.warn(logMessage, data)
        }
        break
      case 'error':
        console.error(logMessage, data)
        break
    }
  }
}

/**
 * Factory function to create a LoggingPlugin instance
 */
export function createLoggingPlugin(options?: {
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
  includePayload?: boolean
  includeContext?: boolean
}): AgentKitPlugin {
  return new LoggingPlugin(options)
}