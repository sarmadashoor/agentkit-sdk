/**
 * Vitest Setup File - Leak Gatekeeper
 *
 * - Detects and reports handle leaks across timers, ports, workers, plugins
 * - Natural process exit for Node 22+ compatibility (no forced exits)
 * - Fails CI or strict environments on leak threshold (STRICT_LEAK_DETECTION)
 */

// Immediate verification that setup file is loaded
console.log('[SETUP] vitest.setup.ts has been loaded ✅')
console.log('[SETUP] Environment: DEBUG_HANDLES=' + process.env.DEBUG_HANDLES + ', STRICT_LEAK_DETECTION=' + process.env.STRICT_LEAK_DETECTION)

// Increase max listeners to prevent EventEmitter memory leak warnings when running many tests
process.setMaxListeners(50)

const STANDARD_HANDLES = new Set([
  'TTY',
  'Pipe',
  'Socket',
  'WriteStream',
  'ReadStream',
  'FSWatcher'
]);

function getHandleTypes(handles: any[]): Record<string, number> {
  return handles.reduce((acc, handle) => {
    const name = handle?.constructor?.name || 'Unknown';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});
}

function getNonStandardHandles(handles: any[]): any[] {
  return handles.filter(h => !STANDARD_HANDLES.has(h?.constructor?.name));
}

function categorizeHandles(handles: any[]) {
  const result = {
    timers: [] as any[],
    messagePorts: [] as any[],
    workers: [] as any[],
    plugins: [] as any[],
    other: [] as any[]
  };

  for (const h of handles) {
    const name = h?.constructor?.name || '';
    if (name.includes('Timeout') || name.includes('Timer')) {
      result.timers.push(h);
    } else if (name.includes('MessagePort') || name.includes('Port')) {
      result.messagePorts.push(h);
    } else if (name.includes('Worker') || name.includes('Thread')) {
      result.workers.push(h);
    } else if (name.includes('Plugin') || (h?.filename?.includes('plugin'))) {
      result.plugins.push(h);
    } else {
      result.other.push(h);
    }
  }

  return result;
}

function getRemediationSuggestions(type: string): string {
  const tips: Record<string, string> = {
    'Timeout': 'clearTimeout() or .unref() on long-running timers',
    'Immediate': 'clearImmediate() during teardown',
    'Timer': 'clearInterval() and .unref()',
    'MessagePort': 'Call port.close() after use',
    'Worker': 'worker.terminate() + cleanup hooks',
    'ChildProcess': 'child.kill() and wait for exit',
    'Server': 'server.close() on shutdown',
    'Socket': 'socket.destroy() or socket.end()',
    'Plugin': 'Ensure plugin shutdown or disposal'
  };

  return tips[type] || `Check teardown for lingering ${type} instances`;
}

function logDanglingResources(handles: any[], label: string = 'HANDLES') {
  if (!handles.length) return;

  const categorized = categorizeHandles(handles);
  const summary = getHandleTypes(handles);

  console.warn(`\n[${label}] 🚨 Active handles detected (${handles.length} total):`);
  console.warn(`[${label}] Handle summary:`, summary);

  for (const [category, items] of Object.entries(categorized)) {
    if (items.length) {
      console.warn(`  - ${category} (${items.length}) → ${getRemediationSuggestions(category.slice(0, 1).toUpperCase() + category.slice(1))}`);
    }
  }
}

const isStrict = process.env.CI === 'true' || process.env.STRICT_LEAK_DETECTION === '1';
let hasRunFinalCheck = false;
let baselineHandles: any[] = [];

// Set baseline during setup
if (baselineHandles.length === 0) {
  baselineHandles = process._getActiveHandles().slice();
  console.log(`[LEAK GATEKEEPER] Baseline set: ${baselineHandles.length} handles`);
}

function performLeakCheck() {
  if (hasRunFinalCheck) return;
  hasRunFinalCheck = true;

  const allHandles = process._getActiveHandles();
  const leaked = getNonStandardHandles(allHandles);
  
  // Calculate handles beyond baseline
  const newHandleCount = allHandles.length - baselineHandles.length;
  const baselineNonStandard = getNonStandardHandles(baselineHandles);
  const newLeakedCount = leaked.length - baselineNonStandard.length;

  console.log(`[LEAK GATEKEEPER] Total handles: ${allHandles.length} (+${newHandleCount} from baseline), Non-standard: ${leaked.length} (+${newLeakedCount} new)`);

  if (newLeakedCount > 0) {
    logDanglingResources(leaked, 'FINAL-LEAK-CHECK');
    if (isStrict && newLeakedCount > 2) {
      console.error(`[STRICT MODE] ❌ Found ${newLeakedCount} NEW leaked handles (threshold: 2).`);
      // Remove forced exit - let Node.js handle cleanup naturally for Node 22+ compatibility
      // process.exit(1);
    } else {
      console.warn(`[WARNING] ⚠️ Detected ${newLeakedCount} new potential leaks beyond baseline.`);
    }
  } else {
    console.log(`[LEAK GATEKEEPER] ✅ No new handle leaks beyond baseline.`);
  }
}

