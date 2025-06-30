import type { AgentKitPlugin, AgentContext, SendPayload, PluginHookName } from '@agentkit/types'
import { AgentKitError } from '../errors'
import { debugLog } from '../log'
import { WorkerPool } from './worker-utils'

// Import new modular components
import { PluginRegistry } from './core/PluginRegistry'
import { PlatformEnvironment } from './environment/PlatformEnvironment'
import { PluginSecurity } from './security/PluginSecurity'
import { PluginExecutor } from './execution/PluginExecutor'
import { PluginObservability } from './observability/PluginObservability'
import type { PluginManagerOptions, PluginExecutionResult } from './types'

/**
 * PluginManager - Refactored modular version
 * 
 * Main orchestrator that coordinates plugin lifecycle through specialized modules:
 * - PluginRegistry: Plugin registration and lookup
 * - PlatformEnvironment: Platform detection and sandbox context
 * - PluginSecurity: Argument sanitization and security validation
 * - PluginExecutor: Plugin execution in different environments
 * - PluginObservability: Execution lifecycle and monitoring
 */
export class PluginManager {
  private registry: PluginRegistry
  private platformEnv: PlatformEnvironment
  private security: PluginSecurity
  private executor: PluginExecutor
  private observability: PluginObservability
  private workerPool?: WorkerPool
  private options: Required<Omit<PluginManagerOptions, 'observabilityHooks' | 'allowedGlobals'>> & {
    observabilityHooks?: PluginManagerOptions['observabilityHooks']
    allowedGlobals?: string[]
  }
  private isShutdown = false

