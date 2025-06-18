#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Current directory:', process.cwd());
console.log('Node version:', process.version);

// Try to find pnpm
const pnpmPaths = [
  'pnpm',
  '/usr/local/bin/pnpm',
  path.join(process.env.HOME, '.local/share/pnpm/pnpm'),
  path.join(process.env.HOME, '.pnpm/pnpm')
];

let pnpmPath = null;
for (const p of pnpmPaths) {
  try {
    const result = require('child_process').execSync(`which ${p}`, { encoding: 'utf8' });
    if (result) {
      pnpmPath = p;
      break;
    }
  } catch (e) {
    // Continue trying
  }
}

console.log('pnpm path:', pnpmPath || 'not found');

// Try to run vitest
if (pnpmPath) {
  const vitest = spawn(pnpmPath, ['exec', 'vitest', 'run', '--reporter', 'verbose'], {
    cwd: process.cwd(),
    stdio: 'pipe'
  });

  let output = '';
  
  vitest.stdout.on('data', (data) => {
    output += data.toString();
    process.stdout.write(data);
  });

  vitest.stderr.on('data', (data) => {
    output += data.toString();
    process.stderr.write(data);
  });

  vitest.on('close', (code) => {
    console.log(`\nVitest process exited with code ${code}`);
    
    // Write output to file
    fs.writeFileSync('vitest-debug.log', output);
    console.log('Output written to vitest-debug.log');
  });

  vitest.on('error', (err) => {
    console.error('Failed to start vitest:', err);
  });
} else {
  console.error('pnpm not found in PATH');
  
  // Try npx as fallback
  console.log('\nTrying npx vitest instead...');
  const npx = spawn('npx', ['vitest', 'run', '--reporter', 'verbose'], {
    cwd: process.cwd(),
    stdio: 'inherit'
  });
  
  npx.on('error', (err) => {
    console.error('Failed to start vitest with npx:', err);
  });
}