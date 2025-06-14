import { describe, it, expect, beforeEach, vi } from 'vitest'
import { connectAgent } from '../index'
import { AgentRegistry } from '@agentkit/registry'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'
import { ObservabilityHooks, RequestMetadata, ErrorContext } from '@agentkit/types'

describe('Observability Hooks', () => {
  let registry: AgentRegistry
  let observabilityHooks: {
    onRequestStart: ReturnType<typeof vi.fn>
    onRequestEnd: ReturnType<typeof vi.fn>
    onError: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    registry = new AgentRegistry()
    
    // Register test agent
    registry.register({
      id: 'obs-test-agent',
      name: 'Observability Test Agent',
      version: '1.0.0',
      factory: () => new DummyAgent()
    })

    // Register test transport
    registry.registerTransport(new DummyTransport({ debug: false }))

    // Create mock observability hooks
    observabilityHooks = {
      onRequestStart: vi.fn(),
      onRequestEnd: vi.fn(),
      onError: vi.fn()
    }
  })

  describe('Hook Call Sequence', () => {
    it('should call hooks in correct sequence during successful init', async () => {
      const handle = await connectAgent({
        agent: 'obs-test-agent',
        transport: 'dummy',
        registry,
        observability: observabilityHooks
      })

      // Verify onRequestStart was called for init
      expect(observabilityHooks.onRequestStart).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'init',
          agentId: 'obs-test-agent',
          transportId: 'dummy',
          requestId: expect.any(String),
          timestamp: expect.any(String)
        })
      )

      // Verify onRequestEnd was called for init
      expect(observabilityHooks.onRequestEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'init',
          agentId: 'obs-test-agent',
          transportId: 'dummy',
          requestId: expect.any(String),
          timestamp: expect.any(String)
        }),
        expect.any(Number) // duration
      )

      // No errors should occur during init
      expect(observabilityHooks.onError).not.toHaveBeenCalled()

      await handle.shutdown()
    })

    it('should call hooks in correct sequence during send operation', async () => {
      const handle = await connectAgent({
        agent: 'obs-test-agent',
        transport: 'dummy',
        registry,
        observability: observabilityHooks
      })

      // Clear init calls
      observabilityHooks.onRequestStart.mockClear()
      observabilityHooks.onRequestEnd.mockClear()

      await handle.send({ test: 'message' })

      // Verify onRequestStart was called for send
      expect(observabilityHooks.onRequestStart).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'send',
          agentId: 'obs-test-agent',
          transportId: 'dummy',
          requestId: expect.any(String),
          timestamp: expect.any(String),
          context: expect.objectContaining({
            inputType: 'object'
          })
        })
      )

      // Verify onRequestEnd was called for send
      expect(observabilityHooks.onRequestEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'send',
          agentId: 'obs-test-agent',
          transportId: 'dummy',
          requestId: expect.any(String),
          timestamp: expect.any(String)
        }),
        expect.any(Number) // duration
      )

      await handle.shutdown()
    })

    it('should call hooks in correct sequence during shutdown', async () => {
      const handle = await connectAgent({
        agent: 'obs-test-agent',
        transport: 'dummy',
        registry,
        observability: observabilityHooks
      })

      // Clear init calls
      observabilityHooks.onRequestStart.mockClear()
      observabilityHooks.onRequestEnd.mockClear()

      await handle.shutdown()

      // Verify onRequestStart was called for shutdown
      expect(observabilityHooks.onRequestStart).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'shutdown',
          agentId: 'obs-test-agent',
          transportId: 'dummy',
          requestId: expect.any(String),
          timestamp: expect.any(String)
        })
      )

      // Verify onRequestEnd was called for shutdown
      expect(observabilityHooks.onRequestEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'shutdown',
          agentId: 'obs-test-agent',
          transportId: 'dummy',
          requestId: expect.any(String),
          timestamp: expect.any(String)
        }),
        expect.any(Number) // duration
      )
    })
  })

  describe('Request Metadata Validation', () => {
    it('should provide accurate metadata in onRequestStart', async () => {
      const handle = await connectAgent({
        agent: 'obs-test-agent',
        transport: 'dummy',
        registry,
        observability: observabilityHooks
      })

      const startCall = observabilityHooks.onRequestStart.mock.calls[0][0] as RequestMetadata
      
      expect(startCall).toMatchObject({
        operation: 'init',
        agentId: 'obs-test-agent',
        transportId: 'dummy',
        requestId: expect.stringMatching(/^[a-f0-9-]{36}$/), // UUID format
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/) // ISO format
      })

      await handle.shutdown()
    })

    it('should provide accurate metadata in onRequestEnd with duration', async () => {
      const handle = await connectAgent({
        agent: 'obs-test-agent',
        transport: 'dummy',
        registry,
        observability: observabilityHooks
      })

      const endCall = observabilityHooks.onRequestEnd.mock.calls[0]
      const metadata = endCall[0] as RequestMetadata
      const duration = endCall[1] as number

      expect(metadata).toMatchObject({
        operation: 'init',
        agentId: 'obs-test-agent',
        transportId: 'dummy',
        requestId: expect.stringMatching(/^[a-f0-9-]{36}$/),
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      })

      expect(duration).toBeGreaterThan(0)
      expect(duration).toBeLessThan(1000) // Should complete quickly in tests

      await handle.shutdown()
    })

    it('should include context in send operation metadata', async () => {
      const handle = await connectAgent({
        agent: 'obs-test-agent',
        transport: 'dummy',
        registry,
        observability: observabilityHooks
      })

      // Clear init calls
      observabilityHooks.onRequestStart.mockClear()

      const testInput = { test: 'complex', data: [1, 2, 3] }
      await handle.send(testInput)

      const startCall = observabilityHooks.onRequestStart.mock.calls[0][0] as RequestMetadata
      
      expect(startCall.context).toMatchObject({
        inputType: 'object',
        hasInput: true
      })

      await handle.shutdown()
    })

    it('should maintain consistent requestId between start and end hooks', async () => {
      const handle = await connectAgent({
        agent: 'obs-test-agent',
        transport: 'dummy',
        registry,
        observability: observabilityHooks
      })

      const startMetadata = observabilityHooks.onRequestStart.mock.calls[0][0] as RequestMetadata
      const endMetadata = observabilityHooks.onRequestEnd.mock.calls[0][0] as RequestMetadata

      expect(startMetadata.requestId).toBe(endMetadata.requestId)

      await handle.shutdown()
    })
  })

  describe('Error Handling and Hook Failures', () => {
    it('should call onError hook when agent initialization fails', async () => {
      // Register a failing agent
      registry.register({
        id: 'failing-agent',
        name: 'Failing Agent',
        version: '1.0.0',
        factory: () => ({
          id: 'failing-agent',
          name: 'Failing Agent',
          version: '1.0.0',
          init: async () => {
            throw new Error('Agent init failed')
          },
          handle: async () => ({}),
          shutdown: async () => {}
        })
      })

      await expect(connectAgent({
        agent: 'failing-agent',
        transport: 'dummy',
        registry,
        observability: observabilityHooks
      })).rejects.toThrow('Agent init failed')

      // Verify onError was called with correct context
      expect(observabilityHooks.onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          agentId: 'failing-agent',
          transportId: 'dummy',
          phase: 'init',
          timestamp: expect.any(String),
          error: expect.any(Error)
        })
      )
    })

    it('should continue execution when onRequestStart hook throws', async () => {
      observabilityHooks.onRequestStart.mockImplementation(() => {
        throw new Error('Hook failed')
      })

      // Should not throw despite hook failure
      const handle = await connectAgent({
        agent: 'obs-test-agent',
        transport: 'dummy',
        registry,
        observability: observabilityHooks
      })

      // onRequestEnd should still be called
      expect(observabilityHooks.onRequestEnd).toHaveBeenCalled()

      await handle.shutdown()
    })

    it('should continue execution when onRequestEnd hook throws', async () => {
      observabilityHooks.onRequestEnd.mockImplementation(() => {
        throw new Error('Hook failed')
      })

      // Should not throw despite hook failure
      const handle = await connectAgent({
        agent: 'obs-test-agent',
        transport: 'dummy',
        registry,
        observability: observabilityHooks
      })

      // Verify connection succeeded
      expect(handle.metadata.agentId).toBe('obs-test-agent')

      await handle.shutdown()
    })

    it('should continue execution when onError hook throws', async () => {
      observabilityHooks.onError.mockImplementation(() => {
        throw new Error('Error hook failed')
      })

      // Register a failing agent to trigger onError
      registry.register({
        id: 'error-agent',
        name: 'Error Agent',
        version: '1.0.0',
        factory: () => ({
          id: 'error-agent',
          name: 'Error Agent',
          version: '1.0.0',
          init: async () => {
            throw new Error('Original error')
          },
          handle: async () => ({}),
          shutdown: async () => {}
        })
      })

      // Should still throw the original error, not the hook error
      await expect(connectAgent({
        agent: 'error-agent',
        transport: 'dummy',
        registry,
        observability: observabilityHooks
      })).rejects.toThrow('Original error')
    })
  })

  describe('Edge Cases', () => {
    it('should work when only some hooks are provided', async () => {
      const partialHooks = {
        onRequestStart: vi.fn()
        // onRequestEnd and onError are missing
      }

      const handle = await connectAgent({
        agent: 'obs-test-agent',
        transport: 'dummy',
        registry,
        observability: partialHooks
      })

      expect(partialHooks.onRequestStart).toHaveBeenCalled()

      await handle.shutdown()
    })

    it('should work when observability config is undefined', async () => {
      // Should not throw
      const handle = await connectAgent({
        agent: 'obs-test-agent',
        transport: 'dummy',
        registry
        // No observability config
      })

      expect(handle.metadata.agentId).toBe('obs-test-agent')

      await handle.shutdown()
    })

    it('should work when observability config is empty object', async () => {
      const handle = await connectAgent({
        agent: 'obs-test-agent',
        transport: 'dummy',
        registry,
        observability: {} // Empty config
      })

      expect(handle.metadata.agentId).toBe('obs-test-agent')

      await handle.shutdown()
    })

    it('should handle multiple rapid send operations with unique request IDs', async () => {
      const handle = await connectAgent({
        agent: 'obs-test-agent',
        transport: 'dummy',
        registry,
        observability: observabilityHooks
      })

      // Clear init calls
      observabilityHooks.onRequestStart.mockClear()
      observabilityHooks.onRequestEnd.mockClear()

      // Send multiple messages rapidly
      await Promise.all([
        handle.send({ msg: 1 }),
        handle.send({ msg: 2 }),
        handle.send({ msg: 3 })
      ])

      // Should have 3 start calls and 3 end calls
      expect(observabilityHooks.onRequestStart).toHaveBeenCalledTimes(3)
      expect(observabilityHooks.onRequestEnd).toHaveBeenCalledTimes(3)

      // All request IDs should be unique
      const requestIds = observabilityHooks.onRequestStart.mock.calls.map(
        call => (call[0] as RequestMetadata).requestId
      )
      const uniqueIds = new Set(requestIds)
      expect(uniqueIds.size).toBe(3)

      await handle.shutdown()
    })
  })

  describe('Performance and Timing', () => {
    it('should measure duration accurately', async () => {
      // Add a small delay to the agent init to test timing
      registry.register({
        id: 'slow-agent',
        name: 'Slow Agent',
        version: '1.0.0',
        factory: () => ({
          id: 'slow-agent',
          name: 'Slow Agent',
          version: '1.0.0',
          init: async () => {
            await new Promise(resolve => setTimeout(resolve, 50))
          },
          handle: async (input) => input,
          shutdown: async () => {}
        })
      })

      const handle = await connectAgent({
        agent: 'slow-agent',
        transport: 'dummy',
        registry,
        observability: observabilityHooks
      })

      const duration = observabilityHooks.onRequestEnd.mock.calls[0][1] as number

      // Should be at least 50ms due to our delay
      expect(duration).toBeGreaterThanOrEqual(45) // Some tolerance for timing
      expect(duration).toBeLessThan(200) // But not too long

      await handle.shutdown()
    })

    it('should handle timestamp accuracy', async () => {
      const beforeTime = Date.now()
      
      const handle = await connectAgent({
        agent: 'obs-test-agent',
        transport: 'dummy',
        registry,
        observability: observabilityHooks
      })

      const afterTime = Date.now()

      const startMetadata = observabilityHooks.onRequestStart.mock.calls[0][0] as RequestMetadata
      const endMetadata = observabilityHooks.onRequestEnd.mock.calls[0][0] as RequestMetadata

      const startTime = new Date(startMetadata.timestamp).getTime()
      const endTime = new Date(endMetadata.timestamp).getTime()

      // Timestamps should be within reasonable bounds
      expect(startTime).toBeGreaterThanOrEqual(beforeTime)
      expect(endTime).toBeLessThanOrEqual(afterTime)
      expect(endTime).toBeGreaterThanOrEqual(startTime)

      await handle.shutdown()
    })
  })
})