#!/usr/bin/env node

// Direct test runner - bypasses vitest to check if hang is vitest-specific

const { spawn } = require('child_process');
const path = require('path');

const testCommand = `
const vitest = require('vitest');
console.log('Starting vitest programmatically...');

vitest.startVitest('test', [], {
  run: true,
  threads: false,
  reporters: ['verbose'],
  setupFiles: ['./vitest.setup.ts'],
  include: ['__tests__/debug-onSend-syntax.test.ts']
}).then(vitest => {
  console.log('Vitest completed, exiting...');
  process.exit(0);
}).catch(err => {
  console.error('Vitest error:', err);
  process.exit(1);
});
`;

console.log('Running direct test...');

const proc = spawn('node', ['-e', testCommand], {
  cwd: __dirname,
  env: {
    ...process.env,
    FORCE_TEST_EXIT: '1',
    NODE_ENV: 'test'
  },
  stdio: 'inherit'
});

// Force kill after 20 seconds
const killTimer = setTimeout(() => {
  console.log('\n⏱️ Test hung for 20s, killing process...');
  proc.kill('SIGKILL');
  process.exit(1);
}, 20000);

proc.on('exit', (code) => {
  clearTimeout(killTimer);
  console.log(`\nTest exited with code: ${code}`);
  process.exit(code || 0);
});