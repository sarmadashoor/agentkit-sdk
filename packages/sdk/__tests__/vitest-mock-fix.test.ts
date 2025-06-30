/**
 * Test for vitest mock function handling in sandbox execution
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { AgentManager } from '../src/AgentManager'
import type { Agent, Transport, AgentKitPlugin } from '@agentkit/types'
import { registerAgent, registerManager, registerTransport, cleanupAllResources, flushPromises } from './test-utils'

// Mock implementations
const createMockAgent = (): Agent => ({
  id: 'test-agent',
  name: 'Test Agent',
  init: vi.fn().mockResolvedValue(undefined),
  handle: vi.fn().mockResolvedValue({ data: 'mock response' }),
  shutdown: vi.fn().mockResolvedValue(undefined)
})

const createMockTransport = (): Transport => ({
  id: 'test-transport',
  name: 'Test Transport',
  config: {},
  init: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined),
  receive: vi.fn().mockResolvedValue({ content: null, metadata: {} }),
  canAcceptMore: vi.fn().mockReturnValue(true)
})

describe('Vitest Mock Function Handling', () => {
  let agent: Agent
  let transport: Transport

  beforeEach(() => {
    agent = registerAgent(createMockAgent())
    transport = registerTransport(createMockTransport())
  })

  afterEach(async () => {
    // Clean up all registered resources
    await cleanupAllResources()
    await flushPromises()
  })

  it('should handle vitest mocked functions in sandbox execution', async () => {
    const mockedPlugin: AgentKitPlugin = {
      name: 'MockedPlugin',
      version: '1.0.0',
      onInit: vi.fn().mockResolvedValue(undefined),
      onSend: vi.fn().mockImplementation(async (payload, context) => {
        // Simple computation that doesn't require setTimeout
        const result = Math.max(1, 2, 3)
        return { processed: true, result }
      }),
      onShutdown: vi.fn().mockResolvedValue(undefined)
    }

    const agentManager = registerManager(new AgentManager(agent, transport, {
      plugins: [mockedPlugin],
      observabilityConfig: {
        enableTimelineDebug: true,
        enableMetricsCollection: true,
        enableConsoleWarnings: false
      },
      debug: false
    }, [], 'vitest-mock-test'))

    await agentManager.initialize()
    await agentManager.send({ content: 'test message' })

    const timeline = agentManager.getDebugTimeline()
    const metrics = agentManager.getMetrics()

    console.log('Timeline entries:', timeline?.entries?.length || 0)
    console.log('Timeline status:', timeline?.entries?.map(e => e.status))

    // Plugin should execute successfully despite being a vitest mock
    expect(timeline).toBeDefined()
    expect(timeline!.entries.length).toBeGreaterThan(0)
    
    const pluginEntries = timeline!.entries.filter(e => e.pluginName === 'MockedPlugin')
    expect(pluginEntries.length).toBeGreaterThan(0)
    
    // Check if plugin execution was successful
    const sendEntry = pluginEntries.find(e => e.hookName === 'onSend')
    expect(sendEntry).toBeDefined()
    expect(sendEntry!.status).toBe('success') // Should be success now that vitest mocks are handled
    expect(sendEntry!.error).toBeUndefined()

    // Verify metrics
    const sendMetric = metrics!.plugins.find(p => p.pluginName === 'MockedPlugin' && p.hookName === 'onSend')
    expect(sendMetric!.executionCount).toBe(1)
    expect(sendMetric!.errorCount).toBe(0)
  }, 10000)

  it('should handle vitest mocked functions with arrow function syntax', async () => {
    const arrowFunctionPlugin: AgentKitPlugin = {
      name: 'ArrowFunctionPlugin',
      version: '1.0.0',
      onSend: vi.fn().mockImplementation((payload, context) => {
        // Arrow function expression that returns a simple value
        return { result: 'arrow function success' }
      })
    }

    const agentManager = registerManager(new AgentManager(agent, transport, {
      plugins: [arrowFunctionPlugin],
      observabilityConfig: {
        enableTimelineDebug: true
      },
      debug: false
    }, [], 'arrow-function-test'))

    await agentManager.initialize()
    await agentManager.send({ content: 'test message' })

    const timeline = agentManager.getDebugTimeline()
    
    const sendEntry = timeline!.entries.find(e => e.pluginName === 'ArrowFunctionPlugin' && e.hookName === 'onSend')
    expect(sendEntry).toBeDefined()
    expect(sendEntry!.status).toBe('success')
    expect(sendEntry!.error).toBeUndefined()
  }, 10000)

  it('should handle complex vitest mock implementations', async () => {
    const complexMockPlugin: AgentKitPlugin = {
      name: 'ComplexMockPlugin',
      version: '1.0.0',
      onSend: vi.fn().mockImplementation(async (payload, context) => {
        // Complex async function with multiple operations
        const data = JSON.stringify(payload)
        const parsed = JSON.parse(data)
        const result = Object.keys(parsed).length
        
        // Return async result
        return { 
          processed: true, 
          keyCount: result,
          timestamp: Date.now()
        }
      })
    }

    const agentManager = registerManager(new AgentManager(agent, transport, {
      plugins: [complexMockPlugin],
      observabilityConfig: {
        enableTimelineDebug: true
      },
      debug: false
    }, [], 'complex-mock-test'))

    await agentManager.initialize()
    await agentManager.send({ content: 'test message', metadata: { test: true } })

    const timeline = agentManager.getDebugTimeline()
    
    const sendEntry = timeline!.entries.find(e => e.pluginName === 'ComplexMockPlugin' && e.hookName === 'onSend')
    expect(sendEntry).toBeDefined()
    expect(sendEntry!.status).toBe('success')
    expect(sendEntry!.error).toBeUndefined()
    expect(sendEntry!.duration).toBeGreaterThanOrEqual(0)
  }, 10000)

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})