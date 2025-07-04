import { Agent, AgentInput, AgentOutput } from '@agentkit/types'
import { z } from 'zod'

/**
 * Agent mode definitions for comprehensive testing
 */
export type DummyTestAgentMode = 
  | 'echo'           // Replies with exact input
  | 'fail'           // Throws errors intentionally
  | 'metrics'        // Emits fake observability signals  
  | 'recursive'      // Calls its own handleMessage
  | 'validation'     // Requires strict typed payload shape
  | 'pluginExercise' // Triggers all plugin hooks explicitly
  | 'sideEffect'     // Attempts to mutate global state

/**
 * Configuration schema for DummyTestAgent
 */
export const DummyTestAgentConfigSchema = z.object({
  mode: z.enum(['echo', 'fail', 'metrics', 'recursive', 'validation', 'pluginExercise', 'sideEffect']).default('echo'),
  debug: z.boolean().optional().default(false),
  processingDelay: z.number().optional().default(10),
  
  // Fail mode specific options
  failOn: z.enum(['init', 'handle', 'shutdown', 'all']).optional().default('handle'),
  failMessage: z.string().optional().default('Intentional test failure'),
  
  // Recursive mode options
  recursionDepth: z.number().optional().default(3),
  
  // Validation mode options
  strictValidation: z.boolean().optional().default(true),
  
  // Metrics mode options
  emitMetrics: z.boolean().optional().default(true),
  
  // Side effect mode options
  attemptGlobalMutation: z.boolean().optional().default(true)
})

export type DummyTestAgentConfig = z.infer<typeof DummyTestAgentConfigSchema>

/**
 * Global state for testing side effects (intentionally exposed for testing)
 */
const testGlobalState = {
  mutations: [] as string[],
  counters: { init: 0, handle: 0, shutdown: 0 }
}

/**
 * Validation schema for strict payload validation mode
 */
const StrictPayloadSchema = z.object({
  type: z.string(),
  data: z.object({
    message: z.string(),
    userId: z.string().optional(),
    metadata: z.record(z.unknown()).optional()
  }),
  timestamp: z.string().optional()
})

/**
 * Comprehensive test agent with 7 operational modes for SDK validation
 */
export class DummyTestAgent implements Agent {
  public readonly id: string
  public readonly name: string 
  public readonly version = '1.0.0'
  
  private initialized = false
  private config: DummyTestAgentConfig
  private initData: unknown = null
  private recursionCount = 0
  private metricsEmitted: string[] = []
  private pluginHooksTriggered: string[] = []
  
  constructor(id: string = 'dummy-test-agent', config?: Partial<DummyTestAgentConfig>) {
    this.id = id
    this.name = `Dummy Test Agent (${id})`
    this.config = DummyTestAgentConfigSchema.parse(config || {})
  }

  async init(config?: unknown): Promise<void> {
    this.log(`[${this.config.mode}] Initializing agent...`)
    
    // Update config if provided
    if (config) {
      this.config = DummyTestAgentConfigSchema.parse({ ...this.config, ...config })
    }

    // Handle fail mode
    if (this.config.mode === 'fail' && (this.config.failOn === 'init' || this.config.failOn === 'all')) {
      throw new Error(`[FAIL MODE] ${this.config.failMessage} during init`)
    }

    // Handle side effect mode
    if (this.config.mode === 'sideEffect' && this.config.attemptGlobalMutation) {
      try {
        testGlobalState.counters.init++
        testGlobalState.mutations.push(`init-mutation-${Date.now()}`)
        this.log(`[SIDE EFFECT] Attempted global state mutation during init`)
      } catch (error) {
        this.log(`[SIDE EFFECT] Global mutation blocked: ${error}`)
      }
    }

    // Handle metrics mode
    if (this.config.mode === 'metrics' && this.config.emitMetrics) {
      this.emitMetric('agent.init.started', { agentId: this.id, timestamp: Date.now() })
    }

    this.initialized = true
    this.initData = { 
      ready: true, 
      timestamp: new Date().toISOString(),
      mode: this.config.mode,
      config: this.config
    }
    
    // Simulate async initialization
    await this.delay(this.config.processingDelay)

    if (this.config.mode === 'metrics' && this.config.emitMetrics) {
      this.emitMetric('agent.init.completed', { agentId: this.id, duration: this.config.processingDelay })
    }

    this.log(`[${this.config.mode}] Agent initialized successfully`)
  }

