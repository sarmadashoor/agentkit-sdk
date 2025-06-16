/**
 * Plugin Worker Host
 * 
 * Main thread wrapper that provides the standard AgentKit plugin interface
 * while delegating all execution to isolated WebWorkers. Manages worker
 * lifecycle, monitoring, and fallback strategies.
 */

import type { 
  AgentKitPlugin, 
  AgentContext, 
  SendPayload, 
  PluginHookName 
} from '@agentkit/types'
import { PluginWorker, PluginWorkerConfig, WorkerState } from './PluginWorker'

/**
 * Worker host configuration
 */
export interface PluginWorkerHostConfig {
  /** Enable debug logging */
  debug?: boolean
  /** Worker timeout in milliseconds */
  workerTimeout?: number
  /** Enable worker pooling for performance */
  enablePooling?: boolean
  /** Maximum worker pool size */
  maxPoolSize?: number
  /** Enable metrics collection */
  enableMetrics?: boolean
  /** Fallback to main thread execution */
  enableFallback?: boolean
  /** Custom worker factory (for testing) */
  workerFactory?: (config: PluginWorkerConfig) => PluginWorker
}

/**
 * Execution metrics for monitoring
 */
export interface ExecutionMetrics {
  hookName: PluginHookName
  duration: number
  success: boolean
  workerState: WorkerState
  timestamp: number
  error?: string
}

/**
 * Plugin lifecycle events
 */
export interface PluginLifecycleEvents {
  onWorkerCreated?: (pluginName: string) => void
  onWorkerTerminated?: (pluginName: string, reason: string) => void
  onExecutionStart?: (pluginName: string, hookName: PluginHookName) => void
  onExecutionComplete?: (metrics: ExecutionMetrics) => void
  onWorkerError?: (pluginName: string, error: Error) => void
}

/**
 * Plugin Worker Host - Main thread facade for worker-based plugin execution
 */
export class PluginWorkerHost implements AgentKitPlugin {
  readonly name: string
  readonly version: string
  readonly description?: string

  private plugin: AgentKitPlugin
  private worker: PluginWorker | null = null
  private config: Required<PluginWorkerHostConfig>
  private metrics: ExecutionMetrics[] = []
  private lifecycleEvents: PluginLifecycleEvents
  private isInitialized = false
  private workerCreationPromise: Promise<void> | null = null

  constructor(
    plugin: AgentKitPlugin,
    config: PluginWorkerHostConfig = {},
    lifecycleEvents: PluginLifecycleEvents = {}
  ) {
    // Copy plugin metadata
    this.name = plugin.name
    this.version = plugin.version
    this.description = plugin.description
    this.plugin = plugin

    // Apply config defaults
    this.config = {
      debug: false,
      workerTimeout: 5000,
      enablePooling: false,
      maxPoolSize: 3,
      enableMetrics: true,
      enableFallback: true,
      workerFactory: (cfg) => new PluginWorker(cfg),
      ...config
    }

    this.lifecycleEvents = lifecycleEvents
  }

  /**
   * Initialize the plugin and worker
   */
  async onInit?(context: AgentContext): Promise<void> {
    try {
      await this.ensureWorker()
      
      if (this.plugin.onInit) {
        this.lifecycleEvents.onExecutionStart?.(this.name, 'onInit')
        const startTime = Date.now()
        
        try {
          await this.executeInWorker('onInit', context)
          this.recordMetrics('onInit', startTime, true)
        } catch (error) {
          this.recordMetrics('onInit', startTime, false, error as Error)
          throw error
        }
      }
      
      this.isInitialized = true
    } catch (error) {
      this.handleWorkerError(error as Error)
      
      // Try fallback if enabled
      if (this.config.enableFallback && this.plugin.onInit) {
        this.log('Falling back to main thread execution for onInit')
        await this.plugin.onInit(context)
      } else {
        throw error
      }
    }
  }

  /**
   * Handle send operations in worker
   */
  async onSend?(payload: SendPayload, context: AgentContext): Promise<void> {
    if (!this.plugin.onSend) return

    try {
      await this.ensureWorker()
      this.lifecycleEvents.onExecutionStart?.(this.name, 'onSend')
      const startTime = Date.now()
      
      try {
        // Clone payload to ensure isolation
        const clonedPayload = this.structuredClone(payload)
        const clonedContext = this.structuredClone(context)
        
        await this.executeInWorker('onSend', clonedPayload, clonedContext)
        this.recordMetrics('onSend', startTime, true)
      } catch (error) {
        this.recordMetrics('onSend', startTime, false, error as Error)
        throw error
      }
    } catch (error) {
      this.handleWorkerError(error as Error)
      
      // Try fallback if enabled
      if (this.config.enableFallback) {
        this.log('Falling back to main thread execution for onSend')
        await this.plugin.onSend!(payload, context)
      } else {
        throw error
      }
    }
  }

