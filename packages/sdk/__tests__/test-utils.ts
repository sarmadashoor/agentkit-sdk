/**
 * Shared test utilities for AgentKit SDK test suite
 * Provides consistent cleanup and teardown helpers
 */

import { afterEach, afterAll, vi } from 'vitest';

// Baseline system handles that are acceptable
export const SYSTEM_HANDLES = ['Pipe', 'Socket', 'WriteStream', 'ReadStream', 'TTY'];
export const ALLOWED_BASELINE_HANDLES = 3; // Allow up to 3 system handles

// Track all instances for cleanup
const activeInstances = new Map<string, Set<any>>();

export function trackInstance(type: string, instance: any): void {
  if (!activeInstances.has(type)) {
    activeInstances.set(type, new Set());
  }
  activeInstances.get(type)!.add(instance);
}

export function untrackInstance(type: string, instance: any): void {
  activeInstances.get(type)?.delete(instance);
}

export async function cleanupInstance(instance: any): Promise<void> {
  if (!instance) {return;}

  try {
    // Try common cleanup methods
    if (typeof instance.shutdown === 'function') {
      await instance.shutdown();
    } else if (typeof instance.close === 'function') {
      await instance.close();
    } else if (typeof instance.stop === 'function') {
      await instance.stop();
    } else if (typeof instance.terminate === 'function') {
      await instance.terminate();
    } else if (typeof instance.destroy === 'function') {
      await instance.destroy();
    } else if (typeof instance.cleanup === 'function') {
      await instance.cleanup();
    }

    // Clear any internal references
    if (instance._cleanup) {
      await instance._cleanup();
    }
  } catch (error) {
    console.warn('[TEST-UTILS] Cleanup error:', error);
  }
}

export async function cleanupAllInstances(): Promise<void> {
  for (const [type, instances] of activeInstances.entries()) {
    console.log(`[TEST-UTILS] Cleaning up ${instances.size} ${type} instances`);
    for (const instance of instances) {
      await cleanupInstance(instance);
    }
    instances.clear();
  }
  activeInstances.clear();
}

// Mock transport with canAcceptMore method
export function createMockTransport() {
  return {
    canAcceptMore: vi.fn().mockReturnValue(true),
    send: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    on: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn()
  };
}

// Enhanced cleanup for BoundedExecutor and concurrency tests
export async function cleanupExecutor(executor: any): Promise<void> {
  if (!executor) {return;}

  try {
    // Clear any pending tasks
    if (executor._queue) {
      executor._queue.clear?.();
    }
    if (executor._pendingTasks) {
      executor._pendingTasks.clear?.();
    }

    // Shutdown executor
    if (typeof executor.shutdown === 'function') {
      await executor.shutdown();
    }

    // Clear any timers
    if (executor._timeouts) {
      for (const timeout of executor._timeouts) {
        clearTimeout(timeout);
      }
      executor._timeouts.clear();
    }

    // Clear intervals
    if (executor._intervals) {
      for (const interval of executor._intervals) {
        clearInterval(interval);
      }
      executor._intervals.clear();
    }
  } catch (error) {
    console.warn('[TEST-UTILS] Executor cleanup error:', error);
  }
}

// Worker cleanup helper
export async function cleanupWorkers(workers: any[]): Promise<void> {
  for (const worker of workers) {
    try {
      if (worker && typeof worker.terminate === 'function') {
        await worker.terminate();
      }
    } catch (error) {
      console.warn('[TEST-UTILS] Worker cleanup error:', error);
    }
  }
}

// Plugin cleanup helper
export async function cleanupPlugins(plugins: any[]): Promise<void> {
  for (const plugin of plugins) {
    try {
      if (plugin) {
        if (typeof plugin.shutdown === 'function') {
          await plugin.shutdown();
        }
        if (typeof plugin.cleanup === 'function') {
          await plugin.cleanup();
        }
      }
    } catch (error) {
      console.warn('[TEST-UTILS] Plugin cleanup error:', error);
    }
  }
}

// Handle leak detection helpers
export function getActiveHandles(): any[] {
  return process._getActiveHandles();
}

