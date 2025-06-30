#!/usr/bin/env node

/**
 * Test Isolation Runner
 * 
 * This script runs test files in isolated batches to identify which
 * combination causes process hangs. It tracks execution time and
 * exit status for each batch.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// Configuration
const TIMEOUT_MS = 60000; // 60 seconds timeout per batch
const LOG_FILE = 'test-isolation-results.log';

// Test groups based on functionality
const TEST_GROUPS = {
  'plugin-core': [
    '**/plugin-manager*.test.ts',
    '**/plugin-sandboxing.test.ts',
    '**/plugin-type-import.test.ts',
    '**/plugin-interface-compatibility.test.ts',
    '**/plugin-lifecycle.test.ts',
  ],
  'plugin-worker': [
    '**/plugins/*.test.ts',
    '**/plugin-signature*.test.ts',
    '**/sandboxed*.test.ts',
    '**/worker*.test.ts',
  ],
  'agent-manager': [
    '**/agent-manager*.test.ts',
    '**/connectAgent*.test.ts',
  ],
  'transport': [
    '**/transport*.test.ts',
    '**/bounded*.test.ts',
    '**/BackpressureQueue*.test.ts',
  ],
  'circuit-breaker': [
    '**/circuit-breaker*.test.ts',
  ],
  'observability': [
    '**/observability/**/*.test.ts',
    '**/observability*.test.ts',
    '**/metrics/**/*.test.ts',
  ],
  'manual-tests': [
    '**/manual/*.test.ts',
  ],
  'legacy': [
    '**/legacy/*.test.ts',
  ],
  'misc': [
    '**/debug*.test.ts',
    '**/agent-concurrency.test.ts',
  ],
};

// Utility functions
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
}

async function findTestFiles(patterns) {
  const allFiles = new Set();
  const baseDir = path.join(__dirname, '__tests__');
  
  for (const pattern of patterns) {
    const files = await glob(pattern, {
      cwd: baseDir,
      absolute: true,
    });
    files.forEach(file => allFiles.add(file));
  }
  
  return Array.from(allFiles);
}

async function runTestBatch(name, files, attempt = 1) {
  if (files.length === 0) {
    log(`⏭️  Skipping ${name} - no test files found`);
    return { success: true, skipped: true };
  }
  
  log(`\n${'='.repeat(80)}`);
  log(`🧪 Running ${name} (${files.length} files, attempt ${attempt})`);
  log(`Files: ${files.map(f => path.basename(f)).join(', ')}`);
  log(`${'='.repeat(80)}`);
  
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      FORCE_TEST_EXIT: '1',
      DEBUG_HANDLES: '1',
      NODE_ENV: 'test',
    };
    
    const args = ['vitest', 'run', '--reporter=verbose', ...files];
    const proc = spawn('pnpm', args, {
      env,
      stdio: ['inherit', 'pipe', 'pipe'],
      cwd: path.join(__dirname, '../..'),
    });
    
    let stdout = '';
    let stderr = '';
    let timeoutId;
    let killed = false;
    
    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });
    
    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });
    
    // Set timeout
    timeoutId = setTimeout(() => {
      if (!killed) {
        killed = true;
        log(`\n⏱️  TIMEOUT: ${name} exceeded ${TIMEOUT_MS}ms limit`);
        proc.kill('SIGKILL');
      }
    }, TIMEOUT_MS);
    
    proc.on('exit', (code, signal) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      const durationStr = formatDuration(duration);
      
      if (killed) {
        log(`❌ ${name} - TIMED OUT after ${durationStr}`);
        resolve({
          success: false,
          timeout: true,
          duration,
          code,
          signal,
          stdout,
          stderr,
        });
      } else if (code === 0) {
        log(`✅ ${name} - PASSED in ${durationStr}`);
        resolve({
          success: true,
          duration,
          code,
          stdout,
          stderr,
        });
      } else {
        log(`❌ ${name} - FAILED with code ${code} in ${durationStr}`);
        resolve({
          success: false,
          duration,
          code,
          signal,
          stdout,
          stderr,
        });
      }
    });
    
    proc.on('error', (error) => {
      clearTimeout(timeoutId);
      log(`❌ ${name} - ERROR: ${error.message}`);
      resolve({
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
    });
  });
}

