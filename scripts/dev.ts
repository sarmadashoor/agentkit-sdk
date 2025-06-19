#!/usr/bin/env tsx

import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

interface TestResult {
  file: string;
  passed: boolean;
  output: string;
}

interface TestSummary {
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  failed: string[];
  logs: string[];
}

const MAX_LOG_SIZE = 500 * 1024; // 500KB
const MAX_LOG_LINES = 1000;

class DevTestRunner {
  private outputDir = 'test-output';
  private results: TestResult[] = [];

  async run() {
    const command = process.argv[2];
    
    if (command !== 'test') {
      console.error('Usage: dev test');
      process.exit(1);
    }

    // Clean and create output directory
    if (existsSync(this.outputDir)) {
      rmSync(this.outputDir, { recursive: true, force: true });
    }
    mkdirSync(this.outputDir, { recursive: true });

    console.log('🧪 Running all tests with chunked output logging...');
    
    // Run pnpm test and capture output
    const testProcess = spawn('pnpm', ['test'], {
      shell: true,
      env: { ...process.env, CI: 'true' }
    });

    let currentTest = '';
    let currentOutput = '';
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    testProcess.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write(data); // Echo to console
      
      // Parse test output to identify test files and packages
      const lines = text.split('\n');
      for (const line of lines) {
        // Detect package test runs
        const packageMatch = line.match(/^(packages\/[^\/]+) test:/);
        if (packageMatch) {
          // Save previous test if exists
          if (currentTest) {
            this.saveTestOutput(currentTest, currentOutput);
          }
          currentTest = packageMatch[1];
          currentOutput = line + '\n';
          continue;
        }
        
        // Detect individual test files
        const testFileMatch = line.match(/(?:✓|×|❯)\s+(.+\.test\.(?:ts|tsx|js|jsx))/);
        if (testFileMatch) {
          const testFile = testFileMatch[1];
          if (currentTest) {
            // Update current test to include specific file
            currentTest = `${currentTest}/${testFile}`;
          } else {
            currentTest = testFile;
            currentOutput = '';
          }
        }
        
        // Accumulate output for current test
        if (currentTest) {
          currentOutput += line + '\n';
        }

        // Count test results
        if (line.includes('Test Files') && line.includes('passed')) {
          const passMatch = line.match(/(\d+) passed/);
          if (passMatch) {
            const passed = parseInt(passMatch[1]);
            passedTests += passed;
            totalTests += passed;
          }
        }
        if (line.includes('Test Files') && line.includes('failed')) {
          const failMatch = line.match(/(\d+) failed/);
          if (failMatch) {
            const failed = parseInt(failMatch[1]);
            failedTests += failed;
            totalTests += failed;
          }
        }
        
        // Also look for overall test counts
        if (line.includes('Tests') && line.includes('passed')) {
          const match = line.match(/Tests\s+(\d+) passed/);
          if (match) passedTests += parseInt(match[1]);
        }
        if (line.includes('Tests') && line.includes('failed')) {
          const match = line.match(/Tests\s+(\d+) failed/);
          if (match) failedTests += parseInt(match[1]);
        }
      }
    });

    testProcess.stderr.on('data', (data) => {
      const text = data.toString();
      process.stderr.write(data); // Echo to console
      
      if (currentTest) {
        currentOutput += text;
      }
    });

    testProcess.on('close', (code) => {
      // Save last test output
      if (currentTest) {
        this.saveTestOutput(currentTest, currentOutput);
      }

      // Generate summary
      this.generateSummary();
      
      console.log(`\n📊 Test run completed with exit code: ${code}`);
      console.log(`📁 Test outputs saved to: ${this.outputDir}/`);
      process.exit(code || 0);
    });
  }

  private saveTestOutput(testFile: string, output: string) {
    const baseFileName = testFile.replace(/[\/\\]/g, '-');
    const lines = output.split('\n');
    
    // Check if we need to chunk the output
    const outputSize = Buffer.byteLength(output, 'utf8');
    if (outputSize > MAX_LOG_SIZE || lines.length > MAX_LOG_LINES) {
      // Chunk the output
      let chunkIndex = 1;
      let currentChunk = '';
      let currentLines = 0;
      
      for (const line of lines) {
        const lineSize = Buffer.byteLength(line + '\n', 'utf8');
        const currentSize = Buffer.byteLength(currentChunk, 'utf8');
        
        if ((currentSize + lineSize > MAX_LOG_SIZE || currentLines >= MAX_LOG_LINES) && currentChunk) {
          // Save current chunk
          const chunkPath = join(this.outputDir, `${baseFileName}.${chunkIndex}.log`);
          writeFileSync(chunkPath, currentChunk);
          
          // Start new chunk
          chunkIndex++;
          currentChunk = '';
          currentLines = 0;
        }
        
        currentChunk += line + '\n';
        currentLines++;
      }
      
      // Save last chunk
      if (currentChunk) {
        const chunkPath = join(this.outputDir, `${baseFileName}.${chunkIndex}.log`);
        writeFileSync(chunkPath, currentChunk);
      }
    } else {
      // Save as single file
      const logPath = join(this.outputDir, `${baseFileName}.log`);
      writeFileSync(logPath, output);
    }
    
    // Track if test passed or failed
    const passed = !output.includes('FAIL') && !output.includes('× fail');
    this.results.push({ file: testFile, passed, output });
  }

  private generateSummary() {
    const failed = this.results.filter(r => !r.passed).map(r => r.file);
    const logs: string[] = [];
    
    // Collect all log files
    const fs = require('fs');
    const files = fs.readdirSync(this.outputDir);
    for (const file of files) {
      if (file.endsWith('.log')) {
        logs.push(join(this.outputDir, file));
      }
    }
    
    const summary: TestSummary = {
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.passed).length,
        failed: failed.length
      },
      failed,
      logs: logs.sort()
    };
    
    const summaryPath = join(this.outputDir, 'index.json');
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  }
}

// Run the test runner
const runner = new DevTestRunner();
runner.run().catch(console.error);