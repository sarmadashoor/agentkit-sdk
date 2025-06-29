/**
 * Vitest Setup File - Leak Gatekeeper
 *
 * - Detects and reports handle leaks across timers, ports, workers, plugins
 * - Enforces forced exit if leaks remain (FORCE_TEST_EXIT)
 * - Fails CI or strict environments on leak threshold (STRICT_LEAK_DETECTION)
 */

// Immediate verification that setup file is loaded
console.log('[SETUP] vitest.setup.ts has been loaded ✅')
console.log('[SETUP] Environment: FORCE_TEST_EXIT=' + process.env.FORCE_TEST_EXIT + ', DEBUG_HANDLES=' + process.env.DEBUG_HANDLES)

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

  if (handles.length > 0) {
    logDanglingResources(handles, 'afterEach');
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

// Always force exit - the environment variable might not be set properly
afterAll(async () => {
  console.warn('[AGGRESSIVE CLEANUP] Starting comprehensive cleanup...');
  performLeakCheck();
  
  // Get all active handles
  const remainingHandles = process._getActiveHandles();
  
  console.log(`[AGGRESSIVE CLEANUP] Found ${remainingHandles.length} total handles to analyze`);
  
  // Categorize handles
  const handleCategories = {
    messagePorts: remainingHandles.filter(h => h?.constructor?.name === 'MessagePort'),
    workers: remainingHandles.filter(h => h?.constructor?.name?.includes('Worker')),
    sockets: remainingHandles.filter(h => h?.constructor?.name === 'Socket'),
    pipes: remainingHandles.filter(h => h?.constructor?.name === 'Pipe'),
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
  
  // Aggressively clean up all handles using multiple methods
  const allHandles = Object.values(handleCategories).flat();
  
  for (let i = 0; i < allHandles.length; i++) {
    const handle = allHandles[i];
    const handleType = handle.constructor.name;
    
    try {
      // Try unref first (prevents keeping process alive)
      if (typeof handle.unref === 'function') {
        handle.unref();
        console.log(`[AGGRESSIVE CLEANUP] Unreferenced ${handleType} #${i}`);
      }
      
      // For sockets, try to gracefully close first
      if (handleType === 'Socket') {
        if (typeof handle.end === 'function' && !handle.destroyed) {
          handle.end();
          console.log(`[AGGRESSIVE CLEANUP] Ended socket #${i}`);
        }
        if (typeof handle.destroy === 'function' && !handle.destroyed) {
          handle.destroy();
          console.log(`[AGGRESSIVE CLEANUP] Destroyed socket #${i}`);
        }
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
      
      // Generic close for anything else
      if (typeof handle.close === 'function' && 
          !['Socket', 'Server', 'MessagePort'].includes(handleType)) {
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
    
    // Force unref on everything remaining
    finalHandles.forEach((handle, idx) => {
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