  async handle(input: AgentInput): Promise<AgentOutput> {
    if (!this.initialized) {
      throw new Error('Agent not initialized. Call init() first.')
    }

    this.log(`[${this.config.mode}] Handling input:`, input)

    // Handle fail mode
    if (this.config.mode === 'fail' && (this.config.failOn === 'handle' || this.config.failOn === 'all')) {
      throw new Error(`[FAIL MODE] ${this.config.failMessage} during handle`)
    }

    // Handle side effect mode
    if (this.config.mode === 'sideEffect' && this.config.attemptGlobalMutation) {
      try {
        testGlobalState.counters.handle++
        testGlobalState.mutations.push(`handle-mutation-${Date.now()}`)
        this.log(`[SIDE EFFECT] Attempted global state mutation during handle`)
      } catch (error) {
        this.log(`[SIDE EFFECT] Global mutation blocked: ${error}`)
      }
    }

    // Handle metrics mode
    if (this.config.mode === 'metrics' && this.config.emitMetrics) {
      this.emitMetric('agent.handle.started', { agentId: this.id, inputType: typeof input })
    }

    // Simulate async processing
    await this.delay(this.config.processingDelay)

    let result: AgentOutput

    switch (this.config.mode) {
      case 'echo':
        result = this.handleEchoMode(input)
        break
      case 'recursive':
        result = await this.handleRecursiveMode(input)
        break
      case 'validation':
        result = this.handleValidationMode(input)
        break
      case 'pluginExercise':
        result = this.handlePluginExerciseMode(input)
        break
      case 'metrics':
        result = this.handleMetricsMode(input)
        break
      case 'sideEffect':
        result = this.handleSideEffectMode(input)
        break
      case 'fail':
        // Should have failed earlier, but if we get here, return echo
        result = this.handleEchoMode(input)
        break
      default:
        result = this.handleEchoMode(input)
    }

    if (this.config.mode === 'metrics' && this.config.emitMetrics) {
      this.emitMetric('agent.handle.completed', { agentId: this.id, success: true })
    }

    return result
  }

  async shutdown(): Promise<void> {
    this.log(`[${this.config.mode}] Shutting down agent...`)

    // Handle fail mode
    if (this.config.mode === 'fail' && (this.config.failOn === 'shutdown' || this.config.failOn === 'all')) {
      throw new Error(`[FAIL MODE] ${this.config.failMessage} during shutdown`)
    }

    // Handle side effect mode
    if (this.config.mode === 'sideEffect' && this.config.attemptGlobalMutation) {
      try {
        testGlobalState.counters.shutdown++
        testGlobalState.mutations.push(`shutdown-mutation-${Date.now()}`)
        this.log(`[SIDE EFFECT] Attempted global state mutation during shutdown`)
      } catch (error) {
        this.log(`[SIDE EFFECT] Global mutation blocked: ${error}`)
      }
    }

    // Handle metrics mode
    if (this.config.mode === 'metrics' && this.config.emitMetrics) {
      this.emitMetric('agent.shutdown.started', { agentId: this.id })
    }

    this.initialized = false
    this.initData = null
    this.recursionCount = 0
    
    // Simulate async shutdown
    await this.delay(5)

    if (this.config.mode === 'metrics' && this.config.emitMetrics) {
      this.emitMetric('agent.shutdown.completed', { agentId: this.id })
    }

    this.log(`[${this.config.mode}] Agent shutdown complete`)
  }

  // Mode-specific handlers

  private handleEchoMode(input: AgentInput): AgentOutput {
    return {
      type: 'response',
      data: input,
      metadata: {
        agentId: this.id,
        version: this.version,
        timestamp: new Date().toISOString(),
        mode: 'echo',
        initData: this.initData
      }
    }
  }

  private async handleRecursiveMode(input: AgentInput): Promise<AgentOutput> {
    this.recursionCount++
    
    if (this.recursionCount > this.config.recursionDepth!) {
      return {
        type: 'response',
        data: {
          message: 'Recursion depth limit reached',
          recursionCount: this.recursionCount,
          input
        },
        metadata: {
          agentId: this.id,
          mode: 'recursive',
          recursionDepth: this.recursionCount
        }
      }
    }

    // Simulate recursive call
    this.log(`[RECURSIVE] Making recursive call (depth: ${this.recursionCount})`)
    
    const recursiveInput = {
      type: 'recursive',
      data: {
        original: input,
        recursionLevel: this.recursionCount,
        message: `Recursive call level ${this.recursionCount}`
      }
    }

    // Prevent infinite recursion by checking depth
    if (this.recursionCount < this.config.recursionDepth!) {
      const recursiveResult = await this.handle(recursiveInput)
      
      return {
        type: 'response',
        data: {
          message: 'Recursive processing complete',
          recursionCount: this.recursionCount,
          recursiveResult,
          originalInput: input
        },
        metadata: {
          agentId: this.id,
          mode: 'recursive',
          recursionDepth: this.recursionCount
        }
      }
    }

    return this.handleEchoMode(input)
  }

  private handleValidationMode(input: AgentInput): AgentOutput {
    if (!this.config.strictValidation) {
      return this.handleEchoMode(input)
    }

    try {
      // Validate input against strict schema
      const validatedInput = StrictPayloadSchema.parse(input)
      
      return {
        type: 'response',
        data: {
          message: 'Validation successful',
          validatedInput,
          validationPassed: true
        },
        metadata: {
          agentId: this.id,
          mode: 'validation',
          validationResult: 'success'
        }
      }
    } catch (error) {
      // Return validation error without internal stack traces
      const sanitizedError = error instanceof Error ? error.message : 'Validation failed'
      
      throw new Error(`[VALIDATION MODE] Payload validation failed: ${sanitizedError}`)
    }
  }

