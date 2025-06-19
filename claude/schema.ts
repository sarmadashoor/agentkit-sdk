/**
 * Type definitions for Claude test automation system
 */

export interface ClaudeTask {
  id: string;
  type: 'run-command';
  cmd: string;
  timeout?: number;
  description?: string;
}

export interface ClaudeResult {
  id: string;
  cmd: string;
  startTime: string;
  durationMs: number;
  exitCode: number | null;
  status: 'pass' | 'fail' | 'timeout' | 'error';
  error?: string;
}

export type TaskStatus = 'pass' | 'fail' | 'timeout' | 'error';

export interface TaskExecutionOptions {
  timeout?: number;
  workingDirectory?: string;
  environment?: Record<string, string>;
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  duration: number;
}