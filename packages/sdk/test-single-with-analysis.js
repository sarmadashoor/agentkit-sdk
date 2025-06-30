#!/usr/bin/env node

/**
 * Single test runner with immediate handle analysis
 * This will help us understand what handles are created during test execution
 */

const { spawn } = require('child_process');
const { analyzeHandles, suggestCleanup } = require('./debug-handles.js');

console.log('🧪 Running single test with handle analysis...\n');

// Run a simple test
const testProcess = spawn('pnpm', ['vitest', 'run', '__tests__/init.test.ts', '--reporter=basic'], {
  stdio: 'pipe',
  cwd: process.cwd()
});

let stdout = '';
let stderr = '';

testProcess.stdout.on('data', (data) => {
  stdout += data.toString();
  process.stdout.write(data);
});

testProcess.stderr.on('data', (data) => {
  stderr += data.toString();
  process.stderr.write(data);
});

// Set up a timeout to kill the test if it hangs
const timeout = setTimeout(() => {
  console.log('\n⏰ Test hanging - analyzing handles...\n');
  
  // Analyze handles while test is still running
  const { handlesByType } = analyzeHandles();
  suggestCleanup(handlesByType);
  
  // Kill the test process
  testProcess.kill('SIGTERM');
  
  setTimeout(() => {
    if (!testProcess.killed) {
      console.log('🔥 Force killing test process...');
      testProcess.kill('SIGKILL');
    }
    process.exit(0);
  }, 2000);
}, 10000); // 10 second timeout

testProcess.on('close', (code) => {
  clearTimeout(timeout);
  console.log(`\n✅ Test process exited with code: ${code}\n`);
  
  // Analyze handles after test completion
  console.log('🔍 Analyzing handles after test completion...\n');
  const { handlesByType } = analyzeHandles();
  suggestCleanup(handlesByType);
  
  // Give a moment for any async cleanup
  setTimeout(() => {
    console.log('\n🔍 Final handle analysis after delay...\n');
    const { handlesByType: finalHandles } = analyzeHandles();
    
    if (Object.keys(finalHandles).length === 0) {
      console.log('✅ No handles remaining - clean exit!');
      process.exit(0);
    } else {
      console.log('❌ Handles still remaining - investigating...');
      suggestCleanup(finalHandles);
      process.exit(1);
    }
  }, 1000);
});

testProcess.on('error', (error) => {
  clearTimeout(timeout);
  console.error('❌ Test process error:', error);
  process.exit(1);
});