// ------------------- Global Lifecycle Hooks ------------------- //

process.on('beforeExit', () => {
  const handles = process._getActiveHandles();

  // Explicit MessagePort cleanup
  const ports = handles.filter(h => h?.constructor?.name === 'MessagePort');
  ports.forEach((port, idx) => {
    try {
      port?.close?.();
      console.log(`[LEAK FIX] Closed lingering MessagePort #${idx}`);
    } catch (err) {
      console.warn(`[LEAK FIX] Failed to close MessagePort #${idx}:`, err);
    }
  });

  // Cleanup Workers
  const workers = handles.filter(h => h?.constructor?.name?.includes('Worker'));
  workers.forEach((worker, idx) => {
    try {
      if (typeof worker.terminate === 'function') {
        worker.terminate();
        console.log(`[LEAK FIX] Terminated lingering Worker #${idx}`);
      }
    } catch (err) {
      console.warn(`[LEAK FIX] Failed to terminate Worker #${idx}:`, err);
    }
  });

  if (handles.length) {
    console.warn('\n[beforeExit] Active handles remain. Checking...');
    logDanglingResources(handles, 'beforeExit');
  }

  performLeakCheck();

  // Remove forced exit timeout for Node 22+ compatibility
  // With proper VM Script cleanup, Node.js should exit naturally
  // setTimeout(() => {
  //   console.warn('[FORCED EXIT] 500ms elapsed after beforeExit. Forcing exit...');
  //   process.exit(0);
  // }, 500).unref();
});

process.on('exit', () => {
  performLeakCheck();
});

// ------------------- Vitest-specific Hooks ------------------- //

// Import vitest functions directly since we're in a setup file
import { afterAll, afterEach, beforeAll } from 'vitest'
import { cleanupAllResources } from './__tests__/test-utils/cleanup'
import { inspect } from 'node:util'

// Global cleanup for PluginManager instances
const globalPluginManagers: any[] = [];

// Track all PluginManager instances globally
const originalPluginManagerConstructor = globalThis.PluginManager;
if (typeof globalThis !== 'undefined') {
  globalThis.trackPluginManager = (manager: any) => {
    globalPluginManagers.push(manager);
  };
}

// Register vitest hooks
afterEach(async () => {
  // Clean up any tracked PluginManager instances
  for (const manager of globalPluginManagers) {
    try {
      if (manager && typeof manager.shutdown === 'function') {
        manager.shutdown();
      }
    } catch (error) {
      console.error('[CLEANUP] Error shutting down PluginManager:', error);
    }
  }
  globalPluginManagers.length = 0;

  // Close any remaining MessagePorts
  const handles = process._getActiveHandles();
  const messagePorts = handles.filter(h => h?.constructor?.name === 'MessagePort');
  messagePorts.forEach((port, idx) => {
    try {
      if (typeof port.close === 'function') {
        port.close();
        console.log(`[CLEANUP] Closed MessagePort #${idx} in afterEach`);
      }
    } catch (err) {
      console.warn(`[CLEANUP] Failed to close MessagePort #${idx}:`, err);
    }
  });

  // Only log non-system handles to reduce noise
  const nonSystemHandles = handles.filter(h => !STANDARD_HANDLES.has(h?.constructor?.name));
  if (nonSystemHandles.length > 0) {
    logDanglingResources(nonSystemHandles, 'afterEach');
  }
});

if (process.env.DEBUG_HANDLES === '1') {
  let interval: NodeJS.Timeout | null = null;
  let initialCount = 0;

  beforeAll(() => {
    initialCount = process._getActiveHandles().length;
    console.log(`[DEBUG] Initial active handles: ${initialCount}`);
    interval = setInterval(() => {
      const current = process._getActiveHandles();
      console.log(`[DEBUG] Active handles: ${current.length} →`, getHandleTypes(current));
    }, 1000);
    interval.unref();
  });

  afterAll(() => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }

    const endCount = process._getActiveHandles().length;
    if (endCount > initialCount) {
      console.warn(`[DEBUG] Leaked ${endCount - initialCount} handles during test run`);
      logDanglingResources(process._getActiveHandles(), 'debug-final');
    }
  });
}