export function getHandleTypes(handles: any[]): Record<string, number> {
  return handles.reduce((acc, handle) => {
    const name = handle?.constructor?.name || 'Unknown';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

export function getNonSystemHandles(handles: any[]): any[] {
  return handles.filter(h => !SYSTEM_HANDLES.includes(h?.constructor?.name));
}

export function logHandleReport(label: string = 'HANDLES'): void {
  const handles = getActiveHandles();
  const types = getHandleTypes(handles);
  const nonSystem = getNonSystemHandles(handles);

  console.log(`[${label}] Total: ${handles.length}, Non-system: ${nonSystem.length}`);
  console.log(`[${label}] Types:`, types);
}

// Aggressive cleanup function for afterEach/afterAll
export async function aggressiveCleanup(): Promise<void> {
  // Clean up all tracked instances
  await cleanupAllInstances();

  const handles = getActiveHandles();
  const nonSystemHandles = getNonSystemHandles(handles);

  for (const handle of nonSystemHandles) {
    const handleType = handle?.constructor?.name || 'Unknown';

    try {
      // MessagePorts
      if (handleType === 'MessagePort' && typeof handle.close === 'function') {
        handle.close();
        console.log(`[CLEANUP] Closed MessagePort`);
      }

      // Workers
      if (handleType.includes('Worker') && typeof handle.terminate === 'function') {
        await handle.terminate();
        console.log(`[CLEANUP] Terminated Worker`);
      }

      // Timers
      if (handleType.includes('Timeout')) {
        clearTimeout(handle);
        console.log(`[CLEANUP] Cleared Timeout`);
      }

      if (handleType.includes('Interval')) {
        clearInterval(handle);
        console.log(`[CLEANUP] Cleared Interval`);
      }

      // Generic unref
      if (typeof handle.unref === 'function') {
        handle.unref();
      }
    } catch (error) {
      // Silently ignore cleanup errors
    }
  }

  // Clear all timers
  vi.clearAllTimers();
}

// Setup default cleanup hooks
export function setupTestCleanup(): void {
  afterEach(async () => {
    await aggressiveCleanup();
  });

  afterAll(async () => {
    await aggressiveCleanup();
    
    // Final handle check
    const finalHandles = getActiveHandles();
    const nonSystemHandles = getNonSystemHandles(finalHandles);
    
    if (nonSystemHandles.length > 0) {
      console.warn(`[FINAL-CHECK] ${nonSystemHandles.length} non-system handles remain`);
      logHandleReport('FINAL');
    }
  });
}

// Expected error suppression for plugin tests
export function suppressExpectedErrors(patterns: RegExp[]): void {
  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = (...args: any[]) => {
    const message = args.join(' ');
    if (!patterns.some(pattern => pattern.test(message))) {
      originalError.apply(console, args);
    }
  };

  console.warn = (...args: any[]) => {
    const message = args.join(' ');
    if (!patterns.some(pattern => pattern.test(message))) {
      originalWarn.apply(console, args);
    }
  };

  afterEach(() => {
    console.error = originalError;
    console.warn = originalWarn;
  });
}

// Request tracking and cleanup
const activeRequests = new Set<any>();

export function trackRequest(request: any): void {
  activeRequests.add(request);
}

export function untrackRequest(request: any): void {
  activeRequests.delete(request);
}

export async function cleanupAllRequests(): Promise<void> {
  console.log(`[CLEANUP] Cleaning up ${activeRequests.size} active requests`);
  
  for (const request of activeRequests) {
    try {
      if (request && typeof request.abort === 'function') {
        request.abort();
      } else if (request && typeof request.cancel === 'function') {
        request.cancel();
      } else if (request && typeof request.destroy === 'function') {
        request.destroy();
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
  
  activeRequests.clear();
}

// Transport helpers
export function patchTransportForTests(transport: any): any {
  if (!transport.canAcceptMore) {
    transport.canAcceptMore = () => true;
  }
  return transport;
}

// Test lifecycle helpers
export function withTestLifecycle(testFn: () => void | Promise<void>): void {
  setupTestCleanup();
  
  afterEach(async () => {
    await cleanupAllRequests();
  });
  
  // Run the actual test
  testFn();
}

// Export type definitions for better TypeScript support
export interface TestCleanupOptions {
  suppressErrors?: RegExp[];
  trackRequests?: boolean;
  aggressiveCleanup?: boolean;
}

export function setupAdvancedCleanup(options: TestCleanupOptions = {}): void {
  if (options.suppressErrors) {
    suppressExpectedErrors(options.suppressErrors);
  }

  if (options.trackRequests !== false) {
    afterEach(async () => {
      await cleanupAllRequests();
    });
  }

  if (options.aggressiveCleanup !== false) {
    setupTestCleanup();
  }
}

// Export all cleanup functions from our new cleanup module
export {
  cleanupAllResources,
  registerCleanup,
  runRegisteredCleanups,
  registerAgent,
  registerTransport,
  cleanupAgents,
  cleanupTransports,
  registerCircuitBreaker,
  unregisterCircuitBreaker,
  registerWorkerPool,
  unregisterWorkerPool,
  registerBoundedExecutor,
  unregisterBoundedExecutor,
  registerAgentManager,
  unregisterAgentManager,
  getActiveResourceCounts,
  cleanupWorkerPools,
  cleanupCircuitBreakers,
  cleanupBoundedExecutors,
  cleanupAgentManagers
} from './test-utils/cleanup';

// Export registerAgentManager as registerManager for test compatibility
export { registerAgentManager as registerManager } from './test-utils/cleanup';

// Add missing flushPromises function that tests expect
export async function flushPromises(): Promise<void> {
  // Allow any pending promises to flush
  await new Promise(resolve => setTimeout(resolve, 0));
}

// Global process cleanup enhancement
declare global {
  namespace NodeJS {
    interface Process {
      _getActiveHandles(): any[];
    }
  }
}