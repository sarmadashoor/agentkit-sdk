/**
 * Autonomous Task Runner
 * 
 * Encapsulates subprocess execution with timeout handling, 
 * output capture, and structured result generation.
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { ChildProcess } from 'child_process';
import { ClaudeTask, ClaudeResult, ProcessResult, TaskExecutionOptions } from './schema.js';
import { safeSpawn, killProcess, log } from './utils.js';

export class TaskRunner {
  private resultsDir: string;

  constructor(resultsDir: string) {
    this.resultsDir = resultsDir;
  }

  /**
   * Execute a single task and generate results
   */
  async run(task: ClaudeTask, options: TaskExecutionOptions = {}): Promise<ClaudeResult> {
    const startTime = new Date().toISOString();
    const startTimestamp = Date.now();
    
    log(`🚀 Starting task: ${task.id}`);
    log(`📝 Command: ${task.cmd}`);

    try {
      // Execute the command
      const processResult = await this.executeCommand(
        task.cmd, 
        task.timeout || options.timeout || 60000
      );

      const durationMs = Date.now() - startTimestamp;
      
      // Determine status based on results
      let status: 'pass' | 'fail' | 'timeout' | 'error';
      let error: string | undefined;

      if (processResult.timedOut) {
        status = 'timeout';
        error = 'Process exceeded timeout limit';
      } else if (processResult.exitCode === null) {
        status = 'error';
        error = 'Process failed to execute';
      } else if (processResult.exitCode === 0) {
        status = 'pass';
      } else {
        status = 'fail';
        error = `Process exited with code ${processResult.exitCode}`;
      }

      // Create result object
      const result: ClaudeResult = {
        id: task.id,
        cmd: task.cmd,
        startTime,
        durationMs,
        exitCode: processResult.exitCode,
        status,
        error
      };

      // Write output files
      await this.writeResults(task.id, result, processResult);

      // Log completion
      const statusEmoji = {
        pass: '✅',
        fail: '❌',
        timeout: '⏰',
        error: '💥'
      }[status];

      log(`${statusEmoji} Task ${task.id} completed: ${status} (${durationMs}ms)`);

      return result;

    } catch (error) {
      const durationMs = Date.now() - startTimestamp;
      
      const result: ClaudeResult = {
        id: task.id,
        cmd: task.cmd,
        startTime,
        durationMs,
        exitCode: null,
        status: 'error',
        error: `Execution failed: ${error}`
      };

      // Write error result
      await this.writeResults(task.id, result, {
        stdout: '',
        stderr: `Execution error: ${error}`,
        exitCode: null,
        timedOut: false,
        duration: durationMs
      });

      log(`💥 Task ${task.id} failed with error: ${error}`);
      
      return result;
    }
  }

  /**
   * Execute command with timeout and output capture
   */
  private executeCommand(cmd: string, timeoutMs: number): Promise<ProcessResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      // Spawn the process
      const child = safeSpawn(cmd);
      
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let finished = false;

      // Collect stdout
      if (child.stdout) {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
      }

      // Collect stderr
      if (child.stderr) {
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      // Set up timeout with graceful -> force kill sequence
      const timeout = setTimeout(() => {
        if (!finished) {
          log(`⏰ Task timed out after ${timeoutMs}ms, sending SIGTERM`);
          timedOut = true;
          killProcess(child);
          
          // Force kill after additional delay
          setTimeout(() => {
            if (!finished) {
              log(`🔪 Force killing process with SIGKILL`);
              killProcess(child, { force: true });
            }
          }, 5000);
        }
      }, timeoutMs);

      // Handle process completion
      child.on('close', (exitCode) => {
        if (finished) return;
        finished = true;
        
        clearTimeout(timeout);
        
        const duration = Date.now() - startTime;

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: timedOut ? null : exitCode,
          timedOut,
          duration
        });
      });

      // Handle process errors
      child.on('error', (error) => {
        if (finished) return;
        finished = true;
        
        clearTimeout(timeout);
        
        const duration = Date.now() - startTime;

        resolve({
          stdout: stdout.trim(),
          stderr: `Process error: ${error.message}\\n${stderr}`.trim(),
          exitCode: null,
          timedOut: false,
          duration
        });
      });
    });
  }

  /**
   * Write task results to separate .status.json and .log files
   */
  private async writeResults(
    taskId: string, 
    result: ClaudeResult, 
    processResult: ProcessResult
  ): Promise<void> {
    try {
      // Write status file
      const statusPath = join(this.resultsDir, `${taskId}.status.json`);
      writeFileSync(statusPath, JSON.stringify(result, null, 2));

      // Write log file with full output
      const logPath = join(this.resultsDir, `${taskId}.log`);
      const logContent = [
        `=== Task Execution Log ===`,
        `Task ID: ${taskId}`,
        `Command: ${result.cmd}`,
        `Start Time: ${result.startTime}`,
        `Duration: ${result.durationMs}ms`,
        `Exit Code: ${result.exitCode}`,
        `Status: ${result.status}`,
        ...(result.error ? [`Error: ${result.error}`] : []),
        ``,
        `=== STDOUT ===`,
        processResult.stdout || '(no stdout)',
        ``,
        `=== STDERR ===`,
        processResult.stderr || '(no stderr)',
        ``
      ].join('\\n');

      writeFileSync(logPath, logContent);

      log(`📁 Results written: ${statusPath}, ${logPath}`);

    } catch (error) {
      log(`❌ Failed to write results for task ${taskId}: ${error}`, 'error');
    }
  }
}