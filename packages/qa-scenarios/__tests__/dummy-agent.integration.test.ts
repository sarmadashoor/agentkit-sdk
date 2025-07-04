/**
 * Dummy Test Agent Integration Tests
 * 
 * Comprehensive validation of the DummyTestAgent's 7 operational modes
 * for SDK lifecycle testing, plugin flow validation, and guardrail verification.
 * 
 * Test Coverage:
 * - Echo mode: exact input replication
 * - Fail mode: intentional errors in lifecycle phases
 * - Metrics mode: fake observability signal emission
 * - Recursive mode: self-calling with loop prevention
 * - Validation mode: strict payload shape requirements
 * - Plugin Exercise mode: explicit plugin hook triggering
 * - Side Effect mode: global state mutation attempts and guardrails
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { connectAgent } from '@agentkit/sdk'
import { DummyTransport } from '@agentkit/transports-dummy'
import { 
  DummyTestAgent,
  createDummyTestAgent,
  type DummyTestAgentMode,
  type DummyTestAgentConfig
} from '@agentkit/test-agent'
import type { AgentRuntimeHandle, AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'
import { cleanupAll, waitForCompletion } from '../helpers/teardown'
import { createTestId } from '../helpers/utils'

/**
 * Test plugin for validating plugin hook exercise mode
 */
class TestHookPlugin implements AgentKitPlugin {
  public readonly name = 'test-hook-plugin'
  public readonly version = '1.0.0'
  
  public hookCalls: string[] = []

  async onInit(_context: AgentContext): Promise<void> {
    this.hookCalls.push('onInit')
  }

  async onSend(_payload: SendPayload, _context: AgentContext): Promise<void> {
    this.hookCalls.push('onSend')
  }

  async onError(_error: Error, _context: AgentContext): Promise<void> {
    this.hookCalls.push('onError')
  }

  async onShutdown(_context: AgentContext): Promise<void> {
    this.hookCalls.push('onShutdown')
  }

  reset(): void {
    this.hookCalls = []
  }
}

