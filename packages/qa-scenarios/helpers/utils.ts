/**
 * Utility functions for QA scenarios
 * 
 * Provides common helper functions used across multiple test scenarios.
 */

/**
 * Creates a unique test identifier
 */
export function createTestId(prefix: string = 'qa'): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `${prefix}-${timestamp}-${random}`
}

/**
 * Waits for a condition to be true with timeout
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<void> {
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  
  throw new Error(`Condition not met within ${timeoutMs}ms`)
}

/**
 * Creates a delayed promise for testing async operations
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Generates test data with specified structure
 */
export function generateTestData(type: 'agent' | 'plugin' | 'transport', options: Record<string, unknown> = {}): Record<string, unknown> {
  const baseData = {
    id: createTestId(type),
    timestamp: new Date().toISOString(),
    ...options
  }
  
  switch (type) {
    case 'agent':
      return {
        ...baseData,
        name: `test-agent-${baseData.id}`,
        version: '1.0.0'
      }
    case 'plugin':
      return {
        ...baseData,
        name: `test-plugin-${baseData.id}`,
        hooks: ['onInit', 'onSend']
      }
    case 'transport':
      return {
        ...baseData,
        name: `test-transport-${baseData.id}`,
        protocol: 'dummy'
      }
    default:
      return baseData
  }
}

/**
 * Validates that an object has required properties
 */
export function validateStructure(obj: unknown, requiredProps: string[]): boolean {
  if (!obj || typeof obj !== 'object') {
    return false
  }
  
  const objRecord = obj as Record<string, unknown>
  return requiredProps.every(prop => prop in objRecord)
}

/**
 * Creates a mock console for capturing test output
 */
export function createMockConsole(): {
  console: Pick<Console, 'log' | 'error' | 'warn' | 'info'>
  logs: string[]
  errors: string[]
  clear: () => void
} {
  const logs: string[] = []
  const errors: string[] = []
  
  // Create a partial console mock for testing purposes
  const mockConsole = {
    log: (...args: unknown[]) => logs.push(args.join(' ')),
    error: (...args: unknown[]) => errors.push(args.join(' ')),
    warn: (...args: unknown[]) => logs.push(`WARN: ${args.join(' ')}`),
    info: (...args: unknown[]) => logs.push(`INFO: ${args.join(' ')}`)
  }
  
  return {
    console: mockConsole,
    logs,
    errors,
    clear: () => {
      logs.length = 0
      errors.length = 0
    }
  }
}