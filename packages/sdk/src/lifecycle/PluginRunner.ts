/**
 * Plugin Runner Manager
 * 
 * Handles plugin registration, verification, execution, and lifecycle management
 * for AgentKit SDK.
 */

import { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'
import { PluginVerificationError } from '@agentkit/errors'
import { PluginManager } from '../plugins'
import { debugLog } from '../log'
import { 
  verifyPlugins, 
  createVerificationOptions,
  validateVerificationMode,
  type VerificationMode 
} from '../security/plugin-hmac-verifier'
import { 
  logPluginStart,
  logPluginSuccess,
  logPluginError,
  logPluginTimeout
} from '../debug-tools'

export interface PluginRunnerConfig {
  agentId: string
  transportId: string
  verify?: VerificationMode
  debug?: boolean
  debugModeEnabled?: boolean
}

export interface PluginObservabilityHooks {
  onPluginStart?: (pluginName: string, hookName: string) => void
  onPluginSuccess?: (pluginName: string, hookName: string, duration: number) => void
  onPluginError?: (pluginName: string, hookName: string, error: Error) => void
  onPluginTimeout?: (pluginName: string, hookName: string, timeout: number) => void
}

export class PluginRunner {
  private pluginManager: PluginManager
  private pendingPlugins: AgentKitPlugin[] = []
  private config: PluginRunnerConfig
  private observabilityHooks: PluginObservabilityHooks

  constructor(
    config: PluginRunnerConfig,
    plugins: AgentKitPlugin[] = [],
    observabilityHooks: PluginObservabilityHooks = {}
  ) {
    this.config = config
    this.observabilityHooks = observabilityHooks
    
    // SECURITY PATCH: Validate verification mode before storing plugins
    const verificationMode = config.verify || 'warn'
    const verificationValidation = validateVerificationMode(verificationMode)
    if (!verificationValidation.valid) {
      throw new PluginVerificationError(verificationValidation.errors.join('; '), {
        context: { 
          verificationMode,
          errors: verificationValidation.errors
        }
      })
    }
    
    // Store plugins for verification during initialization
    this.pendingPlugins = plugins

    // Initialize plugin manager with observability hooks
    this.pluginManager = new PluginManager({
      debug: config.debug || false,
      observabilityHooks: {
        onPluginStart: (pluginName: string, hookName: string) => {
          this.observabilityHooks.onPluginStart?.(pluginName, hookName)
          // Log visual trace output
          if (this.config.debugModeEnabled) {
            logPluginStart(pluginName, hookName)
          }
        },
        onPluginSuccess: (pluginName: string, hookName: string, duration: number) => {
          this.observabilityHooks.onPluginSuccess?.(pluginName, hookName, duration)
          // Log visual trace output
          if (this.config.debugModeEnabled) {
            logPluginSuccess(pluginName, hookName, duration)
          }
        },
        onPluginError: (pluginName: string, hookName: string, error: Error) => {
          this.observabilityHooks.onPluginError?.(pluginName, hookName, error)
          // Log visual trace output
          if (this.config.debugModeEnabled) {
            logPluginError(pluginName, hookName, error.message, Date.now())
          }
        },
        onPluginTimeout: (pluginName: string, hookName: string, timeout: number) => {
          this.observabilityHooks.onPluginTimeout?.(pluginName, hookName, timeout)
          // Log visual trace output
          if (this.config.debugModeEnabled) {
            logPluginTimeout(pluginName, hookName, timeout)
          }
        }
      }
    })
  }

  /**
   * Initialize plugins with verification
   */
  async initialize(): Promise<void> {
    await this.registerPluginsWithVerification()
  }

  /**
   * Helper method to call plugin hooks safely
   */
  async callPluginHook(hookName: 'onInit' | 'onShutdown', context: AgentContext): Promise<void>
  async callPluginHook(hookName: 'onSend', payload: SendPayload, context: AgentContext): Promise<void>  
  async callPluginHook(hookName: 'onError', error: Error, context: AgentContext): Promise<void>
  async callPluginHook(hookName: string, ...args: unknown[]): Promise<void> {
    try {
      let results
      if (hookName === 'onSend' && args.length === 2) {
        results = await this.pluginManager.executeHook('onSend', args[0] as SendPayload, args[1] as AgentContext)
      } else if (hookName === 'onError' && args.length === 2) {
        results = await this.pluginManager.executeHook('onError', args[0] as Error, args[1] as AgentContext)
      } else if ((hookName === 'onInit' || hookName === 'onShutdown') && args.length === 1) {
        results = await this.pluginManager.executeHook(hookName as 'onInit' | 'onShutdown', args[0] as AgentContext)
      } else {
        // Fallback - should not happen with proper typing
        throw new Error(`Invalid plugin hook call: ${hookName} with ${args.length} arguments`)
      }
      
      // Log any plugin failures for debugging
      const failures = results.filter(r => !r.success)
      if (failures.length > 0 && this.config.debug) {
        failures.forEach(failure => {
          debugLog.warn('Plugin hook failed', { 
            pluginName: failure.pluginName, 
            hookName: failure.hookName, 
            error: failure.error 
          }, this.config.debug)
        })
      }
    } catch (error) {
      // Plugin execution should not break the main flow
      debugLog.error('plugin hook execution', error as Error, this.config.debug)
      if (this.config.debug) {
        debugLog.warn('Plugin hook failed', { hookName, error }, this.config.debug)
      }
    }
  }

  /**
   * Verify and register plugins with HMAC signature checking
   */
  private async registerPluginsWithVerification(): Promise<void> {
    if (this.pendingPlugins.length === 0) {
      return
    }

    const verificationMode = this.config.verify || 'warn'
    const verificationOptions = createVerificationOptions(
      verificationMode,
      undefined, // Use environment variable for secret
      console
    )

    debugLog.operation('plugin verification start', { 
      pluginCount: this.pendingPlugins.length,
      mode: verificationMode
    }, this.config.debug)

    // Verify all plugins in batch
    const verificationResult = await verifyPlugins(this.pendingPlugins, verificationOptions)

    // Log verification results
    debugLog.operation('plugin verification complete', {
      success: verificationResult.success,
      totalPlugins: this.pendingPlugins.length,
      totalErrors: verificationResult.totalErrors,
      totalWarnings: verificationResult.totalWarnings
    }, this.config.debug)

    // Process results and register successful plugins
    for (const result of verificationResult.results) {
      if (result.success) {
        this.pluginManager.register(result.plugin)
        debugLog.operation('plugin registered', { 
          name: result.plugin.name,
          version: result.plugin.version 
        }, this.config.debug)
      } else {
        // Log errors for failed plugins
        result.errors.forEach(error => {
          debugLog.error('plugin verification error', new Error(error), this.config.debug)
        })
        
        // Throw error if verification failed and we're in strict mode
        if (!result.success && verificationMode === 'strict') {
          throw new PluginVerificationError(result.errors.join('; '), {
            context: { 
              pluginName: result.plugin.name,
              verificationMode,
              errors: result.errors
            }
          })
        }
      }
    }

    // If overall verification failed in strict mode, throw
    if (!verificationResult.success && verificationMode === 'strict') {
      const allErrors = verificationResult.results.flatMap(r => r.errors)
      throw new PluginVerificationError(`Plugin verification failed: ${allErrors.join('; ')}`, {
        context: { 
          verificationMode,
          totalErrors: verificationResult.totalErrors
        }
      })
    }

    // Clear pending plugins
    this.pendingPlugins = []
  }

  /**
   * Register a single plugin
   */
  registerPlugin(plugin: AgentKitPlugin): void {
    this.pluginManager.register(plugin)
  }

  /**
   * Get plugin manager instance
   */
  getPluginManager(): PluginManager {
    return this.pluginManager
  }

  /**
   * Update observability hooks
   */
  updateObservabilityHooks(hooks: PluginObservabilityHooks): void {
    this.observabilityHooks = { ...this.observabilityHooks, ...hooks }
  }

  /**
   * Get registered plugins count
   */
  getRegisteredPluginsCount(): number {
    return this.pluginManager.getRegisteredPlugins().length
  }

  /**
   * Get pending plugins count
   */
  getPendingPluginsCount(): number {
    return this.pendingPlugins.length
  }

  /**
   * Cleanup plugin resources
   */
  async cleanup(): Promise<void> {
    // Plugin manager cleanup is handled internally
    this.pendingPlugins = []
  }
}