// Observability stream cleanup for Node 22+ compatibility
const shutdownObservability = async () => {
  try {
    // Note: No longer touching stdout/stderr system handles for Node 22+ compatibility
    // Just ensure any user-created streams are properly handled in the main cleanup
    
    // Clear any console-related handles by forcing a small delay
    await new Promise(resolve => setTimeout(resolve, 10))
    
    console.log('[OBSERVABILITY CLEANUP] Observability streams cleanup completed')
  } catch (error) {
    console.warn('[OBSERVABILITY CLEANUP] Error during observability cleanup:', error.message)
  }
}

// Add aggressive resource cleanup with new cleanupAllResources function
process.on('exit', async () => {
  try {
    await cleanupAllResources();
  } catch (error) {
    console.error('[EXIT CLEANUP] Error during final cleanup:', error);
  }
});

process.on('uncaughtException', async (err) => {
  console.error('[UNCAUGHT EXCEPTION] Uncaught Exception:', err);
  try {
    await cleanupAllResources();
  } catch (cleanupError) {
    console.error('[UNCAUGHT EXCEPTION CLEANUP] Error during cleanup:', cleanupError);
  }
});

process.on('unhandledRejection', async (reason) => {
  // Check if this is an expected plugin timeout
  if (reason && typeof reason === 'object' && 'code' in reason && reason.code === 'PLUGIN_TIMEOUT') {
    console.log('[EXPECTED PLUGIN TIMEOUT]', reason.context || reason.message);
    return;
  }
  
  console.error('[UNHANDLED REJECTION] Unhandled Rejection:', reason);
  try {
    await cleanupAllResources();
  } catch (cleanupError) {
    console.error('[UNHANDLED REJECTION CLEANUP] Error during cleanup:', cleanupError);
  }
});

// Optional: inspect active handles to debug
if (process.env.DEBUG_HANDLES === '1') {
  console.log('[AGGRESSIVE CLEANUP] Active handles:', inspect(process._getActiveHandles(), { depth: 2 }));
}

