import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BrowserTransport } from '../src/src/BrowserTransport'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('BrowserTransport Integration', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  it('should conform to Transport interface', () => {
    const transport = new BrowserTransport({
      endpoint: 'https://api.example.com/mcp'
    })

    // Verify it has all required Transport interface methods
    expect(typeof transport.id).toBe('string')
    expect(typeof transport.name).toBe('string') 
    expect(typeof transport.config).toBe('object')
    expect(typeof transport.init).toBe('function')
    expect(typeof transport.send).toBe('function')
    expect(typeof transport.receive).toBe('function')
    expect(typeof transport.shutdown).toBe('function')
  })

  it('should work in browser-like environment', async () => {
    // Simulate browser environment
    expect(typeof fetch).toBe('function')  // Should be mocked
    expect(typeof AbortController).toBe('function') // Should be mocked

    const transport = new BrowserTransport({
      endpoint: 'https://api.example.com/mcp',
      timeout: 5000,
      headers: {
        'User-Agent': 'AgentKit-Browser/1.0',
        'X-Client': 'test'
      }
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ response: 'success' })
    })

    // Test full lifecycle
    await transport.init()
    
    await transport.send({
      type: 'message',
      content: 'Hello from browser',
      timestamp: Date.now()
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/mcp',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'AgentKit-Browser/1.0',
          'X-Client': 'test'
        })
      })
    )

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'received' })
    })

    const response = await transport.receive()
    expect(response).toEqual({ data: 'received' })

    await transport.shutdown()
  })

  it('should handle real-world MCP-like communication', async () => {
    const transport = new BrowserTransport({
      endpoint: 'https://mcp.example.com/api/v1',
      timeout: 10000,
      maxRetries: 2,
      headers: {
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json'
      }
    })

    // Mock MCP-style request/response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: 'response-123',
        result: {
          type: 'completion',
          content: 'Agent response content'
        }
      })
    })

    await transport.send({
      id: 'request-123', 
      method: 'completion',
      params: {
        prompt: 'Test prompt',
        max_tokens: 100
      }
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://mcp.example.com/api/v1',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          id: 'request-123',
          method: 'completion', 
          params: {
            prompt: 'Test prompt',
            max_tokens: 100
          }
        })
      })
    )

    await transport.shutdown()
  })

  it('should be compatible with different browser environments', () => {
    // Test without AbortController (older browsers)
    const originalAbortController = global.AbortController
    delete (global as any).AbortController

    const transport = new BrowserTransport({
      endpoint: 'https://api.example.com/mcp'
    })

    expect(transport.id).toBe('browser')
    expect(transport.name).toBe('Browser Transport')

    // Restore
    global.AbortController = originalAbortController
  })

  it('should handle concurrent requests properly', async () => {
    const transport = new BrowserTransport({
      endpoint: 'https://api.example.com/mcp',
      maxRetries: 0 // No retries for this test
    })

    // Mock multiple successful responses
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 1 })
      })
      .mockResolvedValueOnce({
        ok: true, 
        status: 200,
        json: () => Promise.resolve({ id: 2 })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 3 })
      })

    // Send multiple concurrent requests
    const requests = [
      transport.send({ request: 1 }),
      transport.send({ request: 2 }),
      transport.send({ request: 3 })
    ]

    await Promise.all(requests)

    expect(mockFetch).toHaveBeenCalledTimes(3)
    await transport.shutdown()
  })
})