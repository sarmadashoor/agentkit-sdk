/**
 * Autonomous Task Runner
 * 
 * Executes subprocess commands with real-time log streaming,
 * timeout handling, and structured meta.json generation.
 * 
 * Key features:
 * - Real-time stdout/stderr streaming to separate log files
 * - No memory buffering for massive outputs
 * - Timeout handling with graceful/force kill
 * - Detailed lifecycle logging
 */

import { writeFileSync, createWriteStream, WriteStream } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { ChildProcess } from 'child_process';
import { ClaudeTask, ClaudeResult, ProcessResult, TaskExecutionOptions } from './schema.js';
import { safeSpawn, killProcess, log } from './utils.js';
import { config } from './config.js';

export class TaskRunner {
  private resultsDir: string;

  constructor(resultsDir: string) {
    this.resultsDir = resultsDir;
  }

  /**
   * Execute a single task with real-time log streaming
   */
  async run(task: ClaudeTask, options: TaskExecutionOptions = {}): Promise<ClaudeResult> {
    const startTime = new Date().toISOString();
    const startTimestamp = Date.now();
    
    log(`🚀 [${startTime}] Starting task: ${task.id}`);
    if (config.verbose) {
      log(`📝 Command: ${task.cmd}`);
    }

    // Set up log file paths
    const stdoutPath = join(this.resultsDir, `${task.id}.stdout.log`);
    const stderrPath = join(this.resultsDir, `${task.id}.stderr.log`);
    const metaPath = join(this.resultsDir, `${task.id}.meta.json`);

    try {
      // Execute the command with real-time streaming
      const processResult = await this.executeCommandWithStreaming(
        task.cmd,
        stdoutPath,
        stderrPath,
        task.timeout || options.timeout || config.taskTimeoutMs,
        task
      );

      const endTime = new Date().toISOString();
      const durationMs = Date.now() - startTimestamp;
      
      // Determine status based on results
      let status: 'success' | 'timeout' | 'error';
      let error: string | undefined;

      if (processResult.timedOut) {
        status = 'timeout';
        error = 'Process exceeded timeout limit';
      } else if (processResult.exitCode === null) {
        status = 'error';
        error = 'Process failed to execute';
      } else if (processResult.exitCode === 0) {
        status = 'success';
      } else {
        status = 'error';
        error = `Process exited with code ${processResult.exitCode}`;
      }

      // Create result object
      const result: ClaudeResult = {
        id: task.id,
        cmd: task.cmd,
        startTime,
        endTime,
        durationMs,
        exitCode: processResult.exitCode,
        status,
        error
      };

      // Write meta.json
      await this.writeMeta(metaPath, result);

      // Log completion
      const statusEmoji = {
        success: '✅',
        timeout: '⏰',
        error: '❌'
      }[status];

      log(`${statusEmoji} [${endTime}] Task ${task.id} completed: ${status} (${durationMs}ms)`);
      log(`📁 [${endTime}] Logs written: ${stdoutPath}, ${stderrPath}`);
      log(`📊 [${endTime}] Meta written: ${metaPath}`);

      return result;

    } catch (error) {
      const endTime = new Date().toISOString();
      const durationMs = Date.now() - startTimestamp;
      
      const result: ClaudeResult = {
        id: task.id,
        cmd: task.cmd,
        startTime,
        endTime,
        durationMs,
        exitCode: null,
        status: 'error',
        error: `Execution failed: ${error}`
      };

      // Write error result
      await this.writeMeta(metaPath, result);
      
      // Write error to stderr log
      try {
        await writeFile(stderrPath, `# Execution Error\n${error}\n`);
        await writeFile(stdoutPath, `# Task failed to execute\n`);
      } catch (writeError) {
        log(`❌ Failed to write error logs: ${writeError}`, 'error');
      }

      log(`💥 [${endTime}] Task ${task.id} failed with error: ${error}`);
      
      return result;
    }
  }

  /**
   * Execute command with real-time streaming to log files
   */
  private executeCommandWithStreaming(
    cmd: string,
    stdoutPath: string,
    stderrPath: string,
    timeoutMs: number,
    task: ClaudeTask
  ): Promise<ProcessResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      log(`🎯 [${new Date().toISOString()}] Command launched: ${task.id}`);
      
      // Create write streams for real-time logging
      let stdoutStream: WriteStream | null = null;
      let stderrStream: WriteStream | null = null;
      
      try {
        stdoutStream = createWriteStream(stdoutPath, { flags: 'w' });
        stderrStream = createWriteStream(stderrPath, { flags: 'w' });
        
        // Write headers to log files
        stdoutStream.write(`# Task: ${task.id}\n`);
        stdoutStream.write(`# Command: ${task.cmd}\n`);
        stdoutStream.write(`# Started: ${new Date().toISOString()}\n`);
        stdoutStream.write(`# Timeout: ${timeoutMs}ms\n`);
        stdoutStream.write(`\n=== STDOUT ===\n`);
        
        stderrStream.write(`# Task: ${task.id}\n`);
        stderrStream.write(`# Command: ${task.cmd}\n`);
        stderrStream.write(`# Started: ${new Date().toISOString()}\n`);
        stderrStream.write(`\n=== STDERR ===\n`);
      } catch (streamError) {
        log(`❌ Failed to create log streams: ${streamError}`, 'error');
        return resolve({
          stdout: '',
          stderr: `Failed to create log streams: ${streamError}`,
          exitCode: null,
          timedOut: false,
          duration: 0
        });
      }
      
