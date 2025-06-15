/**
 * Plugin Chaos Testing Suite
 * Tests for recursive calls, crashes, and improperly scoped plugin invocations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SecurePluginManagerV2 } from '../src/plugins/SecurePluginManagerV2'
import { pluginExecutionContext, guardAgainstRecursivePluginCalls } from '../src/plugins/PluginExecutionContext'
import { connectAgent } from '../src/index'
import { RecursivePluginCallError } from '../src/errors'
import type { AgentKitPlugin, AgentContext, SendPayload, Agent, Transport } from '@agentkit/types'
import { 
  FaultyPlugin, 
  SlowPlugin, 
  ReentrantPlugin, 
  MutatingPlugin, 
  HangingPlugin,
  MultiErrorPlugin,
  WellBehavedPlugin,
  PluginExecutionTracker
} from '../src/__tests__/chaos/ChaosPlugins'

// Mock agent and transport for testing
const createMockAgent = (): Agent => ({
  id: 'chaos-test-agent',
  name: 'Chaos Test Agent',
  version: '1.0.0',
  init: vi.fn().mockResolvedValue(undefined),
  handle: vi.fn().mockResolvedValue({ result: 'test result' }),
  shutdown: vi.fn().mockResolvedValue(undefined)
})

const createMockTransport = (): Transport => ({
  id: 'chaos-test-transport',
  name: 'Chaos Test Transport',
  config: {},
  init: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined),
  canAcceptMore: vi.fn().mockReturnValue(true)
})

describe('Plugin Chaos Testing Suite', () => {
  let manager: SecurePluginManagerV2
  let tracker: PluginExecutionTracker
  let mockAgent: Agent
  let mockTransport: Transport

  beforeEach(() => {
    // Reset plugin execution context
    pluginExecutionContext.reset()
    
    // Create fresh instances
    manager = new SecurePluginManagerV2({
      debug: false,
      enableSandboxing: true,
      enableFreezing: true,
      hookTimeout: 1000,
      strictExecutionOrder: true,
      failFast: false // Don't fail fast so we can test isolation
    })

    tracker = new PluginExecutionTracker()
    mockAgent = createMockAgent()
    mockTransport = createMockTransport()

    // Monitor plugin errors
    manager.on('pluginError', (errorEvent) => {
      tracker.logExecution(
        errorEvent.pluginName,
        errorEvent.hookName,
        false,
        Date.now() - errorEvent.timestamp,
        errorEvent.isolated,
        errorEvent.error
      )
    })
  })

  afterEach(() => {
    manager.shutdown()
    pluginExecutionContext.reset()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('💥 Recursive Call Protection', () => {
    it('should detect and prevent recursive SDK calls from plugins', async () => {
      // Create reentrant plugin with access to manager
      const reentrantPlugin = new ReentrantPlugin(manager, connectAgent)
      
      manager.register(reentrantPlugin)
      
      const context: AgentContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'test-request',
        timestamp: Date.now()
      }

      // Execute onInit which will attempt recursive calls
      const results = await manager.executeHook('onInit', context)
      
      expect(results).toHaveLength(1)
      expect(results[0].pluginName).toBe('ReentrantPlugin')
      expect(results[0].isolated).toBe(true)
      
      console.log('Executed plugin: ReentrantPlugin - blocked (recursion detected)')
    })

    it('should throw RecursivePluginCallError when guard is called during plugin execution', () => {
      const executionId = pluginExecutionContext.startExecution('TestPlugin', 'onSend')
      
      try {
        expect(() => {
          guardAgainstRecursivePluginCalls('agent.send')
        }).toThrow(RecursivePluginCallError)
      } finally {
        pluginExecutionContext.endExecution(executionId)
      }
    })

    it('should allow SDK calls when no plugins are executing', () => {
      expect(() => {
        guardAgainstRecursivePluginCalls('agent.send')
      }).not.toThrow()
    })

    it('should track execution context correctly during nested plugin calls', () => {
      expect(pluginExecutionContext.getExecutionDepth()).toBe(0)
      
      const id1 = pluginExecutionContext.startExecution('Plugin1', 'onInit')
      expect(pluginExecutionContext.getExecutionDepth()).toBe(1)
      
      const id2 = pluginExecutionContext.startExecution('Plugin2', 'onSend')
      expect(pluginExecutionContext.getExecutionDepth()).toBe(2)
      
      pluginExecutionContext.endExecution(id2)
      expect(pluginExecutionContext.getExecutionDepth()).toBe(1)
      
      pluginExecutionContext.endExecution(id1)
      expect(pluginExecutionContext.getExecutionDepth()).toBe(0)
    })
  })

  describe('🔄 Hook Interruption Simulation', () => {
    it('should handle plugin that throws midway through execution', async () => {
      // Register multiple plugins: one good, one faulty, one good
      manager.register(WellBehavedPlugin)
      manager.register(FaultyPlugin)
      manager.register({ ...WellBehavedPlugin, name: 'AnotherWellBehavedPlugin' })

      const context: AgentContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'test-request',
        timestamp: Date.now()
      }

      const results = await manager.executeHook('onInit', context)
      
      expect(results).toHaveLength(3)
      
      // First plugin should succeed
      expect(results[0].pluginName).toBe('WellBehavedPlugin')
      expect(results[0].success).toBe(true)
      
      // Second plugin should fail but be isolated
      expect(results[1].pluginName).toBe('FaultyPlugin')
      expect(results[1].success).toBe(false)
      expect(results[1].isolated).toBe(true)
      expect(results[1].error).toBeDefined()
      
      // Third plugin should still execute despite second plugin failure
      expect(results[2].pluginName).toBe('AnotherWellBehavedPlugin')
      expect(results[2].success).toBe(true)

      console.log('Executed plugin: FaultyPlugin - failed (isolated)')
    })

    it('should wait for slow plugins or timeout gracefully', async () => {
      // Use a manager with longer timeout to accommodate slow plugins
      const slowTestManager = new SecurePluginManagerV2({
        debug: false,
        enableSandboxing: true,
        hookTimeout: 3000, // 3 second timeout for slow plugin test
        strictExecutionOrder: true,
        failFast: false
      })
      
      slowTestManager.register(WellBehavedPlugin)
      slowTestManager.register(SlowPlugin) // Has 2000ms delay in onSend
      slowTestManager.register({ ...WellBehavedPlugin, name: 'AnotherWellBehavedPlugin' })

      const context: AgentContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'test-request',
        timestamp: Date.now()
      }

      const payload: SendPayload = {
        input: { message: 'test' },
        metadata: {}
      }

      const results = await slowTestManager.executeHook('onSend', payload, context)
      
      expect(results).toHaveLength(3)
      expect(results[0].success).toBe(true) // WellBehavedPlugin
      expect(results[1].success).toBe(true) // SlowPlugin - should complete within timeout
      expect(results[2].success).toBe(true) // AnotherWellBehavedPlugin

      console.log('Executed plugin: SlowPlugin - complete (delayed)')
      
      slowTestManager.shutdown()
    }, 10000) // Set test timeout to 10 seconds

    it('should handle hanging plugins with timeout', async () => {
      // Create manager with shorter timeout for this test
      const fastManager = new SecurePluginManagerV2({
        debug: false,
        enableSandboxing: true,
        hookTimeout: 500,
        strictExecutionOrder: true,
        failFast: false
      })

      fastManager.register(WellBehavedPlugin)
      fastManager.register(HangingPlugin)
      fastManager.register({ ...WellBehavedPlugin, name: 'FinalPlugin' })

      const context: AgentContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'test-request',
        timestamp: Date.now()
      }

      const results = await fastManager.executeHook('onInit', context)
      
      expect(results).toHaveLength(3)
      expect(results[0].success).toBe(true) // WellBehavedPlugin
      expect(results[1].success).toBe(false) // HangingPlugin - should timeout
      expect(results[1].timeout).toBe(true)
      expect(results[2].success).toBe(true) // FinalPlugin

      fastManager.shutdown()
    }, 10000) // Set test timeout to 10 seconds
  })

  describe('🚧 Chaos Test Plugin Suite Integration', () => {
    it('should handle all chaos plugins and verify system recovery', async () => {
      // Use a chaos test manager with appropriate timeout
      const chaosManager = new SecurePluginManagerV2({
        debug: false,
        enableSandboxing: true,
        hookTimeout: 1000, // 1 second timeout for chaos tests
        strictExecutionOrder: true,
        failFast: false
      })
      
      // Register all chaos plugins plus a control group (excluding SlowPlugin for init test)
      chaosManager.register(WellBehavedPlugin)
      chaosManager.register(FaultyPlugin)
      chaosManager.register(new ReentrantPlugin(chaosManager, connectAgent))
      chaosManager.register(MutatingPlugin)
      chaosManager.register(MultiErrorPlugin)
      chaosManager.register({ ...WellBehavedPlugin, name: 'FinalWellBehavedPlugin' })

      const context: AgentContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'test-request',
        timestamp: Date.now()
      }

      const results = await chaosManager.executeHook('onInit', context)

      expect(results).toHaveLength(6)
      
      // Count successful vs failed executions
      const successful = results.filter(r => r.success)
      const failed = results.filter(r => !r.success)
      const isolated = results.filter(r => r.isolated)

      expect(successful.length).toBeGreaterThan(0) // At least well-behaved plugins should succeed
      expect(failed.length).toBeGreaterThan(0) // Chaos plugins should fail
      expect(isolated.length).toBe(results.length) // All should be isolated

      // Verify system is still functional after chaos
      const stats = chaosManager.getStats()
      expect(stats.registeredPlugins).toBe(6)
      expect(stats.totalHookExecutions).toBe(1)

      chaosManager.shutdown()
      console.log('System recovered without deadlock after chaos test')
    }, 10000) // Set test timeout to 10 seconds

    it('should prevent plugin mutations despite chaos', async () => {
      const originalContext: AgentContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'test-request',
        timestamp: Date.now()
      }

      manager.register(MutatingPlugin)
      manager.register(WellBehavedPlugin)

      const results = await manager.executeHook('onInit', originalContext)

      // Verify context was not mutated
      expect(originalContext.agentId).toBe('test-agent')
      expect((originalContext as any).maliciousData).toBeUndefined()
      
      // Verify plugins executed
      expect(results).toHaveLength(2)
      expect(results[0].dataCloned).toBe(true)
      expect(results[1].dataCloned).toBe(true)
    })

    it('should handle multiple error types from MultiErrorPlugin', async () => {
      // Run the test multiple times to catch different error types
      const errorTypes = new Set<string>()
      
      for (let i = 0; i < 10; i++) {
        const testManager = new SecurePluginManagerV2({
          debug: false,
          enableSandboxing: true,
          hookTimeout: 1000,
          strictExecutionOrder: true,
          failFast: false
        })

        testManager.register(MultiErrorPlugin)

        const context: AgentContext = {
          agentId: `test-agent-${i}`,
          transportId: 'test-transport',
          requestId: `test-request-${i}`,
          timestamp: Date.now()
        }

        const results = await testManager.executeHook('onInit', context)
        
        expect(results).toHaveLength(1)
        expect(results[0].success).toBe(false)
        expect(results[0].error).toBeDefined()
        
        if (results[0].error) {
          errorTypes.add(results[0].error.constructor.name)
        }

        testManager.shutdown()
      }

      // Should have caught various error types
      expect(errorTypes.size).toBeGreaterThan(0)
    })
  })

  describe('🛡️ Plugin Isolation Validator', () => {
    it('should ensure thrown plugin errors do not propagate upward', async () => {
      manager.register(FaultyPlugin)
      manager.register(WellBehavedPlugin)

      const context: AgentContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'test-request',
        timestamp: Date.now()
      }

      // This should not throw despite FaultyPlugin throwing
      const results = await manager.executeHook('onInit', context)
      
      expect(results).toHaveLength(2)
      expect(results[0].success).toBe(false) // FaultyPlugin failed
      expect(results[1].success).toBe(true)  // WellBehavedPlugin succeeded
      
      // Verify error was isolated
      expect(results[0].isolated).toBe(true)
    })

    it('should track plugin execution with observable events', (done) => {
      let errorEventReceived = false

      manager.register(FaultyPlugin)

      manager.on('pluginError', (errorEvent) => {
        expect(errorEvent.pluginName).toBe('FaultyPlugin')
        expect(errorEvent.hookName).toBe('onInit')
        expect(errorEvent.error).toBeDefined()
        expect(errorEvent.isolated).toBe(true)
        errorEventReceived = true
      })

      const context: AgentContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'test-request',
        timestamp: Date.now()
      }

      manager.executeHook('onInit', context).then(() => {
        expect(errorEventReceived).toBe(true)
        done()
      })
    })

    it('should maintain execution statistics during chaos', async () => {
      // Use a stats test manager with appropriate timeout
      const statsManager = new SecurePluginManagerV2({
        debug: false,
        enableSandboxing: true,
        hookTimeout: 1000, // 1 second timeout for stats test
        strictExecutionOrder: true,
        failFast: false
      })
      
      statsManager.register(WellBehavedPlugin)
      statsManager.register(FaultyPlugin)

      const context: AgentContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'test-request',
        timestamp: Date.now()
      }

      await statsManager.executeHook('onInit', context)

      const stats = statsManager.getStats()
      expect(stats.totalHookExecutions).toBe(1)
      expect(stats.successfulHookExecutions).toBeGreaterThan(0)
      expect(stats.failedHookExecutions).toBeGreaterThan(0)
      expect(stats.registeredPlugins).toBe(2)
      
      statsManager.shutdown()
    }, 10000) // Set test timeout to 10 seconds

    it('should handle simultaneous plugin execution without deadlock', async () => {
      // Use a deadlock test manager with appropriate timeout
      const deadlockManager = new SecurePluginManagerV2({
        debug: false,
        enableSandboxing: true,
        hookTimeout: 1000, // 1 second timeout for deadlock test
        strictExecutionOrder: true,
        failFast: false
      })
      
      deadlockManager.register(WellBehavedPlugin)
      deadlockManager.register(FaultyPlugin)

      const context: AgentContext = {
        agentId: 'test-agent',
        transportId: 'test-transport',
        requestId: 'test-request',
        timestamp: Date.now()
      }

      // Execute multiple hooks simultaneously
      const promises = [
        deadlockManager.executeHook('onInit', context),
        deadlockManager.executeHook('onError', new Error('test error'), context)
      ]

      const results = await Promise.all(promises)

      expect(results).toHaveLength(2) // Two hook executions
      expect(results[0]).toHaveLength(2) // Two plugins in first execution
      expect(results[1]).toHaveLength(2) // Two plugins in second execution

      // System should still be functional
      const stats = deadlockManager.getStats()
      expect(stats.totalHookExecutions).toBe(2)
      
      deadlockManager.shutdown()
    }, 10000) // Set test timeout to 10 seconds
  })

  describe('📊 Plugin Execution Context Tracking', () => {
    it('should track plugin execution depth correctly', () => {
      expect(pluginExecutionContext.getExecutionDepth()).toBe(0)
      
      const id1 = pluginExecutionContext.startExecution('Plugin1', 'onInit')
      expect(pluginExecutionContext.getExecutionDepth()).toBe(1)
      expect(pluginExecutionContext.isPluginExecuting('Plugin1')).toBe(true)
      
      const id2 = pluginExecutionContext.startExecution('Plugin2', 'onSend')
      expect(pluginExecutionContext.getExecutionDepth()).toBe(2)
      expect(pluginExecutionContext.isPluginExecuting('Plugin2')).toBe(true)
      
      pluginExecutionContext.endExecution(id1)
      expect(pluginExecutionContext.getExecutionDepth()).toBe(1)
      expect(pluginExecutionContext.isPluginExecuting('Plugin1')).toBe(false)
      expect(pluginExecutionContext.isPluginExecuting('Plugin2')).toBe(true)
      
      pluginExecutionContext.endExecution(id2)
      expect(pluginExecutionContext.getExecutionDepth()).toBe(0)
      expect(pluginExecutionContext.isPluginExecuting('Plugin2')).toBe(false)
    })

    it('should provide execution statistics', () => {
      const id1 = pluginExecutionContext.startExecution('Plugin1', 'onInit')
      const id2 = pluginExecutionContext.startExecution('Plugin2', 'onSend')
      
      const stats = pluginExecutionContext.getStats()
      expect(stats.activeExecutions).toBe(2)
      expect(stats.stackDepth).toBe(2)
      expect(stats.globallyLocked).toBe(false)
      expect(stats.executionContexts).toHaveLength(2)
      
      pluginExecutionContext.endExecution(id1)
      pluginExecutionContext.endExecution(id2)
    })

    it('should handle global execution lock', () => {
      expect(pluginExecutionContext.isGloballyLocked()).toBe(false)
      
      pluginExecutionContext.setGlobalLock(true)
      expect(pluginExecutionContext.isGloballyLocked()).toBe(true)
      
      pluginExecutionContext.setGlobalLock(false)
      expect(pluginExecutionContext.isGloballyLocked()).toBe(false)
    })

    it('should clean up execution context on reset', () => {
      const id1 = pluginExecutionContext.startExecution('Plugin1', 'onInit')
      const id2 = pluginExecutionContext.startExecution('Plugin2', 'onSend')
      
      expect(pluginExecutionContext.getExecutionDepth()).toBe(2)
      
      pluginExecutionContext.reset()
      
      expect(pluginExecutionContext.getExecutionDepth()).toBe(0)
      expect(pluginExecutionContext.getActiveExecutions()).toHaveLength(0)
      expect(pluginExecutionContext.isGloballyLocked()).toBe(false)
    })
  })
})