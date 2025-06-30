/**
 * Basic agent fixture for QA testing
 * 
 * Provides a minimal echo agent implementation for testing basic SDK functionality.
 */

import type { Agent, AgentInput, AgentOutput } from '@agentkit/types'

/**
 * Simple echo agent that returns input as output
 */
export class BasicEchoAgent implements Agent {
  public readonly id = 'basic-echo-agent'
  public readonly name = 'Basic Echo Agent'
  public readonly version = '1.0.0'
  
  private isInitialized = false

  async init(): Promise<void> {
    // TODO: Add actual initialization logic
    await new Promise(resolve => setTimeout(resolve, 10)) // Simulate async init
    this.isInitialized = true
  }

  async handle(input: AgentInput): Promise<AgentOutput> {
    if (!this.isInitialized) {
      throw new Error('Agent not initialized')
    }

    // TODO: Add actual processing logic
    return {
      type: 'response',
      data: {
        echo: input.data,
        timestamp: new Date().toISOString(),
        agent: this.id
      }
    }
  }

  async shutdown(): Promise<void> {
    // TODO: Add actual shutdown logic
    await new Promise(resolve => setTimeout(resolve, 10)) // Simulate async shutdown
    this.isInitialized = false
  }
}

/**
 * Agent that simulates processing delay
 */
export class DelayedAgent implements Agent {
  public readonly id = 'delayed-agent'
  public readonly name = 'Delayed Processing Agent'
  public readonly version = '1.0.0'
  
  private isInitialized = false

  constructor(private delayMs: number = 100) {}

  async init(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, this.delayMs))
    this.isInitialized = true
  }

  async handle(input: AgentInput): Promise<AgentOutput> {
    if (!this.isInitialized) {
      throw new Error('Agent not initialized')
    }

    await new Promise(resolve => setTimeout(resolve, this.delayMs))
    
    return {
      type: 'response',
      data: {
        processed: input.data,
        delay: this.delayMs,
        timestamp: new Date().toISOString()
      }
    }
  }

  async shutdown(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, this.delayMs))
    this.isInitialized = false
  }
}

/**
 * Agent that throws errors for testing error handling
 */
export class ErrorAgent implements Agent {
  public readonly id = 'error-agent'
  public readonly name = 'Error Testing Agent'
  public readonly version = '1.0.0'
  
  async init(): Promise<void> {
    // Successful initialization
  }

  async handle(input: AgentInput): Promise<AgentOutput> {
    if (input.data && typeof input.data === 'object' && 'throwError' in input.data) {
      throw new Error(`Test error: ${input.data.throwError}`)
    }

    return {
      type: 'response',
      data: { status: 'ok', input: input.data }
    }
  }

  async shutdown(): Promise<void> {
    // Successful shutdown
  }
}

/**
 * Factory function to create test agents
 */
export function createTestAgent(type: 'echo' | 'delayed' | 'error', options?: { delayMs?: number }): Agent {
  switch (type) {
    case 'echo':
      return new BasicEchoAgent()
    case 'delayed':
      return new DelayedAgent(options?.delayMs)
    case 'error':
      return new ErrorAgent()
    default:
      throw new Error(`Unknown agent type: ${type}`)
  }
}