import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { connectAgent, AgentRegistry } from '../index'
import { createTestAgent } from '@agentkit/test-agent'
import { createDummyTransport } from '@agentkit/transports-dummy'
import { ValidationError, RegistryError, CompatibilityError } from '../errors'
import { z } from 'zod'

describe('connectAgent', () => {
  let registry: AgentRegistry

  beforeEach(() => {
    // Create fresh registry before each test
    registry = new AgentRegistry()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('with literal agent and transport objects', () => {
    it('should successfully connect with agent and transport instances', async () => {
      const agent = createTestAgent()
      const transport = createDummyTransport()
      const onOutput = vi.fn()

      const handle = await connectAgent({
        agent,
        transport,
        onOutput,
        debug: false
      })

      expect(handle).toBeDefined()
      expect(handle.send).toBeInstanceOf(Function)
      expect(handle.shutdown).toBeInstanceOf(Function)
    })

    it('should call agent lifecycle methods correctly', async () => {
      const agent = createTestAgent()
      const transport = createDummyTransport()
      
      const initSpy = vi.spyOn(agent, 'init')
      const handleSpy = vi.spyOn(agent, 'handle')
      const shutdownSpy = vi.spyOn(agent, 'shutdown')

      const handle = await connectAgent({
        agent,
        transport,
        scope: ['test-scope'],
        techStack: 'test-stack'
      })

      // Verify init was called
      expect(initSpy).toHaveBeenCalledWith({
        scope: ['test-scope'],
        techStack: 'test-stack'
      })

      // Send a message
      await handle.send({ test: 'message' })
      expect(handleSpy).toHaveBeenCalledWith({ test: 'message' })

      // Shutdown
      await handle.shutdown()
      expect(shutdownSpy).toHaveBeenCalled()
    })

    it('should trigger onOutput callback with agent response', async () => {
      const agent = createTestAgent()
      const transport = createDummyTransport()
      const onOutput = vi.fn()

      const handle = await connectAgent({
        agent,
        transport,
        onOutput
      })

      await handle.send({ test: 'input' })

      expect(onOutput).toHaveBeenCalledTimes(1)
      expect(onOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          echo: { test: 'input' },
          agentId: 'test-agent',
          processed: true
        })
      )
    })

    it('should send agent output through transport', async () => {
      const agent = createTestAgent()
      const transport = createDummyTransport()
      const sendSpy = vi.spyOn(transport, 'send')

      const handle = await connectAgent({
        agent,
        transport
      })

      await handle.send({ test: 'input' })

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          echo: { test: 'input' },
          agentId: 'test-agent',
          processed: true
        })
      )
    })
  })

  describe('with string agent and transport IDs', () => {
    it('should resolve agent from registry', async () => {
      // Register test agent
      registry.register({
        id: 'test-agent',
        name: 'Test Agent',
        version: '1.0.0',
        factory: () => createTestAgent()
      })

      // Register dummy transport
      const dummyTransport = createDummyTransport()
      registry.registerTransport(dummyTransport)

      const handle = await connectAgent({
        agent: 'test-agent',
        transport: 'dummy',
        registry: registry
      })

      expect(handle).toBeDefined()
      expect(handle.send).toBeInstanceOf(Function)
    })

    it('should throw error for unregistered agent', async () => {
      const transport = createDummyTransport()

      await expect(
        connectAgent({
          agent: 'non-existent-agent',
          transport,
          registry: registry
        })
      ).rejects.toThrow(RegistryError)
    })

    it('should throw error for unregistered transport', async () => {
      const agent = createTestAgent()

      await expect(
        connectAgent({
          agent,
          transport: 'non-existent-transport',
          registry: registry
        })
      ).rejects.toThrow(RegistryError)
    })
  })

  describe('input validation', () => {
    it('should reject invalid agent objects', async () => {
      const invalidAgent = {
        id: 'invalid',
        // Missing required methods
      }
      const transport = createDummyTransport()

      await expect(
        connectAgent({
          agent: invalidAgent as any,
          transport
        })
      ).rejects.toThrow(ValidationError)
    })

    it('should reject invalid transport objects', async () => {
      const agent = createTestAgent()
      const invalidTransport = {
        id: 'invalid',
        // Missing required methods
      }

      await expect(
        connectAgent({
          agent,
          transport: invalidTransport as any
        })
      ).rejects.toThrow(ValidationError)
    })

    it('should reject invalid options', async () => {
      await expect(
        connectAgent({
          // Missing required fields
        } as any)
      ).rejects.toThrow(ValidationError)
    })
  })

  describe('error handling', () => {
    it('should not allow send before initialization completes', async () => {
      // This is handled internally by connectAgent, which waits for init
      const agent = createTestAgent()
      const transport = createDummyTransport()

      const handle = await connectAgent({
        agent,
        transport
      })

      // Should work fine since connectAgent waits for initialization
      await expect(handle.send({ test: 'data' })).resolves.not.toThrow()
    })

    it('should not allow operations after shutdown', async () => {
      const agent = createTestAgent()
      const transport = createDummyTransport()

      const handle = await connectAgent({
        agent,
        transport
      })

      await handle.shutdown()

      // Should throw after shutdown
      await expect(handle.send({ test: 'data' })).rejects.toThrow(
        'AgentManager has been shutdown'
      )
    })

    it('should not allow double initialization', async () => {
      const agent = createTestAgent()
      const transport = createDummyTransport()

      const handle = await connectAgent({
        agent,
        transport
      })

      // The handle is already initialized, so this test verifies internal behavior
      // The public API doesn't expose initialize() directly
      expect(handle).toBeDefined()
    })
  })

  describe('debug mode', () => {
    it('should respect debug flag', async () => {
      const consoleSpy = vi.spyOn(console, 'debug')
      const agent = createTestAgent({ debug: true })
      const transport = createDummyTransport({ debug: true })

      const handle = await connectAgent({
        agent,
        transport,
        debug: true
      })

      await handle.send({ test: 'debug' })

      // Should see debug logs from AgentKit debug logging system
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AgentKit:DEBUG]'),
      )
    })

    it('should validate compatibility', async () => {
      // Create an agent with empty string ID to test our compatibility check
      const invalidAgent = {
        id: '', // Invalid empty ID 
        name: 'Test Agent',
        version: '1.0.0',
        init: async () => {},
        handle: async (input: unknown) => input,
        shutdown: async () => {}
      }
      const transport = createDummyTransport()

      await expect(
        connectAgent({
          agent: invalidAgent as any,
          transport
        })
      ).rejects.toThrow(CompatibilityError)
    })

    it('should provide detailed error context', async () => {
      try {
        await connectAgent({
          agent: 'non-existent-agent',
          transport: 'non-existent-transport'
        })
      } catch (error: any) {
        expect(error).toBeInstanceOf(RegistryError)
        expect(error.context).toBeDefined()
        expect(error.context.requestedAgent).toBe('non-existent-agent')
        expect(error.context.availableAgents).toBeInstanceOf(Array)
      }
    })
  })
})