  /**
   * Handle errors in worker
   */
  async onError?(error: Error, context: AgentContext): Promise<void> {
    if (!this.plugin.onError) return

    try {
      await this.ensureWorker()
      this.lifecycleEvents.onExecutionStart?.(this.name, 'onError')
      const startTime = Date.now()
      
      try {
        // Serialize error for worker
        const serializedError = {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
        
        await this.executeInWorker('onError', serializedError, context)
        this.recordMetrics('onError', startTime, true)
      } catch (workerError) {
        this.recordMetrics('onError', startTime, false, workerError as Error)
        throw workerError
      }
    } catch (workerError) {
      this.handleWorkerError(workerError as Error)
      
      // Try fallback if enabled
      if (this.config.enableFallback) {
        this.log('Falling back to main thread execution for onError')
        await this.plugin.onError!(error, context)
      } else {
        throw workerError
      }
    }
  }

  /**
   * Handle shutdown in worker
   */
  async onShutdown?(context: AgentContext): Promise<void> {
    try {
      if (this.plugin.onShutdown && this.worker) {
        this.lifecycleEvents.onExecutionStart?.(this.name, 'onShutdown')
        const startTime = Date.now()
        
        try {
          await this.executeInWorker('onShutdown', context)
          this.recordMetrics('onShutdown', startTime, true)
        } catch (error) {
          this.recordMetrics('onShutdown', startTime, false, error as Error)
          // Don't throw during shutdown
          this.log('Error during plugin shutdown', error)
        }
      }
    } finally {
      // Always terminate worker on shutdown
      await this.terminateWorker('Plugin shutdown')
    }
  }

  /**
   * Ensure worker is created and ready
   */
  private async ensureWorker(): Promise<void> {
    if (this.worker && this.worker.getState() === 'ready') {
      return
    }

    if (this.workerCreationPromise) {
      return this.workerCreationPromise
    }

    this.workerCreationPromise = this.createWorker()
    try {
      await this.workerCreationPromise
    } finally {
      this.workerCreationPromise = null
    }
  }

  /**
   * Create and initialize worker
   */
  private async createWorker(): Promise<void> {
    try {
      // Check WebWorker support
      if (typeof Worker === 'undefined') {
        throw new Error('WebWorker not supported in this environment')
      }

      // Terminate existing worker if any
      if (this.worker) {
        await this.terminateWorker('Creating new worker')
      }

      // Create new worker
      this.worker = this.config.workerFactory({
        plugin: this.plugin,
        timeout: this.config.workerTimeout,
        debug: this.config.debug,
        workerName: `${this.name}-worker`
      })

      await this.worker.initialize()
      this.lifecycleEvents.onWorkerCreated?.(this.name)
      
      this.log('Worker created and initialized')
    } catch (error) {
      this.log('Failed to create worker', error)
      throw new Error(`Failed to create plugin worker: ${error}`)
    }
  }

  /**
   * Execute hook in worker
   */
  private async executeInWorker(hookName: PluginHookName, ...args: any[]): Promise<any> {
    if (!this.worker) {
      throw new Error('Worker not initialized')
    }

    try {
      const result = await this.worker.executeHook(hookName, ...args)
      return result
    } catch (error) {
      // Check if worker crashed
      if (this.worker.getState() === 'error') {
        this.log('Worker crashed during execution, attempting recovery')
        await this.createWorker()
        
        // Retry once
        return this.worker!.executeHook(hookName, ...args)
      }
      
      throw error
    }
  }

  /**
   * Terminate worker
   */
  private async terminateWorker(reason: string): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate(reason)
        this.lifecycleEvents.onWorkerTerminated?.(this.name, reason)
      } catch (error) {
        this.log('Error during worker termination', error)
      } finally {
        this.worker = null
      }
    }
  }

  /**
   * Handle worker errors
   */
  private handleWorkerError(error: Error): void {
    this.log('Worker error', error)
    this.lifecycleEvents.onWorkerError?.(this.name, error)
  }

  /**
   * Record execution metrics
   */
  private recordMetrics(
    hookName: PluginHookName,
    startTime: number,
    success: boolean,
    error?: Error
  ): void {
    if (!this.config.enableMetrics) return

    const metrics: ExecutionMetrics = {
      hookName,
      duration: Date.now() - startTime,
      success,
      workerState: this.worker?.getState() || 'terminated',
      timestamp: Date.now(),
      error: error?.message
    }

    this.metrics.push(metrics)
    this.lifecycleEvents.onExecutionComplete?.(metrics)

    // Keep metrics bounded
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-500)
    }
  }

  /**
   * Structured clone with fallback
   */
  private structuredClone<T>(obj: T): T {
    try {
      // Use native structuredClone if available
      if (typeof structuredClone === 'function') {
        return structuredClone(obj)
      }
      
      // Fallback to JSON serialization
      return JSON.parse(JSON.stringify(obj))
    } catch (error) {
      this.log('Failed to clone object', error)
      throw new Error(`Failed to clone data for worker: ${error}`)
    }
  }

  /**
   * Internal logging
   */
  private log(message: string, ...args: any[]): void {
    if (this.config.debug) {
      console.log(`[PluginWorkerHost:${this.name}] ${message}`, ...args)
    }
  }

  /**
   * Get execution metrics
   */
  getMetrics(): ExecutionMetrics[] {
    return [...this.metrics]
  }

  /**
   * Get worker state
   */
  getWorkerState(): WorkerState | 'no-worker' {
    return this.worker?.getState() || 'no-worker'
  }

  /**
   * Force worker recreation
   */
  async recreateWorker(): Promise<void> {
    await this.terminateWorker('Manual recreation')
    await this.ensureWorker()
  }

  /**
   * Check if fallback mode is active
   */
  isInFallbackMode(): boolean {
    return this.config.enableFallback && (!this.worker || this.worker.getState() === 'error')
  }
}

