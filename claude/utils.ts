/**
 * Utility Functions for Claude Automation Runner
 * 
 * Helper functions for file operations, timestamps, and logging
 */

import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * Generate a timestamp string suitable for filenames
 * Format: YYYYMMDD-HHMMSS-mmm
 */
export function generateTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0')
  
  return `${year}${month}${day}-${hours}${minutes}${seconds}-${milliseconds}`
}

/**
 * Generate an ISO timestamp string
 */
export function generateISOTimestamp(): string {
  return new Date().toISOString()
}

/**
 * Write an object to a JSON file with pretty formatting
 * @param filePath Path to write the file
 * @param data Object to serialize
 */
export async function writeJsonFile(filePath: string, data: any): Promise<void> {
  try {
    const jsonString = JSON.stringify(data, null, 2)
    writeFileSync(filePath, jsonString, 'utf-8')
  } catch (error) {
    throw new Error(`Failed to write JSON file ${filePath}: ${error}`)
  }
}

/**
 * Read and parse a JSON file
 * @param filePath Path to read from
 * @returns Parsed JSON object
 */
export function readJsonFile<T = any>(filePath: string): T {
  try {
    if (!existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`)
    }
    
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    throw new Error(`Failed to read JSON file ${filePath}: ${error}`)
  }
}

/**
 * Log a message with timestamp
 * @param message Message to log
 * @param level Log level (info, warn, error)
 */
export function log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  const timestamp = new Date().toISOString()
  const prefix = {
    info: '📝',
    warn: '⚠️ ',
    error: '❌'
  }[level]
  
  console.log(`[${timestamp}] ${prefix} ${message}`)
}

/**
 * Log an object as formatted JSON
 * @param obj Object to log
 * @param label Optional label for the object
 */
export function logObject(obj: any, label?: string): void {
  const timestamp = new Date().toISOString()
  const labelText = label ? `${label}: ` : ''
  console.log(`[${timestamp}] 📋 ${labelText}${JSON.stringify(obj, null, 2)}`)
}

/**
 * Format duration in milliseconds to human-readable string
 * @param ms Duration in milliseconds
 * @returns Formatted duration string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`
  } else if (ms < 3600000) {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  } else {
    const hours = Math.floor(ms / 3600000)
    const minutes = Math.floor((ms % 3600000) / 60000)
    return `${hours}h ${minutes}m`
  }
}

/**
 * Format file size in bytes to human-readable string
 * @param bytes Size in bytes
 * @returns Formatted size string
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  
  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`
}

/**
 * Truncate text to a maximum length with ellipsis
 * @param text Text to truncate
 * @param maxLength Maximum length
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  
  return text.substring(0, maxLength - 3) + '...'
}

/**
 * Sanitize a string to be safe for use in filenames
 * @param input Input string
 * @returns Sanitized filename-safe string
 */
export function sanitizeFilename(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9\-_\.]/g, '-')  // Replace invalid chars with hyphens
    .replace(/-+/g, '-')                  // Collapse multiple hyphens
    .replace(/^-|-$/g, '')               // Remove leading/trailing hyphens
    .toLowerCase()
}

/**
 * Create a unique task ID
 * @param prefix Optional prefix for the ID
 * @returns Unique task ID
 */
export function generateTaskId(prefix: string = 'task'): string {
  const timestamp = generateTimestamp()
  const random = Math.random().toString(36).substring(2, 8)
  return `${prefix}-${timestamp}-${random}`
}

/**
 * Parse command line output for common patterns
 * @param output Command output string
 * @returns Parsed information object
 */
export function parseCommandOutput(output: string): {
  lines: string[]
  errors: string[]
  warnings: string[]
  hasErrors: boolean
  hasWarnings: boolean
} {
  const lines = output.split('\n').map(line => line.trim()).filter(line => line.length > 0)
  
  const errors = lines.filter(line => 
    line.toLowerCase().includes('error') ||
    line.toLowerCase().includes('failed') ||
    line.toLowerCase().includes('exception')
  )
  
  const warnings = lines.filter(line =>
    line.toLowerCase().includes('warn') ||
    line.toLowerCase().includes('deprecated')
  )
  
  return {
    lines,
    errors,
    warnings,
    hasErrors: errors.length > 0,
    hasWarnings: warnings.length > 0
  }
}

/**
 * Sleep for a specified number of milliseconds
 * @param ms Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retry attempts
 * @param baseDelay Base delay in milliseconds
 * @returns Promise with the result
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      
      if (attempt === maxRetries) {
        break
      }
      
      const delay = baseDelay * Math.pow(2, attempt)
      log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms: ${error}`, 'warn')
      await sleep(delay)
    }
  }
  
  throw lastError!
}