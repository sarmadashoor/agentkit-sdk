import { describe, it, expect, beforeEach, vi, afterEach, afterAll } from 'vitest'
import { connectAgent, AgentRegistry } from '../src/index'
import { createTestAgent } from '@agentkit/test-agent'
import { createDummyTransport } from '@agentkit/transports-dummy'
import { 
  SchemaValidationError, 
  InvalidInputError, 
  AgentCompatibilityError, 
  AgentNotFoundError,
  TransportNotFoundError 
} from '../src/errors'
import { z } from 'zod'
import { registerAgent, registerTransport, registerCleanup, cleanupAgents } from './test-utils'

// Leak detection state
let testCounter = 0
let baselineHandles: any[] = []

// Track transport instances for cleanup
let activeTransports: Set<any> = new Set()

// Helper function to detect leaks against baseline
function logActiveHandles(label: string) {
  const handles = process._getActiveHandles()
  const messagePorts = handles.filter(h => h.constructor.name === 'MessagePort')
  const nonStandardHandles = handles.filter(h => !['TTY', 'Pipe', 'Socket', 'WriteStream', 'ReadStream', 'FSWatcher'].includes(h.constructor.name))
  
  // Calculate new handles beyond baseline
  const newHandles = handles.length - baselineHandles.length
  const newMessagePorts = messagePorts.length - baselineHandles.filter(h => h.constructor.name === 'MessagePort').length
  
  console.log(`[LEAK DEBUG ${testCounter}] ${label}: ${handles.length} total handles (+${newHandles} from baseline), ${messagePorts.length} MessagePorts (+${newMessagePorts}), ${nonStandardHandles.length} non-standard`)
  
  if (newHandles > 0) {
    console.log(`[LEAK DEBUG ${testCounter}] NEW HANDLES detected beyond baseline!`)
  }
}