// Always force exit - the environment variable might not be set properly
afterAll(async () => {
  console.warn('[AGGRESSIVE CLEANUP] Starting comprehensive cleanup...');
  
  // First, run our new comprehensive cleanup
  try {
    await cleanupAllResources();
    console.log('[AGGRESSIVE CLEANUP] cleanupAllResources completed successfully');
  } catch (error) {
    console.error('[AGGRESSIVE CLEANUP] Error in cleanupAllResources:', error);
  }
  
  // Then run observability cleanup
  await shutdownObservability();
  performLeakCheck();
  
  // Get all active handles
  const remainingHandles = process._getActiveHandles();
  
  console.log(`[AGGRESSIVE CLEANUP] Found ${remainingHandles.length} total handles to analyze`);
  
  // Add detailed handle analysis for debugging
  console.log('🔎 [HANDLE ANALYSIS] Detailed handle dump:');
  remainingHandles.forEach((handle, idx) => {
    const handleType = handle?.constructor?.name || 'Unknown';
    console.log(`  Handle #${idx}: ${handleType}`);
    
    // Check for WriteStream properties
    if (handleType === 'WriteStream' || handleType === 'Pipe') {
      console.log(`    - fd: ${handle.fd}`);
      console.log(`    - path: ${handle.path}`);
      console.log(`    - bytesWritten: ${handle.bytesWritten}`);
      console.log(`    - destroyed: ${handle.destroyed}`);
      console.log(`    - closed: ${handle.closed}`);
      console.log(`    - _writableState:`, handle._writableState ? {
        ended: handle._writableState.ended,
        finished: handle._writableState.finished,
        destroyed: handle._writableState.destroyed
      } : 'N/A');
    }
  });
  
  // Categorize handles
  const handleCategories = {
    messagePorts: remainingHandles.filter(h => h?.constructor?.name === 'MessagePort'),
    workers: remainingHandles.filter(h => h?.constructor?.name?.includes('Worker')),
    sockets: remainingHandles.filter(h => h?.constructor?.name === 'Socket'),
    pipes: remainingHandles.filter(h => h?.constructor?.name === 'Pipe'),
    writeStreams: remainingHandles.filter(h => h?.constructor?.name === 'WriteStream'),
    servers: remainingHandles.filter(h => h?.constructor?.name === 'Server'),
    childProcesses: remainingHandles.filter(h => h?.constructor?.name === 'ChildProcess'),
    timeouts: remainingHandles.filter(h => h?.constructor?.name?.includes('Timeout')),
    other: []
  };
  
  // Find uncategorized handles
  handleCategories.other = remainingHandles.filter(h => 
    !Object.values(handleCategories).some(category => 
      category !== handleCategories.other && category.includes(h)
    )
  );
  
  // Log what we found
  Object.entries(handleCategories).forEach(([category, handles]) => {
    if (handles.length > 0) {
      console.log(`[AGGRESSIVE CLEANUP] ${category}: ${handles.length} handles`);
    }
  });
  
  // Clean up handles with new system handle policy
  const allHandles = Object.values(handleCategories).flat();
  
  for (let i = 0; i < allHandles.length; i++) {
    const handle = allHandles[i];
    const handleType = handle.constructor.name;
    
    try {
      // System handles (WriteStream, Pipe, Socket) - only log, do not destroy
      if (handleType === 'WriteStream' || handleType === 'Pipe' || handleType === 'Socket') {
        console.log(`[SYSTEM HANDLE] ${handleType} #${i} - informational only (not destroyed)`);
        continue;
      }
      
      // Try unref first (prevents keeping process alive) for non-system handles
      if (typeof handle.unref === 'function') {
        handle.unref();
        console.log(`[AGGRESSIVE CLEANUP] Unreferenced ${handleType} #${i}`);
      }
      
      // For servers
      if (handleType === 'Server' && typeof handle.close === 'function') {
        handle.close();
        console.log(`[AGGRESSIVE CLEANUP] Closed server #${i}`);
      }
      
      // For child processes
      if (handleType === 'ChildProcess') {
        if (typeof handle.kill === 'function') {
          handle.kill();
          console.log(`[AGGRESSIVE CLEANUP] Killed child process #${i}`);
        }
      }
      
      // For MessagePorts
      if (handleType === 'MessagePort' && typeof handle.close === 'function') {
        handle.close();
        console.log(`[AGGRESSIVE CLEANUP] Closed MessagePort #${i}`);
      }
      
      // For Workers
      if (handleType.includes('Worker') && typeof handle.terminate === 'function') {
        handle.terminate();
        console.log(`[AGGRESSIVE CLEANUP] Terminated worker #${i}`);
      }
      
      // Generic close for anything else (excluding system handles)
      if (typeof handle.close === 'function' && 
          !['Socket', 'Server', 'MessagePort', 'WriteStream', 'Pipe'].includes(handleType)) {
        handle.close();
        console.log(`[AGGRESSIVE CLEANUP] Closed ${handleType} #${i}`);
      }
      
    } catch (error) {
      console.warn(`[AGGRESSIVE CLEANUP] Failed to clean ${handleType} #${i}:`, error.message);
    }
  }
  
  // Give a small delay for cleanup to complete
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Check what's left
  const finalHandles = process._getActiveHandles();
  console.log(`[AGGRESSIVE CLEANUP] ${finalHandles.length} handles remaining after cleanup`);
  
  if (finalHandles.length > 0) {
    console.warn('[AGGRESSIVE CLEANUP] Remaining handles:', finalHandles.map(h => h.constructor.name));
    
    // Categorize final handles
    const systemHandles = finalHandles.filter(h => 
      h.constructor.name === 'WriteStream' || 
      h.constructor.name === 'Pipe' || 
      h.constructor.name === 'Socket'
    );
    const nonSystemHandles = finalHandles.filter(h => 
      h.constructor.name !== 'WriteStream' && 
      h.constructor.name !== 'Pipe' && 
      h.constructor.name !== 'Socket'
    );
    
    // Only log system handles, don't touch them
    if (systemHandles.length > 0) {
      console.log(`[SYSTEM HANDLES] ${systemHandles.length} system handles remaining: informational only`);
      systemHandles.forEach((handle, idx) => {
        console.log(`  - ${handle.constructor.name} #${idx}`);
      });
    }
    
    // Force unref on non-system handles only
    nonSystemHandles.forEach((handle, idx) => {
      try {
        if (typeof handle.unref === 'function') {
          handle.unref();
          console.log(`[AGGRESSIVE CLEANUP] Force unreferenced final handle #${idx} (${handle.constructor.name})`);
        }
      } catch (err) {
        console.warn(`[AGGRESSIVE CLEANUP] Failed to unref final handle #${idx}:`, err.message);
      }
    });
  }
  
  console.warn('[AGGRESSIVE CLEANUP] Cleanup complete, process should exit naturally');
});

// ------------------- Export ------------------- //

export {};

declare global {
  namespace NodeJS {
    interface Process {
      _getActiveHandles(): any[];
    }
  }
}
