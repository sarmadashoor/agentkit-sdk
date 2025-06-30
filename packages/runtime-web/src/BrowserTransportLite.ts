import { Transport, TransportMessage } from '@agentkit/types'

// Lightweight inline error classes to reduce bundle size
class AgentKitError extends Error {
  public readonly code: string
  public readonly category: string
  public readonly context: Record<string, unknown>
  public readonly cause?: Error

  constructor(message: string, options: {
    code?: string
    category?: string
    context?: Record<string, unknown>
    cause?: Error
  } = {}) {
    super(message)
    this.name = this.constructor.name
    this.code = options.code || 'UNKNOWN_ERROR'
    this.category = options.category || 'unknown'
    this.context = options.context || {}
    if (options.cause) {
      this.cause = options.cause
    }
  }
}

class InvalidConfigurationError extends AgentKitError {
  constructor(message: string, options = {}) {
    super(message, { ...options, code: 'INVALID_CONFIGURATION', category: 'config' })
  }
}

class TransportSendError extends AgentKitError {
  constructor(message: string, options = {}) {
    super(message, { ...options, code: 'TRANSPORT_SEND_FAILED', category: 'transport' })
  }
}

class TransportReceiveError extends AgentKitError {
  constructor(message: string, options = {}) {
    super(message, { ...options, code: 'TRANSPORT_RECEIVE_FAILED', category: 'transport' })
  }
}

class NetworkError extends AgentKitError {
  constructor(message: string, options = {}) {
    super(message, { ...options, code: 'NETWORK_ERROR', category: 'network' })
  }
}

class RequestTimeoutError extends AgentKitError {
  constructor(timeoutMs: number, options = {}) {
    super(`Request timed out after ${timeoutMs}ms`, { ...options, code: 'REQUEST_TIMEOUT', category: 'network' })
  }
}

class HttpError extends AgentKitError {
  public readonly status: number
  public readonly statusText: string
  public readonly responseText?: string

  constructor(status: number, statusText: string, responseText?: string, options = {}) {
    super(`HTTP ${status}: ${statusText}${responseText ? ' - ' + responseText : ''}`, 
          { ...options, code: 'HTTP_ERROR', category: 'network' })
    this.status = status
    this.statusText = statusText
    this.responseText = responseText
  }

  isClientError(): boolean {
    return this.status >= 400 && this.status < 500
  }
}

class CorsError extends AgentKitError {
  constructor(message: string, options = {}) {
    super(`Network/CORS error: ${message}`, { ...options, code: 'CORS_ERROR', category: 'network' })
  }
}

class SerializationError extends AgentKitError {
  constructor(operation: string, dataType: string, options = {}) {
    super(`Failed to ${operation} ${dataType}`, { ...options, code: 'SERIALIZATION_FAILED', category: 'client' })
  }
}

export interface BrowserTransportConfig {
  endpoint: string
  timeout?: number
  maxRetries?: number
  retryDelay?: number
  headers?: Record<string, string>
}

/**
 * Lightweight Browser Transport implementation with minimal dependencies
 * Optimized for small bundle size (<20KB)
 */
export class BrowserTransportLite implements Transport {
  public readonly id = 'browser'
  public readonly name = 'Browser Transport Lite'
  
  public readonly config: Required<Omit<BrowserTransportConfig, 'headers'>> & { headers: Record<string, string> }
  private isShutdown = false
  private activeRequests = new Set<AbortController>()
  private activeTimeouts = new Set<NodeJS.Timeout>()
  // Track MessageChannels and ports for cleanup
  private messageChannels: MessageChannel[] = []
  private messagePorts: { port1?: MessagePort; port2?: MessagePort }[] = []

  constructor(config: BrowserTransportConfig) {
    // Validate required config
    if (!config.endpoint) {
      throw new InvalidConfigurationError('Endpoint is required', {
        context: { configKey: 'endpoint' }
      })
    }

    // Validate endpoint URL format
    try {
      const url = new URL(config.endpoint)
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new InvalidConfigurationError('Invalid protocol - must be http or https', {
          context: { endpoint: config.endpoint, protocol: url.protocol }
        })
      }
    } catch (error) {
      throw new InvalidConfigurationError('Invalid endpoint URL format', {
        cause: error instanceof Error ? error : new Error(String(error)),
        context: { endpoint: config.endpoint }
      })
    }

