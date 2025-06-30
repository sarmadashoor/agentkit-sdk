#!/usr/bin/env node

/**
 * Test Hang Detector
 * Runs specific test groups to identify which cause hangs
 */

const { spawn } = require('child_process');
const path = require('path');

const TEST_GROUPS = [
  {
    name: 'Worker Tests',
    files: [
      '__tests__/plugins/plugin-worker.test.ts',
      '__tests__/plugins/worker-integration.test.ts'
    ]
  },
  {
    name: 'Plugin Core Tests',
    files: [
      '__tests__/plugin-sandboxing.test.ts',
      '__tests__/plugin-interface-compatibility.test.ts',
      '__tests__/plugin-type-import.test.ts'
    ]
  },
  {
    name: 'Circuit Breaker Tests',
    files: [
      '__tests__/circuit-breaker-metrics.test.ts',
      '__tests__/circuit-breaker-observability.test.ts',
      '__tests__/circuit-breaker-transport-integration.test.ts'
    ]
  },
  {
    name: 'Agent Manager Tests',
    files: [
      '__tests__/agent-manager-concurrency.test.ts',
      '__tests__/agent-manager-memory-leaks.test.ts',
      '__tests__/agent-manager-race-conditions.test.ts'
    ]
  },
  {
    name: 'Transport Tests',
    files: [
      '__tests__/transport-backpressure.test.ts',
      '__tests__/transport-simulation.test.ts'
    ]
  }
];

async function runTest(name, files, timeout = 30000) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`Files: ${files.join(', ')}`);
  console.log(`${'='.repeat(60)}`);
  
  return new Promise((resolve) => {
    const startTime = Date.now();
    const args = ['vitest', 'run', ...files];
    
    const proc = spawn('pnpm', args, {
      env: {
        ...process.env,
        FORCE_TEST_EXIT: '1',
        NODE_ENV: 'test'
      },
      stdio: ['inherit', 'pipe', 'pipe'],
      cwd: path.resolve(__dirname)
    });
    
    let stdout = '';
    let stderr = '';
    let killed = false;
    
    const timeoutId = setTimeout(() => {
      if (!killed) {
        killed = true;
        console.log(`\n⏱️  TIMEOUT: ${name} hung after ${timeout}ms`);
        proc.kill('SIGKILL');
      }
    }, timeout);
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('exit', (code, signal) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      
      if (killed) {
        console.log(`❌ ${name} - HUNG (killed after ${duration}ms)`);
        
        // Check for handle leaks in output
        if (stdout.includes('[BEFORE EXIT]') || stdout.includes('[PROBLEMATIC HANDLES]')) {
          console.log('\n🔍 Handle leak detected:');
          const lines = stdout.split('\n');
          lines.forEach(line => {
            if (line.includes('MessagePort') || 
                line.includes('Worker') || 
                line.includes('[PROBLEMATIC HANDLES]') ||
                line.includes('[BEFORE EXIT HANDLES]')) {
              console.log(line);
            }
          });
        }
        
        resolve({ name, hung: true, duration, code, signal });
      } else {
        console.log(`✅ ${name} - Exited cleanly in ${duration}ms`);
        resolve({ name, hung: false, duration, code });
      }
    });
    
    proc.on('error', (error) => {
      clearTimeout(timeoutId);
      console.log(`❌ ${name} - ERROR: ${error.message}`);
      resolve({ name, error: error.message });
    });
  });
}

async function main() {
  console.log('🔍 Test Hang Detector');
  console.log('Testing individual groups to identify hangs...\n');
  
  const results = [];
  
  // Test each group
  for (const group of TEST_GROUPS) {
    const result = await runTest(group.name, group.files);
    results.push(result);
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  
  const hungTests = results.filter(r => r.hung);
  const cleanTests = results.filter(r => !r.hung && !r.error);
  
  console.log(`\n✅ Clean exits: ${cleanTests.length}`);
  cleanTests.forEach(t => console.log(`   - ${t.name}`));
  
  console.log(`\n❌ Hung tests: ${hungTests.length}`);
  hungTests.forEach(t => console.log(`   - ${t.name} (killed after ${t.duration}ms)`));
  
  if (hungTests.length > 0) {
    console.log('\n💡 Next steps:');
    console.log('1. Check the hung test files for missing cleanup in afterEach/afterAll');
    console.log('2. Look for WorkerPool or PluginManager instances not being shutdown');
    console.log('3. Check for unref() missing on timers or intervals');
  }
}

main().catch(console.error);