async function runSingleFileTests(groupName, files) {
  log(`\n🔍 Running individual file tests for ${groupName}`);
  const results = [];
  
  for (const file of files) {
    const fileName = path.basename(file);
    const result = await runTestBatch(`${groupName}/${fileName}`, [file]);
    results.push({ file: fileName, ...result });
    
    // Brief pause between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  return results;
}

async function main() {
  log('🚀 Starting Test Isolation Runner');
  log(`Timeout per batch: ${TIMEOUT_MS}ms`);
  log(`Results will be saved to: ${LOG_FILE}`);
  
  // Clear previous log
  fs.writeFileSync(LOG_FILE, '');
  
  const results = {};
  const problematicGroups = [];
  
  // Phase 1: Run each group in isolation
  log('\n📋 PHASE 1: Running test groups in isolation');
  
  for (const [groupName, patterns] of Object.entries(TEST_GROUPS)) {
    const files = await findTestFiles(patterns);
    const result = await runTestBatch(groupName, files);
    results[groupName] = result;
    
    if (!result.success && !result.skipped) {
      problematicGroups.push(groupName);
    }
    
    // Wait between groups to ensure clean process state
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // Phase 2: For problematic groups, run files individually
  log('\n📋 PHASE 2: Isolating problematic files');
  
  for (const groupName of problematicGroups) {
    const files = await findTestFiles(TEST_GROUPS[groupName]);
    const individualResults = await runSingleFileTests(groupName, files);
    results[`${groupName}_individual`] = individualResults;
  }
  
  // Phase 3: Try combinations of successful groups to find interactions
  log('\n📋 PHASE 3: Testing group combinations');
  
  const successfulGroups = Object.entries(results)
    .filter(([name, result]) => result.success && !result.skipped)
    .map(([name]) => name);
  
  if (successfulGroups.length >= 2) {
    // Test pairs of successful groups
    for (let i = 0; i < successfulGroups.length; i++) {
      for (let j = i + 1; j < successfulGroups.length; j++) {
        const group1 = successfulGroups[i];
        const group2 = successfulGroups[j];
        const combinedName = `${group1}+${group2}`;
        
        const files1 = await findTestFiles(TEST_GROUPS[group1]);
        const files2 = await findTestFiles(TEST_GROUPS[group2]);
        const combinedFiles = [...files1, ...files2];
        
        const result = await runTestBatch(combinedName, combinedFiles);
        results[combinedName] = result;
        
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
  
  // Summary report
  log('\n' + '='.repeat(80));
  log('📊 SUMMARY REPORT');
  log('='.repeat(80));
  
  const timeouts = [];
  const failures = [];
  const successes = [];
  
  Object.entries(results).forEach(([name, result]) => {
    if (result.skipped) return;
    
    if (result.timeout) {
      timeouts.push(name);
    } else if (!result.success) {
      failures.push(name);
    } else {
      successes.push(name);
    }
  });
  
  log(`\n✅ Successful: ${successes.length}`);
  successes.forEach(name => log(`   - ${name}`));
  
  log(`\n❌ Failed: ${failures.length}`);
  failures.forEach(name => log(`   - ${name}`));
  
  log(`\n⏱️  Timed out: ${timeouts.length}`);
  timeouts.forEach(name => log(`   - ${name}`));
  
  // Handle leak analysis
  log('\n🔍 HANDLE LEAK ANALYSIS');
  
  Object.entries(results).forEach(([name, result]) => {
    if (result.stdout && result.stdout.includes('[PROBLEMATIC HANDLES]')) {
      log(`\n${name} leaked handles:`);
      const lines = result.stdout.split('\n');
      const handleSection = lines.findIndex(line => line.includes('[PROBLEMATIC HANDLES]'));
      if (handleSection !== -1) {
        for (let i = handleSection; i < lines.length && i < handleSection + 10; i++) {
          if (lines[i].includes('MessagePort') || lines[i].includes('Worker') || lines[i].includes('Timer')) {
            log(`   ${lines[i].trim()}`);
          }
        }
      }
    }
  });
  
  log('\n✨ Test isolation analysis complete!');
  log(`Full results saved to: ${LOG_FILE}`);
  
  // Exit with appropriate code
  process.exit(timeouts.length > 0 || failures.length > 0 ? 1 : 0);
}

// Run the script
main().catch(error => {
  log(`Fatal error: ${error.message}`);
  process.exit(1);
});