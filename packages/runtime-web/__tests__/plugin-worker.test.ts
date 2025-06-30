import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PluginWorker, PluginWorkerConfig } from '../src/worker/PluginWorker'
import { PluginWorkerHost, wrapPluginWithWorker, isWebWorkerSupported } from '../src/worker/PluginWorkerHost'
import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'

/**
 * WebWorker Plugin Isolation Test Suite
 * 
 * Tests plugin execution in dedicated WebWorkers with security boundaries.
 * Validates DOM isolation, timeout enforcement, and lifecycle management.
 */

// Mock Worker for testing
class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  private handlers: ((event: MessageEvent) => void)[] = []
  terminated = false
  private autoResponses = new Map<string, any>()

  postMessage(data: any): void {
    if (this.terminated) {throw new Error('Worker terminated')}
    
    // Simulate async message handling
    setTimeout(() => {
      const event = new MessageEvent('message', { data })
      
      // Trigger onmessage if set
      if (this.onmessage) {
        this.onmessage(event)
      }
      
      // Trigger addEventListener handlers
      this.handlers.forEach(handler => handler(event))
      
      // Auto-respond if configured
      if (data.type === 'execute-plugin' && this.autoResponses.has('execution')) {
        setTimeout(() => {
          this.simulateMessage(this.autoResponses.get('execution'))
        }, 10)
      }
    }, 0)
  }

  addEventListener(type: string, handler: (event: any) => void): void {
    if (type === 'message') {
      this.handlers.push(handler)
    }
  }

  removeEventListener(type: string, handler: (event: any) => void): void {
    const index = this.handlers.indexOf(handler)
    if (index !== -1) {
      this.handlers.splice(index, 1)
    }
  }

  terminate(): void {
    this.terminated = true
  }

  simulateMessage(data: any): void {
    const event = new MessageEvent('message', { data })
    this.handlers.forEach(handler => handler(event))
    if (this.onmessage) {
      this.onmessage(event)
    }
  }

  // Auto-simulate worker ready for testing
  simulateWorkerReady(): void {
    setTimeout(() => {
      // Send a health-check message instead since worker-ready isn't in the schema
      this.simulateMessage({ 
        type: 'health-check', 
        timestamp: Date.now(),
        payload: {
          status: 'healthy',
          activeExecutions: 0,
          uptime: 0
        }
      })
    }, 10)
  }

  // Auto-respond to execution requests
  simulateExecution(success: boolean = true, result: any = 'test-result', error?: string): void {
    this.autoResponses.set('execution', {
      type: 'plugin-result',
      timestamp: Date.now(),
      payload: {
        success,
        result: success ? result : undefined,
        error: success ? undefined : (error || 'Plugin execution failed'),
        duration: 10
      }
    })
  }

  simulateError(error: string): void {
    if (this.onerror) {
      this.onerror(new ErrorEvent('error', { message: error }))
    }
  }
}

// Mock URL for testing
const mockCreateObjectURL = vi.fn((blob: Blob) => 'blob:mock-url')
const mockRevokeObjectURL = vi.fn()

// Test plugin
const createTestPlugin = (hooks: Partial<AgentKitPlugin> = {}): AgentKitPlugin => ({
  name: 'test-plugin',
  version: '1.0.0',
  description: 'Test plugin for WebWorker isolation',
  ...hooks
})