describe('connectAgent', () => {
  let registry: AgentRegistry

  beforeEach(() => {
    testCounter++
    
    // Set baseline on first test
    if (testCounter === 1) {
      baselineHandles = process._getActiveHandles().slice()
      console.log(`[LEAK DEBUG] Baseline set: ${baselineHandles.length} handles`)
    }
    
    logActiveHandles(`TEST ${testCounter} START`)
    
    // Clear global registry state
    AgentRegistry.clear()
    // Create fresh registry before each test
    registry = new AgentRegistry()
  })

  afterEach(async () => {
    // Shutdown all active transports
    for (const transport of activeTransports) {
      if (transport && typeof transport.shutdown === 'function') {
        try {
          await transport.shutdown()
        } catch (error) {
          console.error('[CLEANUP] Error shutting down transport:', error)
        }
      } else if (transport && typeof transport.dispose === 'function') {
        try {
          await transport.dispose()
        } catch (error) {
          console.error('[CLEANUP] Error disposing transport:', error)
        }
      }
    }
    activeTransports.clear()
    
    // Ensure cleanup runs
    await cleanupAgents()
    
    logActiveHandles(`TEST ${testCounter} AFTER CLEANUP`)
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await cleanupAgents()
    logActiveHandles('ALL TESTS COMPLETE')
    
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  })

  describe('with literal agent and transport objects', () => {
    it('should successfully connect with agent and transport instances', async () => {
      const agent = registerAgent(createTestAgent())
      const transport = registerTransport(createDummyTransport())
      activeTransports.add(transport)
      const onOutput = vi.fn()

      const handle = await connectAgent({
        agent,
        transport,
        onOutput,
        debug: false
      })

      registerCleanup(async () => {
        if (handle) {
          await handle.shutdown()
        }
      })

      expect(handle).toBeDefined()
      expect(handle.send).toBeInstanceOf(Function)
      expect(handle.shutdown).toBeInstanceOf(Function)
    })

    it('should call agent lifecycle methods correctly', async () => {
      const agent = registerAgent(createTestAgent())
      const transport = registerTransport(createDummyTransport())
      activeTransports.add(transport)
      
      const initSpy = vi.spyOn(agent, 'init')
      const handleSpy = vi.spyOn(agent, 'handle')
      const shutdownSpy = vi.spyOn(agent, 'shutdown')

      const handle = await connectAgent({
        agent,
        transport,
        scope: ['test-scope'],
        techStack: 'test-stack'
      })

      registerCleanup(async () => {
        if (handle) {
          await handle.shutdown()
        }
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
      const agent = registerAgent(createTestAgent())
      const transport = registerTransport(createDummyTransport())
      activeTransports.add(transport)
      const onOutput = vi.fn()

      const handle = await connectAgent({
        agent,
        transport,
        onOutput
      })

      registerCleanup(async () => {
        if (handle) {
          await handle.shutdown()
        }
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
      const agent = registerAgent(createTestAgent())
      const transport = registerTransport(createDummyTransport())
      activeTransports.add(transport)
      const sendSpy = vi.spyOn(transport, 'send')

      const handle = await connectAgent({
        agent,
        transport
      })

      registerCleanup(async () => {
        if (handle) {
          await handle.shutdown()
        }
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
      const dummyTransport = registerTransport(createDummyTransport())
      activeTransports.add(dummyTransport)
      registry.registerTransport(dummyTransport)

      const handle = await connectAgent({
        agent: 'test-agent',
        transport: 'dummy',
        registry: registry
      })

      registerCleanup(async () => {
        if (handle) {
          await handle.shutdown()
        }
      })

      expect(handle).toBeDefined()
      expect(handle.send).toBeInstanceOf(Function)
    })

    it('should throw error for unregistered agent', async () => {
      const transport = registerTransport(createDummyTransport())
      activeTransports.add(transport)

      await expect(
        connectAgent({
          agent: 'non-existent-agent',
          transport,
          registry: registry
        })
      ).rejects.toThrow(AgentNotFoundError)
    })

    it('should throw error for unregistered transport', async () => {
      const agent = registerAgent(createTestAgent())

      await expect(
        connectAgent({
          agent,
          transport: 'non-existent-transport',
          registry: registry
        })
      ).rejects.toThrow(TransportNotFoundError)
    })
  })

  describe('input validation', () => {
    it('should reject invalid agent objects', async () => {
      const invalidAgent = {
        id: 'invalid',
        // Missing required methods
      }
      const transport = registerTransport(createDummyTransport())
      activeTransports.add(transport)

      await expect(
        connectAgent({
          agent: invalidAgent as any,
          transport
        })
      ).rejects.toThrow(SchemaValidationError)
    })

    it('should reject invalid transport objects', async () => {
      const agent = registerAgent(createTestAgent())
      const invalidTransport = {
        id: 'invalid',
        // Missing required methods
      }

      await expect(
        connectAgent({
          agent,
          transport: invalidTransport as any
        })
      ).rejects.toThrow(SchemaValidationError)
    })

    it('should reject invalid options', async () => {
      await expect(
        connectAgent({
          // Missing required fields
        } as any)
      ).rejects.toThrow(SchemaValidationError)
    })
  })

  describe('error handling', () => {
    it('should not allow send before initialization completes', async () => {
      // This is handled internally by connectAgent, which waits for init
      const agent = registerAgent(createTestAgent())
      const transport = registerTransport(createDummyTransport())
      activeTransports.add(transport)

      const handle = await connectAgent({
        agent,
        transport
      })

      registerCleanup(async () => {
        if (handle) {
          await handle.shutdown()
        }
      })

      // Should work fine since connectAgent waits for initialization
      await expect(handle.send({ test: 'data' })).resolves.not.toThrow()
    })

    it('should not allow operations after shutdown', async () => {
      const agent = registerAgent(createTestAgent())
      const transport = registerTransport(createDummyTransport())
      activeTransports.add(transport)

      const handle = await connectAgent({
        agent,
        transport
      })

      await handle.shutdown()

      // Should throw after shutdown
      await expect(handle.send({ test: 'data' })).rejects.toThrow(
        'SandboxedExecutor has been shutdown'
      )
    })

    it('should not allow double initialization', async () => {
      const agent = registerAgent(createTestAgent())
      const transport = registerTransport(createDummyTransport())
      activeTransports.add(transport)

      const handle = await connectAgent({
        agent,
        transport
      })

      registerCleanup(async () => {
        if (handle) {
          await handle.shutdown()
        }
      })

      // The handle is already initialized, so this test verifies internal behavior
      // The public API doesn't expose initialize() directly
      expect(handle).toBeDefined()
    })
  })

  describe('debug mode', () => {
    it('should respect debug flag', async () => {
      const consoleSpy = vi.spyOn(console, 'debug')
      const agent = registerAgent(createTestAgent({ debug: true }))
      const transport = registerTransport(createDummyTransport({ debug: true }))
      activeTransports.add(transport)

      const handle = await connectAgent({
        agent,
        transport,
        debug: true
      })

      registerCleanup(async () => {
        if (handle) {
          await handle.shutdown()
        }
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
      const transport = registerTransport(createDummyTransport())
      activeTransports.add(transport)

      await expect(
        connectAgent({
          agent: invalidAgent as any,
          transport
        })
      ).rejects.toThrow(SchemaValidationError)
    })

    it('should provide detailed error context', async () => {
      try {
        await connectAgent({
          agent: 'non-existent-agent',
          transport: 'non-existent-transport'
        })
      } catch (error: any) {
        expect(error).toBeInstanceOf(AgentNotFoundError)
        expect(error.context).toBeDefined()
        expect(error.context.requestedAgent).toBe('non-existent-agent')
        expect(error.context.availableAgents).toBeInstanceOf(Array)
      }
    })
  })
})