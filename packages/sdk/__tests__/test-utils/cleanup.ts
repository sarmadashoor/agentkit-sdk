import { WorkerPool } from '../../src/plugins/worker-utils';
import { CircuitBreaker } from '../../src/circuitBreaker';
import { BoundedExecutor } from '../../src/boundedExecutor';
import { AgentManager } from '../../src/AgentManager';

// Global registries for tracking active resources
const activeWorkerPools = new Set<WorkerPool>();
const activeCircuitBreakers = new Set<CircuitBreaker>();
const activeBoundedExecutors = new Set<BoundedExecutor>();
const activeAgentManagers = new Set<AgentManager>();

// Cleanup function registry
const cleanupFns: (() => Promise<void>)[] = [];

// Agent and transport registries (for test compatibility)
declare global {
  // eslint-disable-next-line no-var
  var agentRegistry: Map<string, any>;
  // eslint-disable-next-line no-var
  var transportRegistry: Map<string, any>;
  // eslint-disable-next-line no-var
  var activeTransports: Set<any>;
}

// Resource registration functions
export function registerWorkerPool(pool: WorkerPool): WorkerPool {
  activeWorkerPools.add(pool);
  return pool;
}

export function unregisterWorkerPool(pool: WorkerPool): void {
  activeWorkerPools.delete(pool);
}

export function registerCircuitBreaker(breaker: CircuitBreaker): CircuitBreaker {
  activeCircuitBreakers.add(breaker);
  return breaker;
}

export function unregisterCircuitBreaker(breaker: CircuitBreaker): void {
  activeCircuitBreakers.delete(breaker);
}

export function registerBoundedExecutor(executor: BoundedExecutor): BoundedExecutor {
  activeBoundedExecutors.add(executor);
  return executor;
}

export function unregisterBoundedExecutor(executor: BoundedExecutor): void {
  activeBoundedExecutors.delete(executor);
}

export function registerAgentManager(manager: AgentManager): AgentManager {
  activeAgentManagers.add(manager);
  return manager;
}

export function unregisterAgentManager(manager: AgentManager): void {
  activeAgentManagers.delete(manager);
}

