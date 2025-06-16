// @browser-safe
import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'
import { z } from 'zod'

/**
 * A test plugin for lifecycle simulation and chaos testing
 * 
 * @author AgentKit Test Suite
 * @license MIT
 */
export class GreetPlugin implements AgentKitPlugin {
  readonly name = 'greet-plugin'
  readonly version = '1.0.0'
  readonly description = 'A test plugin for lifecycle simulation and chaos testing'
  
  compatibility = {
    browserCompatibility: {
      chrome: 'latest',
      firefox: 'latest',
      safari: 'latest',
      edge: 'latest'
    }
  }
  
  private readonly pluginConfig: GreetPluginConfig
  
  // Chaos testing configuration
  private chaosConfig = {
    failOnInit: false,
    failOnSend: false,
    failOnError: false,
    failOnShutdown: false,
    delayMs: 0,
    throwAfterCalls: 0,
    callCount: 0
  }
  
  // Execution metrics
  private metrics = {
    initTime: 0,
    sendCount: 0,
    errorCount: 0,
    shutdownTime: 0,
    memoryUsage: 0
  }
  
  constructor(config?: Partial<GreetPluginConfig>) {
    // Merge with defaults and validate
    this.pluginConfig = GreetPluginConfigSchema.parse(config || {})
  }

  /**
   * Get the current plugin configuration
   */
  getConfig(): Readonly<GreetPluginConfig> {
    return Object.freeze({ ...this.pluginConfig })
  }

  /**
   * Update plugin configuration (creates new instance)
   */
  withConfig(newConfig: Partial<GreetPluginConfig>): GreetPlugin {
    return new GreetPlugin({ ...this.pluginConfig, ...newConfig })
  }
  
  /**
   * Configure chaos testing behavior
   */
  setChaosConfig(config: Partial<typeof this.chaosConfig>): void {
    this.chaosConfig = { ...this.chaosConfig, ...config }
  }
  
  /**
   * Get execution metrics
   */
  getMetrics() {
    return { ...this.metrics }
  }
  
