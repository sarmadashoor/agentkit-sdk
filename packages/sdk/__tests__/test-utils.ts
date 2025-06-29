/**
 * Test utilities for proper cleanup and isolation of test resources
 * Prevents cross-test leakage by tracking and cleaning up agents, managers, and other resources
 */

import type { Agent, Transport } from '@agentkit/types'
import type { AgentManager } from '../src/AgentManager'
import type { PluginManager } from '../src/plugins/PluginManager'

// Track all created resources for cleanup
const agents: Agent[] = []
const managers: AgentManager[] = []
const pluginManagers: PluginManager[] = []
const transports: Transport[] = []
const cleanupCallbacks: Array<() => Promise<void>> = []

/**
 * Register an agent for automatic cleanup
 */
export function registerAgent(agent: Agent): Agent {
  agents.push(agent)
  return agent
}

/**
 * Register an AgentManager for automatic cleanup
 */
export function registerManager(manager: AgentManager): AgentManager {
  managers.push(manager)
  return manager
}

/**
 * Register a transport for automatic cleanup
 */
export function registerTransport(transport: Transport): Transport {
  transports.push(transport)
  return transport
}

/**
 * Register a PluginManager for automatic cleanup
 */
export function registerPluginManager(pluginManager: PluginManager): PluginManager {
  pluginManagers.push(pluginManager)
  return pluginManager
}

/**
 * Register a custom cleanup callback
 */
export function registerCleanup(callback: () => Promise<void>): void {
  cleanupCallbacks.push(callback)
}

/**
 * Clean up all transport instances to prevent handle leaks
 */
export async function cleanupTransports(): Promise<void> {
  // Track all transport instances that have been created
  for (const transport of transports) {
    try {
      if (transport.dispose) {
        await transport.dispose()
      } else if (transport.shutdown) {
        await transport.shutdown()
      }
    } catch (error) {
      console.error('Error disposing transport:', error)
    }
  }
  transports.length = 0
}

/**
 * Clean up all plugin managers to prevent handle leaks
 */
export async function cleanupPluginManagers(): Promise<void> {
  for (const pluginManager of pluginManagers) {
    try {
      pluginManager.shutdown()
    } catch (error) {
      console.error('Error shutting down PluginManager:', error)
    }
  }
  pluginManagers.length = 0
}

/**
 * Enhanced cleanup function that handles all resources
 */
export async function cleanupAllResources(): Promise<void> {
  // Clean up plugin managers first (they may have workers)
  await cleanupPluginManagers()
  
  // Clean up agents 
  await cleanupAgents()
  
  // Clean up transports
  await cleanupTransports()
  
  // Remove manual GC calls for Node 22+ compatibility
  // Let Node.js handle garbage collection naturally
  // if (global.gc) {
  //   global.gc()
  // }
  
  // Flush all pending promises and microtasks multiple times
  await flushPromises()
  await flushPromises()
  await flushPromises()
  
  // Wait for cleanup to complete with longer timeout to ensure all async operations settle
  await new Promise(resolve => setTimeout(resolve, 50).unref())
  
  // Final promise flush
  await flushPromises()
}

/**
 * Clean up all registered agents
 */
export async function cleanupAgents(): Promise<void> {
  // First, shut down all plugin managers (they may have workers)
  await cleanupPluginManagers()

  // Then, shut down all managers (they manage agents internally)
  for (const manager of managers) {
    try {
      await manager.shutdown()
    } catch (error) {
      console.error('Error shutting down AgentManager:', error)
    }
  }
  managers.length = 0

  // Then shut down standalone agents
  for (const agent of agents) {
    try {
      if (agent.shutdown) {
        await agent.shutdown()
      }
    } catch (error) {
      console.error('Error shutting down agent:', error)
    }
  }
  agents.length = 0

  // Clean up transports
  await cleanupTransports()

  // Run custom cleanup callbacks
  for (const callback of cleanupCallbacks) {
    try {
      await callback()
    } catch (error) {
      console.error('Error running cleanup callback:', error)
    }
  }
  cleanupCallbacks.length = 0
}

/**
 * Create a test-scoped timeout to prevent hanging tests
 */
export function createTestTimeout(ms: number = 30000): { clear: () => void } {
  const timeout = setTimeout(() => {
    console.error(`Test timeout after ${ms}ms - possible resource leak`)
    // Remove forced exit for Node 22+ compatibility - let Vitest handle timeouts
    // process.exit(1)
  }, ms).unref() // CRITICAL: .unref() so it doesn't keep process alive

  return {
    clear: () => clearTimeout(timeout)
  }
}

/**
 * Utility to wait for a condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const start = Date.now()
  
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, interval).unref())
  }
  
  throw new Error(`Timeout waiting for condition after ${timeout}ms`)
}

/**
 * Ensure all async operations are flushed
 */
export async function flushPromises(): Promise<void> {
  await new Promise(resolve => {
    if (typeof setImmediate !== 'undefined') {
      setImmediate(resolve)
    } else {
      setTimeout(resolve, 0).unref()
    }
  })
}

/**
 * Create isolated test environment
 */
export function isolatedTest(name: string, fn: () => Promise<void> | void) {
  return async () => {
    const testTimeout = createTestTimeout()
    try {
      await fn()
      await flushPromises()
    } finally {
      testTimeout.clear()
      await cleanupAgents()
    }
  }
}