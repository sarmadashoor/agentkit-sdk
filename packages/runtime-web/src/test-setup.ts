/**
 * Test setup for browser environment testing
 * Provides polyfills and mocks for browser APIs
 */

import { vi } from 'vitest'

// Global fetch mock for testing
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock AbortController for testing
const mockAbort = vi.fn()
const mockAbortController = {
  signal: { 
    aborted: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  },
  abort: mockAbort
}
global.AbortController = vi.fn(() => mockAbortController) as any

// Mock Headers API
global.Headers = class Headers {
  private headers: Record<string, string> = {}
  
  constructor(init?: Record<string, string>) {
    if (init) {
      Object.entries(init).forEach(([key, value]) => {
        this.headers[key.toLowerCase()] = value
      })
    }
  }
  
  get(name: string): string | null {
    return this.headers[name.toLowerCase()] || null
  }
  
  set(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value
  }
  
  has(name: string): boolean {
    return name.toLowerCase() in this.headers
  }
  
  delete(name: string): void {
    delete this.headers[name.toLowerCase()]
  }
  
  *[Symbol.iterator]() {
    for (const [key, value] of Object.entries(this.headers)) {
      yield [key, value]
    }
  }
} as any

// Mock Request API
global.Request = class Request {
  url: string
  method: string
  headers: Headers
  body: any
  
  constructor(input: string, init?: RequestInit) {
    this.url = input
    this.method = init?.method || 'GET'
    this.headers = new Headers(init?.headers as Record<string, string>)
    this.body = init?.body
  }
} as any

// Mock Response API  
global.Response = class Response {
  ok: boolean
  status: number
  statusText: string
  headers: Headers
  private _body: any
  
  constructor(body?: any, init?: ResponseInit) {
    this._body = body
    this.status = init?.status || 200
    this.ok = this.status >= 200 && this.status < 300
    this.statusText = init?.statusText || 'OK'
    this.headers = new Headers(init?.headers as Record<string, string>)
  }
  
  async json() {
    return typeof this._body === 'string' ? JSON.parse(this._body) : this._body
  }
  
  async text() {
    return typeof this._body === 'string' ? this._body : JSON.stringify(this._body)
  }
  
  clone() {
    return new Response(this._body, {
      status: this.status,
      statusText: this.statusText,
      headers: this.headers as any
    })
  }
} as any

// Mock URL API (usually available in Node.js but good to be explicit)
if (typeof global.URL === 'undefined') {
  global.URL = class URL {
    protocol: string
    hostname: string
    port: string
    pathname: string
    search: string
    hash: string
    href: string
    
    constructor(url: string, _base?: string) {
      // Simple URL parsing for testing
      const match = url.match(/^(https?:)\/\/([^/]+)(\/[^?]*)?(\?[^#]*)?(#.*)?$/)
      if (!match) {
        throw new Error('Invalid URL')
      }
      
      this.protocol = match[1]
      this.hostname = match[2].split(':')[0]
      this.port = match[2].split(':')[1] || ''
      this.pathname = match[3] || '/'
      this.search = match[4] || ''
      this.hash = match[5] || ''
      this.href = url
    }
  } as any
}

// Mock navigator API
Object.defineProperty(global, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Test Environment) AgentKit/1.0',
    platform: 'Test',
    language: 'en-US',
    onLine: true,
    cookieEnabled: true,
    connection: {
      effectiveType: '4g'
    }
  },
  writable: true
})

// Mock console methods if not available
if (typeof global.console === 'undefined') {
  global.console = {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    group: vi.fn(),
    groupEnd: vi.fn(),
    time: vi.fn(),
    timeEnd: vi.fn()
  } as any
}

// Mock localStorage for browser-like storage testing
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (index: number) => Object.keys(store)[index] || null
  }
})()

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true
})

// Mock sessionStorage
Object.defineProperty(global, 'sessionStorage', {
  value: localStorageMock, // Same interface as localStorage for testing
  writable: true
})

// Mock performance API for timing tests
Object.defineProperty(global, 'performance', {
  value: {
    now: () => Date.now(),
    mark: vi.fn(),
    measure: vi.fn(),
    getEntriesByType: vi.fn(() => []),
    getEntriesByName: vi.fn(() => [])
  },
  writable: true
})

// Export test utilities
export const testUtils = {
  // Reset all mocks
  resetMocks: () => {
    mockFetch.mockReset()
    mockAbort.mockReset()
    vi.clearAllMocks()
  },
  
  // Setup successful fetch response
  mockFetchSuccess: (responseData: any, status = 200) => {
    mockFetch.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(responseData),
      text: () => Promise.resolve(JSON.stringify(responseData)),
      headers: new Headers({ 'content-type': 'application/json' })
    })
  },
  
  // Setup fetch error
  mockFetchError: (error: Error) => {
    mockFetch.mockRejectedValueOnce(error)
  },
  
  // Setup fetch network error
  mockFetchNetworkError: () => {
    mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'))
  },
  
  // Setup fetch timeout
  mockFetchTimeout: () => {
    const timeoutError = new Error('Request timeout')
    timeoutError.name = 'AbortError'
    mockFetch.mockRejectedValueOnce(timeoutError)
  },
  
  // Get mock instances
  getMocks: () => ({
    fetch: mockFetch,
    abort: mockAbort,
    abortController: mockAbortController
  })
}

// Make test utils available globally for easy access in tests
declare global {
  // eslint-disable-next-line no-var
  var testUtils: {
    resetMocks: () => void
    mockFetchSuccess: (responseData: any, status?: number) => void
    mockFetchError: (error: Error) => void
    mockFetchNetworkError: () => void
    mockFetchTimeout: () => void
    getMocks: () => {
      fetch: any
      abort: any
      abortController: any
    }
  }
}

global.testUtils = testUtils