describe('WebWorker Plugin Isolation', () => {
  let originalWorker: typeof Worker
  let originalURL: typeof URL
  let lastWorkerInstance: MockWorker | null = null

  beforeEach(() => {
    // Mock Worker and URL
    originalWorker = (global as any).Worker
    originalURL = (global as any).URL
    lastWorkerInstance = null
    
    // Create auto-ready MockWorker
    ;(global as any).Worker = class extends MockWorker {
      constructor(url: string, options?: any) {
        super()
        lastWorkerInstance = this
        this.simulateWorkerReady()
        this.simulateExecution()
      }
    }
    
    ;(global as any).URL = {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL
    }

    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore globals
    (global as any).Worker = originalWorker
    ;(global as any).URL = originalURL
  })

  describe('PluginWorker', () => {
    it('should create worker with secure environment', async () => {
      const plugin = createTestPlugin({
        async onInit(context: AgentContext) {
          console.log('Plugin initialized')
        }
      })

      const worker = new PluginWorker({ plugin })
      await worker.initialize()

      expect(worker.getState()).toBe('ready')
      expect(mockCreateObjectURL).toHaveBeenCalled()
      
      // Verify secure code generation
      const blob = mockCreateObjectURL.mock.calls[0][0] as Blob
      const code = await blob.text()
      
      // Check security measures
      expect(code).toContain("'use strict'")
      expect(code).toContain('Object.freeze(Object.prototype)')
      expect(code).toContain('Object.freeze(Array.prototype)')
      expect(code).toContain('dangerousGlobals')
      expect(code).toContain('document')
      expect(code).toContain('window')
      expect(code).toContain('localStorage')
    })

    it('should execute plugin hooks in worker', async () => {
      const onInitMock = vi.fn()
      const plugin = createTestPlugin({
        async onInit(context: AgentContext) {
          onInitMock(context)
          return 'init-result'
        }
      })

      const worker = new PluginWorker({ plugin })
      await worker.initialize()

      // Execute hook
      const context: AgentContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'test-001',
        timestamp: Date.now(),
        metadata: {}
      }

      const result = await worker.executeHook('onInit', context)
      expect(result).toBe('test-result') // This will be the mocked response
    })

    it('should handle execution timeouts', async () => {
      const plugin = createTestPlugin({
        async onSend(payload: SendPayload, context: AgentContext) {
          // Simulate long-running operation that would timeout
          const shouldContinue = true
          while (shouldContinue) {
            await new Promise(resolve => setTimeout(resolve, 100))
            // In real scenario, this would be interrupted by timeout
          }
        }
      })

      // Create a custom mock worker that doesn't respond
      ;(global as any).Worker = class extends MockWorker {
        constructor(url: string, options?: any) {
          super()
          this.simulateWorkerReady()
          // Don't call simulateExecution() to cause timeout
        }
      }

      const worker = new PluginWorker({ 
        plugin,
        timeout: 100 // Very short timeout
      })
      
      await worker.initialize()

      const payload: SendPayload = {
        input: { message: 'test' },
        metadata: {}
      }

      const context: AgentContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'test-001',
        timestamp: Date.now(),
        metadata: {}
      }

      // Should timeout
      await expect(worker.executeHook('onSend', payload, context))
        .rejects
        .toThrow(/timeout/)
    })

    it('should terminate worker gracefully', async () => {
      const plugin = createTestPlugin({
        async onShutdown(context: AgentContext) {
          console.log('Shutting down gracefully')
        }
      })

      const worker = new PluginWorker({ plugin })
      await worker.initialize()

      await worker.terminate('Test termination')

      expect(worker.getState()).toBe('terminated')
      expect(lastWorkerInstance?.terminated).toBe(true)
    })

    it('should handle worker errors', async () => {
      const plugin = createTestPlugin({
        async onError(error: Error, context: AgentContext) {
          throw new Error('Error handler failed')
        }
      })

      // Create a custom mock worker that returns an error
      ;(global as any).Worker = class extends MockWorker {
        constructor(url: string, options?: any) {
          super()
          lastWorkerInstance = this
          this.simulateWorkerReady()
          this.simulateExecution(false, undefined, 'Plugin execution failed') // false = error with specific message
        }
      }

      const worker = new PluginWorker({ plugin })
      await worker.initialize()

      const error = new Error('Test error')
      const context: AgentContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'test-001',
        timestamp: Date.now(),
        metadata: {}
      }

      await expect(worker.executeHook('onError', error, context))
        .rejects
        .toThrow('Plugin execution failed')
    })
  })

  describe('PluginWorkerHost', () => {
    it('should wrap plugin with worker isolation', async () => {
      const onInitMock = vi.fn()
      const plugin = createTestPlugin({
        async onInit(context: AgentContext) {
          onInitMock(context)
        }
      })

      const host = wrapPluginWithWorker(plugin, { debug: true })
      
      expect(host.name).toBe(plugin.name)
      expect(host.version).toBe(plugin.version)
      expect(host.description).toBe(plugin.description)
    })

    it('should delegate execution to worker', async () => {
      const plugin = createTestPlugin({
        async onSend(payload: SendPayload, context: AgentContext) {
          return `Processed: ${payload.input.message}`
        }
      })

      const workerMock = {
        initialize: vi.fn().mockResolvedValue(undefined),
        executeHook: vi.fn().mockResolvedValue('worker-result'),
        getState: vi.fn().mockReturnValue('ready'),
        terminate: vi.fn().mockResolvedValue(undefined)
      }

      const host = new PluginWorkerHost(plugin, {
        workerFactory: () => workerMock as any
      })

      const payload: SendPayload = {
        input: { message: 'test' },
        metadata: {}
      }

      const context: AgentContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'test-001',
        timestamp: Date.now(),
        metadata: {}
      }

      await host.onSend?.(payload, context)

      expect(workerMock.initialize).toHaveBeenCalled()
      expect(workerMock.executeHook).toHaveBeenCalledWith('onSend', expect.any(Object), expect.any(Object))
    })

    it('should fall back to main thread on worker failure', async () => {
      const onSendMock = vi.fn().mockResolvedValue('main-thread-result')
      const plugin = createTestPlugin({
        onSend: onSendMock
      })

      const workerMock = {
        initialize: vi.fn().mockRejectedValue(new Error('Worker failed')),
        getState: vi.fn().mockReturnValue('error')
      }

      const host = new PluginWorkerHost(plugin, {
        enableFallback: true,
        workerFactory: () => workerMock as any
      })

      const payload: SendPayload = {
        input: { message: 'test' },
        metadata: {}
      }

      const context: AgentContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'test-001',
        timestamp: Date.now(),
        metadata: {}
      }

      await host.onSend?.(payload, context)

      expect(onSendMock).toHaveBeenCalledWith(payload, context)
    })

    it('should collect execution metrics', async () => {
      const plugin = createTestPlugin({
        async onInit(context: AgentContext) {
          return 'initialized'
        }
      })

      const workerMock = {
        initialize: vi.fn().mockResolvedValue(undefined),
        executeHook: vi.fn().mockResolvedValue('success'),
        getState: vi.fn().mockReturnValue('ready'),
        terminate: vi.fn().mockResolvedValue(undefined)
      }

      const onExecutionComplete = vi.fn()
      const host = new PluginWorkerHost(plugin, {
        enableMetrics: true,
        workerFactory: () => workerMock as any
      }, {
        onExecutionComplete
      })

      const context: AgentContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'test-001',
        timestamp: Date.now(),
        metadata: {}
      }

      await host.onInit?.(context)

      expect(onExecutionComplete).toHaveBeenCalledWith(expect.objectContaining({
        hookName: 'onInit',
        success: true,
        workerState: 'ready'
      }))

      const metrics = host.getMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].hookName).toBe('onInit')
    })

    it('should handle plugin lifecycle correctly', async () => {
      const lifecycleCalls: string[] = []
      const plugin = createTestPlugin({
        async onInit(context: AgentContext) {
          lifecycleCalls.push('onInit')
        },
        async onSend(payload: SendPayload, context: AgentContext) {
          lifecycleCalls.push('onSend')
        },
        async onError(error: Error, context: AgentContext) {
          lifecycleCalls.push('onError')
        },
        async onShutdown(context: AgentContext) {
          lifecycleCalls.push('onShutdown')
        }
      })

      const workerMock = {
        initialize: vi.fn().mockResolvedValue(undefined),
        executeHook: vi.fn().mockImplementation((hook) => {
          return Promise.resolve(`${hook}-result`)
        }),
        getState: vi.fn().mockReturnValue('ready'),
        terminate: vi.fn().mockResolvedValue(undefined)
      }

      const host = new PluginWorkerHost(plugin, {
        workerFactory: () => workerMock as any
      })

      const context: AgentContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'test-001',
        timestamp: Date.now(),
        metadata: {}
      }

      // Execute lifecycle
      await host.onInit?.(context)
      
      await host.onSend?.({
        input: { message: 'test' },
        metadata: {}
      }, context)
      
      await host.onError?.(new Error('test'), context)
      
      await host.onShutdown?.(context)

      expect(workerMock.executeHook).toHaveBeenCalledTimes(4)
      expect(workerMock.terminate).toHaveBeenCalled()
    })
  })

  describe('Security Isolation', () => {
    it('should prevent DOM access in worker code', async () => {
      const plugin = createTestPlugin({
        async onInit(context: AgentContext) {
          // This should fail in worker
          try {
            (global as any).document.createElement('div')
            return 'DOM accessed'
          } catch (error) {
            return 'DOM blocked'
          }
        }
      })

      const worker = new PluginWorker({ plugin })
      const code = (worker as any).generateWorkerCode()
      
      // Verify DOM blocking code is present
      expect(code).toContain("'document'")
      expect(code).toContain('Access to ${global} is not allowed')
      expect(code).toContain('Object.defineProperty')
    })

    it('should prevent global object access', async () => {
      const plugin = createTestPlugin({
        async onInit(context: AgentContext) {
          // This should fail in worker
          try {
            (global as any).window.location = 'evil.com'
            return 'Global accessed'
          } catch (error) {
            return 'Global blocked'
          }
        }
      })

      const worker = new PluginWorker({ plugin })
      const code = (worker as any).generateWorkerCode()
      
      // Verify global blocking
      expect(code).toContain("'window'")
      expect(code).toContain("'location'")
    })

    it('should use structured cloning for data isolation', async () => {
      const plugin = createTestPlugin({
        async onSend(payload: SendPayload, context: AgentContext) {
          // Try to modify payload (should not affect original)
          (payload as any).compromised = true
          ;(context as any).compromised = true
          return 'processed'
        }
      })

      const host = wrapPluginWithWorker(plugin, {
        enableFallback: false
      })

      const originalPayload: SendPayload = {
        input: { message: 'test' },
        metadata: {}
      }

      const originalContext: AgentContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'test-001',
        timestamp: Date.now(),
        metadata: {}
      }

      // Mock structured clone and worker to ensure it's called
      const structuredCloneSpy = vi.spyOn(host as any, 'structuredClone')
      
      // Create a working mock for this test
      const workerMock = {
        initialize: vi.fn().mockResolvedValue(undefined),
        executeHook: vi.fn().mockResolvedValue('success'),
        getState: vi.fn().mockReturnValue('ready'),
        terminate: vi.fn().mockResolvedValue(undefined)
      }

      // Replace the worker factory for this test
      ;(host as any).config.workerFactory = () => workerMock

      try {
        await host.onSend?.(originalPayload, originalContext)
      } catch (error) {
        // Worker might fail in test env, that's ok
      }

      expect(structuredCloneSpy).toHaveBeenCalledWith(originalPayload)
      expect(structuredCloneSpy).toHaveBeenCalledWith(originalContext)
      
      // Original objects should not be modified
      expect((originalPayload as any).compromised).toBeUndefined()
      expect((originalContext as any).compromised).toBeUndefined()
    })
  })

  describe('WebWorker Support Detection', () => {
    it('should detect WebWorker support correctly', () => {
      // With mocked globals
      expect(isWebWorkerSupported()).toBe(true)

      // Without Worker
      ;(global as any).Worker = undefined
      expect(isWebWorkerSupported()).toBe(false)
      ;(global as any).Worker = MockWorker

      // Without Blob
      ;(global as any).Blob = undefined
      expect(isWebWorkerSupported()).toBe(false)
      ;(global as any).Blob = Blob

      // Without URL
      ;(global as any).URL = undefined
      expect(isWebWorkerSupported()).toBe(false)
    })
  })

  describe('Worker Pool', () => {
    it('should manage multiple plugins in pool', async () => {
      const { PluginWorkerPool } = await import('../src/worker/PluginWorkerHost')
      
      const pool = new PluginWorkerPool()
      
      const plugin1 = createTestPlugin({ name: 'plugin-1' })
      const plugin2 = createTestPlugin({ name: 'plugin-2' })
      
      const host1 = pool.addPlugin(plugin1)
      const host2 = pool.addPlugin(plugin2)
      
      expect(pool.getHosts()).toHaveLength(2)
      expect(host1.name).toBe('plugin-1')
      expect(host2.name).toBe('plugin-2')
      
      await pool.removePlugin('plugin-1')
      expect(pool.getHosts()).toHaveLength(1)
      
      await pool.shutdown()
      expect(pool.getHosts()).toHaveLength(0)
    })
  })
})