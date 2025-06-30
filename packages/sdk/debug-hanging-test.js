const { spawn } = require('child_process');
const path = require('path');

// Run the test with debugging
const testFile = '__tests__/agent-manager-concurrency.test.ts';
console.log('🔍 Running test with enhanced debugging...\n');

const child = spawn('pnpm', ['vitest', 'run', testFile], {
  env: {
    ...process.env,
    FORCE_TEST_EXIT: '1',
    DEBUG_HANDLES: '1',
    NODE_OPTIONS: '--trace-warnings'
  },
  stdio: 'pipe'
});

let output = '';
let pendingOperations = [];

child.stdout.on('data', (data) => {
  const text = data.toString();
  process.stdout.write(text);
  output += text;
});

child.stderr.on('data', (data) => {
  const text = data.toString();
  process.stderr.write(text);
  output += text;
});

// Give the test time to run
setTimeout(() => {
  if (!child.killed) {
    console.log('\n\n🚨 TEST IS HANGING - Forcing debug output...\n');
    
    // Send SIGUSR1 to trigger Node's built-in diagnostic report if available
    try {
      child.kill('SIGUSR1');
    } catch (e) {
      console.log('Could not send SIGUSR1:', e.message);
    }
    
    // Wait a bit then force kill
    setTimeout(() => {
      console.log('\n💀 Force killing process...\n');
      child.kill('SIGKILL');
      
      // Analyze output for clues
      console.log('\n📊 Analysis:');
      
      // Check for unresolved promises
      const promiseMatches = output.match(/Promise\s*{[\s\S]*?<pending>/g) || [];
      if (promiseMatches.length > 0) {
        console.log(`- Found ${promiseMatches.length} pending promises`);
      }
      
      // Check for active timers
      const timerMatches = output.match(/setTimeout|setInterval|setImmediate/g) || [];
      console.log(`- Found ${timerMatches.length} timer references`);
      
      // Check for MessagePort references
      const portMatches = output.match(/MessagePort|port\d+\.close/g) || [];
      console.log(`- Found ${portMatches.length} MessagePort references`);
      
      // Look for sandbox/worker references
      const workerMatches = output.match(/Worker|worker|sandbox|vm\./g) || [];
      console.log(`- Found ${workerMatches.length} worker/sandbox references`);
      
      process.exit(1);
    }, 5000);
  }
}, 20000); // Wait 20 seconds before checking

child.on('exit', (code) => {
  if (code === 0) {
    console.log('\n✅ Test exited cleanly!');
  } else {
    console.log(`\n❌ Test exited with code: ${code}`);
  }
  process.exit(code);
});