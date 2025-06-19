#!/usr/bin/env node

/**
 * Claude Automation Daemon
 * 
 * Long-running TypeScript watcher that monitors claude/tasks/ for JSON task files,
 * executes shell commands, and writes results to claude/results/
 */

import { watch } from 'fs/promises'
import { existsSync, readFileSync, unlinkSync, mkdirSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { runShellCommand } from './taskRunner.js'
import { writeJsonFile, generateTimestamp, log } from './utils.js'

interface Task {
  id: string
  type: 'run-command'
  cmd: string
  timeout?: number
  description?: string
}

interface TaskResult {
  taskId: string
  cmd: string
  startTime: string
  endTime: string
  duration: number
  stdout: string
  stderr: string
  exitCode: number
  success: boolean
  error?: string
  timestamp: string
}

class ClaudeDaemon {
  private isRunning = false
  private tasksDir: string
  private resultsDir: string

  constructor() {
    this.tasksDir = resolve('./claude/tasks')
    this.resultsDir = resolve('./claude/results')
    
    // Ensure directories exist
    if (!existsSync(this.tasksDir)) {
      mkdirSync(this.tasksDir, { recursive: true })
    }
    if (!existsSync(this.resultsDir)) {
      mkdirSync(this.resultsDir, { recursive: true })
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      log('Daemon is already running')
      return
    }

    this.isRunning = true
    log('🤖 Claude Daemon started - monitoring tasks directory...')
    log(`📁 Tasks: ${this.tasksDir}`)
    log(`📊 Results: ${this.resultsDir}`)

    // Process any existing tasks first
    await this.processExistingTasks()

    // Start watching for new tasks
    try {
      const watcher = watch(this.tasksDir, { recursive: false })
      for await (const event of watcher) {
        if (!this.isRunning) break
        
        if (event.eventType === 'rename' && event.filename?.endsWith('.json')) {
          const taskPath = join(this.tasksDir, event.filename)
          
          // Wait a moment for file to be fully written
          await new Promise(resolve => setTimeout(resolve, 100))
          
          if (existsSync(taskPath)) {
            await this.processTask(taskPath)
          }
        }
      }
    } catch (error) {
      log(`❌ Watcher error: ${error}`)
      this.isRunning = false
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false
    log('🛑 Claude Daemon stopped')
  }

  private async processExistingTasks(): Promise<void> {
    try {
      const files = readdirSync(this.tasksDir)
      const taskFiles = files.filter((f: string) => f.endsWith('.json'))
      
      if (taskFiles.length > 0) {
        log(`📋 Found ${taskFiles.length} existing task(s) to process`)
        
        for (const file of taskFiles) {
          const taskPath = join(this.tasksDir, file)
          await this.processTask(taskPath)
        }
      }
    } catch (error) {
      log(`❌ Error processing existing tasks: ${error}`)
    }
  }

  private async processTask(taskPath: string): Promise<void> {
    try {
      log(`🔄 Processing task: ${taskPath}`)
      
      // Read and parse task
      const taskData = readFileSync(taskPath, 'utf-8')
      const task: Task = JSON.parse(taskData)
      
      // Validate task
      if (!this.isValidTask(task)) {
        log(`❌ Invalid task format in ${taskPath}`)
        return
      }

      // Security check - only allow safe commands
      if (!this.isSafeCommand(task.cmd)) {
        log(`🚫 Unsafe command blocked: ${task.cmd}`)
        await this.writeErrorResult(task, 'Command blocked for security reasons')
        unlinkSync(taskPath)
        return
      }

      log(`▶️  Executing: ${task.cmd}`)
      const startTime = new Date().toISOString()
      
      // Execute command
      const result = await runShellCommand(task.cmd, task.timeout)
      
      // Create result object
      const taskResult: TaskResult = {
        taskId: task.id,
        cmd: task.cmd,
        startTime,
        endTime: result.endTime,
        duration: result.duration,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        success: result.exitCode === 0,
        timestamp: generateTimestamp()
      }

      // Write result
      const resultPath = join(this.resultsDir, `${task.id}-${generateTimestamp()}.json`)
      await writeJsonFile(resultPath, taskResult)
      
      // Log outcome
      if (taskResult.success) {
        log(`✅ Task ${task.id} completed successfully (${result.duration}ms)`)
      } else {
        log(`❌ Task ${task.id} failed with exit code ${result.exitCode}`)
      }

      // Remove processed task
      unlinkSync(taskPath)
      
    } catch (error) {
      log(`❌ Error processing task ${taskPath}: ${error}`)
      
      try {
        // Try to read task for error result
        const taskData = readFileSync(taskPath, 'utf-8')
        const task: Task = JSON.parse(taskData)
        await this.writeErrorResult(task, `Processing error: ${error}`)
        unlinkSync(taskPath)
      } catch (cleanupError) {
        log(`❌ Error during cleanup: ${cleanupError}`)
      }
    }
  }

  private isValidTask(task: any): task is Task {
    return (
      typeof task === 'object' &&
      typeof task.id === 'string' &&
      task.id.length > 0 &&
      task.type === 'run-command' &&
      typeof task.cmd === 'string' &&
      task.cmd.length > 0
    )
  }

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
    ]

    // Check against dangerous patterns first
    for (const pattern of dangerousPatterns) {
      if (pattern.test(cmd)) {
        return false
      }
    }

    // Test-related command patterns (flexible and comprehensive)
    const safePatterns = [
      /^pnpm( run)?( --filter=[^ ]+)? test/,           // pnpm test variations
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
    ]

    return safePatterns.some(pattern => pattern.test(cmd))
  }

  private async writeErrorResult(task: Task, error: string): Promise<void> {
    const errorResult: TaskResult = {
      taskId: task.id,
      cmd: task.cmd,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: 0,
      stdout: '',
      stderr: error,
      exitCode: -1,
      success: false,
      error,
      timestamp: generateTimestamp()
    }

    const resultPath = join(this.resultsDir, `${task.id}-error-${generateTimestamp()}.json`)
    await writeJsonFile(resultPath, errorResult)
  }
}

// CLI interface
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file://${process.cwd()}/${process.argv[1]}`;

if (isMain) {
  const daemon = new ClaudeDaemon()
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    log('\n🛑 Received SIGINT, shutting down gracefully...')
    await daemon.stop()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    log('\n🛑 Received SIGTERM, shutting down gracefully...')
    await daemon.stop()
    process.exit(0)
  })

  // Start daemon
  daemon.start().catch((error) => {
    log(`❌ Daemon failed to start: ${error}`)
    process.exit(1)
  })
}

export { ClaudeDaemon }