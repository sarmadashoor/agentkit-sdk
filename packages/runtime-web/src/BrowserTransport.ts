import { Transport } from '@agentkit/types'

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

  constructor(config: BrowserTransportConfig) {
    // Validate required config
    if (!config.endpoint) {
      throw new Error('Endpoint is required')
    }

    // Validate endpoint URL format
    try {
      const url = new URL(config.endpoint)
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid protocol')
      }
    } catch (error) {
      throw new Error('Invalid endpoint URL')
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
      throw new Error('Transport has been shutdown')
    }

    await this.makeRequest('POST', message)
    // send() should not return anything
  }

  async receive(): Promise<unknown> {
    if (this.isShutdown) {
      throw new Error('Transport has been shutdown')
    }

    return this.makeRequest('GET')
  }

  async shutdown(): Promise<void> {
    if (this.isShutdown) {
      return // Already shutdown, idempotent
    }

    this.isShutdown = true

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
      throw new Error('fetch is not available')
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

    throw lastError || new Error('Unknown error')
  }

  private async executeRequest(method: string, body?: unknown): Promise<unknown> {
    let abortController: AbortController | undefined

    // Create AbortController if available
    if (typeof AbortController !== 'undefined') {
      abortController = new AbortController()
      this.activeRequests.add(abortController)

      // Set timeout
      setTimeout(() => {
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
        
        throw new Error(errorMessage)
      }

      // Parse JSON response for GET requests or non-204 responses
      if (method === 'GET') {
        try {
          return await response.json()
        } catch (error) {
          throw new Error(`Failed to parse response JSON: ${(error as Error).message}`)
        }
      }

      // For POST requests (send), we don't need to return data
      return undefined
    } catch (error) {
      // Handle specific error types
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timeout')
        }
        
        // Handle network/CORS errors
        if (error.message.includes('fetch')) {
          throw new Error(`Network error - this may be a CORS issue: ${error.message}`)
        }
      }
      
      throw error
    } finally {
      // Clean up abort controller
      if (abortController) {
        this.activeRequests.delete(abortController)
      }
    }
  }

  private isClientError(error: Error): boolean {
    // Check if error is a 4xx client error (don't retry these)
    return error.message.includes('HTTP 4')
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

}