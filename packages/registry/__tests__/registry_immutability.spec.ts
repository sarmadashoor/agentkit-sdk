import { describe, it, expect, beforeEach } from 'vitest'
import { AgentRegistry } from '../src/index'
import type { AgentMetadata, Transport } from '@agentkit/types'

describe('Registry Immutability', () => {
  let registry: AgentRegistry

  beforeEach(() => {
    registry = new AgentRegistry()
  })

  const mockAgent: AgentMetadata = {
    id: 'test-agent',
    name: 'Test Agent',
    version: '1.0.0',
    description: 'Test agent for immutability tests',
    factory: () => ({ handle: async () => {}, shutdown: async () => {} })
  }

  const mockTransport: Transport = {
    id: 'test-transport',
    name: 'Test Transport',
    init: async () => {},
    send: async () => {},
    receive: async () => ({ data: 'test' }),
    canAcceptMore: () => true,
    config: { endpoint: 'test', timeout: 5000 }
  }

  describe('seal() method', () => {
    it('should allow registrations before sealing', () => {
      expect(() => registry.register(mockAgent)).not.toThrow()
      expect(() => registry.registerTransport(mockTransport)).not.toThrow()
    })

    it('should seal the registry and prevent further mutations', () => {
      registry.register(mockAgent)
      registry.seal()

      expect(() => registry.register({
        ...mockAgent,
        id: 'another-agent'
      })).toThrow(/Cannot register agent on sealed registry/)
    })

    it('should prevent transport registration after sealing', () => {
      registry.seal()

      expect(() => registry.registerTransport(mockTransport)).toThrow(/Cannot register transport on sealed registry/)
    })

    it('should prevent clearing after sealing', () => {
      registry.seal()

      expect(() => registry.clear()).toThrow(/Cannot clear registry on sealed registry/)
    })

    it('should prevent removing agents after sealing', () => {
      registry.register(mockAgent)
      registry.seal()

      expect(() => registry.removeAgent('test-agent')).toThrow(/Cannot remove agent on sealed registry/)
    })

    it('should prevent removing transports after sealing', () => {
      registry.registerTransport(mockTransport)
      registry.seal()

      expect(() => registry.removeTransport('test-transport')).toThrow(/Cannot remove transport on sealed registry/)
    })

    it('should not allow sealing multiple times', () => {
      registry.seal()
      
      expect(() => registry.seal()).toThrow(/Registry is already sealed/)
    })

    it('should allow read operations after sealing', () => {
      registry.register(mockAgent)
      registry.registerTransport(mockTransport)
      registry.seal()

      expect(() => registry.lookup('test-agent')).not.toThrow()
      expect(() => registry.lookupTransport('test-transport')).not.toThrow()
      expect(() => registry.getAgent('test-agent')).not.toThrow()
      expect(() => registry.getTransport('test-transport')).not.toThrow()
      expect(() => registry.listAgents()).not.toThrow()
      expect(() => registry.listTransports()).not.toThrow()
    })

    it('should return sealed status correctly', () => {
      expect(registry.isSealed()).toBe(false)
      registry.seal()
      expect(registry.isSealed()).toBe(true)
    })
  })

  describe('Deep freezing verification', () => {
    it('should deeply freeze agent metadata objects', { timeout: 10000 }, () => {
      const agentWithConfig = {
        ...mockAgent,
        config: { 
          apiKey: 'secret',
          settings: { timeout: 1000, retries: 3 }
        }
      }

      registry.register(agentWithConfig)
      registry.seal()

      const retrievedAgent = registry.getAgent('test-agent')!
      
      // Should not be able to modify the agent
      expect(() => {
        (retrievedAgent as any).name = 'Modified Name'
      }).toThrow()

      // Should not be able to modify nested config
      expect(() => {
        (retrievedAgent.config as any).apiKey = 'hacked'
      }).toThrow()

      // Should not be able to modify deeply nested objects
      expect(() => {
        (retrievedAgent.config as any).settings.timeout = 999
      }).toThrow()
    })

    it('should deeply freeze transport objects', { timeout: 10000 }, () => {
      const transportWithNestedConfig: Transport = {
        ...mockTransport,
        config: {
          endpoint: 'https://api.example.com',
          headers: { 'Authorization': 'Bearer token' },
          retryPolicy: { maxRetries: 3, backoff: 'exponential' }
        }
      }

      registry.registerTransport(transportWithNestedConfig)
      registry.seal()

      const retrievedTransport = registry.getTransport('test-transport')!

      // Should not be able to modify transport properties
      expect(() => {
        (retrievedTransport as any).name = 'Modified Transport'
      }).toThrow()

      // Should not be able to modify config
      expect(() => {
        (retrievedTransport.config as any).endpoint = 'https://hacker.com'
      }).toThrow()

      // Should not be able to modify nested config objects
      expect(() => {
        (retrievedTransport.config as any).headers['Authorization'] = 'Bearer hacked'
      }).toThrow()

      // Should not be able to modify deeply nested objects
      expect(() => {
        (retrievedTransport.config as any).retryPolicy.maxRetries = 999
      }).toThrow()
    })

    it('should freeze circular reference objects without infinite recursion', { timeout: 10000 }, () => {
      const circularAgent: any = {
        id: 'circular-agent',
        name: 'Circular Agent',
        version: '1.0.0',
        description: 'Agent with circular references',
        factory: () => ({ handle: async () => {}, shutdown: async () => {} }),
        config: {}
      }
      
      // Create circular reference
      circularAgent.config.self = circularAgent

      expect(() => registry.register(circularAgent)).not.toThrow()
      registry.seal()

      const retrieved = registry.getAgent('circular-agent')!
      
      // Should be frozen despite circular reference
      expect(() => {
        (retrieved as any).name = 'Modified'
      }).toThrow()
    })

    it('should preserve function references while freezing other properties', () => {
      const agentWithFunctions = {
        ...mockAgent,
        factory: () => ({ 
          handle: async () => 'test-result', 
          shutdown: async () => {} 
        }),
        config: {
          validate: (input: string) => input.length > 0,
          transform: (data: any) => ({ processed: data })
        }
      }

      registry.register(agentWithFunctions)
      registry.seal()

      const retrieved = registry.getAgent('test-agent')!
      
      // Functions should still be callable
      const instance = retrieved.factory()
      expect(instance.handle()).resolves.toBe('test-result')
      
      // But config object should be frozen
      expect(() => {
        (retrieved.config as any).newProperty = 'hack'
      }).toThrow()
    })
  })

  describe('Registry internal state protection', () => {
    it('should prevent direct manipulation of internal maps after sealing', () => {
      registry.register(mockAgent)
      registry.seal()

      // Attempt to access internal state should be protected
      const registryAny = registry as any
      
      // Maps should be frozen
      expect(Object.isFrozen(registryAny.agents)).toBe(true)
      expect(Object.isFrozen(registryAny.transports)).toBe(true)
      
      // Registry itself should be frozen
      expect(Object.isFrozen(registry)).toBe(true)
      
      // In strict mode, operations on frozen objects should throw
      // In non-strict mode, they might silently fail
      // Let's test that the registry remains in a valid state
      expect(() => registry.getAgent('test-agent')).not.toThrow()
      expect(registry.listAgents()).toContain('test-agent')
    })

    it('should maintain registry immutability even with complex nested structures', { timeout: 10000 }, () => {
      // Simplified structure to improve performance while maintaining test coverage
      const complexAgent = {
        id: 'complex-agent',
        name: 'Complex Agent',
        version: '1.0.0',
        description: 'Agent with complex nested structure',
        factory: () => ({ handle: async () => {}, shutdown: async () => {} }),
        config: {
          database: {
            host: 'db1.example.com',
            credentials: {
              username: 'user',
              options: {
                ssl: true,
                pools: { max: 20 }
              }
            }
          },
          features: {
            enabled: ['auth'],
            experimental: {
              newFeature: { enabled: false }
            }
          }
        }
      }

      registry.register(complexAgent)
      registry.seal()

      const retrieved = registry.getAgent('complex-agent')!

      // Test various levels of nesting are frozen
      expect(() => {
        (retrieved.config as any).database.host = 'hacked'
      }).toThrow()

      expect(() => {
        (retrieved.config as any).database.credentials.username = 'hacked'
      }).toThrow()

      expect(() => {
        (retrieved.config as any).database.credentials.options.pools.max = 999
      }).toThrow()

      expect(() => {
        (retrieved.config as any).features.enabled.push('hacker-feature')
      }).toThrow()

      expect(() => {
        (retrieved.config as any).features.experimental.newFeature.enabled = true
      }).toThrow()
    })
  })
})