  /**
   * Inject controlled delay and failures
   */
  private async injectChaos(hookName: string): Promise<void> {
    this.chaosConfig.callCount++
    
    // Inject delay if configured
    if (this.chaosConfig.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.chaosConfig.delayMs))
    }
    
    // Throw error if configured for this hook
    const shouldFail = this.chaosConfig[`failOn${hookName.charAt(2).toUpperCase() + hookName.slice(3)}` as keyof typeof this.chaosConfig]
    if (shouldFail) {
      throw new Error(`Chaos injection: ${hookName} failure simulation`)
    }
    
    // Throw error after certain number of calls
    if (this.chaosConfig.throwAfterCalls > 0 && this.chaosConfig.callCount > this.chaosConfig.throwAfterCalls) {
      throw new Error(`Chaos injection: failure after ${this.chaosConfig.throwAfterCalls} calls`)
    }
  }

  /**
   * Called when the agent is initialized
   * Use this hook to set up any required resources or connections
   */
  async onInit(context: AgentContext): Promise<void> {
    const startTime = Date.now()
    await this.injectChaos('onInit')
    
    if (!this.pluginConfig.enabled) {
      return
    }
    
    if (this.pluginConfig.logLevel !== 'error') {
      console.log(`[${this.name}] Initializing with agent ${context.agentId}`)
    }
    
    try {
      // Simulate initialization work
      await new Promise(resolve => setTimeout(resolve, 1))
      
      // Track memory usage (simulated)
      this.metrics.memoryUsage = process.memoryUsage?.()?.heapUsed || 0
      this.metrics.initTime = Date.now() - startTime
      
      if (this.pluginConfig.logLevel === 'debug') {
        console.log(`[${this.name}] Initialization completed in ${this.metrics.initTime}ms`)
      }
      
    } catch (error) {
      console.error(`[${this.name}] Initialization failed:`, error)
      throw error // Re-throw to signal initialization failure
    }
  }

  /**
   * Called before sending data to the agent
   * Use this hook to modify, validate, or log outgoing data
   */
  async onSend(payload: SendPayload, context: AgentContext): Promise<void> {
    await this.injectChaos('onSend')
    
    if (!this.pluginConfig.enabled) {
      return
    }
    
    this.metrics.sendCount++
    
    if (this.pluginConfig.logLevel === 'debug') {
      console.log(`[${this.name}] Processing send for agent ${context.agentId}`, {
        payloadSize: JSON.stringify(payload.input).length,
        timestamp: context.timestamp,
        sendCount: this.metrics.sendCount
      })
    }
    
    try {
      // Simulate greeting enhancement
      if (payload.input && typeof payload.input === 'object' && 'message' in payload.input) {
        const originalMessage = payload.input.message as string
        if (typeof originalMessage === 'string' && this.pluginConfig.greetingPrefix) {
          payload.input.message = `${this.pluginConfig.greetingPrefix} ${originalMessage}`
        }
      }
      
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 1))
      
    } catch (error) {
      console.error(`[${this.name}] Send processing failed:`, error)
      throw error // Re-throw to prevent send operation
    }
  }

  /**
   * Called when an error occurs in the agent system
   * Use this hook to handle, log, or report errors
   */
  async onError(error: Error, context: AgentContext): Promise<void> {
    await this.injectChaos('onError')
    
    if (!this.pluginConfig.enabled) {
      return
    }
    
    this.metrics.errorCount++
    
    console.error(`[${this.name}] Error in agent ${context.agentId}:`, {
      error: error.message,
      stack: error.stack,
      context: {
        requestId: context.requestId,
        timestamp: context.timestamp
      },
      errorCount: this.metrics.errorCount
    })
    
    try {
      // Simulate error handling work
      await new Promise(resolve => setTimeout(resolve, 1))
      
    } catch (handlingError) {
      // Don't throw from error handlers to avoid infinite loops
      console.error(`[${this.name}] Error handling failed:`, handlingError)
    }
  }

  /**
   * Called when the agent is shutting down
   * Use this hook to clean up resources and save state
   */
  async onShutdown(context: AgentContext): Promise<void> {
    const startTime = Date.now()
    await this.injectChaos('onShutdown')
    
    if (this.pluginConfig.logLevel !== 'error') {
      console.log(`[${this.name}] Shutting down for agent ${context.agentId}`)
    }
    
    try {
      // Simulate cleanup work
      await new Promise(resolve => setTimeout(resolve, 1))
      
      this.metrics.shutdownTime = Date.now() - startTime
      
      if (this.pluginConfig.logLevel === 'debug') {
        console.log(`[${this.name}] Final metrics:`, this.metrics)
      }
      
    } catch (error) {
      // Log but don't throw during shutdown to avoid blocking other cleanup
      console.error(`[${this.name}] Shutdown cleanup failed:`, error)
    }
  }
}

// Enhanced configuration schema with validation
export const GreetPluginConfigSchema = z.object({
  /** Enable or disable the plugin */
  enabled: z.boolean().default(true),
  /** Logging level for plugin operations */
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Prefix to add to greeting messages */
  greetingPrefix: z.string().default('Hello'),
  /** Maximum processing delay in ms */
  maxDelay: z.number().min(0).max(1000).default(100)
}).strict() // Prevent additional properties

export type GreetPluginConfig = z.infer<typeof GreetPluginConfigSchema>

/**
 * Plugin factory function for easy instantiation
 */
export function createGreetPlugin(config?: Partial<GreetPluginConfig>): GreetPlugin {
  return new GreetPlugin(config)
}

/**
 * Register plugin with AgentKit SDK
 * Usage: connectAgent({ plugins: [registerGreetPlugin()] })
 */
export function registerGreetPlugin(config?: Partial<GreetPluginConfig>) {
  return createGreetPlugin(config)
}

// Default export for convenience
export default GreetPlugin