      // Spawn the process
      const child = safeSpawn(cmd, {
        shell: (task as any).shell !== undefined ? (task as any).shell : false
      });
      
      let timedOut = false;
      let finished = false;
      let hasStdout = false;
      let hasStderr = false;

      // Stream stdout to file and optionally to console
      if (child.stdout && stdoutStream) {
        child.stdout.on('data', (data) => {
          const dataStr = data.toString();
          stdoutStream!.write(dataStr);
          hasStdout = true;
          
          if (config.verbose) {
            // Echo to console with prefix
            const lines = dataStr.split('\n');
            lines.forEach(line => {
              if (line.trim()) {
                console.log(`[${task.id}] ${line}`);
              }
            });
          }
        });
      }

      // Stream stderr to file and optionally to console
      if (child.stderr && stderrStream) {
        child.stderr.on('data', (data) => {
          const dataStr = data.toString();
          stderrStream!.write(dataStr);
          hasStderr = true;
          
          if (config.verbose) {
            // Echo to console with prefix
            const lines = dataStr.split('\n');
            lines.forEach(line => {
              if (line.trim()) {
                console.error(`[${task.id}:err] ${line}`);
              }
            });
          }
        });
      }

      log(`📡 [${new Date().toISOString()}] Stdout/stderr piping confirmed: ${task.id}`);

      // Set up timeout with graceful -> force kill sequence
      const timeout = setTimeout(() => {
        if (!finished) {
          const timeoutTime = new Date().toISOString();
          log(`⏰ [${timeoutTime}] Task timed out after ${timeoutMs}ms, sending SIGTERM: ${task.id}`);
          timedOut = true;
          
          // Write timeout message to stderr log
          if (stderrStream) {
            stderrStream.write(`\n\n# TIMEOUT after ${timeoutMs}ms\n`);
          }
          
          killProcess(child);
          
          // Force kill after grace period
          setTimeout(() => {
            if (!finished) {
              log(`🔪 [${new Date().toISOString()}] Force killing process with SIGKILL: ${task.id}`);
              if (stderrStream) {
                stderrStream.write(`# FORCE KILLED\n`);
              }
              killProcess(child, { force: true });
            }
          }, config.killGracePeriodMs);
        }
      }, timeoutMs);

      // Handle process completion
      child.on('close', (exitCode) => {
        if (finished) return;
        finished = true;
        
        const endTime = new Date().toISOString();
        clearTimeout(timeout);
        
        const duration = Date.now() - startTime;
        
        // Close streams
        if (stdoutStream) {
          stdoutStream.write(`\n\n# Completed: ${endTime}\n`);
          stdoutStream.write(`# Duration: ${duration}ms\n`);
          stdoutStream.write(`# Exit Code: ${exitCode}\n`);
          stdoutStream.end();
        }
        
        if (stderrStream) {
          stderrStream.write(`\n\n# Completed: ${endTime}\n`);
          stderrStream.write(`# Duration: ${duration}ms\n`);
          stderrStream.write(`# Exit Code: ${exitCode}\n`);
          stderrStream.end();
        }

        log(`🏁 [${endTime}] Command exited: ${task.id} (code: ${exitCode}, duration: ${duration}ms)`);

        resolve({
          stdout: hasStdout ? '(streamed to file)' : '(no output)',
          stderr: hasStderr ? '(streamed to file)' : '(no output)',
          exitCode: timedOut ? null : exitCode,
          timedOut,
          duration
        });
      });

      // Handle process errors
      child.on('error', (error) => {
        if (finished) return;
        finished = true;
        
        const errorTime = new Date().toISOString();
        clearTimeout(timeout);
        
        const duration = Date.now() - startTime;
        
        // Write error to stderr stream
        if (stderrStream) {
          stderrStream.write(`\n\n# PROCESS ERROR: ${error.message}\n`);
          stderrStream.write(`# Error Time: ${errorTime}\n`);
          stderrStream.end();
        }
        
        if (stdoutStream) {
          stdoutStream.write(`\n\n# Process failed to start\n`);
          stdoutStream.end();
        }

        log(`💥 [${errorTime}] Process error for ${task.id}: ${error.message}`);

        resolve({
          stdout: '(process failed)',
          stderr: `Process error: ${error.message}`,
          exitCode: null,
          timedOut: false,
          duration
        });
      });
    });
  }

  /**
   * Write meta.json file with structured task results
   */
  private async writeMeta(metaPath: string, result: ClaudeResult): Promise<void> {
    try {
      const metaContent = JSON.stringify(result, null, 2);
      await writeFile(metaPath, metaContent);
      
      if (config.verbose) {
        log(`📊 Meta file written: ${metaPath}`);
      }
    } catch (error) {
      log(`❌ Failed to write meta file ${metaPath}: ${error}`, 'error');
      throw error;
    }
  }
}