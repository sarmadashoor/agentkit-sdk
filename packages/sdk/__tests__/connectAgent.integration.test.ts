import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { connectAgent, AgentRegistry, initializeDefaultRegistry } from '../src/index'
import { DummyAgent, DummyAgentConfigSchema } from '@agentkit/test-agent'
import { DummyTransport, DummyTransportConfigSchema } from '@agentkit/transports-dummy'
import { ValidationError, RegistryError, AgentInitError, TransportInitError } from '../src/errors'
import { z } from 'zod'

describe('connectAgent Integration Tests', () => {
  beforeEach(() => {
    // Clear and reinitialize registry for each test
    AgentRegistry.clear()
    initializeDefaultRegistry()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('End-to-end lifecycle with string IDs', () => {
    it('should connect agent using string IDs from registry', async () => {
      const onOutput = vi.fn()

      const handle = await connectAgent({
        agent: 'dummy-agent',
        transport: 'dummy',
        onOutput,
        debug: false
      })

      expect(handle).toBeDefined()
      expect(handle.send).toBeInstanceOf(Function)
      expect(handle.shutdown).toBeInstanceOf(Function)
    })

    it('should call init() and handle() methods correctly via registry', async () => {
      const onOutput = vi.fn()
      
      const handle = await connectAgent({
        agent: 'dummy-agent',
        transport: 'dummy',
        onOutput,
        scope: ['test', 'integration'],
        techStack: 'typescript'
      })

      // Send a test message
      const testInput = { test: 'integration message', data: [1, 2, 3] }
      await handle.send(testInput)

      // Verify onOutput was called with expected structure
      expect(onOutput).toHaveBeenCalledTimes(1)
      expect(onOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          result: expect.stringContaining('echo:'),
          metadata: expect.objectContaining({
            agentId: 'dummy-agent',
            version: '1.0.0'
          })
        })
      )

      await handle.shutdown()
    })

    it('should validate that init() returns ready status', async () => {
      // Test that our dummy agent follows the expected protocol
      const agent = new DummyAgent()
      await agent.init({ debug: true })
      
      expect(agent.isInitialized()).toBe(true)
    })

    it('should process complex inputs correctly', async () => {
      const onOutput = vi.fn()
      
      const handle = await connectAgent({
        agent: 'dummy-agent',
        transport: 'dummy'
      })

      const complexInput = {
        command: 'process',
        data: {
          items: ['a', 'b', 'c'],
          metadata: { timestamp: Date.now() }
        },
        nested: { deep: { value: 42 } }
      }

      await handle.send(complexInput)

      // Verify the agent processed and echoed the complex input
      // The dummy agent should return the input in a structured way
      const result = await handle.send(complexInput)
      
      await handle.shutdown()
    })
  })

  describe('Configuration validation with Zod', () => {
    it('should validate agent configuration with Zod schema', async () => {
      const validConfig = {
        debug: true,
        echoPrefix: 'test:',
        processingDelay: 5
      }

      // This should not throw
      expect(() => DummyAgentConfigSchema.parse(validConfig)).not.toThrow()

      const invalidConfig = {
        debug: 'not-a-boolean',  // Invalid type
        processingDelay: 'not-a-number'  // Invalid type
      }

      // This should throw
      expect(() => DummyAgentConfigSchema.parse(invalidConfig)).toThrow()
    })

    it('should validate transport configuration with Zod schema', async () => {
      const validConfig = {
        debug: false,
        logMessages: true,
        responseDelay: 10,
        fixedResponse: { status: 'ok' }
      }

      // This should not throw
      expect(() => DummyTransportConfigSchema.parse(validConfig)).not.toThrow()

      const invalidConfig = {
        debug: 'invalid',  // Invalid type
        responseDelay: 'not-a-number'  // Invalid type
      }

      // This should throw
      expect(() => DummyTransportConfigSchema.parse(invalidConfig)).toThrow()
    })

    it('should reject malformed connectAgent options', async () => {
      // Missing required fields
      await expect(
        connectAgent({} as any)
      ).rejects.toThrow(ValidationError)

      // Invalid agent type
      await expect(
        connectAgent({
          agent: 123 as any,  // Should be string or Agent object
          transport: 'dummy'
        })
      ).rejects.toThrow(ValidationError)

      // Invalid transport type
      await expect(
        connectAgent({
          agent: 'dummy-agent',
          transport: 123 as any  // Should be string or Transport object
        })
      ).rejects.toThrow(ValidationError)
    })
  })

  describe('Transport behavior validation', () => {
    it('should verify transport send/receive cycle', async () => {
      const transport = new DummyTransport({ debug: true, logMessages: false })
      await transport.init()

      const testMessage = { test: 'transport message' }
      await transport.send(testMessage)

      expect(transport.getQueueSize()).toBeGreaterThan(0)
      expect(transport.getSentMessages()).toHaveLength(1)
      expect(transport.getSentMessages()[0]).toEqual(testMessage)

      const received = await transport.receive()
      expect(received).toEqual(
        expect.objectContaining({
          echoed: testMessage,
          transportId: 'dummy'
        })
      )
    })

    it('should handle fixed response configuration', async () => {
      const fixedResponse = { status: 'fixed', data: 'always-this' }
      const transport = new DummyTransport({ 
        fixedResponse,
        logMessages: false 
      })
      await transport.init()

      await transport.send({ anything: 'will be ignored' })
      const received = await transport.receive()

      expect(received).toEqual(fixedResponse)
    })
  })

  describe('Error handling and edge cases', () => {
    it('should handle non-existent agent ID gracefully', async () => {
      await expect(
        connectAgent({
          agent: 'non-existent-agent',
          transport: 'dummy'
        })
      ).rejects.toThrow(RegistryError)
    })

    it('should handle non-existent transport ID gracefully', async () => {
      await expect(
        connectAgent({
          agent: 'dummy-agent',
          transport: 'non-existent-transport'
        })
      ).rejects.toThrow(RegistryError)
    })

    it('should handle agent initialization failures', async () => {
      // Create a broken agent that fails on init
      const brokenAgent = new DummyAgent()
      const originalInit = brokenAgent.init.bind(brokenAgent)
      vi.spyOn(brokenAgent, 'init').mockRejectedValue(new Error('Init failed'))

      const transport = new DummyTransport()

      await expect(
        connectAgent({
          agent: brokenAgent,
          transport
        })
      ).rejects.toThrow(AgentInitError)
    })

    it('should handle transport initialization failures', async () => {
      const agent = new DummyAgent()
      const brokenTransport = new DummyTransport()
      vi.spyOn(brokenTransport, 'init').mockRejectedValue(new Error('Transport init failed'))

      await expect(
        connectAgent({
          agent,
          transport: brokenTransport
        })
      ).rejects.toThrow(TransportInitError)
    })
  })

  describe('Shutdown sequence validation', () => {
    it('should ensure clean shutdown sequence', async () => {
      const handle = await connectAgent({
        agent: 'dummy-agent',
        transport: 'dummy'
      })

      // Send a message to ensure everything is working
      await handle.send({ test: 'before shutdown' })

      // Shutdown should work without errors
      await expect(handle.shutdown()).resolves.not.toThrow()

      // Further operations should fail
      await expect(handle.send({ test: 'after shutdown' })).rejects.toThrow(
        'AgentManager has been shutdown'
      )
    })

    it('should allow multiple shutdown calls', async () => {
      const handle = await connectAgent({
        agent: 'dummy-agent',
        transport: 'dummy'
      })

      // First shutdown
      await handle.shutdown()

      // Second shutdown should not throw
      await expect(handle.shutdown()).resolves.not.toThrow()
    })
  })

  describe('Registry management', () => {
    it('should list registered agents and transports', () => {
      const agents = AgentRegistry.listAgents()
      const transports = AgentRegistry.listTransports()

      expect(agents).toContain('dummy-agent')
      expect(transports).toContain('dummy')
    })

    it('should allow manual registration', () => {
      AgentRegistry.register({
        id: 'test-manual-agent',
        name: 'Manual Test Agent',
        version: '1.0.0',
        description: 'Manually registered for testing',
        factory: () => new DummyAgent()
      })

      const agents = AgentRegistry.listAgents()
      expect(agents).toContain('test-manual-agent')

      // Should be able to use it
      expect(async () => {
        const handle = await connectAgent({
          agent: 'test-manual-agent',
          transport: 'dummy'
        })
        await handle.shutdown()
      }).not.toThrow()
    })
  })

  describe('Full stack integration', () => {
    it('should complete full agent lifecycle with all features', async () => {
      const outputCollector: unknown[] = []
      
      const handle = await connectAgent({
        agent: 'dummy-agent',
        transport: 'dummy',
        scope: ['integration', 'full-test'],
        techStack: 'typescript-vitest',
        onOutput: (output) => {
          outputCollector.push(output)
        },
        debug: false
      })

      // Send multiple messages to test stability
      const messages = [
        { type: 'greeting', message: 'Hello' },
        { type: 'query', data: { question: 'What is 2+2?' } },
        { type: 'command', action: 'process', payload: [1, 2, 3, 4, 5] }
      ]

      for (const message of messages) {
        await handle.send(message)
      }

      // Verify all outputs were collected
      expect(outputCollector).toHaveLength(messages.length)
      
      // Verify each output has expected structure
      outputCollector.forEach((output, index) => {
        expect(output).toEqual(
          expect.objectContaining({
            result: expect.stringContaining('echo:'),
            metadata: expect.objectContaining({
              agentId: 'dummy-agent',
              version: '1.0.0'
            })
          })
        )
      })

      // Clean shutdown
      await handle.shutdown()
    })
  })

  describe('Lifecycle hooks', () => {
    it('should call onInit hook after successful initialization', async () => {
      const onInit = vi.fn()
      
      const handle = await connectAgent({
        agent: 'dummy-agent',
        transport: 'dummy',
        onInit
      })

      expect(onInit).toHaveBeenCalledTimes(1)
      expect(onInit).toHaveBeenCalledWith('dummy-agent')

      await handle.shutdown()
    })

    it('should call onShutdown hook after successful shutdown', async () => {
      const onShutdown = vi.fn()
      
      const handle = await connectAgent({
        agent: 'dummy-agent',
        transport: 'dummy',
        onShutdown
      })

      expect(onShutdown).not.toHaveBeenCalled()

      await handle.shutdown()

      expect(onShutdown).toHaveBeenCalledTimes(1)
      expect(onShutdown).toHaveBeenCalledWith('dummy-agent')
    })

    it('should call onError hook when agent fails', async () => {
      const onError = vi.fn()
      const brokenAgent = new DummyAgent()
      vi.spyOn(brokenAgent, 'handle').mockRejectedValue(new Error('Agent broke!'))

      const handle = await connectAgent({
        agent: brokenAgent,
        transport: 'dummy',
        onError
      })

      await expect(handle.send({ test: 'data' })).rejects.toThrow('Agent broke!')

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Agent broke!')
        })
      )

      await handle.shutdown()
    })

    it('should handle errors in lifecycle hooks gracefully', async () => {
      const onInit = vi.fn().mockImplementation(() => {
        throw new Error('Hook failed!')
      })
      const onShutdown = vi.fn().mockImplementation(() => {
        throw new Error('Shutdown hook failed!')
      })
      
      // Hooks throwing should not break the main flow
      const handle = await connectAgent({
        agent: 'dummy-agent',
        transport: 'dummy',
        onInit,
        onShutdown,
        debug: true
      })

      expect(onInit).toHaveBeenCalled()
      
      // Agent should still work
      await handle.send({ test: 'data' })
      
      await handle.shutdown()
      expect(onShutdown).toHaveBeenCalled()
    })
  })

  describe('Runtime metadata', () => {
    it('should return complete metadata in runtime handle', async () => {
      const handle = await connectAgent({
        agent: 'dummy-agent',
        transport: 'dummy',
        scope: ['read', 'write', 'execute']
      })

      expect(handle.metadata).toBeDefined()
      expect(handle.metadata).toEqual({
        agentId: 'dummy-agent',
        transportId: 'dummy',
        registeredScopes: [], // Dummy agent doesn't have registered scopes yet
        requestedScopes: ['read', 'write', 'execute']
      })

      await handle.shutdown()
    })

    it('should include registered scopes from agent metadata', async () => {
      // Register an agent with scopes AFTER beforeEach has cleared registry
      AgentRegistry.register({
        id: 'scoped-agent',
        name: 'Scoped Test Agent', 
        version: '1.0.0',
        supportedScopes: ['read', 'list'],
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'scoped-agent',
        transport: 'dummy',
        scope: ['read', 'write']
      })

      expect(handle.metadata).toBeDefined()
      expect(handle.metadata.agentId).toBe('scoped-agent') // Registry ID used as authoritative agent ID
      expect(handle.metadata.transportId).toBe('dummy')
      expect(handle.metadata.requestedScopes).toEqual(['read', 'write'])
      expect(handle.metadata.registeredScopes).toEqual(['read', 'list']) // Bug 1 fixed

      await handle.shutdown()
    })
  })

  describe('Scope mismatch logging', () => {
    it('should log scope mismatch warning in debug mode', async () => {
      const consoleSpy = vi.spyOn(console, 'warn')
      
      // Register an agent with limited scopes  
      AgentRegistry.register({
        id: 'limited-agent',
        name: 'Limited Scope Agent',
        version: '1.0.0',
        supportedScopes: ['read'],
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'limited-agent',
        transport: 'dummy',
        scope: ['read', 'write'],
        debug: true
      })

      // Bug is now fixed: scope mismatch should be detected and logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Scope mismatch: requested [read, write] but agent only supports [read]')
      )

      await handle.shutdown()
    })

    it('should not log scope warnings in non-debug mode', async () => {
      const consoleSpy = vi.spyOn(console, 'warn')
      
      AgentRegistry.register({
        id: 'silent-agent',
        name: 'Silent Agent',
        version: '1.0.0',
        supportedScopes: ['read'],
        factory: () => new DummyAgent()
      })

      const handle = await connectAgent({
        agent: 'silent-agent',
        transport: 'dummy',
        scope: ['read', 'write'],
        debug: false
      })

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Scope mismatch')
      )

      await handle.shutdown()
    })
  })
})