// Main cleanup function
export async function cleanupAllResources(): Promise<void> {
  console.log('[CLEANUP] Running all resource cleanups...');
  
  const cleanupPromises: Promise<void>[] = [];

  // Run registered cleanup functions first
  cleanupPromises.push(runRegisteredCleanups());

  // Clean up agents and transports
  cleanupPromises.push(cleanupAgents());
  cleanupPromises.push(cleanupTransports());

  // Shut down all active worker pools
  for (const pool of activeWorkerPools) {
    cleanupPromises.push(
      (async () => {
        try {
          // Check available shutdown methods and use the best one (now async)
          if (typeof pool.shutdown === 'function') {
            await pool.shutdown();
            console.log('[CLEANUP] Worker pool shutdown successfully');
          } else if (typeof pool.terminate === 'function') {
            await pool.terminate();
            console.log('[CLEANUP] Worker pool terminated successfully');
          } else if (typeof pool.destroy === 'function') {
            await pool.destroy();
            console.log('[CLEANUP] Worker pool destroyed successfully');
          } else if (typeof pool.close === 'function') {
            await pool.close();
            console.log('[CLEANUP] Worker pool closed successfully');
          } else {
            console.log('[CLEANUP] Worker pool has no cleanup method - skipping');
          }
        } catch (error) {
          // More specific error handling for different worker pool types
          if (error.message?.includes('terminate is not a function')) {
            console.log('[CLEANUP] Worker pool terminate method not available - skipping');
          } else {
            console.warn('[CLEANUP] Failed to cleanup worker pool:', error.message);
          }
        }
      })()
    );
  }

  // Shut down all agent managers (handles transports internally)
  for (const manager of activeAgentManagers) {
    cleanupPromises.push(
      (async () => {
        try {
          // Check if manager is initialized before attempting shutdown
          const hasState = typeof manager.getState === 'function';
          const state = hasState ? manager.getState() : 'unknown';
          
          // Skip shutdown for uninitialized managers
          if (state === 'idle' || state === 'uninitialized') {
            console.log(`[CLEANUP] Skipping shutdown of ${state} AgentManager`);
            return;
          }
          
          if (typeof manager.shutdown === 'function') {
            await manager.shutdown();
          } else if (typeof manager.stop === 'function') {
            await manager.stop();
          } else if (typeof manager.destroy === 'function') {
            await manager.destroy();
          }
        } catch (error) {
          // Only log if it's not an "uninitialized" or "not initialized" error
          if (!error.message?.includes('not initialized') && 
              !error.message?.includes('uninitialized') &&
              !error.code?.includes('AGENT_SHUTDOWN_FAILED')) {
            console.warn('[CLEANUP] Failed to shutdown agent manager:', error);
          } else {
            console.log(`[CLEANUP] Skipped uninitialized AgentManager: ${error.message}`);
          }
        }
      })()
    );
  }

  // Shut down all bounded executors
  for (const executor of activeBoundedExecutors) {
    cleanupPromises.push(
      (async () => {
        try {
          if (typeof executor.shutdown === 'function') {
            await executor.shutdown();
          } else if (typeof executor.stop === 'function') {
            await executor.stop();
          } else if (typeof executor.destroy === 'function') {
            await executor.destroy();
          }
        } catch (error) {
          console.warn('[CLEANUP] Failed to shutdown bounded executor:', error);
        }
      })()
    );
  }

  // Reset circuit breaker states
  for (const breaker of activeCircuitBreakers) {
    cleanupPromises.push(
      (async () => {
        try {
          if (typeof breaker.shutdown === 'function') {
            await breaker.shutdown();
          } else if (typeof breaker.reset === 'function') {
            breaker.reset();
          }
        } catch (error) {
          console.warn('[CLEANUP] Failed to reset circuit breaker:', error);
        }
      })()
    );
  }

  // Wait for all cleanup operations to complete
  await Promise.allSettled(cleanupPromises);

  // Clear all registries
  activeWorkerPools.clear();
  activeCircuitBreakers.clear();
  activeBoundedExecutors.clear();
  activeAgentManagers.clear();

  // Force garbage collection if available (Node.js specific)
  if (global.gc && typeof global.gc === 'function') {
    try {
      global.gc();
    } catch (error) {
      // Ignore GC errors
    }
  }

  // Small delay to allow resources to fully clean up
  await new Promise(resolve => setTimeout(resolve, 10));
  
  console.log('[CLEANUP] All resources cleaned up ✅');
}

// Convenience function for cleaning up specific resource types
export async function cleanupWorkerPools(): Promise<void> {
  const promises = Array.from(activeWorkerPools).map(async (pool) => {
    try {
      if (typeof pool.terminate === 'function') {
        await pool.terminate();
      } else if (typeof pool.shutdown === 'function') {
        await pool.shutdown();
      } else if (typeof pool.destroy === 'function') {
        await pool.destroy();
      } else if (typeof pool.close === 'function') {
        await pool.close();
      } else {
        console.log('[CLEANUP] Worker pool has no cleanup method available');
      }
    } catch (error) {
      if (!error.message?.includes('terminate is not a function')) {
        console.warn('[CLEANUP] Failed to cleanup worker pool:', error.message);
      }
    }
  });
  await Promise.allSettled(promises);
  activeWorkerPools.clear();
}

export async function cleanupCircuitBreakers(): Promise<void> {
  const promises = Array.from(activeCircuitBreakers).map(async (breaker) => {
    try {
      if (typeof breaker.shutdown === 'function') {
        await breaker.shutdown();
      } else if (typeof breaker.reset === 'function') {
        breaker.reset();
      }
    } catch (error) {
      console.warn('[CLEANUP] Failed to reset circuit breaker:', error);
    }
  });
  await Promise.allSettled(promises);
  activeCircuitBreakers.clear();
}

