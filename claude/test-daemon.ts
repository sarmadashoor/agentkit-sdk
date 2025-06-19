#!/usr/bin/env node

/**
 * Test script for the refactored Claude daemon system
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ClaudeDaemon } from './daemon.js';
import { log, sleep } from './utils.js';

async function testDaemonSystem() {
  log('🧪 Testing Claude Autonomous Daemon System');
  
  const daemon = new ClaudeDaemon();
  
  // Create a simple test task
  const testTask = {
    id: 'test-echo-command',
    type: 'run-command' as const,
    cmd: 'echo "Hello from Claude autonomous test system!"',
    description: 'Simple echo test to verify daemon functionality',
    timeout: 5000
  };
  
  // Write the test task
  const taskPath = './claude/tasks/test-echo-command.json';
  writeFileSync(taskPath, JSON.stringify(testTask, null, 2));
  log(`📝 Created test task: ${taskPath}`);
  
  // Start daemon
  log('🚀 Starting daemon...');
  await daemon.start();
  
  // Wait for task to be processed
  log('⏳ Waiting for task to be processed...');
  await sleep(3000);
  
  // Check results
  const statusPath = './claude/results/test-echo-command.status.json';
  const logPath = './claude/results/test-echo-command.log';
  
  if (existsSync(statusPath)) {
    const status = JSON.parse(readFileSync(statusPath, 'utf-8'));
    log('✅ Task results found:');
    log(`   Status: ${status.status}`);
    log(`   Duration: ${status.durationMs}ms`);
    log(`   Exit Code: ${status.exitCode}`);
    
    if (existsSync(logPath)) {
      const logContent = readFileSync(logPath, 'utf-8');
      log('📋 Log file created successfully');
    }
  } else {
    log('❌ No results found - daemon may not be working correctly');
  }
  
  // Stop daemon
  log('🛑 Stopping daemon...');
  await daemon.stop();
  
  log('🧪 Test completed');
}

// Run test if this file is executed directly
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  testDaemonSystem().catch(error => {
    log(`❌ Test failed: ${error}`, 'error');
    process.exit(1);
  });
}