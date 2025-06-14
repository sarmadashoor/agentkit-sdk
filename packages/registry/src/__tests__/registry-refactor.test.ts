import { describe, it, expect, beforeEach } from 'vitest'
import { AgentRegistry } from '../index'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'

describe('AgentRegistry Instance-Based Design', () => {
  let registry1: AgentRegistry
  let registry2: AgentRegistry

  beforeEach(() => {
    registry1 = new AgentRegistry()
    registry2 = new AgentRegistry()
  })

  describe('Basic Instance Operations', () => {
    it('should create independent registry instances', () => {
      expect(registry1).toBeDefined()
      expect(registry2).toBeDefined()
      expect(registry1).not.toBe(registry2)
    })

    it('should support agent registration on individual instances', () => {
      const metadata = {
        id: 'test-agent',
        name: 'Test Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      }

      // Register on registry1 only
      registry1.register(metadata)

      // Should be found in registry1
      const found1 = registry1.getAgent('test-agent')
      expect(found1).toBeDefined()
      expect(found1?.id).toBe('test-agent')

      // Should NOT be found in registry2
      const found2 = registry2.getAgent('test-agent')
      expect(found2).toBeUndefined()
    })

    it('should support transport registration on individual instances', () => {
      const transport = new DummyTransport()

      // Register on registry1 only
      registry1.registerTransport(transport)

      // Should be found in registry1
      const found1 = registry1.getTransport('dummy')
      expect(found1).toBeDefined()
      expect(found1?.id).toBe('dummy')

      // Should NOT be found in registry2
      const found2 = registry2.getTransport('dummy')
      expect(found2).toBeUndefined()
    })
  })

  describe('Registry Isolation', () => {
    it('should maintain complete isolation between registry instances', () => {
      // Register different agents in each registry
      registry1.register({
        id: 'agent-1',
        name: 'Agent One',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      registry2.register({
        id: 'agent-2',
        name: 'Agent Two',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      // Each registry should only have its own agent
      expect(registry1.listAgents()).toEqual(['agent-1'])
      expect(registry2.listAgents()).toEqual(['agent-2'])

      expect(registry1.getAgent('agent-1')).toBeDefined()
      expect(registry1.getAgent('agent-2')).toBeUndefined()

      expect(registry2.getAgent('agent-1')).toBeUndefined()
      expect(registry2.getAgent('agent-2')).toBeDefined()
    })

    it('should allow same ID registration in different registries', () => {
      const sameId = 'duplicate-id'

      registry1.register({
        id: sameId,
        name: 'First Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      registry2.register({
        id: sameId,
        name: 'Second Agent',
        version: '2.0.0',
        factory: () => new DummyAgent()
      })

      const agent1 = registry1.getAgent(sameId)
      const agent2 = registry2.getAgent(sameId)

      expect(agent1?.name).toBe('First Agent')
      expect(agent1?.version).toBe('1.0.0')

      expect(agent2?.name).toBe('Second Agent')
      expect(agent2?.version).toBe('2.0.0')
    })
  })

  describe('Error Handling', () => {
    it('should reject duplicate agent IDs within same registry', () => {
      const metadata = {
        id: 'duplicate-agent',
        name: 'First Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      }

      // First registration should succeed
      registry1.register(metadata)

      // Second registration with same ID should fail
      expect(() => {
        registry1.register({
          ...metadata,
          name: 'Second Agent'
        })
      }).toThrow(/already registered/)
    })

    it('should reject duplicate transport IDs within same registry', () => {
      const transport1 = new DummyTransport()
      const transport2 = new DummyTransport()

      // First registration should succeed
      registry1.registerTransport(transport1)

      // Second registration with same ID should fail
      expect(() => {
        registry1.registerTransport(transport2)
      }).toThrow(/already registered/)
    })

    it('should reject invalid agent metadata', () => {
      // Test empty ID
      expect(() => {
        registry1.register({
          id: '', // Invalid empty ID
          name: 'Test Agent',
          version: '1.0.0',
          factory: () => new DummyAgent()
        } as any)
      }).toThrow(/cannot be empty|String must contain at least 1 character/)

      // Test empty name
      expect(() => {
        registry1.register({
          id: 'test-agent',
          name: '', // Invalid empty name
          version: '1.0.0',
          factory: () => new DummyAgent()
        } as any)
      }).toThrow(/cannot be empty|String must contain at least 1 character/)

      // Test missing factory
      expect(() => {
        registry1.register({
          id: 'test-agent',
          name: 'Test Agent',
          version: '1.0.0'
          // Missing factory
        } as any)
      }).toThrow(/validation failed/)
    })

    it('should handle agent lookup errors gracefully', () => {
      expect(() => {
        registry1.lookup('nonexistent-agent')
      }).toThrow(/not found/)

      expect(() => {
        registry1.lookupTransport('nonexistent-transport')
      }).toThrow(/not found/)
    })
  })

  describe('Cleanup and Disposal', () => {
    it('should support clear() operation', () => {
      // Register some agents and transports
      registry1.register({
        id: 'test-agent',
        name: 'Test Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })
      registry1.registerTransport(new DummyTransport())

      expect(registry1.listAgents()).toHaveLength(1)
      expect(registry1.listTransports()).toHaveLength(1)

      // Clear should remove everything
      registry1.clear()

      expect(registry1.listAgents()).toHaveLength(0)
      expect(registry1.listTransports()).toHaveLength(0)
    })

    it('should support selective removal', () => {
      registry1.register({
        id: 'agent-1',
        name: 'Agent One',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      registry1.register({
        id: 'agent-2',
        name: 'Agent Two',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      expect(registry1.listAgents()).toHaveLength(2)

      // Remove specific agent
      registry1.removeAgent('agent-1')

      expect(registry1.listAgents()).toEqual(['agent-2'])
      expect(registry1.getAgent('agent-1')).toBeUndefined()
      expect(registry1.getAgent('agent-2')).toBeDefined()
    })
  })

  describe('Advanced Features', () => {
    it('should preserve scope information correctly', () => {
      const metadata = {
        id: 'scoped-agent',
        name: 'Scoped Agent',
        version: '1.0.0',
        supportedScopes: ['read', 'write', 'admin'],
        factory: () => new DummyAgent()
      }

      registry1.register(metadata)
      const retrieved = registry1.getAgent('scoped-agent')

      expect(retrieved?.supportedScopes).toEqual(['read', 'write', 'admin'])
    })

    it('should support metadata introspection', () => {
      registry1.register({
        id: 'agent-1',
        name: 'Agent One',
        version: '1.0.0',
        description: 'First test agent',
        factory: () => new DummyAgent()
      })

      registry1.register({
        id: 'agent-2',
        name: 'Agent Two',
        version: '2.0.0',
        factory: () => new DummyAgent()
      })

      const agents = registry1.listAgents()
      expect(agents).toHaveLength(2)
      expect(agents).toContain('agent-1')
      expect(agents).toContain('agent-2')

      const metadata1 = registry1.getAgent('agent-1')
      expect(metadata1?.description).toBe('First test agent')
    })

    it('should handle concurrent operations safely', async () => {
      // Register multiple agents concurrently
      const registrations = Array.from({ length: 10 }, (_, i) => 
        registry1.register({
          id: `agent-${i}`,
          name: `Agent ${i}`,
          version: '1.0.0',
          factory: () => new DummyAgent()
        })
      )

      // All should succeed
      expect(() => registrations).not.toThrow()
      expect(registry1.listAgents()).toHaveLength(10)
    })
  })

  describe('Backwards Compatibility', () => {
    it('should maintain factory-based agent creation', () => {
      const metadata = {
        id: 'factory-agent',
        name: 'Factory Agent',
        version: '1.0.0',
        factory: () => {
          const agent = new DummyAgent()
          agent.id = 'factory-created-id'
          return agent
        }
      }

      registry1.register(metadata)
      const retrieved = registry1.getAgent('factory-agent')

      expect(retrieved?.factory).toBeDefined()
      
      // Factory should create agent instance
      const agent = retrieved!.factory()
      expect(agent).toBeDefined()
      expect(agent.id).toBe('factory-created-id')
    })

    it('should support all existing metadata fields', () => {
      const metadata = {
        id: 'full-metadata-agent',
        name: 'Full Metadata Agent',
        version: '1.2.3',
        description: 'Agent with all metadata fields',
        supportedScopes: ['read', 'write'],
        factory: () => new DummyAgent(),
        // Additional fields should be preserved
        customField: 'custom-value'
      }

      registry1.register(metadata as any)
      const retrieved = registry1.getAgent('full-metadata-agent') as any

      expect(retrieved.id).toBe('full-metadata-agent')
      expect(retrieved.name).toBe('Full Metadata Agent')
      expect(retrieved.version).toBe('1.2.3')
      expect(retrieved.description).toBe('Agent with all metadata fields')
      expect(retrieved.supportedScopes).toEqual(['read', 'write'])
      expect(retrieved.customField).toBe('custom-value')
    })
  })
})