    // Set config with defaults
    this.config = {
      endpoint: config.endpoint,
      timeout: config.timeout ?? 10000,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      headers: config.headers ?? {}
    }
  }

  async init(config?: Record<string, unknown>): Promise<void> {
    // Browser transport doesn't need initialization
  }

  async send(message: TransportMessage): Promise<void> {
    if (this.isShutdown) {
      throw new TransportSendError('Transport has been shutdown', {
        context: { transportId: this.id }
      })
    }

    try {
      await this.makeRequest('POST', message)
    } catch (error) {
      // Re-throw domain-specific errors directly, wrap others
      if (error instanceof HttpError || 
          error instanceof NetworkError || 
          error instanceof RequestTimeoutError || 
          error instanceof CorsError ||
          error instanceof SerializationError) {
        throw error
      }
      
      throw new TransportSendError('Failed to send message', {
        cause: error instanceof Error ? error : new Error(String(error)),
        context: { transportId: this.id, messageType: typeof message }
      })
    }
  }

  async receive(): Promise<TransportMessage> {
    if (this.isShutdown) {
      throw new TransportReceiveError('Transport has been shutdown', {
        context: { transportId: this.id }
      })
    }

    try {
      return this.makeRequest('GET')
    } catch (error) {
      throw new TransportReceiveError('Failed to receive message', {
        cause: error instanceof Error ? error : new Error(String(error)),
        context: { transportId: this.id }
      })
    }
  }

  async shutdown(): Promise<void> {
    if (this.isShutdown) {
      return // Already shutdown, idempotent
    }

    this.isShutdown = true

    // Clear all active timeouts to prevent memory leaks
    for (const timeout of this.activeTimeouts) {
      clearTimeout(timeout)
    }
    this.activeTimeouts.clear()

    // Abort all active requests
    for (const controller of this.activeRequests) {
      try {
        controller.abort()
      } catch {
        // Ignore errors during abort
      }
    }
    this.activeRequests.clear()

    // Close all MessageChannels and their ports explicitly
    for (const channel of this.messageChannels) {
      try {
        // Close both ports of the channel
        if (channel.port1) {
          channel.port1.close()
        }
        if (channel.port2) {
          channel.port2.close()
        }
      } catch {
        // Ignore errors during port closure
      }
    }
    this.messageChannels.length = 0
    
    // Close any individually tracked ports
    for (const portPair of this.messagePorts) {
      try {
        if (portPair.port1 && typeof portPair.port1.close === 'function') {
          portPair.port1.close()
          ;(portPair as any).port1 = undefined
        }
        if (portPair.port2 && typeof portPair.port2.close === 'function') {
          portPair.port2.close()
          ;(portPair as any).port2 = undefined
        }
      } catch {
        // Ignore errors during port closure
      }
    }
    this.messagePorts.length = 0
  }

  /**
   * Register MessagePorts for tracking and cleanup
   */
  private registerMessagePorts(port1: MessagePort, port2: MessagePort): void {
    const portPair = { port1, port2 }
    this.messagePorts.push(portPair)
    
    // Auto-remove when ports are closed externally
    port1.addEventListener('close', () => {
      (portPair as any).port1 = undefined
    })
    port2.addEventListener('close', () => {
      (portPair as any).port2 = undefined
    })
  }

  /**
   * Create a MessageChannel and register for cleanup
   * Use this method instead of creating MessageChannel directly
   */
  createMessageChannel(): { port1: MessagePort; port2: MessagePort; close: () => void } {
    const channel = new MessageChannel()
    
    // Track the channel itself
    this.messageChannels.push(channel)
    
    // Also register individual ports for cleanup
    this.registerMessagePorts(channel.port1, channel.port2)
    
    return {
      port1: channel.port1,
      port2: channel.port2,
      close: () => {
        try {
          channel.port1.close()
          channel.port2.close()
          
          // Remove from tracking
          const channelIndex = this.messageChannels.indexOf(channel)
          if (channelIndex > -1) {
            this.messageChannels.splice(channelIndex, 1)
          }
        } catch {
          // Ignore errors during manual close
        }
      }
    }
  }

  // Add dispose alias for consistency
  async dispose(): Promise<void> {
    await this.shutdown()
  }

  private async makeRequest(method: 'GET' | 'POST', body?: TransportMessage): Promise<TransportMessage> {
    // Check if fetch is available
    if (typeof fetch === 'undefined') {
      throw new NetworkError('fetch is not available - browser environment required', {
        context: { environment: 'non-browser' }
      })
    }

    let lastError: Error | null = null
    let attempt = 0
    const maxAttempts = this.config.maxRetries + 1

    while (attempt < maxAttempts) {
      try {
        const result = await this.executeRequest(method, body)
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        attempt++

        // Don't retry on client errors (4xx) or when shutdown, or if we've reached max attempts
        if (this.isShutdown || this.isClientError(lastError) || attempt >= maxAttempts) {
          throw lastError
        }

        // Exponential backoff: retryDelay * 2^(attempt-1)
        const delay = this.config.retryDelay * Math.pow(2, attempt - 1)
        await this.sleep(delay)
      }
    }

    throw lastError || new NetworkError('Unknown error occurred during request')
  }

  private async executeRequest(method: 'GET' | 'POST', body?: TransportMessage): Promise<TransportMessage> {
    let abortController: AbortController | undefined
    let timeoutId: NodeJS.Timeout | undefined

    // Create AbortController if available
    if (typeof AbortController !== 'undefined') {
      abortController = new AbortController()
      this.activeRequests.add(abortController)

      // Set timeout with proper tracking for cleanup
      timeoutId = this.createTrackedTimeout(() => {
        if (abortController && !abortController.signal.aborted) {
          abortController.abort()
        }
      }, this.config.timeout)
    }

    try {
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...this.config.headers
      }

      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: abortController?.signal
      }

      if (body !== undefined && method !== 'GET') {
        fetchOptions.body = JSON.stringify(body)
      }

      const response = await fetch(this.config.endpoint, fetchOptions)

      // Handle HTTP errors
      if (!response.ok) {
        let errorText = ''
        try {
          errorText = await response.text()
        } catch {
          // Ignore errors reading response body
        }
        
        throw new HttpError(response.status, response.statusText, errorText)
      }

      // Parse JSON response for GET requests
      if (method === 'GET') {
        try {
          return await response.json()
        } catch (error) {
          const message = `Failed to parse response JSON: ${error instanceof Error ? error.message : String(error)}`
          const parseError = new Error(message)
          parseError.name = 'SerializationError'
          throw parseError
        }
      }

      // For POST requests (send), we don't need to return data
      return undefined as any
    } catch (error) {
      // Handle specific error types
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new RequestTimeoutError(this.config.timeout, {
            context: { endpoint: this.config.endpoint }
          })
        }
        
        // Handle network/CORS errors
        if (error.message.includes('Failed to fetch')) {
          throw new NetworkError(`Network error - this may be a CORS issue: ${error.message}`, {
            cause: error,
            context: { endpoint: this.config.endpoint }
          })
        }
        
        // Handle generic network errors
        if (error.message.includes('Network error')) {
          throw new NetworkError(error.message, {
            cause: error,
            context: { endpoint: this.config.endpoint }
          })
        }
      }
      
      throw error
    } finally {
      // Clean up abort controller
      if (abortController) {
        this.activeRequests.delete(abortController)
      }
      // Clean up timeout
      if (timeoutId) {
        clearTimeout(timeoutId)
        this.activeTimeouts.delete(timeoutId)
      }
    }
  }

  private isClientError(error: Error): boolean {
    // Check if error is a 4xx client error (don't retry these)
    if (error instanceof HttpError) {
      return error.isClientError()
    }
    return error.message.includes('HTTP 4')
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Helper method to create tracked timeouts that will be cleaned up on shutdown
   */
  private createTrackedTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    if (this.isShutdown) {
      // Don't create new timeouts after shutdown
      throw new TransportSendError('Cannot create timeout after shutdown', {
        context: { transportId: this.id }
      })
    }

    const timeout = setTimeout(() => {
      // Remove from tracking set when timeout fires
      this.activeTimeouts.delete(timeout)
      if (!this.isShutdown) {
        callback()
      }
    }, delay)

    // Track the timeout for cleanup
    this.activeTimeouts.add(timeout)
    return timeout
  }

  /**
   * Check if transport can accept more messages (backpressure indicator)
   */
  canAcceptMore(): boolean {
    // For HTTP transport, we base backpressure on active request count
    // This prevents overwhelming the target server or browser's connection pool
    const maxConcurrentRequests = 10 // Reasonable default for browser environment
    return !this.isShutdown && this.activeRequests.size < maxConcurrentRequests
  }
}