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

function runCommand(command, args, description) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`${description}`);
    console.log(`Command: ${command} ${args.join(' ')}`);
    console.log('-'.repeat(60));
    
    let stdout = '';
    let stderr = '';
    
    const child = spawn(command, args, {
      cwd: process.cwd()
    });
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      console.log(`Exit code: ${code}`);
      if (stdout) {
        console.log('\nSTDOUT (first 1000 chars):');
        console.log(stdout.substring(0, 1000));
        if (stdout.length > 1000) console.log('...(truncated)');
      }
      if (stderr) {
        console.log('\nSTDERR (first 1000 chars):');
        console.log(stderr.substring(0, 1000));
        if (stderr.length > 1000) console.log('...(truncated)');
      }
      resolve(code);
    });
    
    child.on('error', (error) => {
      console.error(`Error: ${error.message}`);
      resolve(1);
    });
  });
}

async function runTest() {
  const testNumber = process.argv[2] || '1';
  
  switch(testNumber) {
    case '1':
      return await runCommand('pnpm', [
        'exec', 'vitest', 'run', 
        '--config', 'packages/sdk/vitest.config.ts', 
        '--reporter', 'verbose'
      ], 'Test 1: pnpm exec vitest run --config packages/sdk/vitest.config.ts --reporter verbose');
      
    case '2':
      return await runCommand('pnpm', [
        'exec', 'vitest', 'run',
        '--config', 'packages/sdk/vitest.integration.config.ts',
        '--reporter', 'verbose'
      ], 'Test 2: pnpm exec vitest run --config packages/sdk/vitest.integration.config.ts --reporter verbose');
      
    case '3':
      return await runCommand('npx', [
        'vitest', 'run',
        '--config', 'packages/sdk/vitest.config.ts',
        '--reporter', 'verbose'
      ], 'Test 3: npx vitest run --config packages/sdk/vitest.config.ts --reporter verbose');
      
    case '4':
      return await runCommand('npx', [
        'vitest', 'run',
        '--config', 'packages/sdk/vitest.integration.config.ts',
        '--reporter', 'verbose'
      ], 'Test 4: npx vitest run --config packages/sdk/vitest.integration.config.ts --reporter verbose');
      
    default:
      console.log('Usage: node test-individual.js [1|2|3|4]');
  }
}

runTest().catch(console.error);