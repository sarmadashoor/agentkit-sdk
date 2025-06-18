import { describe, it, expect, beforeEach } from 'vitest'
import { AgentRegistry } from '../src/index'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'
import { 
  createMinimalAgent, 
  createSimpleNestedConfig, 
  createSimpleArrayConfig,
  createMinimalCircularConfig,
  expectWithinTimeLimit 
} from './performance-helpers'

describe('Registry Immutability', () => {
  let registry: AgentRegistry
  
  beforeEach(() => {
    registry = new AgentRegistry()
  })

  describe('Agent Metadata Immutability', () => {
    it('should deep freeze agent metadata on registration', () => {
      const metadata = createMinimalAgent('test-agent', {
        setting1: 'value1',
        nested: { setting2: 'value2' }
      })

      expectWithinTimeLimit(() => {
        registry.register(metadata)
        const retrieved = registry.lookup('test-agent')

        // Should be frozen at all levels
        expect(Object.isFrozen(retrieved)).toBe(true)
        expect(Object.isFrozen(retrieved.config)).toBe(true)
        expect(Object.isFrozen(retrieved.config.nested)).toBe(true)
      }, 50, 'deep freeze registration')
    })

    it('should prevent mutations to retrieved agent metadata', () => {
      const metadata = createMinimalAgent('test-agent', { mutable: 'original' })

      expectWithinTimeLimit(() => {
        registry.register(metadata)
        const retrieved = registry.lookup('test-agent')

        // Attempts to mutate should fail silently or throw in strict mode
        expect(() => {
          (retrieved as any).name = 'Hacked Agent'
        }).toThrow()
        
        expect(() => {
          (retrieved.config as any).mutable = 'hacked'
        }).toThrow()

        // Values should remain unchanged
        expect(retrieved.name).toBe('Agent test-agent')
        expect(retrieved.config.mutable).toBe('original')
      }, 50, 'mutation prevention')
    })

    it('should not affect the original metadata object', () => {
      const metadata = createMinimalAgent('test-agent', { mutable: 'original' })

      expectWithinTimeLimit(() => {
        registry.register(metadata)
        
        // Original should not be frozen
        expect(Object.isFrozen(metadata)).toBe(false)
        expect(Object.isFrozen(metadata.config)).toBe(false)
        
        // Should be able to mutate original
        metadata.config.mutable = 'changed'
        expect(metadata.config.mutable).toBe('changed')
        
        // Registry should still have original values
        const retrieved = registry.lookup('test-agent')
        expect(retrieved.config.mutable).toBe('original')
      }, 50, 'original object isolation')
    })
  })

  describe('Transport Immutability', () => {
    it('should freeze transport config on registration', () => {
      const transport = new DummyTransport({
        debug: true,
        logMessages: false,
        responseDelay: 100
      })

      registry.registerTransport(transport)
      const retrieved = registry.lookupTransport('dummy')

      // Config should be frozen
      expect(Object.isFrozen(retrieved.config)).toBe(true)
    })

    it('should prevent mutations to transport config', () => {
      const transport = new DummyTransport({
        debug: false,
        logMessages: true,
        responseDelay: 100
      })

      registry.registerTransport(transport)
      const retrieved = registry.lookupTransport('dummy')

      // Attempts to mutate config should fail
      expect(() => {
        (retrieved.config as any).debug = true
      }).toThrow()
      
      expect(() => {
        (retrieved.config as any).responseDelay = 999
      }).toThrow()

      // Values should remain unchanged
      expect(retrieved.config.debug).toBe(false)
      expect(retrieved.config.responseDelay).toBe(100)
    })
  })

  describe('Registry Freezing', () => {
    it('should be able to freeze the entire registry', () => {
      const metadata = {
        id: 'test-agent',
        name: 'Test Agent',
        version: '1.0.0',
        description: 'Test agent', 
        factory: () => new DummyAgent()
      }

      registry.register(metadata)
      registry.registerTransport(new DummyTransport())
      
      expect(registry.isFrozen()).toBe(false)
      
      registry.freeze()
      
      expect(registry.isFrozen()).toBe(true)
      expect(Object.isFrozen(registry)).toBe(true)
    })

    it('should prevent registrations after freezing', () => {
      registry.freeze()

      expect(() => {
        registry.register({
          id: 'test-agent',
          name: 'Test Agent',
          version: '1.0.0',
          description: 'Test agent',
          factory: () => new DummyAgent()
        })
      }).toThrow(/Cannot register agent on (frozen|sealed) registry/)

      expect(() => {
        registry.registerTransport(new DummyTransport())
      }).toThrow(/Cannot register transport on (frozen|sealed) registry/)
    })

    it('should prevent mutations after freezing', () => {
      const metadata = {
        id: 'test-agent',
        name: 'Test Agent',
        version: '1.0.0',
        description: 'Test agent',
        factory: () => new DummyAgent()
      }
      
      registry.register(metadata)
      registry.freeze()

      expect(() => {
        registry.removeAgent('test-agent')
      }).toThrow(/Cannot remove agent on (frozen|sealed) registry/)

      expect(() => {
        registry.clear()
      }).toThrow(/Cannot clear registry on (frozen|sealed) registry/)
    })

    it('should allow multiple freeze calls safely', () => {
      registry.freeze()
      registry.freeze() // Should not throw
      expect(registry.isFrozen()).toBe(true)
    })

    it('should still allow read operations after freezing', () => {
      const metadata = {
        id: 'test-agent',
        name: 'Test Agent',
        version: '1.0.0',
        description: 'Test agent',
        factory: () => new DummyAgent()
      }
      
      registry.register(metadata)
      registry.registerTransport(new DummyTransport())
      registry.freeze()

      // Read operations should still work
      expect(registry.lookup('test-agent')).toBeDefined()
      expect(registry.lookupTransport('dummy')).toBeDefined()
      expect(registry.hasAgent('test-agent')).toBe(true)
      expect(registry.hasTransport('dummy')).toBe(true)
      expect(registry.listAgents()).toContain('test-agent')
      expect(registry.listTransports()).toContain('dummy')
      expect(registry.agentCount).toBe(1)
      expect(registry.transportCount).toBe(1)
    })
  })

  describe('Circular Reference Handling', () => {
    it('should handle circular references in agent metadata', () => {
      const config = createMinimalCircularConfig()
      const metadata = createMinimalAgent('circular-agent', config)
      
      expectWithinTimeLimit(() => {
        // Should not throw despite circular reference
        expect(() => {
          registry.register(metadata)
        }).not.toThrow()
        
        const retrieved = registry.lookup('circular-agent')
        expect(retrieved).toBeDefined()
        expect(Object.isFrozen(retrieved)).toBe(true)
        expect(Object.isFrozen(retrieved.config)).toBe(true)
      }, 100, 'circular reference handling')
    })
  })

  describe('Deep Nesting Protection', () => {
    it('should freeze deeply nested objects', () => {
      const metadata = createMinimalAgent('deep-agent', createSimpleNestedConfig())

      expectWithinTimeLimit(() => {
        registry.register(metadata)
        const retrieved = registry.lookup('deep-agent')

        // All levels should be frozen
        expect(Object.isFrozen(retrieved.config)).toBe(true)
        expect(Object.isFrozen(retrieved.config.level1)).toBe(true)
        expect(Object.isFrozen(retrieved.config.level1.level2)).toBe(true)

        // Test mutation at the deepest level only (most efficient)
        expect(() => {
          (retrieved.config.level1.level2 as any).value = 'hacked'
        }).toThrow()
      }, 50, 'deep nesting freeze')
    })
  })

  describe('Array Immutability', () => {
    it('should freeze arrays in metadata', () => {
      const metadata = createMinimalAgent('array-agent', createSimpleArrayConfig())

      expectWithinTimeLimit(() => {
        registry.register(metadata)
        const retrieved = registry.lookup('array-agent')

        // Arrays should be frozen
        expect(Object.isFrozen(retrieved.config.features)).toBe(true)
        expect(Object.isFrozen(retrieved.config.nested)).toBe(true)
        expect(Object.isFrozen(retrieved.config.nested[0])).toBe(true)

        // Test only the most critical mutation cases
        expect(() => {
          (retrieved.config.features as any).push('hacked')
        }).toThrow()
        
        expect(() => {
          (retrieved.config.nested[0] as any).setting = 'hacked'
        }).toThrow()
      }, 50, 'array immutability')
    })
  })
})