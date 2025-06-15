import { Transport, TransportMessage } from '@agentkit/types'
import { 
  InvalidConfigurationError, 
  TransportInitError,
  TransportSendError,
  TransportReceiveError,
  NetworkError,
  RequestTimeoutError,
  HttpError,
  CorsError,
  SerializationError
} from '@agentkit/errors'

export interface BrowserTransportConfig {
  endpoint: string
  timeout?: number
  maxRetries?: number
  retryDelay?: number
  headers?: Record<string, string>
}

export class BrowserTransport implements Transport {
  public readonly id = 'browser'
  public readonly name = 'Browser Transport'
  public readonly config: Required<BrowserTransportConfig>

  private isShutdown = false
  private activeRequests = new Set<AbortController>()
  // Memory leak prevention - track active timeouts
  private activeTimeouts = new Set<NodeJS.Timeout>()

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
        cause: error as Error,
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

  async init(config?: unknown): Promise<void> {
    // Browser transport doesn't need initialization
    // This method exists to satisfy the Transport interface
  }

  async send(message: unknown): Promise<void> {
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
        cause: error as Error,
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
      return this.makeRequest('GET') as Promise<TransportMessage>
    } catch (error) {
      throw new TransportReceiveError('Failed to receive message', {
        cause: error as Error,
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
  }

  private async makeRequest(method: string, body?: unknown): Promise<unknown> {
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
        lastError = error as Error
        attempt++

        // Don't retry on client errors (4xx) or when shutdown, or if we've reached max attempts
        if (this.isShutdown || this.isClientError(error as Error) || attempt >= maxAttempts) {
          throw lastError
        }

        // Exponential backoff: retryDelay * 2^(attempt-1)
        const delay = this.config.retryDelay * Math.pow(2, attempt - 1)
        await this.sleep(delay)
      }
    }

    throw lastError || new NetworkError('Unknown error occurred during request')
  }

  private async executeRequest(method: string, body?: unknown): Promise<unknown> {
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
      const headers: Record<string, string> = {
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
        
        const errorMessage = errorText 
          ? `HTTP ${response.status}: ${response.statusText} - ${errorText}`
          : `HTTP ${response.status}: ${response.statusText}`
        
        throw new HttpError(response.status, response.statusText, errorText)
      }

      // Parse JSON response for GET requests or non-204 responses
      if (method === 'GET') {
        try {
          return await response.json()
        } catch (error) {
          const message = `Failed to parse response JSON: ${(error as Error).message}`
          const parseError = new Error(message)
          parseError.name = 'SerializationError'
          throw parseError
        }
      }

      // For POST requests (send), we don't need to return data
      return undefined
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

}