  constructor(options: PluginManagerOptions = {}) {
    // Setup configuration with defaults
    this.options = {
      debug: options.debug ?? false,
      hookTimeout: options.hookTimeout ?? 5000,
      failFast: options.failFast ?? false,
      observabilityHooks: options.observabilityHooks,
      sandbox: options.sandbox ?? true,
      sandboxTimeout: options.sandboxTimeout ?? 2000,
      allowedGlobals: options.allowedGlobals ?? ['Math', 'Date', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean'],
      enableDebugMode: options.enableDebugMode ?? false
    }

    // Initialize core modules
    this.registry = new PluginRegistry(this.options.debug)
    this.platformEnv = new PlatformEnvironment(this.options.debug)
    this.security = new PluginSecurity(this.options.debug)

    // Setup sandboxing based on platform capabilities
    this.setupSandboxing()

    // Initialize executor with dependencies
    this.executor = new PluginExecutor({
      platformEnv: this.platformEnv,
      security: this.security,
      workerPool: this.workerPool,
      observabilityHooks: this.options.observabilityHooks,
      debug: this.options.debug,
      sandbox: this.options.sandbox,
      sandboxTimeout: this.options.sandboxTimeout,
      allowedGlobals: this.options.allowedGlobals,
      enableDebugMode: this.options.enableDebugMode
    })

    // Initialize observability with dependencies
    this.observability = new PluginObservability({
      registry: this.registry,
      security: this.security,
      executor: this.executor,
      observabilityHooks: this.options.observabilityHooks,
      debug: this.options.debug,
      hookTimeout: this.options.hookTimeout,
      failFast: this.options.failFast
    })

    debugLog.lifecycle('plugin manager created', 'PluginManager', {
      hookTimeout: this.options.hookTimeout,
      failFast: this.options.failFast,
      debug: this.options.debug,
      sandbox: this.options.sandbox,
      sandboxTimeout: this.options.sandboxTimeout,
      allowedGlobals: this.options.allowedGlobals?.length,
      platform: this.platformEnv.getPlatformName(),
      hasWorkerPool: !!this.workerPool,
      supportsSandboxing: this.platformEnv.supportsSandboxing()
    }, this.options.debug)

    // Warn if sandboxing is disabled in debug/development mode
    if (!this.options.sandbox && (this.options.debug || this.options.enableDebugMode)) {
      console.warn('Plugin sandboxing disabled. This should only be used in development or trusted environments.')
    }
  }

  /**
   * Register a plugin with validation
   */
  register(plugin: AgentKitPlugin): void {
    this.registry.register(plugin)
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): ReadonlyArray<AgentKitPlugin> {
    return this.registry.getPlugins()
  }

  /**
   * Get plugin by name
   */
  getPlugin(name: string): AgentKitPlugin | undefined {
    return this.registry.getPlugin(name)
  }

  /**
   * Remove a plugin by name
   */
  removePlugin(name: string): boolean {
    return this.registry.removePlugin(name)
  }

  /**
   * Clear all registered plugins
   */
  clear(): void {
    this.registry.clear()
  }

  /**
   * Execute a hook on all plugins that implement it
   */
  // eslint-disable-next-line no-dupe-class-members
  executeHook(hookName: 'onInit' | 'onShutdown', context: AgentContext): Promise<PluginExecutionResult[]>
  // eslint-disable-next-line no-dupe-class-members
  executeHook(hookName: 'onSend', payload: SendPayload, context: AgentContext): Promise<PluginExecutionResult[]>
  // eslint-disable-next-line no-dupe-class-members
  executeHook(hookName: 'onError', error: Error | AgentKitError, context: AgentContext): Promise<PluginExecutionResult[]>
  // eslint-disable-next-line no-dupe-class-members
  async executeHook(
    hookName: PluginHookName, 
    ...args: [AgentContext] | [SendPayload, AgentContext] | [Error | AgentKitError, AgentContext]
  ): Promise<PluginExecutionResult[]> {
    return (this.observability.executeHook as any)(hookName, ...args)
  }

  /**
   * Get execution summary for performance analysis
   */
  createExecutionSummary(results: PluginExecutionResult[]) {
    return this.observability.createExecutionSummary(results)
  }

  /**
   * Get platform information
   */
  getPlatformInfo() {
    return {
      platform: this.platformEnv.getPlatformName(),
      capabilities: this.platformEnv.getCapabilities(),
      supportsSandboxing: this.platformEnv.supportsSandboxing(),
      recommendedStrategy: this.platformEnv.getRecommendedSandboxStrategy()
    }
  }

  /**
   * Get all registered plugins
   */
  getRegisteredPlugins(): ReadonlyArray<AgentKitPlugin> {
    return this.registry.getPlugins()
  }

  /**
   * Generate security report for a plugin
   */
  generateSecurityReport(plugin: AgentKitPlugin) {
    return this.security.createSecurityReport(plugin)
  }

  /**
   * Shutdown the plugin manager and clean up all resources
   */
  shutdown(): void {
    if (this.isShutdown) {
      return
    }

    this.isShutdown = true

    // Shutdown all modules
    this.observability.shutdown()
    
    if (this.workerPool) {
      this.workerPool.shutdown()
      this.workerPool = undefined
    }

    debugLog.operation('plugin manager shutdown', {
      platform: this.platformEnv.getPlatformName(),
      hadWorkerPool: !!this.workerPool
    }, this.options.debug)
  }

  /**
   * Setup sandboxing based on platform capabilities
   */
  private setupSandboxing(): void {
    if (!this.options.sandbox) {
      debugLog.lifecycle('sandbox disabled by configuration', 'PluginManager', {}, this.options.debug)
      return
    }

    const capabilities = this.platformEnv.getCapabilities()
    const strategy = this.platformEnv.getRecommendedSandboxStrategy()

    switch (strategy) {
      case 'vm':
        debugLog.lifecycle('sandbox enabled - Node.js vm.runInContext', 'PluginManager', {
          platform: 'node'
        }, this.options.debug)
        break

      case 'worker': {
        this.workerPool = new WorkerPool({
          maxWorkers: 3,
          maxIdleTime: 30000,
          debug: this.options.debug,
          preWarm: false
        })
        debugLog.lifecycle('sandbox enabled - Browser Web Workers', 'PluginManager', {
          platform: 'browser',
          webWorkerSupport: true
        }, this.options.debug)
        break
      }

      case 'none': {
        this.options.sandbox = false
        debugLog.lifecycle('sandbox disabled - platform not supported', 'PluginManager', {
          platform: this.platformEnv.getPlatformName(),
          isNodeJS: capabilities.isNodeJS,
          isBrowser: capabilities.isBrowser,
          supportsWebWorkers: capabilities.supportsWebWorkers
        }, this.options.debug)

        if (this.options.enableDebugMode && typeof console !== 'undefined') {
          console.warn(
            'AgentKit: Plugin sandboxing disabled due to unsupported environment. ' +
            'This may pose security risks with untrusted plugins.'
          )
        }
        break
      }
    }
  }
}