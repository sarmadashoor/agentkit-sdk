#!/usr/bin/env node

/**
 * Autonomous Claude Test Daemon
 * 
 * Monitors /tasks directory for JSON task files, executes them one at a time,
 * with real-time log streaming and autonomous debugging support.
 * 
 * Key features:
 * - Sequential task execution (one at a time)
 * - Real-time stdout/stderr streaming to separate files
 * - Timeout handling with graceful/force kill
 * - Structured meta.json output per task
 * - Support for massive log outputs without memory buffering
 * - Detailed lifecycle logging with timestamps
 */

import { watch } from 'fs/promises';
import { existsSync, readFileSync, unlinkSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { ClaudeTask, ClaudeResult } from './schema.js';
import { TaskRunner } from './taskRunner.js';
import { log, sleep } from './utils.js';
import { config } from './config.js';

export class ClaudeDaemon {
  private isRunning = false;
  private isProcessing = false;
  private tasksDir: string;
  private resultsDir: string;
  private taskRunner: TaskRunner;
  private taskQueue: string[] = [];

  constructor() {
    this.tasksDir = resolve(config.tasksDir);
    this.resultsDir = resolve(config.resultsDir);
    this.taskRunner = new TaskRunner(this.resultsDir);
    
    // Ensure directories exist
    this.ensureDirectories();
    // Setup error handlers to prevent crashes
    this.setupErrorHandlers();
  }

  /**
   * Handle uncaught exceptions to prevent daemon crashes
   */
  private setupErrorHandlers(): void {
    process.on('uncaughtException', (error) => {
      log(`❌ [${new Date().toISOString()}] Uncaught Exception: ${error}`, 'error');
      log(`❌ Stack: ${error.stack}`, 'error');
      // Don't exit - keep daemon running
    });

    process.on('unhandledRejection', (reason, promise) => {
      log(`❌ [${new Date().toISOString()}] Unhandled Rejection at:`, 'error');
      log(`❌ Promise: ${promise}`, 'error');
      log(`❌ Reason: ${reason}`, 'error');
      // Don't exit - keep daemon running
    });
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
    log(`⚙️  Verbose logging: ${config.verbose}`);
    log(`⏱️  Default timeout: ${config.taskTimeoutMs}ms`);
    log('🔄 Running tasks sequentially with real-time log streaming');

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
      const taskFiles = files.filter((f: string) => this.isValidTaskFile(f));
      
      if (taskFiles.length > 0) {
        log(`📋 Found ${taskFiles.length} existing task(s) to queue`);
        this.taskQueue.push(...taskFiles.map(f => join(this.tasksDir, f)));
      }
    } catch (error) {
      log(`❌ Error discovering tasks: ${error}`, 'error');
    }
  }

  /**
   * Check if a file is a valid task file to process
   */
  private isValidTaskFile(filename: string): boolean {
    // Must be a JSON file
    if (!filename.endsWith('.json')) {
      return false;
    }

    // Ignore hidden files
    if (filename.startsWith('.')) {
      return false;
    }

    // Ignore configured files
    if (config.ignoredFiles.includes(filename)) {
      return false;
    }

    // Ignore files with ignored extensions
    const hasIgnoredExt = config.ignoredExtensions.some(ext => 
      filename.endsWith(ext) || filename.includes(ext + '.'));
    if (hasIgnoredExt) {
      return false;
    }

    return true;
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
        await sleep(config.pollIntervalMs);
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
        
        if (event.eventType === 'rename' && event.filename && this.isValidTaskFile(event.filename)) {
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
    const startTime = new Date().toISOString();
    let task: any = null;
    
    try {
      log(`🔄 [${startTime}] Processing task: ${taskPath}`);
      
      // Read and parse task with error handling
      try {
        const taskData = readFileSync(taskPath, 'utf-8');
        task = JSON.parse(taskData);
        log(`📋 [${new Date().toISOString()}] Task JSON parsed successfully`);
      } catch (parseError) {
        log(`❌ [${new Date().toISOString()}] Failed to parse JSON in ${taskPath}: ${parseError}`, 'error');
        await this.writeErrorResult(
          { id: `invalid-${Date.now()}`, cmd: '', type: 'run-command' },
          `JSON parse error: ${parseError}`
        );
        return;
      }
      
      // Validate and normalize task
      if (!this.isValidTask(task)) {
        const taskId = task?.id || task?.taskId || `invalid-${Date.now()}`;
        log(`❌ [${new Date().toISOString()}] Invalid task format in ${taskPath}`, 'error');
        log(`📋 Task data: ${JSON.stringify(task, null, 2)}`);
        await this.writeErrorResult(
          { id: taskId, cmd: task?.cmd || '', type: 'run-command' },
          'Invalid task format - missing required fields: id, cmd'
        );
        return;
      }

      log(`📋 [${new Date().toISOString()}] Task loaded: ${task.id}`);
      if (config.verbose) {
        log(`💻 Command: ${task.cmd}`);
        log(`⏱️  Timeout: ${task.timeout || config.taskTimeoutMs}ms`);
      }

      // Security check
      if (!this.isSafeCommand(task.cmd)) {
        log(`🚫 [${new Date().toISOString()}] Unsafe command blocked: ${task.cmd}`, 'warn');
        await this.writeErrorResult(task, 'Command blocked for security reasons');
        return;
      }

      log(`🚀 [${new Date().toISOString()}] Starting task execution: ${task.id}`);
      
      // Execute task
      const result = await this.taskRunner.run(task);
      
      const endTime = new Date().toISOString();
      log(`✅ [${endTime}] Task completed: ${task.id} (${result.status})`);
      
      // Clean up task file only on successful completion
      if (result.status === 'success') {
        this.cleanupTaskFile(taskPath);
        log(`🗑️  [${endTime}] Task file cleaned up: ${taskPath}`);
      } else {
        log(`⚠️  [${endTime}] Task file preserved for inspection: ${taskPath}`);
      }
      
    } catch (error) {
      const errorTime = new Date().toISOString();
      log(`❌ [${errorTime}] Error processing task ${taskPath}: ${error}`, 'error');
      
      try {
        // Use task if we have it, otherwise create fallback
        const fallbackTask = task || { id: `error-${Date.now()}`, cmd: '', type: 'run-command' };
        await this.writeErrorResult(fallbackTask, `Processing error: ${error}`);
        log(`📝 [${errorTime}] Error result written for task: ${fallbackTask.id}`);
      } catch (cleanupError) {
        log(`❌ [${errorTime}] Error during error handling: ${cleanupError}`, 'error');
      }
      
      // Don't cleanup on error - leave for inspection
      log(`⚠️  [${errorTime}] Task file preserved for debugging: ${taskPath}`);
    }
  }

  /**
   * Validate task structure and normalize if needed
   */
  private isValidTask(task: any): task is ClaudeTask {
    if (typeof task !== 'object' || task === null) {
      return false;
    }

    // Normalize taskId to id if needed
    if (task.taskId && !task.id) {
      task.id = task.taskId;
    }

    // Set default type if missing
    if (!task.type) {
      task.type = 'run-command';
    }

    return (
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
  private async writeErrorResult(task: { id: string; cmd: string; type?: string }, error: string): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const errorResult: ClaudeResult = {
        id: task.id,
        cmd: task.cmd,
        startTime: timestamp,
        endTime: timestamp,
        durationMs: 0,
        exitCode: null,
        status: 'error',
        error
      };

      // Write meta.json using async writeFile
      const metaPath = join(this.resultsDir, `${task.id}.meta.json`);
      const metaContent = JSON.stringify(errorResult, null, 2);
      try {
        await writeFile(metaPath, metaContent);
        log(`📝 [${timestamp}] Meta file written: ${metaPath}`);
      } catch (metaError) {
        log(`❌ Failed to write meta file ${metaPath}: ${metaError}`, 'error');
      }
      
      // Write log files using async writeFile
      const stdoutPath = join(this.resultsDir, `${task.id}.stdout.log`);
      const stderrPath = join(this.resultsDir, `${task.id}.stderr.log`);
      
      try {
        await writeFile(stdoutPath, `# Task failed during validation\n# Error: ${error}\n`);
        log(`📝 [${timestamp}] Stdout log written: ${stdoutPath}`);
      } catch (stdoutError) {
        log(`❌ Failed to write stdout log ${stdoutPath}: ${stdoutError}`, 'error');
      }
      
      try {
        await writeFile(stderrPath, `# Validation Error: ${error}\n`);
        log(`📝 [${timestamp}] Stderr log written: ${stderrPath}`);
      } catch (stderrError) {
        log(`❌ Failed to write stderr log ${stderrPath}: ${stderrError}`, 'error');
      }
      
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

