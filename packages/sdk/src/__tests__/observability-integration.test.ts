import { describe, it, expect, beforeEach, vi } from 'vitest'
import { connectAgent } from '../index'
import { AgentRegistry } from '@agentkit/registry'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'

describe('Observability Integration', () => {
  let registry: AgentRegistry
  let observabilityCallLog: Array<{
    type: 'start' | 'end' | 'error'
    operation?: string
    duration?: number
    error?: Error
    timestamp: string
  }>

  beforeEach(() => {
    registry = new AgentRegistry()
    observabilityCallLog = []
    
    // Register test agent
    registry.register({
      id: 'integration-agent',
      name: 'Integration Test Agent',
      version: '1.0.0',
      factory: () => new DummyAgent()
    })

    // Register test transport
    registry.registerTransport(new DummyTransport({ debug: false }))
  })

  it('should demonstrate complete observability lifecycle', async () => {
    const handle = await connectAgent({
      agent: 'integration-agent',
      transport: 'dummy',
      registry,
      debug: true,
      observability: {
        onRequestStart: (metadata) => {
          observabilityCallLog.push({
            type: 'start',
            operation: metadata.operation,
            timestamp: metadata.timestamp
          })
        },
        onRequestEnd: (metadata, duration) => {
          observabilityCallLog.push({
            type: 'end',
            operation: metadata.operation,
            duration,
            timestamp: metadata.timestamp
          })
        },
        onError: (error, context) => {
          observabilityCallLog.push({
            type: 'error',
            operation: context.operation || context.phase,
            error,
            timestamp: context.timestamp
          })
        }
      }
    })

    // Send a message
    await handle.send({ test: 'observability' })

    // Shutdown
    await handle.shutdown()

    // Verify the complete lifecycle was observed
    expect(observabilityCallLog).toHaveLength(6) // 3 operations × 2 calls each (start/end)

    // Verify init lifecycle
    expect(observabilityCallLog[0]).toMatchObject({
      type: 'start',
      operation: 'init'
    })
    expect(observabilityCallLog[1]).toMatchObject({
      type: 'end',
      operation: 'init'
    })
    expect(observabilityCallLog[1].duration).toBeGreaterThan(0)

    // Verify send lifecycle
    expect(observabilityCallLog[2]).toMatchObject({
      type: 'start',
      operation: 'send'
    })
    expect(observabilityCallLog[3]).toMatchObject({
      type: 'end',
      operation: 'send'
    })
    expect(observabilityCallLog[3].duration).toBeGreaterThan(0)

    // Verify shutdown lifecycle
    expect(observabilityCallLog[4]).toMatchObject({
      type: 'start',
      operation: 'shutdown'
    })
    expect(observabilityCallLog[5]).toMatchObject({
      type: 'end',
      operation: 'shutdown'
    })
    expect(observabilityCallLog[5].duration).toBeGreaterThan(0)

    // No errors should have occurred
    const errors = observabilityCallLog.filter(log => log.type === 'error')
    expect(errors).toHaveLength(0)
  })

  it('should capture errors in observability hooks', async () => {
    // Register a failing agent to test error observability
    registry.register({
      id: 'failing-integration-agent',
      name: 'Failing Integration Agent',
      version: '1.0.0',
      factory: () => ({
        id: 'failing-integration-agent',
        name: 'Failing Integration Agent',
        version: '1.0.0',
        init: async () => {
          throw new Error('Integration test failure')
        },
        handle: async () => ({}),
        shutdown: async () => {}
      })
    })

    try {
      await connectAgent({
        agent: 'failing-integration-agent',
        transport: 'dummy',
        registry,
        observability: {
          onRequestStart: (metadata) => {
            observabilityCallLog.push({
              type: 'start',
              operation: metadata.operation,
              timestamp: metadata.timestamp
            })
          },
          onRequestEnd: (metadata, duration) => {
            observabilityCallLog.push({
              type: 'end',
              operation: metadata.operation,
              duration,
              timestamp: metadata.timestamp
            })
          },
          onError: (error, context) => {
            observabilityCallLog.push({
              type: 'error',
              operation: context.operation || context.phase,
              error,
              timestamp: context.timestamp
            })
          }
        }
      })
      // Should not reach here
      expect.fail('Expected connectAgent to throw')
    } catch (error) {
      // Debug: Log what we actually captured
      console.log('Observability log:', JSON.stringify(observabilityCallLog, null, 2))
      
      // Verify error was captured in observability - might be more calls due to error tracking
      expect(observabilityCallLog.length).toBeGreaterThanOrEqual(2)
      
      expect(observabilityCallLog[0]).toMatchObject({
        type: 'start',
        operation: 'init'
      })
      
      // Find the error log entry
      const errorLog = observabilityCallLog.find(log => log.type === 'error')
      expect(errorLog).toBeDefined()
      expect(errorLog?.error).toBeInstanceOf(Error)
      expect(errorLog?.error?.message).toContain('Integration test failure')
    }
  })

  it('should handle hook failures gracefully', async () => {
    let hookErrorCount = 0
    
    const handle = await connectAgent({
      agent: 'integration-agent',
      transport: 'dummy',
      registry,
      debug: true, // Enable debug to see hook failure warnings
      observability: {
        onRequestStart: () => {
          hookErrorCount++
          throw new Error('Hook failure test')
        },
        onRequestEnd: (metadata, duration) => {
          // This should still be called despite onRequestStart failing
          observabilityCallLog.push({
            type: 'end',
            operation: metadata.operation,
            duration,
            timestamp: metadata.timestamp
          })
        }
      }
    })

    await handle.send({ test: 'hook-failure' })
    await handle.shutdown()

    // Hook should have failed 3 times (init, send, shutdown) but not disrupted operations
    expect(hookErrorCount).toBe(3)
    
    // onRequestEnd should still have been called 3 times
    expect(observabilityCallLog).toHaveLength(3)
    expect(observabilityCallLog.every(log => log.type === 'end')).toBe(true)
  })
})