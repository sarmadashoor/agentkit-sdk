/**
 * Task Runner Module
 * 
 * Provides secure shell command execution with comprehensive result capture
 */

import { spawn } from 'child_process'
import { promisify } from 'util'

export interface ExecutionResult {
  stdout: string
  stderr: string
  exitCode: number
  startTime: string
  endTime: string
  duration: number
  timedOut: boolean
}

/**
 * Execute a shell command with comprehensive result capture
 * @param cmd Command to execute
 * @param timeoutMs Timeout in milliseconds (default: 60 seconds)
 * @returns Promise with execution results
 */
export async function runShellCommand(
  cmd: string, 
  timeoutMs: number = 60000
): Promise<ExecutionResult> {
  const startTime = new Date().toISOString()
  const startTimestamp = Date.now()

  return new Promise((resolve) => {
    // Parse command and arguments
    const [command, ...args] = cmd.trim().split(/\s+/)
    
    // Spawn the process
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false, // Security: avoid shell injection
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'development', // Safe default
        CI: 'false' // Avoid CI-specific behaviors
      }
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let finished = false

    // Collect stdout
    if (child.stdout) {
      child.stdout.on('data', (data) => {
        stdout += data.toString()
      })
    }

    // Collect stderr
    if (child.stderr) {
      child.stderr.on('data', (data) => {
        stderr += data.toString()
      })
    }

    // Set up timeout
    const timeout = setTimeout(() => {
      if (!finished) {
        timedOut = true
        child.kill('SIGTERM')
        
        // Force kill after additional delay
        setTimeout(() => {
          if (!finished) {
            child.kill('SIGKILL')
          }
        }, 5000)
      }
    }, timeoutMs)

    // Handle process completion
    child.on('close', (exitCode) => {
      if (finished) return
      finished = true
      
      clearTimeout(timeout)
      
      const endTime = new Date().toISOString()
      const duration = Date.now() - startTimestamp

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: timedOut ? -1 : (exitCode || 0),
        startTime,
        endTime,
        duration,
        timedOut
      })
    })

    // Handle process errors
    child.on('error', (error) => {
      if (finished) return
      finished = true
      
      clearTimeout(timeout)
      
      const endTime = new Date().toISOString()
      const duration = Date.now() - startTimestamp

      resolve({
        stdout: stdout.trim(),
        stderr: `Process error: ${error.message}\n${stderr}`.trim(),
        exitCode: -1,
        startTime,
        endTime,
        duration,
        timedOut: false
      })
    })
  })
}

/**
 * Execute multiple commands sequentially
 * @param commands Array of commands to execute
 * @param timeoutMs Timeout per command in milliseconds
 * @returns Promise with array of execution results
 */
export async function runShellCommands(
  commands: string[],
  timeoutMs: number = 60000
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = []
  
  for (const cmd of commands) {
    const result = await runShellCommand(cmd, timeoutMs)
    results.push(result)
    
    // Stop execution if a command fails
    if (result.exitCode !== 0) {
      break
    }
  }
  
  return results
}

/**
 * Execute a command and return only the success status
 * @param cmd Command to execute
 * @param timeoutMs Timeout in milliseconds
 * @returns Promise<boolean> indicating success
 */
export async function checkCommand(
  cmd: string,
  timeoutMs: number = 30000
): Promise<boolean> {
  try {
    const result = await runShellCommand(cmd, timeoutMs)
    return result.exitCode === 0 && !result.timedOut
  } catch (error) {
    return false
  }
}

/**
 * Execute a command and return stdout if successful
 * @param cmd Command to execute
 * @param timeoutMs Timeout in milliseconds
 * @returns Promise<string | null> stdout or null if failed
 */
export async function getCommandOutput(
  cmd: string,
  timeoutMs: number = 30000
): Promise<string | null> {
  try {
    const result = await runShellCommand(cmd, timeoutMs)
    return result.exitCode === 0 && !result.timedOut ? result.stdout : null
  } catch (error) {
    return null
  }
}