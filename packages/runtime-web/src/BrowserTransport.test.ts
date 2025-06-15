import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { BrowserTransport } from './BrowserTransport'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock AbortController
const mockAbort = vi.fn()
const mockAbortController = {
  signal: { 
    aborted: false,
    onabort: null,
    reason: undefined,
    throwIfAborted: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  },
  abort: mockAbort
}
global.AbortController = vi.fn().mockImplementation(() => mockAbortController)

describe('BrowserTransport', () => {
  let transport: BrowserTransport

  beforeEach(() => {
    transport = new BrowserTransport({
      endpoint: 'https://api.example.com/mcp',
      timeout: 5000,
      maxRetries: 0,  // Disable retries for core tests
      retryDelay: 100
    })
    
    mockFetch.mockClear()
    mockAbort.mockClear()
  })

  afterEach(async () => {
    if (transport) {
      await transport.shutdown()
    }
  })

  describe('Basic Transport Interface', () => {
    it('should initialize correctly', () => {
      expect(transport.id).toBe('browser')
      expect(transport.name).toBe('Browser Transport')
      expect(transport.config.endpoint).toBe('https://api.example.com/mcp')
    })

    it('should implement init method', async () => {
      await expect(transport.init()).resolves.toBeUndefined()
    })

    it('should validate endpoint URL', () => {
      expect(() => new BrowserTransport({ endpoint: 'invalid-url' }))
        .toThrow('Invalid endpoint URL')
    })

    it('should throw error for missing endpoint', () => {
      expect(() => new BrowserTransport({} as any))
        .toThrow('Endpoint is required')
    })
  })

  describe('Successful Requests', () => {
    it('should send data successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true })
      })

      await transport.send({ message: 'test' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/mcp',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }),
          body: JSON.stringify({ message: 'test' })
        })
      )
    })

    it('should receive data successfully', async () => {
      const responseData = { message: 'response' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(responseData)
      })

      const result = await transport.receive()

      expect(result).toEqual(responseData)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/mcp',
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('should include custom headers in requests', async () => {
      const customTransport = new BrowserTransport({
        endpoint: 'https://api.example.com/mcp',
        headers: { 'Authorization': 'Bearer token' }
      })

      try {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({})
        })

        await customTransport.send({ test: 'data' })

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/mcp',
          expect.objectContaining({
            headers: expect.objectContaining({
              'Authorization': 'Bearer token'
            })
          })
        )
      } finally {
        await customTransport.shutdown()
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle 4xx client errors without retry', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid request')
      })

      await expect(transport.send({ test: 'data' }))
        .rejects.toThrow('HTTP 400: Bad Request - Invalid request')

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should handle 5xx server errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error')
      })

      await expect(transport.send({ test: 'data' }))
        .rejects.toThrow('HTTP 500: Internal Server Error - Server error')
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(transport.send({ test: 'data' }))
        .rejects.toThrow('Network error')
    })

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('The operation was aborted')
      timeoutError.name = 'AbortError'
      mockFetch.mockRejectedValueOnce(timeoutError)

      await expect(transport.send({ test: 'data' }))
        .rejects.toThrow('Request timed out after 5000ms')
    })

    it('should handle CORS errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'))

      await expect(transport.send({ test: 'data' }))
        .rejects.toThrow('Network error - this may be a CORS issue: Failed to fetch')
    })
  })

  describe('Shutdown Lifecycle', () => {
    it('should handle shutdown gracefully', async () => {
      await expect(transport.shutdown()).resolves.toBeUndefined()
    })

    it('should prevent requests after shutdown', async () => {
      await transport.shutdown()

      await expect(transport.send({ test: 'data' }))
        .rejects.toThrow('Transport has been shutdown')

      await expect(transport.receive())
        .rejects.toThrow('Transport has been shutdown')
    })

    it('should be idempotent', async () => {
      await transport.shutdown()
      await expect(transport.shutdown()).resolves.toBeUndefined()
    })

    it('should abort active requests during shutdown', async () => {
      // Start a request that won't complete
      mockFetch.mockImplementationOnce(() => new Promise(() => {}))

      const sendPromise = transport.send({ test: 'data' })
      
      // Shutdown should abort the request
      await transport.shutdown()

      expect(mockAbort).toHaveBeenCalled()
    })
  })

  describe('Configuration', () => {
    it('should use default values', () => {
      const defaultTransport = new BrowserTransport({ 
        endpoint: 'https://test.com' 
      })
      
      expect(defaultTransport.config).toEqual({
        endpoint: 'https://test.com',
        timeout: 10000,
        maxRetries: 3,
        retryDelay: 1000,
        headers: {}
      })
    })

    it('should merge custom config with defaults', () => {
      const customTransport = new BrowserTransport({
        endpoint: 'https://test.com',
        timeout: 2000,
        headers: { 'Custom-Header': 'value' }
      })
      
      expect(customTransport.config).toEqual({
        endpoint: 'https://test.com',
        timeout: 2000,
        maxRetries: 3,
        retryDelay: 1000,
        headers: { 'Custom-Header': 'value' }
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle missing fetch', async () => {
      const originalFetch = global.fetch
      delete (global as any).fetch

      await expect(transport.send({ test: 'data' }))
        .rejects.toThrow('fetch is not available')

      global.fetch = originalFetch
    })

    it('should handle JSON parsing errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('Invalid JSON'))
      })

      await expect(transport.receive())
        .rejects.toThrow('Failed to parse response JSON: Invalid JSON')
    })

    it('should handle AbortController not available', async () => {
      const originalAbortController = global.AbortController
      delete (global as any).AbortController

      const testTransport = new BrowserTransport({
        endpoint: 'https://api.example.com/mcp'
      })

      try {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true })
        })

        await testTransport.send({ test: 'data' })

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/mcp',
          expect.objectContaining({
            signal: undefined
          })
        )
      } finally {
        await testTransport.shutdown()
        global.AbortController = originalAbortController
      }
    })

    it('should validate endpoint URL format', () => {
      expect(() => new BrowserTransport({ endpoint: 'not-a-url' }))
        .toThrow('Invalid endpoint URL')

      expect(() => new BrowserTransport({ endpoint: 'ftp://invalid.com' }))
        .toThrow('Invalid endpoint URL')

      expect(() => new BrowserTransport({ endpoint: 'http://valid.com' }))
        .not.toThrow()

      expect(() => new BrowserTransport({ endpoint: 'https://valid.com' }))
        .not.toThrow()
    })
  })

  describe('Retry Logic', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should retry on 5xx server errors', async () => {
      const retryTransport = new BrowserTransport({
        endpoint: 'https://api.example.com/mcp',
        maxRetries: 1,
        retryDelay: 100
      })

      try {
        mockFetch
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            text: () => Promise.resolve('Server error')
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true })
          })

        const sendPromise = retryTransport.send({ test: 'data' })
        
        await vi.advanceTimersByTimeAsync(100)
        await sendPromise

        expect(mockFetch).toHaveBeenCalledTimes(2)
      } finally {
        await retryTransport.shutdown()
      }
    })

    it('should not retry on 4xx client errors', async () => {
      const retryTransport = new BrowserTransport({
        endpoint: 'https://api.example.com/mcp',
        maxRetries: 2
      })

      try {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: () => Promise.resolve('Invalid request')
        })

        await expect(retryTransport.send({ test: 'data' }))
          .rejects.toThrow('HTTP 400: Bad Request - Invalid request')

        expect(mockFetch).toHaveBeenCalledTimes(1)
      } finally {
        await retryTransport.shutdown()
      }
    })

    it('should retry on network errors', async () => {
      const retryTransport = new BrowserTransport({
        endpoint: 'https://api.example.com/mcp',
        maxRetries: 1,
        retryDelay: 50
      })

      try {
        mockFetch
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true })
          })

        const sendPromise = retryTransport.send({ test: 'data' })
        
        await vi.advanceTimersByTimeAsync(50)
        await sendPromise

        expect(mockFetch).toHaveBeenCalledTimes(2)
      } finally {
        await retryTransport.shutdown()
      }
    })

    it('should fail after max retry attempts', async () => {
      vi.useRealTimers()
      
      const retryTransport = new BrowserTransport({
        endpoint: 'https://api.example.com/mcp',
        maxRetries: 2,
        retryDelay: 50
      })

      try {
        mockFetch
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))

        const sendPromise = retryTransport.send({ test: 'data' })
        
        await expect(sendPromise).rejects.toThrow('Network error')

        expect(mockFetch).toHaveBeenCalledTimes(3) // Initial + 2 retries
      } finally {
        // Proper cleanup to prevent unhandled rejections
        await retryTransport.shutdown()
        vi.useFakeTimers()
      }
    })

    it('should implement exponential backoff delays', async () => {
      const retryTransport = new BrowserTransport({
        endpoint: 'https://api.example.com/mcp',
        maxRetries: 2,
        retryDelay: 100
      })

      try {
        mockFetch
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true })
          })

        const sendPromise = retryTransport.send({ test: 'data' })

        // First retry after 100ms
        await vi.advanceTimersByTimeAsync(100)
        
        // Second retry after 200ms (exponential backoff)
        await vi.advanceTimersByTimeAsync(200)

        await sendPromise
        expect(mockFetch).toHaveBeenCalledTimes(3)
      } finally {
        await retryTransport.shutdown()
      }
    })
  })
})