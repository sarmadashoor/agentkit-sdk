/**
 * Test Workspace Helper Functions
 * 
 * Provides utilities for managing test workspaces without using process.chdir()
 * Safe for use in worker environments and CI systems.
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { rm } from 'fs/promises'

export interface WorkspaceContext {
  path: string
  cleanup: () => Promise<void>
}

/**
 * Creates an isolated test workspace
 */
export async function createTestWorkspace(prefix: string = 'agentkit-test-'): Promise<WorkspaceContext> {
  const workspacePath = await fs.mkdtemp(join(tmpdir(), prefix))
  
  return {
    path: workspacePath,
    cleanup: async () => {
      try {
        await rm(workspacePath, { recursive: true, force: true })
      } catch (error) {
        // Ignore cleanup errors
        console.warn(`Failed to cleanup test workspace: ${error}`)
      }
    }
  }
}

/**
 * Executes a command in a specific directory without changing process.cwd()
 */
export interface ExecOptions {
  cwd?: string
  encoding?: BufferEncoding
  timeout?: number
  stdio?: 'pipe' | 'inherit' | 'ignore'
  env?: Record<string, string>
}

/**
 * Safe file operations that don't rely on process.cwd()
 */
export class SafeFileOps {
  private basePath: string

  constructor(basePath: string) {
    this.basePath = basePath
  }

  /**
   * Write file relative to base path
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = join(this.basePath, relativePath)
    await fs.mkdir(join(fullPath, '..'), { recursive: true })
    await fs.writeFile(fullPath, content, 'utf8')
  }

  /**
   * Read file relative to base path
   */
  async readFile(relativePath: string): Promise<string> {
    const fullPath = join(this.basePath, relativePath)
    return await fs.readFile(fullPath, 'utf8')
  }

  /**
   * Check if file exists relative to base path
   */
  async exists(relativePath: string): Promise<boolean> {
    const fullPath = join(this.basePath, relativePath)
    try {
      await fs.access(fullPath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Create directory relative to base path
   */
  async mkdir(relativePath: string): Promise<void> {
    const fullPath = join(this.basePath, relativePath)
    await fs.mkdir(fullPath, { recursive: true })
  }

  /**
   * Get absolute path for relative path
   */
  resolve(relativePath: string): string {
    return join(this.basePath, relativePath)
  }
}

/**
 * Environment variable management helper
 */
export class TestEnvironment {
  private originalEnv: Record<string, string | undefined> = {}

  /**
   * Set environment variable and remember original value
   */
  set(key: string, value: string): void {
    if (!(key in this.originalEnv)) {
      this.originalEnv[key] = process.env[key]
    }
    process.env[key] = value
  }

  /**
   * Remove environment variable and remember original value
   */
  remove(key: string): void {
    if (!(key in this.originalEnv)) {
      this.originalEnv[key] = process.env[key]
    }
    delete process.env[key]
  }

  /**
   * Restore all modified environment variables
   */
  restore(): void {
    for (const [key, value] of Object.entries(this.originalEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    this.originalEnv = {}
  }
}