export async function cleanupBoundedExecutors(): Promise<void> {
  const promises = Array.from(activeBoundedExecutors).map(async (executor) => {
    try {
      if (typeof executor.shutdown === 'function') {
        await executor.shutdown();
      } else if (typeof executor.stop === 'function') {
        await executor.stop();
      }
    } catch (error) {
      console.warn('[CLEANUP] Failed to shutdown bounded executor:', error);
    }
  });
  await Promise.allSettled(promises);
  activeBoundedExecutors.clear();
}

export async function cleanupAgentManagers(): Promise<void> {
  const promises = Array.from(activeAgentManagers).map(async (manager) => {
    try {
      if (typeof manager.shutdown === 'function') {
        await manager.shutdown();
      } else if (typeof manager.stop === 'function') {
        await manager.stop();
      }
    } catch (error) {
      console.warn('[CLEANUP] Failed to shutdown agent manager:', error);
    }
  });
  await Promise.allSettled(promises);
  activeAgentManagers.clear();
}

// Missing registration functions that tests expect
export function registerCleanup(fn: () => Promise<void>): void {
  cleanupFns.push(fn);
}

export async function runRegisteredCleanups(): Promise<void> {
  for (const fn of cleanupFns) {
    try {
      await fn();
    } catch (err) {
      console.error('[CLEANUP] Error in registered cleanup:', err);
    }
  }
  cleanupFns.length = 0;
}

export function registerAgent(agent: any): any {
  if (!globalThis.agentRegistry) {
    globalThis.agentRegistry = new Map();
  }
  globalThis.agentRegistry.set(agent.id || `agent-${Date.now()}`, agent);
  return agent;
}

export function registerTransport(transport: any): any {
  if (!globalThis.transportRegistry) {
    globalThis.transportRegistry = new Map();
  }
  if (!globalThis.activeTransports) {
    globalThis.activeTransports = new Set();
  }
  globalThis.transportRegistry.set(transport.id || `transport-${Date.now()}`, transport);
  globalThis.activeTransports.add(transport);
  return transport;
}

export async function cleanupAgents(): Promise<void> {
  if (globalThis.agentRegistry) {
    for (const agent of globalThis.agentRegistry.values()) {
      try {
        if (typeof agent.shutdown === 'function') {
          await agent.shutdown();
        }
      } catch (error) {
        console.warn('[CLEANUP] Error shutting down agent:', error);
      }
    }
    globalThis.agentRegistry.clear();
  }
  console.log('[CLEANUP] Agents cleaned up ✅');
}

export async function cleanupTransports(): Promise<void> {
  if (globalThis.activeTransports) {
    for (const transport of globalThis.activeTransports) {
      try {
        if (typeof transport.shutdown === 'function') {
          await transport.shutdown();
        } else if (typeof transport.close === 'function') {
          await transport.close();
        }
      } catch (error) {
        console.warn('[CLEANUP] Error shutting down transport:', error);
      }
    }
    globalThis.activeTransports.clear();
  }
  if (globalThis.transportRegistry) {
    globalThis.transportRegistry.clear();
  }
  console.log('[CLEANUP] Transports cleaned up ✅');
}

// Utility to get active resource counts (for debugging)
export function getActiveResourceCounts(): {
  workerPools: number;
  circuitBreakers: number;
  boundedExecutors: number;
  agentManagers: number;
  agents: number;
  transports: number;
} {
  return {
    workerPools: activeWorkerPools.size,
    circuitBreakers: activeCircuitBreakers.size,
    boundedExecutors: activeBoundedExecutors.size,
    agentManagers: activeAgentManagers.size,
    agents: globalThis.agentRegistry?.size || 0,
    transports: globalThis.activeTransports?.size || 0,
  };
}