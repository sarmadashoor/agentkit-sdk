#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Change to the root directory
const rootDir = path.resolve(__dirname, '../../');
process.chdir(rootDir);

console.log('Current working directory:', process.cwd());
console.log('='.repeat(80));

function runCommand(command, args, description) {
  return new Promise((resolve) => {
    console.log(`\n${description}`);
    console.log(`Command: ${command} ${args.join(' ')}`);
    console.log('-'.repeat(60));
    
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    child.on('close', (code) => {
      console.log(`\nExit code: ${code}`);
      console.log('='.repeat(80));
      resolve(code);
    });
    
    child.on('error', (error) => {
      console.error(`Error: ${error.message}`);
      console.log(`\nExit code: 1 (error)`);
      console.log('='.repeat(80));
      resolve(1);
    });
  });
}

async function runTests() {
  console.log('Testing vitest configurations...\n');
  
  // Test 1: pnpm exec vitest run --config packages/sdk/vitest.config.ts --reporter verbose
  await runCommand('pnpm', [
    'exec', 'vitest', 'run', 
    '--config', 'packages/sdk/vitest.config.ts', 
    '--reporter', 'verbose'
  ], 'Test 1: pnpm exec vitest run --config packages/sdk/vitest.config.ts --reporter verbose');
  
  // Test 2: pnpm exec vitest run --config packages/sdk/vitest.integration.config.ts --reporter verbose
  await runCommand('pnpm', [
    'exec', 'vitest', 'run',
    '--config', 'packages/sdk/vitest.integration.config.ts',
    '--reporter', 'verbose'
  ], 'Test 2: pnpm exec vitest run --config packages/sdk/vitest.integration.config.ts --reporter verbose');
  
  // Test 3: npx vitest run --config packages/sdk/vitest.config.ts --reporter verbose
  await runCommand('npx', [
    'vitest', 'run',
    '--config', 'packages/sdk/vitest.config.ts',
    '--reporter', 'verbose'
  ], 'Test 3: npx vitest run --config packages/sdk/vitest.config.ts --reporter verbose');
  
  // Test 4: npx vitest run --config packages/sdk/vitest.integration.config.ts --reporter verbose
  await runCommand('npx', [
    'vitest', 'run',
    '--config', 'packages/sdk/vitest.integration.config.ts',
    '--reporter', 'verbose'
  ], 'Test 4: npx vitest run --config packages/sdk/vitest.integration.config.ts --reporter verbose');
  
  console.log('\nAll tests completed.');
}

runTests().catch(console.error);