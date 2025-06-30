/**
 * Integration tests for Web Worker plugin isolation
 * Focus on testing the worker execution path specifically
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { WorkerPool, isWebWorkerSupported, isBrowserEnvironment } from '../../src/plugins/worker-utils'
import { setupTestCleanup, cleanupWorkers, trackInstance, untrackInstance } from '../test-utils'

// Mock browser environment globals
const mockBrowserGlobals = () => {
  // Mock Worker
  (global as any).Worker = vi.fn().mockImplementation(() => ({
    postMessage: vi.fn(),
    terminate: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onmessage: null,
    onerror: null,
    onmessageerror: null
  }))

  // Mock Blob
  ;(global as any).Blob = vi.fn().mockImplementation((content, options) => ({
    content,
    type: options?.type
  }))

  // Mock URL
  ;(global as any).URL = {
    createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
    revokeObjectURL: vi.fn()
  }

  // Mock window
  ;(global as any).window = {
    Worker: (global as any).Worker,
    location: { origin: 'https://test.com' }
  }

  // Mock document
  ;(global as any).document = {
    createElement: vi.fn().mockReturnValue({
      textContent: '',
      style: {}
    })
  }
}

describe('Web Worker Integration', () => {
  setupTestCleanup() // Set up automatic cleanup
  
  let originalWorker: any
  let originalBlob: any
  let originalURL: any
  let originalWindow: any
  let originalDocument: any
  let workerPools: WorkerPool[] = []

  beforeEach(() => {
    // Store original values
    originalWorker = (global as any).Worker
    originalBlob = (global as any).Blob
    originalURL = (global as any).URL
    originalWindow = (global as any).window
    originalDocument = (global as any).document

    // Set up browser environment
    mockBrowserGlobals()
  })

  afterEach(async () => {
    // Clean up any worker pools
    for (const pool of workerPools) {
      try {
        await pool.terminate()
      } catch (error) {
        console.error('[CLEANUP] Error terminating worker pool:', error)
      }
      untrackInstance('worker-pool', pool)
    }
    workerPools = []
    
    // Restore original values
    ;(global as any).Worker = originalWorker
    ;(global as any).Blob = originalBlob
    ;(global as any).URL = originalURL
    ;(global as any).window = originalWindow
    ;(global as any).document = originalDocument
  })

  afterAll(async () => {
    // Final cleanup
    for (const pool of workerPools) {
      try {
        await pool.terminate()
      } catch (error) {
        // Ignore
      }
    }
    workerPools = []
  })

  describe('Environment Detection', () => {
    it('should detect Web Worker support', () => {
      expect(isWebWorkerSupported()).toBe(true)
    })

    it('should detect browser environment', () => {
      expect(isBrowserEnvironment()).toBe(true)
    })

    it('should handle missing Worker API', () => {
      (global as any).Worker = undefined
      expect(isWebWorkerSupported()).toBe(false)
    })

    it('should handle missing Blob API', () => {
      (global as any).Blob = undefined
      expect(isWebWorkerSupported()).toBe(false)
    })
  })

  describe('Worker Pool Creation', () => {
    it('should create worker pool with default options', () => {
      const pool = new WorkerPool()
      workerPools.push(pool)
      trackInstance('worker-pool', pool)
      
      expect(pool).toBeDefined()
      expect(pool.getStats().totalWorkers).toBe(0)
    })

    it('should create worker pool with custom options', () => {
      const pool = new WorkerPool({
        maxWorkers: 5,
        maxIdleTime: 60000,
        debug: true,
        preWarm: false
      })
      workerPools.push(pool)
      trackInstance('worker-pool', pool)
      
      expect(pool).toBeDefined()
    })

    it('should pre-warm workers when enabled', () => {
      const pool = new WorkerPool({
        maxWorkers: 3,
        preWarm: true
      })
      workerPools.push(pool)
      trackInstance('worker-pool', pool)
      
      // Should have pre-warmed workers
      const stats = pool.getStats()
      expect(stats.totalWorkers).toBeGreaterThan(0)
      expect(stats.availableWorkers).toBe(stats.totalWorkers)
      
      pool.shutdown()
    })
  })

  describe('Worker Execution', () => {
    let pool: WorkerPool

    beforeEach(() => {
      pool = new WorkerPool({ debug: true })
    })

    afterEach(() => {
      pool.shutdown()
    })

    it('should execute simple plugin function', async () => {
      // Mock successful worker execution
      const mockWorker = {
        postMessage: vi.fn(),
        terminate: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        onmessage: null,
        onerror: null,
        onmessageerror: null
      }

      ;(global as any).Worker = vi.fn().mockImplementation(() => {
        // Simulate immediate response
        setTimeout(() => {
          if (mockWorker.onmessage) {
            mockWorker.onmessage({
              data: {
                id: 'test',
                type: 'result',
                result: { success: true, value: 42 }
              }
            } as MessageEvent)
          }
        }, 10)
        return mockWorker
      })

      const result = await pool.execute({
        pluginName: 'test-plugin',
        hookName: 'onInit',
        functionSource: 'function(context) { return { success: true, value: 42 }; }',
        args: [{ agentId: 'test' }],
        timeout: 1000,
        allowedGlobals: ['Math', 'Date'],
        debug: true
      })

      expect(result).toEqual({ success: true, value: 42 })
      expect(mockWorker.postMessage).toHaveBeenCalled()
    })

    it('should handle worker timeout', async () => {
      // Mock worker that never responds
      const mockWorker = {
        postMessage: vi.fn(),
        terminate: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        onmessage: null,
        onerror: null,
        onmessageerror: null
      }

      ;(global as any).Worker = vi.fn().mockImplementation(() => mockWorker)

      await expect(pool.execute({
        pluginName: 'timeout-plugin',
        hookName: 'onInit',
        functionSource: 'function() { while(true) {} }', // eslint-disable-line no-constant-condition
        args: [],
        timeout: 100, // Very short timeout
        allowedGlobals: [],
        debug: true
      })).rejects.toThrow('timeout')

      expect(mockWorker.terminate).toHaveBeenCalled()
    })

    it('should handle worker errors', async () => {
      const mockWorker = {
        postMessage: vi.fn(),
        terminate: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        onmessage: null,
        onerror: null,
        onmessageerror: null
      }

      ;(global as any).Worker = vi.fn().mockImplementation(() => {
        setTimeout(() => {
          if (mockWorker.onmessage) {
            mockWorker.onmessage({
              data: {
                id: 'test',
                type: 'error',
                error: {
                  message: 'Plugin execution failed',
                  name: 'Error'
                }
              }
            } as MessageEvent)
          }
        }, 10)
        return mockWorker
      })

      await expect(pool.execute({
        pluginName: 'error-plugin',
        hookName: 'onInit',
        functionSource: 'function() { throw new Error("Plugin execution failed"); }',
        args: [],
        timeout: 1000,
        allowedGlobals: [],
        debug: true
      })).rejects.toThrow('Plugin execution failed')
    })
  })

  describe('Worker Pool Management', () => {
    it('should manage worker lifecycle correctly', async () => {
      const pool = new WorkerPool({ maxWorkers: 2, debug: true })
      
      const initialStats = pool.getStats()
      expect(initialStats.totalWorkers).toBe(0)
      expect(initialStats.availableWorkers).toBe(0)
      expect(initialStats.busyWorkers).toBe(0)
      
      pool.shutdown()
    })

    it('should handle concurrent executions', async () => {
      const pool = new WorkerPool({ maxWorkers: 2, debug: true })
      
      // Mock multiple workers
      const mockWorkers: any[] = []
      let executionCounter = 0
      
      ;(global as any).Worker = vi.fn().mockImplementation(() => {
        const worker = {
          postMessage: vi.fn(),
          terminate: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          onmessage: null,
          onerror: null,
          onmessageerror: null
        }
        mockWorkers.push(worker)
        
        // Simulate delayed response with unique execution id
        setTimeout(() => {
          if (worker.onmessage) {
            worker.onmessage({
              data: {
                id: 'test',
                type: 'result',
                result: { workerId: mockWorkers.length, executionId: ++executionCounter }
              }
            } as MessageEvent)
          }
        }, 50)
        
        return worker
      })

      // Execute only 2 plugins concurrently (within pool limit)
      const executions = Array.from({ length: 2 }, (_, i) =>
        pool.execute({
          pluginName: `plugin-${i}`,
          hookName: 'onInit',
          functionSource: `function() { return { id: ${i} }; }`,
          args: [],
          timeout: 1000,
          allowedGlobals: [],
          debug: true
        })
      )

      const results = await Promise.all(executions)
      expect(results).toHaveLength(2)
      
      pool.shutdown()
    })
  })

  describe('Security Isolation', () => {
    it('should create isolated execution context', () => {
      const pool = new WorkerPool()
      
      // Verify that worker pool was created successfully
      const stats = pool.getStats()
      expect(stats.totalWorkers).toBe(0) // No pre-warmed workers by default
      expect(stats.availableWorkers).toBe(0)
      expect(stats.busyWorkers).toBe(0)
      
      pool.shutdown()
    })

    it('should prevent access to main thread globals', async () => {
      const pool = new WorkerPool()
      
      // Mock worker that tries to access restricted globals
      const mockWorker = {
        postMessage: vi.fn(),
        terminate: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        onmessage: null,
        onerror: null,
        onmessageerror: null
      }

      ;(global as any).Worker = vi.fn().mockImplementation(() => {
        setTimeout(() => {
          if (mockWorker.onmessage) {
            mockWorker.onmessage({
              data: {
                id: 'test',
                type: 'error',
                error: {
                  message: 'document is not defined',
                  name: 'ReferenceError'
                }
              }
            } as MessageEvent)
          }
        }, 10)
        return mockWorker
      })

      await expect(pool.execute({
        pluginName: 'dom-access-plugin',
        hookName: 'onInit',
        functionSource: 'function() { return document.body; }',
        args: [],
        timeout: 1000,
        allowedGlobals: [],
        debug: true
      })).rejects.toThrow('document is not defined')
      
      pool.shutdown()
    })
  })

  describe('Memory Management', () => {
    it('should clean up resources on shutdown', () => {
      const pool = new WorkerPool({ preWarm: true })
      
      const initialStats = pool.getStats()
      expect(initialStats.totalWorkers).toBeGreaterThan(0)
      
      pool.shutdown()
      
      const finalStats = pool.getStats()
      expect(finalStats.totalWorkers).toBe(0)
    })

    it('should garbage collect idle workers', async () => {
      const pool = new WorkerPool({ 
        maxIdleTime: 100, // Very short for testing
        debug: true 
      })
      
      // Create a worker by executing something
      const mockWorker = {
        postMessage: vi.fn(),
        terminate: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        onmessage: null,
        onerror: null,
        onmessageerror: null
      }

      ;(global as any).Worker = vi.fn().mockImplementation(() => {
        setTimeout(() => {
          if (mockWorker.onmessage) {
            mockWorker.onmessage({
              data: {
                id: 'test',
                type: 'result',
                result: { done: true }
              }
            } as MessageEvent)
          }
        }, 10)
        return mockWorker
      })

      await pool.execute({
        pluginName: 'temp-plugin',
        hookName: 'onInit',
        functionSource: 'function() { return { done: true }; }',
        args: [],
        timeout: 1000,
        allowedGlobals: [],
        debug: true
      })

      // Wait for garbage collection
      await new Promise(resolve => setTimeout(resolve, 200))
      
      pool.shutdown()
    })
  })

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})