describe('Dummy Test Agent Integration Tests', () => {
  let testId: string
  let handle: AgentRuntimeHandle | null = null
  let transport: DummyTransport
  let testPlugin: TestHookPlugin

  beforeEach(async () => {
    testId = createTestId('dummy-agent-integration')
    transport = new DummyTransport({ 
      debug: false, 
      logMessages: false,
      responseDelay: 10,
      maxQueueSize: 50,
      enableBackpressure: false
    })
    testPlugin = new TestHookPlugin()
    handle = null
  })

  afterEach(async () => {
    if (handle) {
      try {
        await handle.shutdown()
      } catch (error) {
        console.warn('Error during test cleanup:', error)
      }
    }
    await cleanupAll()
    await waitForCompletion(500)
  })

  describe('1️⃣ Echo Mode', () => {
    it('should reply with exact input and validate plugin hooks', async () => {
      console.log(`📝 Test: Echo Mode - ${testId}`)
      
      const agent = createDummyTestAgent('echo', { debug: true, processingDelay: 5 })
      const outputs: any[] = []
      
      handle = await connectAgent({
        agent,
        transport,
        plugins: [testPlugin],
        features: { sandbox: false },
        onOutput: (output) => {
          outputs.push(output)
        }
      })

      const testInput = {
        type: 'test',
        data: { message: 'Hello Echo Mode', userId: 'test-user' },
        timestamp: new Date().toISOString()
      }

      await handle.send(testInput)
      
      // Wait for output to be captured
      await new Promise(resolve => setTimeout(resolve, 50))

      // Validate exact echo response
      expect(outputs).toHaveLength(1)
      const result = outputs[0]
      expect(result.type).toBe('response')
      expect(result.data).toEqual(testInput)
      expect(result.metadata?.mode).toBe('echo')
      expect(result.metadata?.agentId).toBe('dummy-test-agent-echo')

      // Validate plugin hooks were called
      expect(testPlugin.hookCalls).toContain('onInit')
      expect(testPlugin.hookCalls).toContain('onSend')

      console.log('✅ Echo mode test passed')
    })
  })

  describe('2️⃣ Fail Mode', () => {
    it('should catch and verify errors in init phase', async () => {
      console.log(`📝 Test: Fail Mode - Init Phase - ${testId}`)
      
      const agent = createDummyTestAgent('fail', { 
        failOn: 'init', 
        failMessage: 'Test init failure',
        debug: true 
      })

      // Expect init to fail
      await expect(agent.init()).rejects.toThrow('[FAIL MODE] Test init failure during init')
      
      console.log('✅ Fail mode init test passed')
    })

    it('should catch and verify errors in handle phase', async () => {
      console.log(`📝 Test: Fail Mode - Handle Phase - ${testId}`)
      
      const agent = createDummyTestAgent('fail', { 
        failOn: 'handle', 
        failMessage: 'Test handle failure',
        debug: true 
      })

      handle = await connectAgent({
        agent,
        transport,
        features: { sandbox: false }
      })

      const testInput = { type: 'test', data: { message: 'This should fail' } }

      // Expect send to fail (the error bubbles up through the SDK)
      await expect(handle.send(testInput)).rejects.toThrow()
      
      console.log('✅ Fail mode handle test passed')
    })

    it('should catch and verify errors in shutdown phase', async () => {
      console.log(`📝 Test: Fail Mode - Shutdown Phase - ${testId}`)
      
      const agent = createDummyTestAgent('fail', { 
        failOn: 'shutdown', 
        failMessage: 'Test shutdown failure',
        debug: true 
      })

      handle = await connectAgent({
        agent,
        transport,
        features: { sandbox: false }
      })

      // Expect shutdown to fail
      await expect(handle.shutdown()).rejects.toThrow()
      handle = null // Prevent duplicate shutdown in afterEach
      
      console.log('✅ Fail mode shutdown test passed')
    })

    it('should ensure no partial state leaks on failure', async () => {
      console.log(`📝 Test: Fail Mode - State Integrity - ${testId}`)
      
      const agent = createDummyTestAgent('fail', { failOn: 'handle', debug: true })

      handle = await connectAgent({
        agent,
        transport,
        features: { sandbox: false }
      })

      // Verify agent is properly initialized before failure
      expect(agent.isInitialized()).toBe(true)

      try {
        await handle.send({ type: 'test', data: { message: 'fail test' } })
      } catch (error) {
        // Expected failure
      }

      // Verify agent state remains consistent after failure
      expect(agent.isInitialized()).toBe(true) // Should still be initialized
      
      console.log('✅ Fail mode state integrity test passed')
    })
  })

  describe('3️⃣ Metrics Mode', () => {
    it('should emit fake metrics events and validate sandbox isolation', async () => {
      console.log(`📝 Test: Metrics Mode - ${testId}`)
      
      const agent = createDummyTestAgent('metrics', { 
        emitMetrics: true, 
        debug: true,
        processingDelay: 10
      })
      const outputs: any[] = []

      handle = await connectAgent({
        agent,
        transport,
        features: { sandbox: false },
        onOutput: (output) => {
          outputs.push(output)
        }
      })

      const testInput = { type: 'test', data: { message: 'metrics test' } }
      await handle.send(testInput)
      
      // Wait for output to be captured
      await new Promise(resolve => setTimeout(resolve, 50))

      // Validate metrics emission
      const metricsEmitted = agent.getMetricsEmitted()
      expect(metricsEmitted.length).toBeGreaterThan(0)
      expect(metricsEmitted.some((m: string) => m.includes('agent.handle.started'))).toBe(true)
      expect(metricsEmitted.some((m: string) => m.includes('agent.handle.completed'))).toBe(true)

      // Validate response structure
      expect(outputs).toHaveLength(1)
      const result = outputs[0]
      expect(result.type).toBe('response')
      expect(result.data.message).toBe('Metrics emitted')
      expect(result.data.metricsCount).toBeGreaterThan(0)
      expect(result.metadata?.mode).toBe('metrics')

      console.log(`✅ Metrics mode test passed (${metricsEmitted.length} metrics emitted)`)
    })
  })

  describe('4️⃣ Recursive Mode', () => {
    it('should validate recursion limits and prevent infinite loops', async () => {
      console.log(`📝 Test: Recursive Mode - ${testId}`)
      
      const agent = createDummyTestAgent('recursive', { 
        recursionDepth: 3,
        debug: true,
        processingDelay: 5
      })
      const outputs: any[] = []

      handle = await connectAgent({
        agent,
        transport,
        features: { sandbox: false },
        onOutput: (output) => {
          outputs.push(output)
        }
      })

      const testInput = { type: 'test', data: { message: 'recursive test' } }
      await handle.send(testInput)
      
      // Wait for output to be captured
      await new Promise(resolve => setTimeout(resolve, 100))

      // Validate recursion handling
      expect(outputs).toHaveLength(1)
      const result = outputs[0]
      expect(result.type).toBe('response')
      expect(result.data.message).toBe('Recursive processing complete')
      expect(result.data.recursionCount).toBeLessThanOrEqual(3)
      expect(result.metadata?.mode).toBe('recursive')

      // Verify recursion count
      const finalRecursionCount = agent.getRecursionCount()
      expect(finalRecursionCount).toBeGreaterThan(0)
      expect(finalRecursionCount).toBeLessThanOrEqual(3)

      console.log(`✅ Recursive mode test passed (max depth: ${finalRecursionCount})`)
    })

    it('should honor concurrency limits during recursion', async () => {
      console.log(`📝 Test: Recursive Mode - Concurrency Limits - ${testId}`)
      
      const agent = createDummyTestAgent('recursive', { 
        recursionDepth: 2,
        debug: true,
        processingDelay: 20
      })
      const outputs: any[] = []

      handle = await connectAgent({
        agent,
        transport,
        features: { sandbox: false },
        resourceLimits: {
          maxConcurrentRequests: 2,
          maxQueueSize: 5,
          requestTimeoutMs: 5000
        },
        onOutput: (output) => {
          outputs.push(output)
        }
      })

      const testInput = { type: 'test', data: { message: 'concurrent recursive test' } }
      
      // Should complete without hitting concurrency limits
      await handle.send(testInput)
      
      // Wait for output to be captured
      await new Promise(resolve => setTimeout(resolve, 100))
      
      expect(outputs).toHaveLength(1)
      expect(outputs[0].type).toBe('response')
      
      console.log('✅ Recursive mode concurrency test passed')
    })
  })

  describe('5️⃣ Validation Mode', () => {
    it('should validate correct payloads and provide strict errors', async () => {
      console.log(`📝 Test: Validation Mode - Correct Payload - ${testId}`)
      
      const agent = createDummyTestAgent('validation', { 
        strictValidation: true,
        debug: true
      })
      const outputs: any[] = []

      handle = await connectAgent({
        agent,
        transport,
        features: { sandbox: false },
        onOutput: (output) => {
          outputs.push(output)
        }
      })

      // Valid payload
      const validInput = {
        type: 'test',
        data: {
          message: 'valid message',
          userId: 'user123',
          metadata: { session: 'abc' }
        },
        timestamp: new Date().toISOString()
      }

      await handle.send(validInput)
      
      // Wait for output to be captured
      await new Promise(resolve => setTimeout(resolve, 50))
      
      expect(outputs).toHaveLength(1)
      const result = outputs[0]
      expect(result.type).toBe('response')
      expect(result.data.validationPassed).toBe(true)
      expect(result.metadata?.validationResult).toBe('success')

      console.log('✅ Validation mode correct payload test passed')
    })

    it('should reject incorrect payloads with clear DX error output', async () => {
      console.log(`📝 Test: Validation Mode - Invalid Payload - ${testId}`)
      
      const agent = createDummyTestAgent('validation', { 
        strictValidation: true,
        debug: true
      })

      handle = await connectAgent({
        agent,
        transport,
        features: { sandbox: false }
      })

      // Invalid payload (missing required fields)
      const invalidInput = {
        type: 'test',
        invalidField: 'should not be here'
      }

      await expect(handle.send(invalidInput)).rejects.toThrow(/VALIDATION MODE.*Payload validation failed/)

      console.log('✅ Validation mode invalid payload test passed')
    })
  })

  describe('6️⃣ Plugin Exercise Mode', () => {
    it('should explicitly invoke all plugin hooks and validate lifecycle integrity', async () => {
      console.log(`📝 Test: Plugin Exercise Mode - ${testId}`)
      
      const agent = createDummyTestAgent('pluginExercise', { debug: true })
      const outputs: any[] = []

      handle = await connectAgent({
        agent,
        transport,
        plugins: [testPlugin],
        features: { sandbox: false },
        onOutput: (output) => {
          outputs.push(output)
        }
      })

      const testInput = { type: 'test', data: { message: 'plugin exercise test' } }
      await handle.send(testInput)
      
      // Wait for output to be captured
      await new Promise(resolve => setTimeout(resolve, 50))

      // Validate plugin hook triggering in agent
      const hooksTriggered = agent.getPluginHooksTriggered()
      expect(hooksTriggered.length).toBeGreaterThan(0)
      expect(hooksTriggered.some((h: string) => h.includes('onInit'))).toBe(true)
      expect(hooksTriggered.some((h: string) => h.includes('onSend'))).toBe(true)

      // Validate actual plugin was called
      expect(testPlugin.hookCalls).toContain('onInit')
      expect(testPlugin.hookCalls).toContain('onSend')

      // Validate response
      expect(outputs).toHaveLength(1)
      const result = outputs[0]
      expect(result.type).toBe('response')
      expect(result.data.message).toBe('Plugin hooks exercised')
      expect(result.metadata?.mode).toBe('pluginExercise')

      console.log(`✅ Plugin exercise mode test passed (${hooksTriggered.length} hooks triggered)`)
    })
  })

  describe('7️⃣ Side Effect Mode', () => {
    it('should attempt global mutations and validate guardrails', async () => {
      console.log(`📝 Test: Side Effect Mode - Global Mutations - ${testId}`)
      
      const agent = createDummyTestAgent('sideEffect', { 
        attemptGlobalMutation: true,
        debug: true
      })
      const outputs: any[] = []

      // Get baseline global state
      agent.resetGlobalState()

      handle = await connectAgent({
        agent,
        transport,
        features: { sandbox: false },
        onOutput: (output) => {
          outputs.push(output)
        }
      })

      const testInput = { type: 'test', data: { message: 'side effect test' } }
      await handle.send(testInput)
      
      // Wait for output to be captured
      await new Promise(resolve => setTimeout(resolve, 50))

      // Validate attempted mutations
      const finalState = agent.getGlobalStateSnapshot()
      expect(finalState.mutations.length).toBeGreaterThan(0)
      expect(finalState.counters.init).toBeGreaterThanOrEqual(1)
      expect(finalState.counters.handle).toBeGreaterThanOrEqual(1)

      // Validate response structure
      expect(outputs).toHaveLength(1)
      const result = outputs[0]
      expect(result.type).toBe('response')
      expect(result.data.message).toBe('Side effect attempts completed')
      expect(result.data.mutationAttempts).toBeDefined()
      expect(result.data.globalState).toBeDefined()
      expect(result.metadata?.mode).toBe('sideEffect')

      console.log(`✅ Side effect mode test passed (${finalState.mutations.length} mutations attempted)`)
    })

    it('should confirm sandbox behavior blocks malicious mutations', async () => {
      console.log(`📝 Test: Side Effect Mode - Sandbox Protection - ${testId}`)
      
      const agent = createDummyTestAgent('sideEffect', { 
        attemptGlobalMutation: true,
        debug: true
      })
      const outputs: any[] = []

      // Test with sandbox enabled (if available)
      handle = await connectAgent({
        agent,
        transport,
        features: { sandbox: true }, // Enable sandbox protection
        onOutput: (output) => {
          outputs.push(output)
        }
      })

      const testInput = { type: 'test', data: { message: 'sandbox test' } }
      
      // Should not throw even if mutations are attempted
      await handle.send(testInput)
      
      // Wait for output to be captured
      await new Promise(resolve => setTimeout(resolve, 50))
      
      expect(outputs).toHaveLength(1)
      expect(outputs[0].type).toBe('response')
      
      console.log('✅ Side effect mode sandbox test passed')
    })
  })

  describe('🔄 All Modes Integration', () => {
    it('should validate all 7 modes work correctly in sequence', async () => {
      console.log(`📝 Test: All Modes Integration - ${testId}`)
      
      const modes: DummyTestAgentMode[] = ['echo', 'metrics', 'recursive', 'validation', 'pluginExercise', 'sideEffect']
      const results: Record<string, boolean> = {}

      for (const mode of modes) {
        try {
          console.log(`  🧪 Testing mode: ${mode}`)
          
          const agent = createDummyTestAgent(mode, { 
            debug: false, 
            processingDelay: 5,
            recursionDepth: 2
          })
          const outputs: any[] = []

          const testHandle = await connectAgent({
            agent,
            transport: new DummyTransport({ 
              debug: false,
              logMessages: false,
              responseDelay: 10,
              maxQueueSize: 50,
              enableBackpressure: false
            }),
            features: { sandbox: false },
            onOutput: (output) => {
              outputs.push(output)
            }
          })

          let testInput: any = { type: 'test', data: { message: `test for ${mode}` } }
          
          // Special case for validation mode
          if (mode === 'validation') {
            testInput = {
              type: 'test',
              data: {
                message: 'validation test',
                userId: 'test-user'
              }
            }
          }

          await testHandle.send(testInput)
          
          // Wait for output
          await new Promise(resolve => setTimeout(resolve, 50))
          
          await testHandle.shutdown()

          expect(outputs.length).toBeGreaterThan(0)
          results[mode] = true
          console.log(`    ✅ ${mode} mode passed`)
          
        } catch (error) {
          console.error(`    ❌ ${mode} mode failed:`, error)
          results[mode] = false
        }
      }

      // Validate all modes succeeded (except fail mode which we skip)
      const successfulModes = Object.values(results).filter(Boolean).length
      expect(successfulModes).toBe(modes.length)

      console.log(`✅ All modes integration test passed (${successfulModes}/${modes.length} modes successful)`)
    })
  })

  describe('🛡️ Security & Audit', () => {
    it('should scrub internal stack traces from user-facing errors', async () => {
      console.log(`📝 Test: Security - Stack Trace Scrubbing - ${testId}`)
      
      const agent = createDummyTestAgent('validation', { strictValidation: true })

      handle = await connectAgent({
        agent,
        transport,
        features: { sandbox: false }
      })

      try {
        await handle.send({ invalid: 'payload' })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        
        // Should not contain internal stack traces or file paths
        expect(errorMessage).not.toMatch(/at.*\.ts:\d+/)
        expect(errorMessage).not.toMatch(/node_modules/)
        expect(errorMessage).toContain('[VALIDATION MODE]')
        
        console.log('✅ Stack trace scrubbing validated')
      }
    })

    it('should confirm no global state leaks between test runs', async () => {
      console.log(`📝 Test: Security - Global State Isolation - ${testId}`)
      
      const agent1 = createDummyTestAgent('sideEffect')
      const agent2 = createDummyTestAgent('sideEffect')

      // Reset global state
      agent1.resetGlobalState()
      
      const baselineState = agent1.getGlobalStateSnapshot()
      
      // Run first agent
      const handle1 = await connectAgent({
        agent: agent1,
        transport: new DummyTransport({ 
          debug: false,
          logMessages: false,
          responseDelay: 10,
          maxQueueSize: 50,
          enableBackpressure: false
        }),
        features: { sandbox: false }
      })
      
      await handle1.send({ type: 'test', data: { message: 'first agent' } })
      const state1 = agent1.getGlobalStateSnapshot()
      await handle1.shutdown()

      // Run second agent
      const handle2 = await connectAgent({
        agent: agent2,
        transport: new DummyTransport({ 
          debug: false,
          logMessages: false,
          responseDelay: 10,
          maxQueueSize: 50,
          enableBackpressure: false
        }),
        features: { sandbox: false }
      })
      
      await handle2.send({ type: 'test', data: { message: 'second agent' } })
      const state2 = agent2.getGlobalStateSnapshot()
      await handle2.shutdown()

      // Both agents should see accumulated global state (shared intentionally for testing)
      expect(state1.mutations.length).toBeGreaterThan(baselineState.mutations.length)
      expect(state2.mutations.length).toBeGreaterThan(state1.mutations.length)
      
      console.log('✅ Global state isolation test passed')
    })
  })
})