  private handlePluginExerciseMode(input: AgentInput): AgentOutput {
    // Simulate triggering all plugin hooks
    const hooks = ['onInit', 'onSend', 'onError', 'onShutdown']
    
    hooks.forEach(hook => {
      this.pluginHooksTriggered.push(`${hook}-${Date.now()}`)
      this.log(`[PLUGIN EXERCISE] Triggered plugin hook: ${hook}`)
    })

    return {
      type: 'response',
      data: {
        message: 'Plugin hooks exercised',
        hooksTriggered: this.pluginHooksTriggered,
        input
      },
      metadata: {
        agentId: this.id,
        mode: 'pluginExercise',
        totalHooksTriggered: this.pluginHooksTriggered.length
      }
    }
  }

  private handleMetricsMode(input: AgentInput): AgentOutput {
    // Emit various fake metrics
    this.emitMetric('agent.processing.started', { inputSize: JSON.stringify(input).length })
    this.emitMetric('agent.processing.cpu', { usage: Math.random() * 100 })
    this.emitMetric('agent.processing.memory', { used: Math.random() * 1024 * 1024 })
    this.emitMetric('agent.processing.latency', { ms: this.config.processingDelay })

    return {
      type: 'response',
      data: {
        message: 'Metrics emitted',
        metricsCount: this.metricsEmitted.length,
        input
      },
      metadata: {
        agentId: this.id,
        mode: 'metrics',
        metricsEmitted: this.metricsEmitted.slice(-5) // Last 5 metrics
      }
    }
  }

  private handleSideEffectMode(input: AgentInput): AgentOutput {
    const mutationAttempts = []

    // Attempt various global mutations
    try {
      // Attempt to modify global object
      mutationAttempts.push('global-object-mutation')
      
      // Attempt to modify process environment
      mutationAttempts.push('process-env-mutation')
      
      // Attempt to modify prototype
      mutationAttempts.push('prototype-mutation')
      
    } catch (error) {
      this.log(`[SIDE EFFECT] Mutation blocked: ${error}`)
    }

    return {
      type: 'response',
      data: {
        message: 'Side effect attempts completed',
        mutationAttempts,
        globalState: {
          mutations: testGlobalState.mutations.length,
          counters: testGlobalState.counters
        },
        input
      },
      metadata: {
        agentId: this.id,
        mode: 'sideEffect',
        mutationAttempts: mutationAttempts.length
      }
    }
  }

  // Helper methods

  private emitMetric(name: string, data: Record<string, unknown>): void {
    const metric = `${name}:${JSON.stringify(data)}`
    this.metricsEmitted.push(metric)
    this.log(`[METRIC] ${name}`, data)
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private log(message: string, data?: unknown): void {
    if (this.config.debug) {
      if (data) {
        console.log(`[DummyTestAgent:${this.id}] ${message}`, data)
      } else {
        console.log(`[DummyTestAgent:${this.id}] ${message}`)
      }
    }
  }

  // Public getters for testing

  public getConfig(): DummyTestAgentConfig {
    return { ...this.config }
  }

  public getMetricsEmitted(): string[] {
    return [...this.metricsEmitted]
  }

  public getPluginHooksTriggered(): string[] {
    return [...this.pluginHooksTriggered]
  }

  public getGlobalStateSnapshot(): typeof testGlobalState {
    return {
      mutations: [...testGlobalState.mutations],
      counters: { ...testGlobalState.counters }
    }
  }

  public resetGlobalState(): void {
    testGlobalState.mutations.length = 0
    testGlobalState.counters = { init: 0, handle: 0, shutdown: 0 }
  }

  public isInitialized(): boolean {
    return this.initialized
  }

  public getRecursionCount(): number {
    return this.recursionCount
  }
}

/**
 * Factory function to create DummyTestAgent instances
 */
export function createDummyTestAgent(
  mode: DummyTestAgentMode = 'echo',
  config?: Partial<DummyTestAgentConfig>
): DummyTestAgent {
  return new DummyTestAgent(`dummy-test-agent-${mode}`, { mode, ...config })
}

/**
 * Utility function to create agents for all modes
 */
export function createAllModeAgents(baseConfig?: Partial<DummyTestAgentConfig>): Record<DummyTestAgentMode, DummyTestAgent> {
  const modes: DummyTestAgentMode[] = ['echo', 'fail', 'metrics', 'recursive', 'validation', 'pluginExercise', 'sideEffect']
  
  return modes.reduce((agents, mode) => {
    agents[mode] = createDummyTestAgent(mode, baseConfig)
    return agents
  }, {} as Record<DummyTestAgentMode, DummyTestAgent>)
}