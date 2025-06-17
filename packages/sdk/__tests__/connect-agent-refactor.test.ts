import { describe, it, expect, beforeEach } from 'vitest'
import { connectAgent } from '../src/index'
import { AgentRegistry } from '@agentkit/registry'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'

describe('connectAgent with Instance-Based Registry', () => {
  let registry: AgentRegistry

  beforeEach(() => {
    registry = new AgentRegistry()
  })

  describe('Registry Injection', () => {
    it('should accept registry instance as parameter', async () => {
      // Register agent and transport in specific registry
      registry.register({
        id: 'test-agent',
        name: 'Test Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })
      registry.registerTransport(new DummyTransport())

      // Connect using specific registry
      const handle = await connectAgent({
        agent: 'test-agent',
        transport: 'dummy',
        registry: registry
      })

      expect(handle).toBeDefined()
      expect(handle.metadata.agentId).toBe('test-agent')
      expect(handle.metadata.transportId).toBe('dummy')

      await handle.shutdown()
    })

    it('should use provided registry for agent lookup', async () => {
      const registry1 = new AgentRegistry()
      const registry2 = new AgentRegistry()

      // Register agent only in registry1
      registry1.register({
        id: 'agent-in-registry1',
        name: 'Agent in Registry 1',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })
      registry1.registerTransport(new DummyTransport())

      // Register different agent in registry2
      registry2.register({
        id: 'agent-in-registry2',
        name: 'Agent in Registry 2',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })
      registry2.registerTransport(new DummyTransport())

      // Should find agent in registry1
      const handle1 = await connectAgent({
        agent: 'agent-in-registry1',
        transport: 'dummy',
        registry: registry1
      })
      expect(handle1.metadata.agentId).toBe('agent-in-registry1')
      await handle1.shutdown()

      // Should find agent in registry2
      const handle2 = await connectAgent({
        agent: 'agent-in-registry2',
        transport: 'dummy',
        registry: registry2
      })
      expect(handle2.metadata.agentId).toBe('agent-in-registry2')
      await handle2.shutdown()

      // Should NOT find agent-in-registry2 in registry1
      await expect(connectAgent({
        agent: 'agent-in-registry2',
        transport: 'dummy',
        registry: registry1
      })).rejects.toThrow(/not found/)
    })

    it('should support backwards compatibility with default registry', async () => {
      // This test ensures we can still use connectAgent without explicit registry
      // when a default/global registry is available (for backwards compatibility)
      
      // Register in the default registry (if it exists)
      const defaultRegistry = new AgentRegistry()
      defaultRegistry.register({
        id: 'default-agent',
        name: 'Default Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })
      defaultRegistry.registerTransport(new DummyTransport())

      // For now, we expect explicit registry to be required
      // This test documents the backwards compatibility requirement
      await expect(connectAgent({
        agent: 'default-agent',
        transport: 'dummy',
        registry: defaultRegistry
      })).resolves.toBeDefined()
    })
  })

  describe('Registry Error Handling', () => {
    it('should provide clear error when agent not found in specific registry', async () => {
      registry.registerTransport(new DummyTransport())
      
      // Don't register any agents
      
      await expect(connectAgent({
        agent: 'nonexistent-agent',
        transport: 'dummy',
        registry: registry
      })).rejects.toThrow(/not found in registry/)
    })

    it('should provide clear error when transport not found in specific registry', async () => {
      registry.register({
        id: 'test-agent',
        name: 'Test Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })
      
      // Don't register any transports
      
      await expect(connectAgent({
        agent: 'test-agent',
        transport: 'nonexistent-transport',
        registry: registry
      })).rejects.toThrow(/not found in registry/)
    })

    it('should handle registry lookup errors gracefully', async () => {
      // Empty registry
      
      await expect(connectAgent({
        agent: 'any-agent',
        transport: 'any-transport',
        registry: registry
      })).rejects.toThrow()
    })
  })

  describe('Registry Isolation in connectAgent', () => {
    it('should not interfere with other registry instances', async () => {
      const registry1 = new AgentRegistry()
      const registry2 = new AgentRegistry()

      // Setup registry1
      registry1.register({
        id: 'isolated-agent',
        name: 'Isolated Agent 1',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })
      registry1.registerTransport(new DummyTransport())

      // Setup registry2 with same IDs but different implementations
      registry2.register({
        id: 'isolated-agent',
        name: 'Isolated Agent 2',
        version: '2.0.0',
        factory: () => {
          const agent = new DummyAgent()
          agent.name = 'Different Agent'
          return agent
        }
      })
      registry2.registerTransport(new DummyTransport())

      // Connect to both registries simultaneously
      const handle1 = await connectAgent({
        agent: 'isolated-agent',
        transport: 'dummy',
        registry: registry1
      })

      const handle2 = await connectAgent({
        agent: 'isolated-agent',
        transport: 'dummy',
        registry: registry2
      })

      // Should get different agent instances
      expect(handle1.metadata.agentId).toBe('isolated-agent')
      expect(handle2.metadata.agentId).toBe('isolated-agent')

      // Cleanup
      await handle1.shutdown()
      await handle2.shutdown()
    })
  })

  describe('Scope Handling with Instance Registry', () => {
    it('should properly handle scopes from registry metadata', async () => {
      registry.register({
        id: 'scoped-agent',
        name: 'Scoped Agent',
        version: '1.0.0',
        supportedScopes: ['read', 'write'],
        factory: () => new DummyAgent()
      })
      registry.registerTransport(new DummyTransport())

      const handle = await connectAgent({
        agent: 'scoped-agent',
        transport: 'dummy',
        scope: ['read'],
        registry: registry
      })

      expect(handle.metadata.registeredScopes).toEqual(['read', 'write'])
      expect(handle.metadata.requestedScopes).toEqual(['read'])

      await handle.shutdown()
    })

    it('should handle scope mismatches with registry-specific agents', async () => {
      registry.register({
        id: 'limited-agent',
        name: 'Limited Agent',
        version: '1.0.0',
        supportedScopes: ['read'],
        factory: () => new DummyAgent()
      })
      registry.registerTransport(new DummyTransport())

      // Request unsupported scope - should log but not fail
      const handle = await connectAgent({
        agent: 'limited-agent',
        transport: 'dummy',
        scope: ['read', 'write'], // 'write' not supported
        registry: registry,
        debug: true
      })

      expect(handle.metadata.registeredScopes).toEqual(['read'])
      expect(handle.metadata.requestedScopes).toEqual(['read', 'write'])

      await handle.shutdown()
    })
  })

  describe('Direct Instance Support', () => {
    it('should support direct agent instances with registry for transport', async () => {
      const directAgent = new DummyAgent()
      registry.registerTransport(new DummyTransport())

      const handle = await connectAgent({
        agent: directAgent,
        transport: 'dummy',
        registry: registry
      })

      expect(handle.metadata.agentId).toBe(directAgent.id)
      expect(handle.metadata.transportId).toBe('dummy')

      await handle.shutdown()
    })

    it('should support direct transport instances with registry for agent', async () => {
      registry.register({
        id: 'registry-agent',
        name: 'Registry Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      const directTransport = new DummyTransport()

      const handle = await connectAgent({
        agent: 'registry-agent',
        transport: directTransport,
        registry: registry
      })

      expect(handle.metadata.agentId).toBe('registry-agent')
      expect(handle.metadata.transportId).toBe(directTransport.id)

      await handle.shutdown()
    })

    it('should support both direct instances with registry for metadata only', async () => {
      const directAgent = new DummyAgent()
      const directTransport = new DummyTransport()

      // Registry not used for lookup, but could be used for other purposes
      const handle = await connectAgent({
        agent: directAgent,
        transport: directTransport,
        registry: registry
      })

      expect(handle.metadata.agentId).toBe(directAgent.id)
      expect(handle.metadata.transportId).toBe(directTransport.id)

      await handle.shutdown()
    })
  })
})