/**
 * Factory function to wrap a plugin with worker isolation
 */
export function wrapPluginWithWorker(
  plugin: AgentKitPlugin,
  config?: PluginWorkerHostConfig,
  lifecycleEvents?: PluginLifecycleEvents
): PluginWorkerHost {
  return new PluginWorkerHost(plugin, config, lifecycleEvents)
}

/**
 * Check if WebWorker support is available
 */
export function isWebWorkerSupported(): boolean {
  return typeof Worker !== 'undefined' && 
         typeof Blob !== 'undefined' && 
         typeof URL !== 'undefined' &&
         typeof URL.createObjectURL === 'function'
}

/**
 * Create a worker pool for multiple plugins
 */
export class PluginWorkerPool {
  private hosts = new Map<string, PluginWorkerHost>()
  private config: PluginWorkerHostConfig
  private lifecycleEvents: PluginLifecycleEvents

  constructor(
    config: PluginWorkerHostConfig = {},
    lifecycleEvents: PluginLifecycleEvents = {}
  ) {
    this.config = config
    this.lifecycleEvents = lifecycleEvents
  }

  /**
   * Add plugin to pool
   */
  addPlugin(plugin: AgentKitPlugin): PluginWorkerHost {
    if (this.hosts.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} already exists in pool`)
    }

    const host = new PluginWorkerHost(plugin, this.config, this.lifecycleEvents)
    this.hosts.set(plugin.name, host)
    return host
  }

  /**
   * Remove plugin from pool
   */
  async removePlugin(pluginName: string): Promise<void> {
    const host = this.hosts.get(pluginName)
    if (host && host.onShutdown) {
      await host.onShutdown({
        agentId: 'pool',
        transportId: 'pool',
        requestId: 'remove',
        timestamp: Date.now(),
        metadata: { reason: 'Removed from pool' }
      })
    }
    this.hosts.delete(pluginName)
  }

  /**
   * Get all plugin hosts
   */
  getHosts(): PluginWorkerHost[] {
    return Array.from(this.hosts.values())
  }

  /**
   * Shutdown all workers
   */
  async shutdown(): Promise<void> {
    const shutdownPromises = Array.from(this.hosts.values()).map(host => {
      if (host.onShutdown) {
        return host.onShutdown({
          agentId: 'pool',
          transportId: 'pool',
          requestId: 'shutdown',
          timestamp: Date.now(),
          metadata: { reason: 'Pool shutdown' }
        })
      }
    })

    await Promise.all(shutdownPromises)
    this.hosts.clear()
  }

  /**
   * Get pool metrics
   */
  getMetrics(): {
    pluginName: string
    metrics: ExecutionMetrics[]
    workerState: WorkerState | 'no-worker'
  }[] {
    return Array.from(this.hosts.entries()).map(([name, host]) => ({
      pluginName: name,
      metrics: host.getMetrics(),
      workerState: host.getWorkerState()
    }))
  }
}