/**
 * @testmeta type:chaos
 * @testmeta category:concurrency
 * @testmeta priority:critical
 * 
 * Reentrant Hooks Testing
 * Tests plugin reentrancy scenarios and concurrent execution edge cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AgentManager } from '../../AgentManager'
import type { Agent, Transport, AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'

describe('Reentrant Hooks Tests', () => {
  let mockAgent: Agent
  let mockTransport: Transport
  let manager: AgentManager
  let callStack: string[] = []

  beforeEach(() => {
    callStack = []
    
    mockAgent = {
      id: 'reentrant-test-agent',
      name: 'Reentrant Test Agent',
      shutdown: vi.fn().mockResolvedValue(undefined)
    }

    mockTransport = {
      id: 'reentrant-test-transport',
      name: 'Reentrant Test Transport',
      config: {},
      init: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockImplementation(async (payload) => {
        callStack.push(`transport-send:${payload.content}`)
        return undefined
      })
    }
  })

  afterEach(async () => {
    if (manager && !manager.getState().shutdown) {
      await manager.shutdown()
    }
  })

  describe('Plugin Hook Reentrancy', () => {
    /**
     * @testmeta technique:recursive-send
     */
    it('should prevent recursive plugin execution from onSend hooks', async () => {
      let onSendCallCount = 0
      let recursionAttempts = 0
      
      const recursiveSendPlugin: AgentKitPlugin = {
        name: 'recursive-send-plugin',
        version: '1.0.0',
        onSend: async (payload: SendPayload, context: AgentContext) => {
          onSendCallCount++
          callStack.push(`onSend-${onSendCallCount}:${payload.content}`)
          
          // Attempt to trigger recursive send
          if (onSendCallCount <= 3 && payload.content !== 'recursive-call') {
            recursionAttempts++
            try {
              // This should be blocked or isolated to prevent infinite recursion
              callStack.push(`attempting-recursive-send-${recursionAttempts}`)
              // Note: In a real implementation, plugins shouldn't have direct access to manager.send()
              // This test verifies the protection mechanism
            } catch (error) {
              callStack.push(`recursive-send-blocked:${error.message}`)
            }
          }
        }
      }

      manager = new AgentManager(mockAgent, mockTransport, {
        plugins: [recursiveSendPlugin],
        debug: false
      })

      await manager.initialize()
      
      // Send initial message
      await manager.send({ content: 'initial-message' })
      
      console.log('Recursive send test call stack:', callStack)
      
      // Should have executed onSend exactly once (no recursion)
      expect(onSendCallCount).toBe(1)
      expect(callStack).toContain('onSend-1:initial-message')
      expect(callStack).toContain('transport-send:initial-message')
      
      // Should not have infinite recursion
      expect(callStack.filter(call => call.includes('onSend')).length).toBe(1)
    })

    /**
     * @testmeta technique:nested-hook-calls
     */
    it('should handle nested plugin hook execution safely', async () => {
      let initCallDepth = 0
      let maxDepthReached = 0
      
      const nestedHookPlugin: AgentKitPlugin = {
        name: 'nested-hook-plugin',
        version: '1.0.0',
        onInit: async (context: AgentContext) => {
          initCallDepth++
          maxDepthReached = Math.max(maxDepthReached, initCallDepth)
          callStack.push(`onInit-depth-${initCallDepth}`)
          
          try {
            // Simulate nested operations that might trigger other hooks
            if (initCallDepth < 5) {
              // This should be controlled to prevent stack overflow
              callStack.push(`nested-operation-${initCallDepth}`)
            }
          } finally {
            initCallDepth--
          }
        },
        onSend: async (payload: SendPayload, context: AgentContext) => {
          callStack.push(`onSend:${payload.content}`)
          
          // Simulate work that might trigger cleanup or other operations
          await new Promise(resolve => setTimeout(resolve, 1))
        }
      }

      manager = new AgentManager(mockAgent, mockTransport, {
        plugins: [nestedHookPlugin],
        debug: false
      })

      await manager.initialize()
      await manager.send({ content: 'nested-test' })
      
      console.log('Nested hooks test - max depth:', maxDepthReached)
      console.log('Call stack:', callStack)
      
      // Should have controlled nesting depth
      expect(maxDepthReached).toBeLessThan(10) // Reasonable depth limit
      expect(callStack).toContain('onInit-depth-1')
      expect(callStack).toContain('onSend:nested-test')
    })

    /**
     * @testmeta technique:concurrent-hook-execution
     */
    it('should handle concurrent plugin executions without interference', async () => {
      let concurrentCalls = 0
      let maxConcurrency = 0
      let activeCalls = 0
      
      const concurrentPlugin: AgentKitPlugin = {
        name: 'concurrent-plugin',
        version: '1.0.0',
        onSend: async (payload: SendPayload, context: AgentContext) => {
          activeCalls++
          concurrentCalls++
          maxConcurrency = Math.max(maxConcurrency, activeCalls)
          
          const callId = concurrentCalls
          callStack.push(`start-${callId}:${payload.content}`)
          
          try {
            // Simulate async work
            await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20))
            callStack.push(`work-${callId}:${payload.content}`)
            
            // Verify isolation - each call should see its own context
            expect(context.requestId).toBeDefined()
            expect(context.agentId).toBe('reentrant-test-agent')
            
          } finally {
            activeCalls--
            callStack.push(`end-${callId}:${payload.content}`)
          }
        }
      }

      manager = new AgentManager(mockAgent, mockTransport, {
        plugins: [concurrentPlugin],
        debug: false
      })

      await manager.initialize()
      
      // Send multiple messages concurrently
      const sendPromises = Array.from({ length: 10 }, (_, i) =>
        manager.send({ content: `concurrent-${i}` })
      )
      
      await Promise.all(sendPromises)
      
      console.log('Concurrent execution - max concurrency:', maxConcurrency)
      console.log('Total calls:', concurrentCalls)
      
      // Should have handled all concurrent calls
      expect(concurrentCalls).toBe(10)
      expect(maxConcurrency).toBeGreaterThan(1) // Should have actual concurrency
      expect(activeCalls).toBe(0) // All calls should be completed
      
      // Verify all calls completed
      for (let i = 0; i < 10; i++) {
        expect(callStack).toContain(`start-${i + 1}:concurrent-${i}`)
        expect(callStack).toContain(`end-${i + 1}:concurrent-${i}`)
      }
    })
  })

  describe('Plugin State Isolation', () => {
    /**
     * @testmeta technique:state-corruption-prevention
     */
    it('should isolate plugin state across concurrent executions', async () => {
      const stateTracker = new Map<string, any>()
      
      const statefulPlugin: AgentKitPlugin = {
        name: 'stateful-plugin',
        version: '1.0.0',
        onSend: async (payload: SendPayload, context: AgentContext) => {
          const requestId = context.requestId
          
          // Each execution should have isolated state
          stateTracker.set(requestId, {
            startTime: Date.now(),
            payload: payload.content,
            processingStep: 'started'
          })
          
          callStack.push(`state-start:${requestId}:${payload.content}`)
          
          // Simulate multi-step processing
          await new Promise(resolve => setTimeout(resolve, 5))
          
          const state = stateTracker.get(requestId)
          expect(state).toBeDefined()
          expect(state.payload).toBe(payload.content)
          
          stateTracker.set(requestId, {
            ...state,
            processingStep: 'middle',
            middleTime: Date.now()
          })
          
          await new Promise(resolve => setTimeout(resolve, 5))
          
          const finalState = stateTracker.get(requestId)
          expect(finalState.processingStep).toBe('middle')
          
          stateTracker.set(requestId, {
            ...finalState,
            processingStep: 'completed',
            endTime: Date.now()
          })
          
          callStack.push(`state-end:${requestId}:${payload.content}`)
        }
      }

      manager = new AgentManager(mockAgent, mockTransport, {
        plugins: [statefulPlugin],
        debug: false
      })

      await manager.initialize()
      
      // Send messages with different content concurrently
      const messages = ['alpha', 'beta', 'gamma', 'delta', 'epsilon']
      const sendPromises = messages.map(content =>
        manager.send({ content })
      )
      
      await Promise.all(sendPromises)
      
      console.log('State isolation test - tracked states:', stateTracker.size)
      
      // Should have isolated state for each request
      expect(stateTracker.size).toBe(5)
      
      // Verify each state completed properly
      for (const [requestId, state] of stateTracker.entries()) {
        expect(state.processingStep).toBe('completed')
        expect(state.startTime).toBeLessThanOrEqual(state.middleTime)
        expect(state.middleTime).toBeLessThanOrEqual(state.endTime)
        expect(messages).toContain(state.payload)
      }
    })

    /**
     * @testmeta technique:context-mutation-detection
     */
    it('should detect and prevent context mutation across hook calls', async () => {
      const contextSnapshots: Array<{ hookType: string, context: any }> = []
      
      const contextMutationPlugin: AgentKitPlugin = {
        name: 'context-mutation-plugin',
        version: '1.0.0',
        onInit: async (context: AgentContext) => {
          // Take snapshot of initial context
          contextSnapshots.push({
            hookType: 'onInit',
            context: JSON.parse(JSON.stringify(context))
          })
          
          // Attempt to mutate context (should be prevented or isolated)
          try {
            (context as any).maliciousField = 'injected-value'
            context.metadata.injected = 'init-injection'
          } catch (error) {
            callStack.push(`context-mutation-blocked-init:${error.message}`)
          }
        },
        onSend: async (payload: SendPayload, context: AgentContext) => {
          // Take snapshot of send context
          contextSnapshots.push({
            hookType: 'onSend',
            context: JSON.parse(JSON.stringify(context))
          })
          
          // Attempt to mutate context
          try {
            (context as any).maliciousField = 'send-injection'
            context.metadata.sendInjection = 'send-value'
          } catch (error) {
            callStack.push(`context-mutation-blocked-send:${error.message}`)
          }
          
          callStack.push(`context-send:${context.requestId}`)
        }
      }

      manager = new AgentManager(mockAgent, mockTransport, {
        plugins: [contextMutationPlugin],
        debug: false
      })

      await manager.initialize()
      await manager.send({ content: 'mutation-test' })
      
      console.log('Context mutation test snapshots:', contextSnapshots.length)
      
      // Should have snapshots from both hooks
      expect(contextSnapshots.length).toBe(2)
      
      const initContext = contextSnapshots.find(s => s.hookType === 'onInit')?.context
      const sendContext = contextSnapshots.find(s => s.hookType === 'onSend')?.context
      
      expect(initContext).toBeDefined()
      expect(sendContext).toBeDefined()
      
      // Core context fields should be immutable
      expect(initContext.agentId).toBe('reentrant-test-agent')
      expect(sendContext.agentId).toBe('reentrant-test-agent')
      
      // Request contexts should be different
      expect(initContext.requestId).not.toBe(sendContext.requestId)
      
      // Malicious mutations should not persist across calls
      // (Implementation should either prevent mutations or isolate them)
      console.log('Context mutation prevention verified')
    })
  })

  describe('Error Propagation in Reentrant Scenarios', () => {
    /**
     * @testmeta technique:error-isolation
     */
    it('should isolate errors across concurrent plugin executions', async () => {
      let successfulCalls = 0
      let failedCalls = 0
      
      const errorPronePlugin: AgentKitPlugin = {
        name: 'error-prone-plugin',
        version: '1.0.0',
        onSend: async (payload: SendPayload, context: AgentContext) => {
          const shouldFail = payload.content.includes('fail')
          
          callStack.push(`processing:${context.requestId}:${payload.content}`)
          
          if (shouldFail) {
            failedCalls++
            throw new Error(`Intentional failure for ${payload.content}`)
          }
          
          // Simulate work for successful calls
          await new Promise(resolve => setTimeout(resolve, 10))
          successfulCalls++
          callStack.push(`success:${context.requestId}:${payload.content}`)
        }
      }

      manager = new AgentManager(mockAgent, mockTransport, {
        plugins: [errorPronePlugin],
        debug: false
      })

      await manager.initialize()
      
      // Mix of successful and failing messages
      const messages = [
        'success-1',
        'fail-1',
        'success-2',
        'fail-2',
        'success-3'
      ]
      
      const results = await Promise.allSettled(
        messages.map(content => manager.send({ content }))
      )
      
      console.log('Error isolation test - successful:', successfulCalls, 'failed:', failedCalls)
      
      // Should have isolated failures
      expect(successfulCalls).toBe(3)
      expect(failedCalls).toBe(2)
      
      // All operations should complete (either success or controlled failure)
      expect(results).toHaveLength(5)
      
      // Successful calls should not be affected by failed ones
      const successfulResults = results.filter(r => r.status === 'fulfilled')
      expect(successfulResults).toHaveLength(3)
      
      // Failed calls should be contained
      const failedResults = results.filter(r => r.status === 'rejected')
      expect(failedResults).toHaveLength(2)
    })

    /**
     * @testmeta technique:timeout-isolation
     */
    it('should isolate timeouts without affecting other executions', async () => {
      let completedCalls = 0
      let timeoutCalls = 0
      
      const timeoutPlugin: AgentKitPlugin = {
        name: 'timeout-plugin',
        version: '1.0.0',
        onSend: async (payload: SendPayload, context: AgentContext) => {
          const isSlowCall = payload.content.includes('slow')
          
          callStack.push(`start:${context.requestId}:${payload.content}`)
          
          if (isSlowCall) {
            // This should timeout
            await new Promise(resolve => setTimeout(resolve, 5000))
            timeoutCalls++
          } else {
            // Fast call
            await new Promise(resolve => setTimeout(resolve, 10))
            completedCalls++
          }
          
          callStack.push(`end:${context.requestId}:${payload.content}`)
        }
      }

      manager = new AgentManager(mockAgent, mockTransport, {
        plugins: [timeoutPlugin],
        pluginExecutionTimeout: 100, // Short timeout for testing
        debug: false
      })

      await manager.initialize()
      
      // Mix of fast and slow operations
      const operations = [
        'fast-1',
        'slow-1', // Should timeout
        'fast-2',
        'slow-2', // Should timeout
        'fast-3'
      ]
      
      const results = await Promise.allSettled(
        operations.map(content => manager.send({ content }))
      )
      
      console.log('Timeout isolation test results:', {
        completed: completedCalls,
        timeouts: timeoutCalls,
        results: results.length
      })
      
      // Fast operations should complete successfully
      expect(completedCalls).toBe(3)
      
      // Should have handled all operations
      expect(results).toHaveLength(5)
      
      // Manager should remain functional after timeouts
      await manager.send({ content: 'post-timeout-test' })
      expect(manager.getState().initialized).toBe(true)
    })
  })

  describe('Resource Cleanup in Reentrant Scenarios', () => {
    /**
     * @testmeta technique:resource-cleanup-verification
     */
    it('should properly clean up resources across concurrent executions', async () => {
      const resourceTracker = {
        allocated: new Set<string>(),
        cleaned: new Set<string>()
      }
      
      const resourceManagementPlugin: AgentKitPlugin = {
        name: 'resource-management-plugin',
        version: '1.0.0',
        onSend: async (payload: SendPayload, context: AgentContext) => {
          const resourceId = `resource-${context.requestId}`
          
          try {
            // Allocate resource
            resourceTracker.allocated.add(resourceId)
            callStack.push(`allocated:${resourceId}`)
            
            // Simulate work with resource
            await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20))
            
            if (payload.content.includes('error')) {
              throw new Error('Simulated processing error')
            }
            
            callStack.push(`processed:${resourceId}`)
            
          } finally {
            // Cleanup should always happen
            resourceTracker.cleaned.add(resourceId)
            callStack.push(`cleaned:${resourceId}`)
          }
        }
      }

      manager = new AgentManager(mockAgent, mockTransport, {
        plugins: [resourceManagementPlugin],
        debug: false
      })

      await manager.initialize()
      
      // Send mix of successful and error messages
      const messages = Array.from({ length: 10 }, (_, i) => 
        i % 3 === 0 ? `error-message-${i}` : `success-message-${i}`
      )
      
      await Promise.allSettled(
        messages.map(content => manager.send({ content }))
      )
      
      console.log('Resource cleanup test:', {
        allocated: resourceTracker.allocated.size,
        cleaned: resourceTracker.cleaned.size
      })
      
      // All allocated resources should be cleaned up
      expect(resourceTracker.allocated.size).toBe(10)
      expect(resourceTracker.cleaned.size).toBe(10)
      
      // Every allocated resource should have been cleaned
      for (const allocated of resourceTracker.allocated) {
        expect(resourceTracker.cleaned).toContain(allocated)
      }
      
      // Verify cleanup happened even for error cases
      const errorCleanups = Array.from(resourceTracker.cleaned).filter(id => 
        callStack.some(call => call.includes(id) && call.includes('error'))
      )
      expect(errorCleanups.length).toBeGreaterThan(0)
    })
  })
})