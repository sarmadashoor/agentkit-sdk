/**
 * Integration Tests for Snapshot Agent
 * 
 * These tests validate that the snapshot agent correctly integrates with
 * the AgentKit SDK using only public APIs. This serves as both testing
 * and documentation for real-world usage.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// IMPORTANT: Only importing from public SDK APIs - just like a real consumer would
import { 
  connectAgent, 
  AgentRegistry,
  type AgentRuntimeHandle,
  type AgentKitPlugin
} from '@agentkit/sdk'

import { SnapshotAgent } from '../src/SnapshotAgent.js'
import { MockTransport } from '../src/MockTransport.js'
import { SnapshotLoggingPlugin } from '../src/SnapshotLoggingPlugin.js'
import { SnapshotService } from '../src/index.js'

describe('Snapshot Agent Integration Tests', () => {
  let registry: AgentRegistry
  let handle: AgentRuntimeHandle

  beforeEach(() => {
    registry = new AgentRegistry()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    if (handle) {
      await handle.shutdown()
    }
  })

  describe('Complete Lifecycle Tests', () => {
    it('should successfully complete full lifecycle: init → send → shutdown', async () => {
      // 1. Setup components using only public APIs
      const snapshotAgent = new SnapshotAgent({
        debug: false,
        maxSnapshots: 10
      })

      registry.register({
        id: 'snapshot-agent',
        name: 'Snapshot Agent',
        version: '1.0.0',
        factory: () => snapshotAgent
      })

      const transport = MockTransport.createReliableTransport()
      registry.registerTransport(transport)

      // 2. Connect using SDK
      handle = await connectAgent({
        agent: 'snapshot-agent',
        transport: 'mock-transport',
        registry,
        debug: false
      })

      expect(handle).toBeDefined()
      expect(handle.metadata.agentId).toBe('snapshot-agent')
      expect(handle.metadata.transportId).toBe('mock-transport')

      // 3. Send messages and verify they work
      await expect(handle.send({
        action: 'create',
        snapshotId: 'test-snapshot',
        data: { test: 'data' }
      })).resolves.not.toThrow()

      await expect(handle.send({
        action: 'get',
        snapshotId: 'test-snapshot'
      })).resolves.not.toThrow()

      await expect(handle.send({
        action: 'list'
      })).resolves.not.toThrow()

      // 4. Shutdown gracefully
      await expect(handle.shutdown()).resolves.not.toThrow()

      // Verify agent and transport statistics
      expect(snapshotAgent.getStats().requestCount).toBeGreaterThan(0)
      expect(transport.getStats().messageCount).toBeGreaterThan(0)
    })

    it('should handle plugin integration correctly', async () => {
      const pluginCalls: string[] = []
      
      // Create a test plugin using public API
      const testPlugin: AgentKitPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        onInit: (context) => {
          pluginCalls.push(`init:${context.agentId}`)
        },
        onSend: (payload, context) => {
          pluginCalls.push(`send:${(payload.input as any).action}`)
        },
        onShutdown: (context) => {
          pluginCalls.push(`shutdown:${context.agentId}`)
        }
      }

      const snapshotAgent = new SnapshotAgent()
      registry.register({
        id: 'snapshot-agent',
        name: 'Snapshot Agent',
        version: '1.0.0',
        factory: () => snapshotAgent
      })

      const transport = MockTransport.createReliableTransport()
      registry.registerTransport(transport)

      handle = await connectAgent({
        agent: 'snapshot-agent',
        transport: 'mock-transport',
        registry,
        plugins: [testPlugin]
      })

      // Plugin onInit should have been called
      expect(pluginCalls).toContain('init:snapshot-agent')

      await handle.send({
        action: 'create',
        data: { test: 'plugin-test' }
      })

      // Plugin onSend should have been called
      expect(pluginCalls).toContain('send:create')

      await handle.shutdown()

      // Plugin onShutdown should have been called
      expect(pluginCalls).toContain('shutdown:snapshot-agent')

      // Verify call order
      expect(pluginCalls.indexOf('init:snapshot-agent')).toBeLessThan(
        pluginCalls.indexOf('send:create')
      )
      expect(pluginCalls.indexOf('send:create')).toBeLessThan(
        pluginCalls.indexOf('shutdown:snapshot-agent')
      )
    })

    it('should work with custom logging plugin', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const loggingPlugin = new SnapshotLoggingPlugin({
        logLevel: 'info',
        includePayloads: false,
        enableMetrics: true
      })

      const snapshotAgent = new SnapshotAgent()
      registry.register({
        id: 'snapshot-agent',
        name: 'Snapshot Agent',
        version: '1.0.0',
        factory: () => snapshotAgent
      })

      const transport = MockTransport.createReliableTransport()
      registry.registerTransport(transport)

      handle = await connectAgent({
        agent: 'snapshot-agent',
        transport: 'mock-transport',
        registry,
        plugins: [loggingPlugin]
      })

      await handle.send({
        action: 'create',
        data: { test: 'logging' }
      })

      await handle.shutdown()

      // Verify logging plugin was active
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SnapshotAgent]'),
        expect.anything()
      )

      // Check metrics
      const metrics = loggingPlugin.getMetrics()
      expect(metrics.totalRequests).toBe(1)
      expect(metrics.totalErrors).toBe(0)
      expect(metrics.successRate).toBe(1)

      consoleSpy.mockRestore()
    })
  })

  describe('Error Handling Tests', () => {
    it('should handle transport failures gracefully', async () => {
      const errorCalls: any[] = []

      const errorPlugin: AgentKitPlugin = {
        name: 'error-tracker',
        version: '1.0.0',
        onError: (error, context) => {
          errorCalls.push({
            error: error.message,
            agentId: context.agentId
          })
        }
      }

      const snapshotAgent = new SnapshotAgent()
      registry.register({
        id: 'snapshot-agent',
        name: 'Snapshot Agent',
        version: '1.0.0',
        factory: () => snapshotAgent
      })

      // Create a transport that always fails
      const failingTransport = MockTransport.createFailingTransport()
      registry.registerTransport(failingTransport)

      handle = await connectAgent({
        agent: 'snapshot-agent',
        transport: 'mock-transport',
        registry,
        plugins: [errorPlugin],
        onError: (error) => {
          // SDK-level error handling
          expect(error).toBeInstanceOf(Error)
        }
      })

      // This should fail due to transport failure
      await expect(handle.send({
        action: 'create',
        data: { test: 'failure' }
      })).rejects.toThrow()

      // Error plugin should have been called
      expect(errorCalls).toHaveLength(1)
      expect(errorCalls[0].error).toContain('MockTransport send failed')
      expect(errorCalls[0].agentId).toBe('snapshot-agent')

      await handle.shutdown()
    })

    it('should handle agent validation errors', async () => {
      const snapshotAgent = new SnapshotAgent()
      registry.register({
        id: 'snapshot-agent',
        name: 'Snapshot Agent',
        version: '1.0.0',
        factory: () => snapshotAgent
      })

      const transport = MockTransport.createReliableTransport()
      registry.registerTransport(transport)

      handle = await connectAgent({
        agent: 'snapshot-agent',
        transport: 'mock-transport',
        registry
      })

      // Send invalid request (missing action)
      await expect(handle.send({
        data: { test: 'no action' }
      })).rejects.toThrow('Missing required field: action')

      // Send invalid action
      await expect(handle.send({
        action: 'invalid-action'
      })).rejects.toThrow('Unknown action: invalid-action')

      await handle.shutdown()
    })

    it('should handle plugin errors without breaking main flow', async () => {
      const errorPlugin: AgentKitPlugin = {
        name: 'broken-plugin',
        version: '1.0.0',
        onInit: () => { throw new Error('Plugin init failed') },
        onSend: () => { throw new Error('Plugin send failed') },
        onShutdown: () => { throw new Error('Plugin shutdown failed') }
      }

      const workingPlugin: AgentKitPlugin = {
        name: 'working-plugin',
        version: '1.0.0',
        onInit: vi.fn(),
        onSend: vi.fn(),
        onShutdown: vi.fn()
      }

      const snapshotAgent = new SnapshotAgent()
      registry.register({
        id: 'snapshot-agent',
        name: 'Snapshot Agent',
        version: '1.0.0',
        factory: () => snapshotAgent
      })

      const transport = MockTransport.createReliableTransport()
      registry.registerTransport(transport)

      // Should not throw despite broken plugin
      handle = await connectAgent({
        agent: 'snapshot-agent',
        transport: 'mock-transport',
        registry,
        plugins: [errorPlugin, workingPlugin],
        debug: false // Suppress error logs in test
      })

      // Should work despite plugin errors
      await expect(handle.send({
        action: 'create',
        data: { test: 'plugin-resilience' }
      })).resolves.not.toThrow()

      // Working plugin should still be called
      expect(workingPlugin.onInit).toHaveBeenCalled()
      expect(workingPlugin.onSend).toHaveBeenCalled()

      await handle.shutdown()
      expect(workingPlugin.onShutdown).toHaveBeenCalled()
    })
  })

  describe('SnapshotService High-Level API Tests', () => {
    it('should provide convenient high-level API', async () => {
      const service = new SnapshotService({
        debug: false,
        transport: 'reliable',
        maxSnapshots: 5
      })

      await service.initialize()

      // Test all high-level operations
      await expect(service.createSnapshot(
        { message: 'test' }, 
        'test-snapshot'
      )).resolves.not.toThrow()

      await expect(service.getSnapshot('test-snapshot')).resolves.not.toThrow()
      
      await expect(service.listSnapshots()).resolves.toBeDefined()
      
      await expect(service.processData({ test: 'data' })).resolves.not.toThrow()
      
      await expect(service.deleteSnapshot('test-snapshot')).resolves.not.toThrow()

      // Test service status
      const status = service.getStatus()
      expect(status.initialized).toBe(true)
      expect(status.agentId).toBe('snapshot-agent')

      await service.shutdown()

      // Should not be initialized after shutdown
      expect(service.getStatus().initialized).toBe(false)
    })

    it('should handle service lifecycle errors', async () => {
      const service = new SnapshotService({
        transport: 'unreliable' // High failure rate
      })

      await service.initialize()

      // Some operations may fail due to unreliable transport
      // But service should remain functional
      try {
        await service.createSnapshot({ test: 'unreliable' })
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
      }

      await service.shutdown()
    })

    it('should prevent operations before initialization', async () => {
      const service = new SnapshotService()

      // Should throw error for operations before init
      await expect(service.createSnapshot({ test: 'data' }))
        .rejects.toThrow('Service not initialized')
        
      await expect(service.getSnapshot('test'))
        .rejects.toThrow('Service not initialized')
        
      await expect(service.listSnapshots())
        .rejects.toThrow('Service not initialized')
        
      await expect(service.processData({ test: 'data' }))
        .rejects.toThrow('Service not initialized')
        
      await expect(service.deleteSnapshot('test'))
        .rejects.toThrow('Service not initialized')

      // Shutdown should not throw even if not initialized
      await expect(service.shutdown()).resolves.not.toThrow()
    })
  })

  describe('Performance and Edge Cases', () => {
    it('should handle rapid concurrent operations', async () => {
      const service = new SnapshotService({
        debug: false,
        transport: 'reliable'
      })

      await service.initialize()

      // Send multiple concurrent operations
      const operations = Array.from({ length: 10 }, (_, i) =>
        service.createSnapshot({ id: i, data: `test-${i}` }, `snapshot-${i}`)
      )

      await Promise.all(operations)

      // All snapshots should be accessible
      const listPromises = Array.from({ length: 5 }, () => service.listSnapshots())
      await Promise.all(listPromises)

      await service.shutdown()
    })

    it('should handle large payloads correctly', async () => {
      const service = new SnapshotService({
        debug: false,
        transport: 'reliable'
      })

      await service.initialize()

      // Create a large payload
      const largeData = {
        array: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: `item-${i}`,
          metadata: { created: Date.now(), index: i }
        })),
        description: 'A'.repeat(10000) // Large string
      }

      await expect(service.createSnapshot(largeData, 'large-snapshot'))
        .resolves.not.toThrow()

      await expect(service.getSnapshot('large-snapshot'))
        .resolves.not.toThrow()

      await service.shutdown()
    })

    it('should enforce storage limits', async () => {
      const service = new SnapshotService({
        debug: false,
        transport: 'reliable',
        maxSnapshots: 2 // Very low limit
      })

      await service.initialize()

      // Should succeed for first two snapshots
      await service.createSnapshot({ id: 1 }, 'snapshot-1')
      await service.createSnapshot({ id: 2 }, 'snapshot-2')

      // Third should fail due to storage limit
      await expect(service.createSnapshot({ id: 3 }, 'snapshot-3'))
        .rejects.toThrow('Storage limit reached')

      await service.shutdown()
    })
  })
})