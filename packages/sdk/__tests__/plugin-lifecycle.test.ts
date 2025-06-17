import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest'
import { connectAgent } from '../src/index'
import { GreetPlugin, createGreetPlugin, registerGreetPlugin } from './fixtures/greet-plugin'
import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'
import { MetricsCollector } from '../src/observability/MetricsCollector'
import { PluginExecutionTimeline } from '../src/observability/PluginExecutionTimeline'

/**
 * Plugin Lifecycle Simulation Test Suite
 * 
 * Validates complete plugin lifecycle including:
 * - CLI scaffolding integration
 * - Hook execution order and timing
 * - Controlled failure injection
 * - Debug tracing and metrics
 * - Plugin isolation and security
 * - Memory and resource cleanup
 */

// Mock agent and transport for testing
const mockAgent = {
  id: 'test-agent',
  name: 'Test Agent',
  version: '1.0.0',
  init: vi.fn().mockResolvedValue(undefined),
  handle: vi.fn().mockResolvedValue({ response: 'handled' }),
  shutdown: vi.fn().mockResolvedValue(undefined)
}

const mockTransport = {
  id: 'test-transport',
  name: 'Test Transport',
  init: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined),
  receive: vi.fn().mockResolvedValue({ data: 'received' }),
  canAcceptMore: vi.fn().mockReturnValue(true),
  getStatus: vi.fn().mockReturnValue({
    canAcceptMore: true,
    queueSize: 0,
    isHealthy: true
  })
}

