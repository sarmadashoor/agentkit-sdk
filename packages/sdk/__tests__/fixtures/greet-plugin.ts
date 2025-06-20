import { z } from 'zod'
import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'

/**
 * Configuration schema for the Greet Plugin
 */
export const GreetPluginConfigSchema = z.object({
  enabled: z.boolean().default(true),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  greetingPrefix: z.string().default('Hello'),
  maxDelay: z.number().min(0).max(5000).default(1000)
}).strict() // Reject additional properties to prevent prototype pollution

export type GreetPluginConfig = z.infer<typeof GreetPluginConfigSchema>

/**
 * Chaos testing configuration for controlled failure injection
 */
interface ChaosConfig {
  failOnInit?: boolean
  failOnSend?: boolean
  failOnShutdown?: boolean
  delayMs?: number
  throwAfterCalls?: number
}

/**
 * Plugin metrics for performance monitoring
 */
interface PluginMetrics {
  initTime: number
  sendCount: number
  errorCount: number
  shutdownTime: number
  memoryUsage: number
}

/**
 * Enhanced Greet Plugin with chaos testing and metrics
 * Demonstrates production-ready plugin structure from CLI scaffolding
 */
export class GreetPlugin implements AgentKitPlugin {
  public readonly name = 'greet-plugin'
  public readonly version = '1.0.0'
  public readonly description = 'A demonstration plugin for testing lifecycle management'
  
  private config: GreetPluginConfig
  private chaosConfig: ChaosConfig = {}
  private metrics: PluginMetrics = {
    initTime: 0,
    sendCount: 0,
    errorCount: 0,
    shutdownTime: 0,
    memoryUsage: 0
  }
  private callCount = 0

  constructor(config: Partial<GreetPluginConfig> = {}) {
    this.config = GreetPluginConfigSchema.parse(config)
    
    // Freeze configuration to prevent external modification
    Object.freeze(this.config)
  }

  /**
   * Get current plugin configuration (readonly)
   */
  getConfig(): Readonly<GreetPluginConfig> {
    return this.config
  }

  /**
   * Create new plugin instance with updated configuration
   */
  withConfig(newConfig: Partial<GreetPluginConfig>): GreetPlugin {
    const mergedConfig = { ...this.config, ...newConfig }
    return new GreetPlugin(mergedConfig)
  }

  /**
   * Set chaos testing configuration for failure injection
   */
  setChaosConfig(config: ChaosConfig): void {
    this.chaosConfig = { ...config }
  }

  /**
   * Get current plugin metrics
   */
  getMetrics(): Readonly<PluginMetrics> {
    return { ...this.metrics }
  }

  async onInit(context: AgentContext): Promise<void> {
    const startTime = Date.now()
    this.callCount++
    
    if (this.config.logLevel === 'debug') {
      console.log(`[${this.name}] Initializing with agent ${context.agentId}`)
    }

    // Inject controlled delay if configured
    if (this.chaosConfig.delayMs) {
      await new Promise(resolve => setTimeout(resolve, this.chaosConfig.delayMs))
    }

    // Inject failure if configured
    if (this.chaosConfig.failOnInit) {
      throw new Error('Chaos injection: onInit failure simulation')
    }

    // Check for call-based failure injection
    if (this.chaosConfig.throwAfterCalls && this.callCount > this.chaosConfig.throwAfterCalls) {
      throw new Error(`Chaos injection: failure after ${this.chaosConfig.throwAfterCalls} calls`)
    }

    // Add small delay to ensure non-zero timing
    await new Promise(resolve => setTimeout(resolve, 1))
    
    this.metrics.initTime = Date.now() - startTime
    this.metrics.memoryUsage = process.memoryUsage().heapUsed

    if (this.config.logLevel === 'debug') {
      console.log(`[${this.name}] Initialization completed in ${this.metrics.initTime}ms`)
    }
  }

  async onSend(payload: SendPayload, context: AgentContext): Promise<void> {
    const startTime = Date.now()
    this.callCount++
    this.metrics.sendCount++

    if (this.config.logLevel === 'debug') {
      console.log(`[${this.name}] Processing send for agent ${context.agentId}`)
    }

    // Inject controlled delay if configured
    if (this.chaosConfig.delayMs) {
      await new Promise(resolve => setTimeout(resolve, this.chaosConfig.delayMs))
    }

    // Inject failure if configured
    if (this.chaosConfig.failOnSend) {
      throw new Error('Chaos injection: onSend failure simulation')
    }

    // Check for call-based failure injection
    if (this.chaosConfig.throwAfterCalls && this.callCount > this.chaosConfig.throwAfterCalls) {
      throw new Error(`Chaos injection: failure after ${this.chaosConfig.throwAfterCalls} calls`)
    }

    // Simulate greeting processing
    const greeting = `${this.config.greetingPrefix}, ${context.agentId}!`
    
    if (this.config.logLevel === 'debug') {
      console.log(`[${this.name}] Generated greeting: ${greeting}`)
    }

    const processingTime = Date.now() - startTime
    if (this.config.logLevel === 'debug') {
      console.log(`[${this.name}] Send processing completed in ${processingTime}ms`)
    }
  }

  async onError(error: Error, context: AgentContext): Promise<void> {
    this.metrics.errorCount++

    console.error(`[${this.name}] Error in agent ${context.agentId}:`, {
      error: error.message,
      requestId: context.requestId,
      timestamp: new Date(context.timestamp).toISOString(),
      errorCount: this.metrics.errorCount
    })
  }

  async onShutdown(context: AgentContext): Promise<void> {
    const startTime = Date.now()
    this.callCount++

    console.log(`[${this.name}] Shutting down for agent ${context.agentId}`)

    // Inject controlled delay if configured
    if (this.chaosConfig.delayMs) {
      await new Promise(resolve => setTimeout(resolve, this.chaosConfig.delayMs))
    }

    // Inject failure if configured
    if (this.chaosConfig.failOnShutdown) {
      throw new Error('Chaos injection: onShutdown failure simulation')
    }

    // Check for call-based failure injection
    if (this.chaosConfig.throwAfterCalls && this.callCount > this.chaosConfig.throwAfterCalls) {
      throw new Error(`Chaos injection: failure after ${this.chaosConfig.throwAfterCalls} calls`)
    }

    // Add small delay to ensure non-zero timing
    await new Promise(resolve => setTimeout(resolve, 1))
    
    this.metrics.shutdownTime = Date.now() - startTime

    if (this.config.logLevel === 'debug') {
      console.log(`[${this.name}] Shutdown completed in ${this.metrics.shutdownTime}ms`)
    }
  }
}

/**
 * Factory function for creating GreetPlugin instances
 */
export function createGreetPlugin(config?: Partial<GreetPluginConfig>): GreetPlugin {
  return new GreetPlugin(config)
}

/**
 * Registration helper that creates and returns a GreetPlugin instance
 * Simulates plugin registration in a real system
 */
export function registerGreetPlugin(config?: Partial<GreetPluginConfig>): GreetPlugin {
  const plugin = createGreetPlugin(config)
  
  // In a real system, this would register the plugin with the SDK
  // For testing, we just return the instance
  return plugin
}