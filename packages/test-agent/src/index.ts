import { Agent, AgentInput, AgentOutput } from '@agentkit/types'
import { z } from 'zod'

// Configuration schema for DummyAgent
export const DummyAgentConfigSchema = z.object({
  debug: z.boolean().optional(),
  echoPrefix: z.string().optional().default('echo:'),
  processingDelay: z.number().optional().default(10)
})

export type DummyAgentConfig = z.infer<typeof DummyAgentConfigSchema>

export class DummyAgent implements Agent {
  id = 'dummy-agent'
  name = 'Dummy Agent'
  version = '1.0.0'
  private initialized = false
  private config: DummyAgentConfig
  private initData: unknown = null

  constructor() {
    this.config = DummyAgentConfigSchema.parse({})
  }

  async init(config?: unknown): Promise<void> {
    // Validate config with Zod
    this.config = DummyAgentConfigSchema.parse(config || {})
    
    if (this.config.debug) {
      console.log('[DummyAgent] Initializing with config:', this.config)
    }
    
    this.initialized = true
    this.initData = { ready: true, timestamp: new Date().toISOString() }
    
    // Simulate async initialization
    await new Promise(resolve => setTimeout(resolve, this.config.processingDelay || 10))
  }

  async handle(input: AgentInput): Promise<AgentOutput> {
    if (!this.initialized) {
      throw new Error('Agent not initialized. Call init() first.')
    }
    
    if (this.config.debug) {
      console.log('[DummyAgent] Handling input:', input)
    }

    // Simulate async processing
    await new Promise(resolve => setTimeout(resolve, this.config.processingDelay || 10))
    
    // Return echo result with prefix
    const prefix = this.config.echoPrefix || 'echo:'
    return {
      result: `${prefix}${JSON.stringify(input)}`,
      metadata: {
        agentId: this.id,
        version: this.version,
        timestamp: new Date().toISOString(),
        initData: this.initData
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.config.debug) {
      console.log('[DummyAgent] Shutting down')
    }
    
    this.initialized = false
    this.initData = null
    
    // Simulate async shutdown
    await new Promise(resolve => setTimeout(resolve, 5))
    
    // Return void as expected by the interface
  }

  // Helper methods for testing
  isInitialized(): boolean {
    return this.initialized
  }

  setConfig(config: DummyAgentConfig): void {
    this.config = DummyAgentConfigSchema.parse(config)
  }
}

// Keep the original TestAgent for backward compatibility
export class TestAgent implements Agent {
  id = 'test-agent'
  name = 'Test Agent'
  version = '1.0.0'
  private initialized = false
  private config?: unknown
  private debug: boolean = false

  constructor(config?: { debug?: boolean }) {
    this.debug = config?.debug ?? false
  }

  async init(config?: unknown): Promise<void> {
    if (this.debug) {
      console.log('[TestAgent] Initializing with config:', config)
    }
    this.config = config
    this.initialized = true
    // Simulate async initialization
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  async handle(input: AgentInput): Promise<AgentOutput> {
    if (!this.initialized) {
      throw new Error('Agent not initialized. Call init() first.')
    }
    
    if (this.debug) {
      console.log('[TestAgent] Handling input:', input)
    }

    // Simple echo behavior with transformation
    const response = {
      echo: input,
      timestamp: new Date().toISOString(),
      agentId: this.id,
      processed: true
    }

    // Simulate async processing
    await new Promise(resolve => setTimeout(resolve, 20))
    
    return response
  }

  async shutdown(): Promise<void> {
    if (this.debug) {
      console.log('[TestAgent] Shutting down')
    }
    this.initialized = false
    this.config = undefined
    // Simulate async shutdown
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  // Helper method for testing
  isInitialized(): boolean {
    return this.initialized
  }
}

export const createTestAgent = (config?: { debug?: boolean }): Agent => {
  return new TestAgent(config)
}

export const createDummyAgent = (config?: DummyAgentConfig): Agent => {
  const agent = new DummyAgent()
  // Pre-configure the agent if config is provided
  if (config) {
    agent.setConfig(config)
  }
  return agent
}

// Export new comprehensive test agent
export {
  DummyTestAgent,
  createDummyTestAgent,
  createAllModeAgents,
  DummyTestAgentConfigSchema,
  type DummyTestAgentConfig,
  type DummyTestAgentMode
} from './DummyTestAgent'

export {
  type DummyTestAgentTestResult
} from './types'