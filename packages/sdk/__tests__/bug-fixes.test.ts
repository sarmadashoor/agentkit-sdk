import { describe, it, expect, beforeEach } from 'vitest'
import { connectAgent } from '../src/index'
import { AgentRegistry } from '@agentkit/registry'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'

describe('Bug fixes for Phase 6', () => {
  let registry: AgentRegistry

  beforeEach(() => {
    registry = new AgentRegistry()
    
    // Register test transports
    registry.registerTransport(new DummyTransport({
      debug: false,
      logMessages: false
    }))
  })

  describe('Bug 1: supportedScopes preservation in registry', () => {
    it('should preserve supportedScopes during agent registration and connectAgent flow', async () => {
      // Register agent with specific supportedScopes
      const metadata = {
        id: 'scoped-agent',
        name: 'Scoped Test Agent',
        version: '1.0.0',
        supportedScopes: ['read', 'write', 'delete'],
        factory: () => new DummyAgent()
      }

      registry.register(metadata)

      // Connect to the agent
      const handle = await connectAgent({
        registry: registry,
        agent: 'scoped-agent',
        transport: 'dummy',
        scope: ['read', 'write'],
        debug: true
      })

      // Verify metadata contains the correct supportedScopes
      expect(handle.metadata.registeredScopes).toEqual(['read', 'write', 'delete'])
      expect(handle.metadata.requestedScopes).toEqual(['read', 'write'])
      expect(handle.metadata.agentId).toBe('scoped-agent')

      await handle.shutdown()
    })

    it('should handle agents with empty supportedScopes', async () => {
      const metadata = {
        id: 'empty-scopes-agent',
        name: 'Agent With Empty Scopes',
        version: '1.0.0',
        supportedScopes: [],
        factory: () => new DummyAgent()
      }

      registry.register(metadata)

      const handle = await connectAgent({
        registry: registry,
        agent: 'empty-scopes-agent',
        transport: 'dummy',
        scope: ['read'],
        debug: true
      })

      expect(handle.metadata.registeredScopes).toEqual([])
      expect(handle.metadata.requestedScopes).toEqual(['read'])

      await handle.shutdown()
    })

    it('should handle agents without supportedScopes field', async () => {
      const metadata = {
        id: 'no-scopes-agent',
        name: 'Agent Without Scopes',
        version: '1.0.0',
        factory: () => new DummyAgent()
      }

      registry.register(metadata)

      const handle = await connectAgent({
        registry: registry,
        agent: 'no-scopes-agent',
        transport: 'dummy',
        scope: ['read'],
        debug: true
      })

      expect(handle.metadata.registeredScopes).toEqual([])
      expect(handle.metadata.requestedScopes).toEqual(['read'])

      await handle.shutdown()
    })
  })

  describe('Bug 2: Agent factory-created ID mismatch', () => {
    it('should use registry metadata ID as authoritative agent ID, not factory agent ID', async () => {
      // Register agent where factory creates an agent with a different ID
      const metadata = {
        id: 'registry-agent-id',
        name: 'Registry Agent',
        version: '1.0.0',
        supportedScopes: ['read', 'write'],
        factory: () => {
          // Factory creates agent with different ID than registry
          const agent = new DummyAgent()
          agent.id = 'factory-created-id'
          return agent
        }
      }

      registry.register(metadata)

      const handle = await connectAgent({
        registry: registry,
        agent: 'registry-agent-id',
        transport: 'dummy',
        scope: ['read'],
        debug: true
      })

      // Metadata should use registry ID, not factory-created ID
      expect(handle.metadata.agentId).toBe('registry-agent-id')
      expect(handle.metadata.agentId).not.toBe('factory-created-id')

      await handle.shutdown()
    })

    it('should maintain consistency in lifecycle hooks using authoritative agent ID', async () => {
      let initHookAgentId: string | undefined
      let shutdownHookAgentId: string | undefined

      const metadata = {
        id: 'hook-test-agent',
        name: 'Hook Test Agent',
        version: '1.0.0',
        factory: () => {
          const agent = new DummyAgent()
          agent.id = 'different-factory-id'
          return agent
        }
      }

      registry.register(metadata)

      const handle = await connectAgent({
        registry: registry,
        agent: 'hook-test-agent',
        transport: 'dummy',
        debug: true,
        onInit: (agentId) => {
          initHookAgentId = agentId
        },
        onShutdown: (agentId) => {
          shutdownHookAgentId = agentId
        }
      })

      // Both hooks should receive the registry ID, not factory ID
      expect(initHookAgentId).toBe('hook-test-agent')
      expect(initHookAgentId).not.toBe('different-factory-id')

      await handle.shutdown()

      expect(shutdownHookAgentId).toBe('hook-test-agent')
      expect(shutdownHookAgentId).not.toBe('different-factory-id')
    })

    it('should use agent.id for direct agent instances (backward compatibility)', async () => {
      const directAgent = new DummyAgent()
      directAgent.id = 'direct-agent-id'

      const transport = new DummyTransport({
        debug: false,
        logMessages: false
      })

      const handle = await connectAgent({
        registry: registry,
        agent: directAgent,
        transport: transport,
        debug: true
      })

      // For direct agents, should use agent.id since there's no registry metadata
      expect(handle.metadata.agentId).toBe('direct-agent-id')
      expect(handle.metadata.registeredScopes).toEqual([])

      await handle.shutdown()
    })
  })

  describe('Combined bug fix validation', () => {
    it('should handle complex scenario with both bugs present', async () => {
      let errorHookCalled = false
      let errorHookAgentId: string | undefined

      const metadata = {
        id: 'complex-test-agent',
        name: 'Complex Test Agent',
        version: '1.0.0',
        supportedScopes: ['read', 'write', 'admin'],
        factory: () => {
          const agent = new DummyAgent()
          agent.id = 'factory-id-different'
          return agent
        }
      }

      registry.register(metadata)

      const handle = await connectAgent({
        registry: registry,
        agent: 'complex-test-agent',
        transport: 'dummy',
        scope: ['read', 'invalid-scope'], // Intentional scope mismatch for logging
        debug: true,
        onError: (err) => {
          errorHookCalled = true
          errorHookAgentId = handle.metadata.agentId
        }
      })

      // Verify both bugs are fixed
      expect(handle.metadata.agentId).toBe('complex-test-agent') // Bug 2 fix
      expect(handle.metadata.registeredScopes).toEqual(['read', 'write', 'admin']) // Bug 1 fix
      expect(handle.metadata.requestedScopes).toEqual(['read', 'invalid-scope'])

      await handle.shutdown()
    })
  })

  describe('Scope mismatch logging', () => {
    it('should log scope mismatches but not fail the connection', async () => {
      const metadata = {
        id: 'mismatch-agent',
        name: 'Mismatch Test Agent',
        version: '1.0.0',
        supportedScopes: ['read'],
        factory: () => new DummyAgent()
      }

      registry.register(metadata)

      // This should succeed even with scope mismatch
      const handle = await connectAgent({
        registry: registry,
        agent: 'mismatch-agent',
        transport: 'dummy',
        scope: ['read', 'write', 'admin'], // Requesting more than supported
        debug: true
      })

      expect(handle.metadata.agentId).toBe('mismatch-agent')
      expect(handle.metadata.registeredScopes).toEqual(['read'])
      expect(handle.metadata.requestedScopes).toEqual(['read', 'write', 'admin'])

      // Connection should still work
      await handle.send('test message')
      await handle.shutdown()
    })
  })
})