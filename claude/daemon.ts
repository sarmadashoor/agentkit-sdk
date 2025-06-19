#!/usr/bin/env node

/**
 * Autonomous Claude Test Daemon
 * 
 * Monitors /tasks directory for JSON task files, executes them one at a time,
 * and writes structured results to /results directory.
 * 
 * Key features:
 * - Sequential task execution (one at a time)
 * - Timeout handling with graceful/force kill
 * - Structured .status.json + .log output per task
 * - Security-filtered command execution
 * - Self-diagnosing and Claude-compatible
 */

import { watch } from 'fs/promises';
import { existsSync, readFileSync, unlinkSync, mkdirSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { ClaudeTask, ClaudeResult } from './schema.js';
import { TaskRunner } from './taskRunner.js';
import { log, sleep } from './utils.js';

export class ClaudeDaemon {
  private isRunning = false;
  private isProcessing = false;
  private tasksDir: string;
  private resultsDir: string;
  private taskRunner: TaskRunner;
  private taskQueue: string[] = [];

  constructor() {
    this.tasksDir = resolve('./claude/tasks');
    this.resultsDir = resolve('./claude/results');
    this.taskRunner = new TaskRunner(this.resultsDir);
    
    // Ensure directories exist
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!existsSync(this.tasksDir)) {
      mkdirSync(this.tasksDir, { recursive: true });
    }
    if (!existsSync(this.resultsDir)) {
      mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      log('Daemon is already running');
      return;
    }

    this.isRunning = true;
    log('🤖 Claude Autonomous Test Daemon started');
    log(`📁 Tasks: ${this.tasksDir}`);
    log(`📊 Results: ${this.resultsDir}`);
    log('🔄 Running tasks sequentially, one at a time');

    // Process any existing tasks first
    await this.discoverAndQueueTasks();

    // Start the main processing loop
    this.startProcessingLoop();

    // Start watching for new tasks
    this.startFileWatcher();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    log('🛑 Claude Daemon stopping...');
    
    // Wait for current processing to finish
    while (this.isProcessing) {
      await sleep(100);
    }
    
    log('🛑 Claude Daemon stopped');
  }

  /**
   * Discover existing task files and add them to queue
   */
  private async discoverAndQueueTasks(): Promise<void> {
    try {
      const files = readdirSync(this.tasksDir);
      const taskFiles = files.filter((f: string) => f.endsWith('.json'));
      
      if (taskFiles.length > 0) {
        log(`📋 Found ${taskFiles.length} existing task(s) to queue`);
        this.taskQueue.push(...taskFiles.map(f => join(this.tasksDir, f)));
      }
    } catch (error) {
      log(`❌ Error discovering tasks: ${error}`, 'error');
    }
  }

  /**
   * Main processing loop - handles one task at a time
   */
  private async startProcessingLoop(): Promise<void> {
    while (this.isRunning) {
      if (this.taskQueue.length > 0 && !this.isProcessing) {
        this.isProcessing = true;
        
        const taskPath = this.taskQueue.shift()!;
        await this.processTask(taskPath);
        
        this.isProcessing = false;
      } else {
        // Brief sleep to avoid busy waiting
        await sleep(250);
      }
    }
  }

  /**
   * Watch for new task files and add them to queue
   */
  private async startFileWatcher(): Promise<void> {
    try {
      const watcher = watch(this.tasksDir, { recursive: false });
      
      for await (const event of watcher) {
        if (!this.isRunning) break;
        
        if (event.eventType === 'rename' && event.filename?.endsWith('.json')) {
          const taskPath = join(this.tasksDir, event.filename);
          
          // Wait a moment for file to be fully written
          await sleep(100);
          
          if (existsSync(taskPath)) {
            log(`📥 New task detected: ${event.filename}`);
            this.taskQueue.push(taskPath);
          }
        }
      }
    } catch (error) {
      log(`❌ File watcher error: ${error}`, 'error');
    }
  }

  /**
   * Process a single task file
   */
  private async processTask(taskPath: string): Promise<void> {
    try {
      log(`🔄 Processing: ${taskPath}`);
      
      // Read and parse task
      const taskData = readFileSync(taskPath, 'utf-8');
      const task: ClaudeTask = JSON.parse(taskData);
      
      // Validate task
      if (!this.isValidTask(task)) {
        log(`❌ Invalid task format in ${taskPath}`, 'error');
        await this.writeErrorResult(task, 'Invalid task format');
        this.cleanupTaskFile(taskPath);
        return;
      }

      // Security check
      if (!this.isSafeCommand(task.cmd)) {
        log(`🚫 Unsafe command blocked: ${task.cmd}`, 'warn');
        await this.writeErrorResult(task, 'Command blocked for security reasons');
        this.cleanupTaskFile(taskPath);
        return;
      }

      // Execute task
      const result = await this.taskRunner.run(task);
      
      // Clean up task file on completion
      this.cleanupTaskFile(taskPath);
      
    } catch (error) {
      log(`❌ Error processing task ${taskPath}: ${error}`, 'error');
      
      try {
        // Try to read task for error result
        const taskData = readFileSync(taskPath, 'utf-8');
        const task: ClaudeTask = JSON.parse(taskData);
        await this.writeErrorResult(task, `Processing error: ${error}`);
      } catch (cleanupError) {
        log(`❌ Error during cleanup: ${cleanupError}`, 'error');
      }
      
      this.cleanupTaskFile(taskPath);
    }
  }

  /**
   * Validate task structure
   */
  private isValidTask(task: any): task is ClaudeTask {
    return (
      typeof task === 'object' &&
      typeof task.id === 'string' &&
      task.id.length > 0 &&
      task.type === 'run-command' &&
      typeof task.cmd === 'string' &&
      task.cmd.length > 0
    );
  }

  /**
   * Security check for command safety
   */
  private isSafeCommand(cmd: string): boolean {
    const dangerousPatterns = [
      /rm\s+-rf/,           // Dangerous file deletion
      /sudo/,               // Privilege escalation
      /chmod\s+\+x/,        // Making files executable
      /npm\s+install/,      // Package installation
      /pnpm\s+install/,     // Package installation
      /yarn\s+install/,     // Package installation
      /pip\s+install/,      // Python package installation
      /curl.*\|\s*sh/,      // Pipe to shell
      /wget.*\|\s*sh/,      // Pipe to shell
      />\s*\/dev\/sd/,      // Writing to disk devices
      /mkfs/,               // Format filesystem
      /dd\s+if=/,           // Disk operations
      /fdisk/,              // Disk partitioning
      /mount/,              // Mount operations
      /umount/,             // Unmount operations
    ];

    // Check against dangerous patterns first
    for (const pattern of dangerousPatterns) {
      if (pattern.test(cmd)) {
        return false;
      }
    }

    // Safe command patterns (comprehensive test patterns)
    const safePatterns = [
      /^dev\s+test(\s|$)/,                             // dev test command
      /^\.\/dev\s+test(\s|$)/,                         // ./dev test command
      /^pnpm.*test.*/, // pnpm test with any args
      /^pnpm\s+(test|lint|typecheck|build|clean)(\s|$)/, // Other pnpm commands
      /^npm\s+(test|run\s+\w+)(\s|$)/,                 // npm commands
      /^cd .* && pnpm test/,                           // cd + pnpm test
      /^tsx .*/,                                       // tsx scripts
      /^node .*/,                                      // node scripts
      /^echo\s+/,                                      // Echo commands
      /^ls(\s|$)/,                                     // List files
      /^pwd(\s|$)/,                                    // Print working directory
      /^cat\s+[\w\-\/\.]+$/,                          // Read files
      /^find\s+[\w\-\/\.]+\s+-name\s+[\w\*\.]+$/,    // Find files
      /^grep\s+/,                                      // Grep search
      /^head\s+/,                                      // Head command
      /^tail\s+/,                                      // Tail command
      /^wc\s+/,                                        // Word count
      /^vitest\s+/,                                    // Vitest directly
    ];

    return safePatterns.some(pattern => pattern.test(cmd));
  }

  /**
   * Write error result for failed tasks
   */
  private async writeErrorResult(task: ClaudeTask, error: string): Promise<void> {
    try {
      const errorResult: ClaudeResult = {
        id: task.id,
        cmd: task.cmd,
        startTime: new Date().toISOString(),
        durationMs: 0,
        exitCode: null,
        status: 'error',
        error
      };

      // Use TaskRunner to write consistent result format
      await this.taskRunner.run({
        id: task.id,
        type: 'run-command',
        cmd: 'echo "Error: Task failed validation"'
      });
      
    } catch (writeError) {
      log(`❌ Failed to write error result: ${writeError}`, 'error');
    }
  }

  /**
   * Clean up processed task file
   */
  private cleanupTaskFile(taskPath: string): void {
    try {
      if (existsSync(taskPath)) {
        unlinkSync(taskPath);
        log(`🗑️  Cleaned up task file: ${taskPath}`);
      }
    } catch (error) {
      log(`⚠️  Failed to cleanup task file ${taskPath}: ${error}`, 'warn');
    }
  }

  /**
   * Get current daemon status
   */
  getStatus(): {
    isRunning: boolean;
    isProcessing: boolean;
    queueLength: number;
    tasksDir: string;
    resultsDir: string;
  } {
    return {
      isRunning: this.isRunning,
      isProcessing: this.isProcessing,
      queueLength: this.taskQueue.length,
      tasksDir: this.tasksDir,
      resultsDir: this.resultsDir
    };
  }
}

// CLI interface
const isMain = 
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file://${process.cwd()}/${process.argv[1]}`;

if (isMain) {
  const daemon = new ClaudeDaemon();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    log('\\n🛑 Received SIGINT, shutting down gracefully...');
    await daemon.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    log('\\n🛑 Received SIGTERM, shutting down gracefully...');
    await daemon.stop();
    process.exit(0);
  });

  // Start daemon
  daemon.start().catch((error) => {
    log(`❌ Daemon failed to start: ${error}`, 'error');
    process.exit(1);
  });
}

export { ClaudeDaemon };