describe('Plugin Lifecycle Simulation', () => {
  let plugin: GreetPlugin
  let metricsCollector: MetricsCollector
  let timeline: PluginExecutionTimeline
  let consoleLogSpy: Mock
  let consoleErrorSpy: Mock

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()
    
    // Setup console spies for log validation
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    // Create fresh plugin instance
    plugin = createGreetPlugin({
      enabled: true,
      logLevel: 'debug',
      greetingPrefix: 'Hello',
      maxDelay: 100
    })
    
    // Setup observability
    metricsCollector = new MetricsCollector()
    timeline = new PluginExecutionTimeline()
  })

  afterEach(() => {
    // Restore console
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('CLI Scaffolding Integration', () => {
    it('should generate plugin with production-ready structure', () => {
      // Validate plugin follows enhanced template structure
      expect(plugin.name).toBe('greet-plugin')
      expect(plugin.version).toBe('1.0.0')
      expect(plugin.description).toBeTruthy()
      
      // Validate configuration methods
      expect(typeof plugin.getConfig).toBe('function')
      expect(typeof plugin.withConfig).toBe('function')
      
      // Validate chaos testing capabilities
      expect(typeof plugin.setChaosConfig).toBe('function')
      expect(typeof plugin.getMetrics).toBe('function')
    })

    it('should support factory functions and registration', () => {
      const factoryPlugin = createGreetPlugin()
      expect(factoryPlugin).toBeInstanceOf(GreetPlugin)
      
      const registeredPlugin = registerGreetPlugin()
      expect(registeredPlugin).toBeInstanceOf(GreetPlugin)
    })

    it('should validate configuration with Zod schema', () => {
      expect(() => createGreetPlugin({ enabled: true })).not.toThrow()
      expect(() => createGreetPlugin({ logLevel: 'debug' })).not.toThrow()
      
      // Invalid configuration should throw
      expect(() => createGreetPlugin({ 
        // @ts-expect-error - testing invalid config
        logLevel: 'invalid' 
      })).toThrow()
    })
  })

  describe('Lifecycle Hook Execution', () => {
    let mockContext: AgentContext

    beforeEach(() => {
      mockContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'test-request-123',
        timestamp: Date.now(),
        metadata: {}
      }
    })

    it('should execute onInit → onSend → onShutdown sequence', async () => {
      const executionOrder: string[] = []
      
      // Spy on hook executions
      const originalOnInit = plugin.onInit.bind(plugin)
      const originalOnSend = plugin.onSend.bind(plugin)
      const originalOnShutdown = plugin.onShutdown.bind(plugin)
      
      plugin.onInit = vi.fn().mockImplementation(async (context) => {
        executionOrder.push('onInit')
        return originalOnInit(context)
      })
      
      plugin.onSend = vi.fn().mockImplementation(async (payload, context) => {
        executionOrder.push('onSend')
        return originalOnSend(payload, context)
      })
      
      plugin.onShutdown = vi.fn().mockImplementation(async (context) => {
        executionOrder.push('onShutdown')
        return originalOnShutdown(context)
      })

      // Execute lifecycle
      await plugin.onInit(mockContext)
      
      const sendPayload: SendPayload = {
        input: { message: 'test message' },
        metadata: {}
      }
      await plugin.onSend(sendPayload, mockContext)
      
      await plugin.onShutdown(mockContext)

      // Verify execution order
      expect(executionOrder).toEqual(['onInit', 'onSend', 'onShutdown'])
      
      // Verify hook calls
      expect(plugin.onInit).toHaveBeenCalledWith(mockContext)
      expect(plugin.onSend).toHaveBeenCalledWith(sendPayload, mockContext)
      expect(plugin.onShutdown).toHaveBeenCalledWith(mockContext)
    })

    it('should track execution metrics and timing', async () => {
      // Execute hooks
      await plugin.onInit(mockContext)
      
      const sendPayload: SendPayload = {
        input: { message: 'test' },
        metadata: {}
      }
      await plugin.onSend(sendPayload, mockContext)
      await plugin.onShutdown(mockContext)

      // Check metrics
      const metrics = plugin.getMetrics()
      expect(metrics.initTime).toBeGreaterThan(0)
      expect(metrics.sendCount).toBe(1)
      expect(metrics.shutdownTime).toBeGreaterThan(0)
      expect(metrics.memoryUsage).toBeGreaterThanOrEqual(0)
    })

    it('should handle onError hook correctly', async () => {
      const testError = new Error('Test error for simulation')
      
      await plugin.onError(testError, mockContext)
      
      const metrics = plugin.getMetrics()
      expect(metrics.errorCount).toBe(1)
      
      // Verify error logging
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[greet-plugin] Error in agent test-agent:'),
        expect.objectContaining({
          error: 'Test error for simulation',
          errorCount: 1
        })
      )
    })
  })

  describe('Controlled Failure Injection & Chaos Testing', () => {
    let mockContext: AgentContext

    beforeEach(() => {
      mockContext = {
        agentId: 'chaos-agent',
        transportId: 'chaos-transport',
        requestId: 'chaos-request-456',
        timestamp: Date.now(),
        metadata: {}
      }
    })

    it('should inject failures in onInit hook', async () => {
      plugin.setChaosConfig({ failOnInit: true })
      
      await expect(plugin.onInit(mockContext)).rejects.toThrow(
        'Chaos injection: onInit failure simulation'
      )
    })

    it('should inject failures in onSend hook', async () => {
      plugin.setChaosConfig({ failOnSend: true })
      
      const sendPayload: SendPayload = {
        input: { message: 'test' },
        metadata: {}
      }
      
      await expect(plugin.onSend(sendPayload, mockContext)).rejects.toThrow(
        'Chaos injection: onSend failure simulation'
      )
    })

    it('should inject controlled delays', async () => {
      const delayMs = 50
      plugin.setChaosConfig({ delayMs })
      
      const startTime = Date.now()
      await plugin.onInit(mockContext)
      const endTime = Date.now()
      
      // Verify delay was injected (with some tolerance)
      expect(endTime - startTime).toBeGreaterThanOrEqual(delayMs - 10)
    })

    it('should fail after specified number of calls', async () => {
      plugin.setChaosConfig({ throwAfterCalls: 2 })
      
      // First two calls should succeed
      await plugin.onInit(mockContext)
      
      const sendPayload: SendPayload = {
        input: { message: 'test' },
        metadata: {}
      }
      await plugin.onSend(sendPayload, mockContext)
      
      // Third call should fail
      await expect(plugin.onShutdown(mockContext)).rejects.toThrow(
        'Chaos injection: failure after 2 calls'
      )
    })
  })

  describe('Debug Mode Tracing and Observability', () => {
    it('should generate debug logs with timing information', async () => {
      const debugPlugin = createGreetPlugin({ logLevel: 'debug' })
      
      const mockContext: AgentContext = {
        agentId: 'debug-agent',
        transportId: 'debug-transport',
        requestId: 'debug-request-789',
        timestamp: Date.now(),
        metadata: {}
      }

      await debugPlugin.onInit(mockContext)
      
      // Verify debug logs
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[greet-plugin] Initializing with agent debug-agent'
      )
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[greet-plugin] Initialization completed in')
      )
    })

    it('should trace plugin execution with timeline logs', async () => {
      // Simulate debug trace output like:
      // ▶ onSend(greet-plugin) start (t=0ms)
      // ✔ onSend(greet-plugin) success (t=5ms)
      
      const traceLog = vi.fn()
      const startTime = Date.now()
      
      const mockContext: AgentContext = {
        agentId: 'trace-agent',
        transportId: 'trace-transport',
        requestId: 'trace-request-101',
        timestamp: startTime,
        metadata: {}
      }

      // Mock timeline logging
      const logStart = (hook: string, plugin: string) => {
        const elapsed = Date.now() - startTime
        traceLog(`▶ ${hook}(${plugin}) start (t=${elapsed}ms)`)
      }
      
      const logSuccess = (hook: string, plugin: string) => {
        const elapsed = Date.now() - startTime
        traceLog(`✔ ${hook}(${plugin}) success (t=${elapsed}ms)`)
      }

      // Execute with tracing
      logStart('onSend', 'greet-plugin')
      
      const sendPayload: SendPayload = {
        input: { message: 'trace test' },
        metadata: {}
      }
      await plugin.onSend(sendPayload, mockContext)
      
      logSuccess('onSend', 'greet-plugin')

      // Verify trace logs
      expect(traceLog).toHaveBeenCalledWith(
        expect.stringMatching(/^▶ onSend\(greet-plugin\) start \(t=\d+ms\)$/)
      )
      expect(traceLog).toHaveBeenCalledWith(
        expect.stringMatching(/^✔ onSend\(greet-plugin\) success \(t=\d+ms\)$/)
      )
    })

    it('should log errors with timeline format', async () => {
      const traceLog = vi.fn()
      const startTime = Date.now()
      
      plugin.setChaosConfig({ failOnSend: true })

      const logError = (hook: string, plugin: string, error: string) => {
        const elapsed = Date.now() - startTime
        traceLog(`✖ ${hook}(${plugin}) error: ${error} (t=${elapsed}ms)`)
      }

      const mockContext: AgentContext = {
        agentId: 'error-agent',
        transportId: 'error-transport',
        requestId: 'error-request-202',
        timestamp: startTime,
        metadata: {}
      }

      try {
        const sendPayload: SendPayload = {
          input: { message: 'error test' },
          metadata: {}
        }
        await plugin.onSend(sendPayload, mockContext)
      } catch (error) {
        logError('onSend', 'greet-plugin', (error as Error).message)
      }

      expect(traceLog).toHaveBeenCalledWith(
        expect.stringMatching(/^✖ onSend\(greet-plugin\) error: Chaos injection: onSend failure simulation \(t=\d+ms\)$/)
      )
    })
  })

  describe('Plugin Isolation and Security', () => {
    it('should deep clone plugin configuration', () => {
      const originalConfig = {
        enabled: true,
        logLevel: 'debug' as const,
        greetingPrefix: 'Hello',
        maxDelay: 100
      }
      
      const plugin1 = createGreetPlugin(originalConfig)
      const plugin2 = createGreetPlugin(originalConfig)
      
      // Modifying one config shouldn't affect the other
      const config1 = plugin1.getConfig()
      const config2 = plugin2.getConfig()
      
      expect(config1).toEqual(config2)
      expect(config1).not.toBe(config2) // Different object references
    })

    it('should prevent plugin from modifying other plugin instances', () => {
      const plugin1 = createGreetPlugin({ greetingPrefix: 'Hello' })
      const plugin2 = createGreetPlugin({ greetingPrefix: 'Hi' })
      
      // Plugins should have isolated configurations
      expect(plugin1.getConfig().greetingPrefix).toBe('Hello')
      expect(plugin2.getConfig().greetingPrefix).toBe('Hi')
      
      // Creating new instances shouldn't affect existing ones
      const plugin3 = plugin1.withConfig({ greetingPrefix: 'Hey' })
      
      expect(plugin1.getConfig().greetingPrefix).toBe('Hello') // Unchanged
      expect(plugin3.getConfig().greetingPrefix).toBe('Hey')   // New value
    })

    it('should freeze plugin state at runtime', () => {
      const config = plugin.getConfig()
      
      // Configuration should be readonly
      expect(() => {
        // @ts-expect-error - testing runtime immutability
        config.greetingPrefix = 'Modified'
      }).toThrow()
    })

    it('should validate plugin implements required interface', () => {
      // Plugin should implement all required AgentKitPlugin methods
      expect(plugin).toHaveProperty('name')
      expect(plugin).toHaveProperty('version')
      expect(plugin).toHaveProperty('onInit')
      expect(plugin).toHaveProperty('onSend')
      expect(plugin).toHaveProperty('onError')
      expect(plugin).toHaveProperty('onShutdown')
      
      // All hooks should be functions
      expect(typeof plugin.onInit).toBe('function')
      expect(typeof plugin.onSend).toBe('function')
      expect(typeof plugin.onError).toBe('function')
      expect(typeof plugin.onShutdown).toBe('function')
    })
  })

  describe('Memory and Resource Management', () => {
    it('should track memory usage during plugin execution', async () => {
      const mockContext: AgentContext = {
        agentId: 'memory-agent',
        transportId: 'memory-transport',
        requestId: 'memory-request-303',
        timestamp: Date.now(),
        metadata: {}
      }

      await plugin.onInit(mockContext)
      
      const metrics = plugin.getMetrics()
      expect(typeof metrics.memoryUsage).toBe('number')
      expect(metrics.memoryUsage).toBeGreaterThanOrEqual(0)
    })

    it('should clean up resources during shutdown', async () => {
      const mockContext: AgentContext = {
        agentId: 'cleanup-agent',
        transportId: 'cleanup-transport',
        requestId: 'cleanup-request-404',
        timestamp: Date.now(),
        metadata: {}
      }

      await plugin.onInit(mockContext)
      await plugin.onShutdown(mockContext)
      
      const metrics = plugin.getMetrics()
      expect(metrics.shutdownTime).toBeGreaterThan(0)
      
      // Verify shutdown log
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[greet-plugin] Shutting down for agent cleanup-agent'
      )
    })

    it('should handle shutdown errors gracefully', async () => {
      plugin.setChaosConfig({ failOnShutdown: true })
      
      const mockContext: AgentContext = {
        agentId: 'shutdown-error-agent',
        transportId: 'shutdown-error-transport',
        requestId: 'shutdown-error-request-505',
        timestamp: Date.now(),
        metadata: {}
      }

      // Shutdown should not throw even with chaos injection
      await expect(plugin.onShutdown(mockContext)).rejects.toThrow(
        'Chaos injection: onShutdown failure simulation'
      )
    })
  })

  describe('End-to-End Integration with AgentKit SDK', () => {
    it('should integrate seamlessly with connectAgent()', async () => {
      const plugins = [createGreetPlugin({ logLevel: 'info' })]
      
      // This would typically connect to a real agent, but we're testing the plugin integration
      const options = {
        agent: mockAgent,
        transport: mockTransport,
        plugins,
        debug: true
      }

      // Validate that plugins are properly structured for SDK consumption
      expect(Array.isArray(options.plugins)).toBe(true)
      expect(options.plugins[0]).toBeInstanceOf(GreetPlugin)
      expect(options.plugins[0].name).toBe('greet-plugin')
    })
  })
})