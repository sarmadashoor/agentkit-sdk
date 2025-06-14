import { describe, it, expect, beforeEach } from 'vitest'
import { AgentRegistry } from '../index'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'

describe('AgentRegistry Edge Cases', () => {
  beforeEach(() => {
    AgentRegistry.clear()
  })

  describe('Duplicate registration handling', () => {
    it('should allow overwriting agent registration with same ID', () => {
      // First registration
      AgentRegistry.register({
        id: 'test-agent',
        name: 'First Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      // Second registration with same ID should overwrite
      AgentRegistry.register({
        id: 'test-agent', 
        name: 'Second Agent',
        version: '2.0.0',
        factory: () => new DummyAgent()
      })

      const retrieved = AgentRegistry.lookup('test-agent')
      expect(retrieved.name).toBe('Second Agent')
      expect(retrieved.version).toBe('2.0.0')
    })

    it('should allow overwriting transport registration with same ID', () => {
      const transport1 = new DummyTransport({ debug: false })
      const transport2 = new DummyTransport({ debug: true })

      AgentRegistry.registerTransport(transport1)
      AgentRegistry.registerTransport(transport2)

      const retrieved = AgentRegistry.lookupTransport('dummy')
      expect(retrieved).toBe(transport2)
    })
  })

  describe('Invalid agent metadata', () => {
    it('should throw for agent with missing required fields', () => {
      expect(() => {
        AgentRegistry.register({
          // Missing id field
          name: 'Invalid Agent',
          version: '1.0.0',
          factory: () => new DummyAgent()
        } as any)
      }).toThrow()
    })

    it('should throw for agent with invalid ID type', () => {
      expect(() => {
        AgentRegistry.register({
          id: 123, // Should be string
          name: 'Invalid Agent',
          version: '1.0.0',
          factory: () => new DummyAgent()
        } as any)
      }).toThrow()
    })

    it('should throw for agent with invalid factory', () => {
      expect(() => {
        AgentRegistry.register({
          id: 'test-agent',
          name: 'Invalid Agent',
          version: '1.0.0',
          factory: 'not-a-function'
        } as any)
      }).toThrow()
    })
  })

  describe('Invalid transport registration', () => {
    it('should throw for transport with missing required fields', () => {
      expect(() => {
        AgentRegistry.registerTransport({
          // Missing id field
          name: 'Invalid Transport',
          init: async () => {},
          send: async () => {}
        } as any)
      }).toThrow()
    })

    it('should throw for transport with invalid methods', () => {
      expect(() => {
        AgentRegistry.registerTransport({
          id: 'invalid-transport',
          name: 'Invalid Transport',
          init: 'not-a-function',
          send: async () => {}
        } as any)
      }).toThrow()
    })
  })

  describe('Lookup edge cases', () => {
    it('should throw for non-existent agent', () => {
      expect(() => {
        AgentRegistry.lookup('non-existent-agent')
      }).toThrow('Agent with id "non-existent-agent" not found in registry')
    })

    it('should throw for non-existent transport', () => {
      expect(() => {
        AgentRegistry.lookupTransport('non-existent-transport')
      }).toThrow('Transport with id "non-existent-transport" not found in registry')
    })

    it('should handle empty string lookups gracefully', () => {
      expect(() => {
        AgentRegistry.lookup('')
      }).toThrow('Agent with id "" not found in registry')
    })

    it('should handle null/undefined lookups gracefully', () => {
      expect(() => {
        AgentRegistry.lookup(null as any)
      }).toThrow()

      expect(() => {
        AgentRegistry.lookup(undefined as any)
      }).toThrow()
    })
  })

  describe('Registry state management', () => {
    it('should return empty arrays when registry is empty', () => {
      expect(AgentRegistry.listAgents()).toEqual([])
      expect(AgentRegistry.listTransports()).toEqual([])
    })

    it('should correctly list registered items', () => {
      AgentRegistry.register({
        id: 'agent1',
        name: 'Agent 1',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      AgentRegistry.register({
        id: 'agent2',
        name: 'Agent 2', 
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      AgentRegistry.registerTransport(new DummyTransport())

      expect(AgentRegistry.listAgents()).toContain('agent1')
      expect(AgentRegistry.listAgents()).toContain('agent2')
      expect(AgentRegistry.listTransports()).toContain('dummy')
    })

    it('should clear all registrations', () => {
      // Register some items
      AgentRegistry.register({
        id: 'test-agent',
        name: 'Test Agent',
        version: '1.0.0',
        factory: () => new DummyAgent()
      })

      AgentRegistry.registerTransport(new DummyTransport())

      expect(AgentRegistry.listAgents().length).toBeGreaterThan(0)
      expect(AgentRegistry.listTransports().length).toBeGreaterThan(0)

      // Clear should remove everything
      AgentRegistry.clear()

      expect(AgentRegistry.listAgents()).toEqual([])
      expect(AgentRegistry.listTransports()).toEqual([])
    })
  })

  describe('Complex supportedScopes scenarios', () => {
    it('should reject null supportedScopes', () => {
      expect(() => {
        AgentRegistry.register({
          id: 'null-scopes-agent',
          name: 'Null Scopes Agent',
          version: '1.0.0',
          supportedScopes: null as any,
          factory: () => new DummyAgent()
        })
      }).toThrow()
    })

    it('should handle very large supportedScopes arrays', () => {
      const largeScopes = Array.from({ length: 1000 }, (_, i) => `scope-${i}`)
      
      AgentRegistry.register({
        id: 'large-scopes-agent',
        name: 'Large Scopes Agent',
        version: '1.0.0',
        supportedScopes: largeScopes,
        factory: () => new DummyAgent()
      })

      const retrieved = AgentRegistry.lookup('large-scopes-agent')
      expect(retrieved.supportedScopes).toEqual(largeScopes)
      expect(retrieved.supportedScopes?.length).toBe(1000)
    })

    it('should handle duplicate scopes in supportedScopes', () => {
      const duplicateScopes = ['read', 'write', 'read', 'admin', 'write']
      
      AgentRegistry.register({
        id: 'duplicate-scopes-agent',
        name: 'Duplicate Scopes Agent',
        version: '1.0.0',
        supportedScopes: duplicateScopes,
        factory: () => new DummyAgent()
      })

      const retrieved = AgentRegistry.lookup('duplicate-scopes-agent')
      expect(retrieved.supportedScopes).toEqual(duplicateScopes) // Preserves original array
    })
  })

  describe('Factory function edge cases', () => {
    it('should handle factory that throws during execution', () => {
      AgentRegistry.register({
        id: 'throwing-factory-agent',
        name: 'Throwing Factory Agent',
        version: '1.0.0',
        factory: () => {
          throw new Error('Factory failed!')
        }
      })

      // Registry should store the factory without executing it
      const metadata = AgentRegistry.lookup('throwing-factory-agent')
      expect(metadata).toBeDefined()
      expect(metadata.factory).toBeInstanceOf(Function)

      // But when we call the factory, it should throw
      expect(() => metadata.factory()).toThrow('Factory failed!')
    })

    it('should handle factory that returns invalid agent', () => {
      AgentRegistry.register({
        id: 'invalid-factory-agent',
        name: 'Invalid Factory Agent',
        version: '1.0.0',
        factory: () => ({
          // Missing required Agent interface methods
          id: 'invalid',
          name: 'Invalid'
        } as any)
      })

      const metadata = AgentRegistry.lookup('invalid-factory-agent')
      expect(metadata).toBeDefined()
      
      // Factory returns invalid agent (this will be caught by validation elsewhere)
      const invalidAgent = metadata.factory()
      expect(invalidAgent.id).toBe('invalid')
      expect(typeof invalidAgent.init).toBe('undefined')
    })
  })
})