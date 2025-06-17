import { describe, it, expect, beforeEach } from 'vitest'
import { connectAgent, AgentRegistry } from '../src/index'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'

describe('End-to-End AgentKit SDK Test', () => {
  beforeEach(() => {
    AgentRegistry.clear()
  })

  it('should complete full agent lifecycle with all features', async () => {
    // Step 1: Registry Setup - Register comprehensive agent and transport
    console.log('🔧 Setting up registry...')
    
    AgentRegistry.register({
      id: 'e2e-test-agent',
      name: 'End-to-End Test Agent',
      version: '1.0.0',
      description: 'Agent for comprehensive end-to-end testing',
      supportedScopes: ['read', 'write', 'process', 'admin'],
      factory: () => new DummyAgent()
    })

    AgentRegistry.registerTransport(new DummyTransport({
      debug: true,
      logMessages: true,
      responseDelay: 10
    }))

    // Verify registry state
    expect(AgentRegistry.listAgents()).toContain('e2e-test-agent')
    expect(AgentRegistry.listTransports()).toContain('dummy')

    // Step 2: Lifecycle Tracking - Set up comprehensive hooks
    const lifecycleEvents: Array<{ event: string; timestamp: number; data?: any }> = []
    const outputs: unknown[] = []
    const errors: Error[] = []

    const recordEvent = (event: string, data?: any) => {
      lifecycleEvents.push({ event, timestamp: Date.now(), data })
    }

    // Step 3: Connection with Full Configuration
    console.log('🔌 Connecting with full configuration...')
    
    const handle = await connectAgent({
      agent: 'e2e-test-agent',
      transport: 'dummy',
      scope: ['read', 'write', 'process'], // Partial scope match
      techStack: 'typescript',
      debug: true,
      
      onInit: (agentId) => {
        recordEvent('INIT', { agentId })
        expect(agentId).toBe('e2e-test-agent')
      },
      
      onShutdown: (agentId) => {
        recordEvent('SHUTDOWN', { agentId })
        expect(agentId).toBe('e2e-test-agent')
      },
      
      onError: (error) => {
        recordEvent('ERROR', { message: error.message })
        errors.push(error)
      },
      
      onOutput: (message) => {
        recordEvent('OUTPUT', { messageType: typeof message })
        outputs.push(message)
      }
    })

    // Step 4: Verify Connection Metadata
    console.log('📊 Verifying metadata...')
    
    expect(handle.metadata).toBeDefined()
    expect(handle.metadata.agentId).toBe('e2e-test-agent')
    expect(handle.metadata.transportId).toBe('dummy')
    expect(handle.metadata.registeredScopes).toEqual(['read', 'write', 'process', 'admin'])
    expect(handle.metadata.requestedScopes).toEqual(['read', 'write', 'process'])

    // Verify lifecycle events so far
    expect(lifecycleEvents).toHaveLength(1)
    expect(lifecycleEvents[0].event).toBe('INIT')
    expect(lifecycleEvents[0].data.agentId).toBe('e2e-test-agent')

    // Step 5: Message Processing - Test various message types
    console.log('💬 Testing message processing...')
    
    const testMessages = [
      { type: 'simple', content: 'Hello, AgentKit!' },
      { type: 'complex', data: { nested: { values: [1, 2, 3] }, timestamp: Date.now() } },
      { type: 'array', items: ['item1', 'item2', 'item3'] },
      { type: 'null', value: null },
      { type: 'boolean', success: true, failed: false },
      'plain string message'
    ]

    for (const [index, message] of testMessages.entries()) {
      recordEvent('SEND_START', { messageIndex: index, messageType: typeof message })
      await handle.send(message)
      recordEvent('SEND_COMPLETE', { messageIndex: index })
      
      // Verify output was captured
      expect(outputs).toHaveLength(index + 1)
    }

    // Step 6: Verify All Messages Processed
    expect(outputs).toHaveLength(testMessages.length)
    
    // Each output should be the processed version of the input
    outputs.forEach((output, index) => {
      expect(output).toBeDefined()
      expect(typeof output).toBe('object')
      // DummyAgent wraps input in a result response
      expect((output as any).result).toBeDefined()
      expect((output as any).metadata).toBeDefined()
    })

    // Step 7: Error Handling Test (should not break the flow)
    console.log('🧪 Testing error resilience...')
    
    try {
      // This should work fine with DummyAgent
      await handle.send({ type: 'test-error-resilience', trigger: 'no-error' })
      recordEvent('ERROR_TEST_COMPLETE')
    } catch (error) {
      // If an error occurs, it should be handled gracefully
      recordEvent('ERROR_TEST_CAUGHT', { error: (error as Error).message })
    }

    // Step 8: Performance Timing Test
    console.log('⏱️ Testing performance...')
    
    const performanceStart = Date.now()
    const rapidMessages = Array.from({ length: 5 }, (_, i) => ({ rapid: i, timestamp: Date.now() }))
    
    for (const message of rapidMessages) {
      await handle.send(message)
    }
    
    const performanceEnd = Date.now()
    const totalTime = performanceEnd - performanceStart
    
    recordEvent('PERFORMANCE_TEST', { 
      messageCount: rapidMessages.length, 
      totalTime, 
      averagePerMessage: totalTime / rapidMessages.length 
    })

    // Should handle rapid messages efficiently
    expect(totalTime).toBeLessThan(1000) // Should complete within 1 second

    // Step 9: Graceful Shutdown
    console.log('🛑 Testing graceful shutdown...')
    
    const shutdownStart = Date.now()
    await handle.shutdown()
    const shutdownTime = Date.now() - shutdownStart
    
    recordEvent('SHUTDOWN_COMPLETE', { shutdownTime })

    // Step 10: Final Verification
    console.log('✅ Performing final verification...')
    
    // Check that shutdown hook was called
    const shutdownEvents = lifecycleEvents.filter(e => e.event === 'SHUTDOWN')
    expect(shutdownEvents).toHaveLength(1)
    expect(shutdownEvents[0].data.agentId).toBe('e2e-test-agent')

    // Verify no errors occurred during normal operation
    expect(errors).toHaveLength(0)

    // Verify all outputs were captured (original messages + rapid messages)
    const expectedOutputCount = testMessages.length + rapidMessages.length + 1 // +1 for error resilience test
    expect(outputs).toHaveLength(expectedOutputCount)

    // Verify lifecycle event sequence
    const eventTypes = lifecycleEvents.map(e => e.event)
    expect(eventTypes[0]).toBe('INIT')
    
    // Both SHUTDOWN_COMPLETE and SHUTDOWN should be present
    expect(eventTypes).toContain('SHUTDOWN_COMPLETE')
    expect(eventTypes).toContain('SHUTDOWN')

    // Performance verification
    const performanceEvents = lifecycleEvents.filter(e => e.event === 'PERFORMANCE_TEST')
    expect(performanceEvents).toHaveLength(1)
    expect(performanceEvents[0].data.messageCount).toBe(5)
    expect(performanceEvents[0].data.averagePerMessage).toBeLessThan(200) // Should be fast

    // Step 11: Post-Shutdown Verification
    try {
      await handle.send({ shouldFail: true })
      expect.fail('Should not be able to send messages after shutdown')
    } catch (error) {
      expect((error as Error).message).toContain('shutdown')
    }

    console.log('🎉 End-to-end test completed successfully!')
    console.log(`📈 Lifecycle events recorded: ${lifecycleEvents.length}`)
    console.log(`📤 Messages processed: ${outputs.length}`)
    console.log(`⚠️  Errors encountered: ${errors.length}`)
    
    // Final assertions
    expect(lifecycleEvents.length).toBeGreaterThan(10) // Should have many lifecycle events
    expect(outputs.length).toBe(expectedOutputCount)
    expect(errors.length).toBe(0)
  })

  it('should handle agent that throws during handle()', async () => {
    // Register an agent that will throw during handle
    class ThrowingAgent {
      id = 'throwing-agent'
      name = 'Throwing Agent'
      version = '1.0.0'
      
      async init(): Promise<void> {
        // Init succeeds
      }
      
      async handle(input: unknown): Promise<unknown> {
        throw new Error('Agent handle failed!')
      }
      
      async shutdown(): Promise<void> {
        // Shutdown succeeds
      }
    }

    AgentRegistry.register({
      id: 'throwing-agent',
      name: 'Throwing Agent',
      version: '1.0.0',
      factory: () => new ThrowingAgent()
    })

    AgentRegistry.registerTransport(new DummyTransport())

    let errorCaught = false
    let errorFromHook: Error | null = null

    const handle = await connectAgent({
      agent: 'throwing-agent',
      transport: 'dummy',
      onError: (error) => {
        errorFromHook = error
      }
    })

    try {
      await handle.send({ message: 'This will trigger an error' })
    } catch (error) {
      errorCaught = true
      expect((error as Error).message).toContain('Agent handle failed!')
    }

    expect(errorCaught).toBe(true)
    expect(errorFromHook).not.toBeNull()
    expect(errorFromHook?.message).toContain('Agent handle failed!')

    // Should still be able to shutdown cleanly
    await handle.shutdown()
  })

  it('should handle scope mismatch logging without failure', async () => {
    AgentRegistry.register({
      id: 'limited-scope-agent',
      name: 'Limited Scope Agent',
      version: '1.0.0',
      supportedScopes: ['read'], // Very limited
      factory: () => new DummyAgent()
    })

    AgentRegistry.registerTransport(new DummyTransport())

    // Request scopes beyond what's supported
    const handle = await connectAgent({
      agent: 'limited-scope-agent',
      transport: 'dummy',
      scope: ['read', 'write', 'admin', 'super-admin'], // Way more than supported
      debug: true // Enable debug logging to see scope mismatch warnings
    })

    expect(handle.metadata.registeredScopes).toEqual(['read'])
    expect(handle.metadata.requestedScopes).toEqual(['read', 'write', 'admin', 'super-admin'])

    // Should still work despite scope mismatch
    await handle.send({ message: 'Test with scope mismatch' })
    await handle.shutdown()
  })
})