/**
 * Sample plugins for QA testing
 * 
 * Provides test plugin implementations for validating plugin functionality.
 */

import type { AgentKitPlugin, SendPayload, AgentContext } from '@agentkit/types'

/**
 * Simple logging plugin that tracks lifecycle events
 */
export class LoggingPlugin implements AgentKitPlugin {
  public readonly name = 'logging-plugin'
  public readonly version = '1.0.0'
  
  public logs: string[] = []

  async onInit(_context: AgentContext): Promise<void> {
    this.logs.push(`${Date.now()}: onInit called`)
  }

  async onSend(payload: SendPayload, _context: AgentContext): Promise<void> {
    this.logs.push(`${Date.now()}: onSend called with ${JSON.stringify(payload)}`)
  }

  async onShutdown(_context: AgentContext): Promise<void> {
    this.logs.push(`${Date.now()}: onShutdown called`)
  }

  clearLogs(): void {
    this.logs.length = 0
  }
}

/**
 * Plugin that modifies data as it passes through
 */
export class TransformPlugin implements AgentKitPlugin {
  public readonly name = 'transform-plugin'
  public readonly version = '1.0.0'

  constructor(private transformer: (data: unknown) => unknown) {}

  async onInit(_context: AgentContext): Promise<void> {
    // Plugin initialization
  }

  async onSend(payload: SendPayload, _context: AgentContext): Promise<void> {
    // Transform the payload in place (modifying the context or payload as needed)
    // Note: In a real implementation, this would modify the payload or context
    const transformed = this.transformer(payload)
    // Log or store the transformation result
    console.log('Transformed payload:', transformed)
  }

  async onShutdown(_context: AgentContext): Promise<void> {
    // Plugin cleanup
  }
}

/**
 * Plugin that validates data structure
 */
export class ValidationPlugin implements AgentKitPlugin {
  public readonly name = 'validation-plugin'
  public readonly version = '1.0.0'

  constructor(private validator: (data: unknown) => boolean) {}

  async onInit(_context: AgentContext): Promise<void> {
    // Plugin initialization
  }

  async onSend(payload: SendPayload, _context: AgentContext): Promise<void> {
    if (!this.validator(payload)) {
      throw new Error('Validation failed')
    }
  }

  async onShutdown(_context: AgentContext): Promise<void> {
    // Plugin cleanup
  }
}

/**
 * Plugin that simulates async operations
 */
export class AsyncPlugin implements AgentKitPlugin {
  public readonly name = 'async-plugin'
  public readonly version = '1.0.0'

  constructor(private delayMs: number = 50) {}

  async onInit(_context: AgentContext): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, this.delayMs))
  }

  async onSend(_payload: unknown): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, this.delayMs))
  }

  async onShutdown(_context: AgentContext): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, this.delayMs))
  }
}

/**
 * Plugin that tracks call counts for testing
 */
export class CounterPlugin implements AgentKitPlugin {
  public readonly name = 'counter-plugin'
  public readonly version = '1.0.0'

  public initCount = 0
  public sendCount = 0
  public shutdownCount = 0

  async onInit(_context: AgentContext): Promise<void> {
    this.initCount++
  }

  async onSend(_payload: SendPayload, _context: AgentContext): Promise<void> {
    this.sendCount++
  }

  async onShutdown(_context: AgentContext): Promise<void> {
    this.shutdownCount++
  }

  reset(): void {
    this.initCount = 0
    this.sendCount = 0
    this.shutdownCount = 0
  }
}

/**
 * Collection of sample plugins for testing
 */
export const samplePlugins: AgentKitPlugin[] = [
  new LoggingPlugin(),
  new TransformPlugin((data) => ({ transformed: data, timestamp: Date.now() })),
  new ValidationPlugin((data) => data !== null && data !== undefined),
  new AsyncPlugin(25),
  new CounterPlugin()
]

/**
 * Factory function to create test plugins
 */
export function createTestPlugin(
  type: 'logging' | 'transform' | 'validation' | 'async' | 'counter',
  options?: {
    transformer?: (data: unknown) => unknown
    validator?: (data: unknown) => boolean
    delayMs?: number
  }
): AgentKitPlugin {
  switch (type) {
    case 'logging':
      return new LoggingPlugin()
    case 'transform':
      return new TransformPlugin(options?.transformer || ((data) => data))
    case 'validation':
      return new ValidationPlugin(options?.validator || (() => true))
    case 'async':
      return new AsyncPlugin(options?.delayMs)
    case 'counter':
      return new CounterPlugin()
    default:
      throw new Error(`Unknown plugin type: ${type}`)
  }
}