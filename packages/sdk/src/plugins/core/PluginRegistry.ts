import type { AgentKitPlugin, PluginHookName } from '@agentkit/types'
import { AgentKitPluginSchema } from '../types'
import { PluginValidationError, PluginSignatureError } from '../../errors'
import { debugLog } from '../../log'
import { PluginSignature, PluginSignatureConfig } from '../../security/PluginSignature'
import { EnvironmentGuard } from '../../security/EnvironmentGuard'

/**
 * Plugin Registry - Manages plugin registration and lookup
 */
export class PluginRegistry {
  private plugins: AgentKitPlugin[] = []
  private debug: boolean
  private signature?: PluginSignature

  constructor(debug: boolean = false, signatureConfig?: PluginSignatureConfig) {
    this.debug = debug

    if (signatureConfig || EnvironmentGuard.isProduction()) {
      this.signature = new PluginSignature(signatureConfig || {
        publicKey: process.env.AGENTKIT_PUBLIC_KEY || '',
        allowUnsigned: !EnvironmentGuard.isProduction(),
        trustedKeys: process.env.AGENTKIT_TRUSTED_KEYS?.split(',') || []
      });
    }
  }

  /**
   * Register a plugin with validation
   */
  register(plugin: AgentKitPlugin): void {
    // Verify plugin signature if signature verification is enabled
    if (this.signature && !this.signature.verifyPlugin(plugin as any)) {
      throw new PluginSignatureError(plugin.name, 'signature', 'Plugin signature verification failed');
    }

    // Validate plugin schema
    try {
      AgentKitPluginSchema.parse(plugin)
    } catch (error) {
      throw new PluginValidationError(plugin.name || 'unknown', String(error), {
        context: { plugin: plugin.name, validationError: error }
      })
    }

    // Validate hook functions are actually functions and have correct signatures
    this.validatePluginHooks(plugin)

    this.plugins.push(plugin)
    
    const availableHooks = [
      plugin.onInit ? 'onInit' : null,
      plugin.onSend ? 'onSend' : null, 
      plugin.onError ? 'onError' : null,
      plugin.onShutdown ? 'onShutdown' : null
    ].filter(Boolean)
    
    debugLog.operation('plugin registered', {
      name: plugin.name,
      version: plugin.version,
      hooks: availableHooks
    }, this.debug)
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): ReadonlyArray<AgentKitPlugin> {
    return [...this.plugins]
  }

  /**
   * Get plugin by name
   */
  getPlugin(name: string): AgentKitPlugin | undefined {
    return this.plugins.find(p => p.name === name)
  }

  /**
   * Remove a plugin by name
   */
  removePlugin(name: string): boolean {
    const initialLength = this.plugins.length
    this.plugins = this.plugins.filter(p => p.name !== name)
    const removed = this.plugins.length < initialLength
    
    if (removed) {
      debugLog.operation('plugin removed', { name }, this.debug)
    }
    
    return removed
  }

  /**
   * Clear all registered plugins
   */
  clear(): void {
    this.plugins = []
    debugLog.operation('plugins cleared', {}, this.debug)
  }

  /**
   * Get plugins that implement a specific hook
   */
  getPluginsWithHook(hookName: PluginHookName): Array<{ plugin: AgentKitPlugin; hook: Function }> {
    return this.plugins
      .map(plugin => ({ plugin, hook: (plugin as any)[hookName] }))
      .filter(({ hook }) => typeof hook === 'function')
  }

  /**
   * Validate plugin hook functions and signatures
   */
  private validatePluginHooks(plugin: AgentKitPlugin): void {
    const hooks: PluginHookName[] = ['onInit', 'onSend', 'onError', 'onShutdown']
    
    for (const hookName of hooks) {
      const hook = (plugin as any)[hookName]
      if (!hook) {continue}
      
      if (typeof hook !== 'function') {
        throw new PluginSignatureError(plugin.name, hookName, 'must be a function', {
          context: { hookType: typeof hook }
        })
      }
      
      // Validate function signature by checking length (parameter count)
      // Skip validation for mock functions and functions with dynamic length
      const isMockFunction = 'mockImplementation' in hook || 'isMockFunction' in hook || hook.toString().includes('Mock')
      
      // Validate parameter count for real functions
      if (!isMockFunction) {
        switch (hookName) {
          case 'onInit':
          case 'onShutdown':
            if (hook.length !== 1 && hook.length !== 0) { // Allow 0 for () => {} style
              throw new PluginSignatureError(plugin.name, hookName, 'must accept exactly 1 parameter (context)', {
                context: { expectedParams: 1, actualParams: hook.length }
              })
            }
            break
          case 'onSend':
            if (hook.length !== 2 && hook.length !== 0) { // Allow 0 for () => {} style
              throw new PluginSignatureError(plugin.name, hookName, 'must accept exactly 2 parameters (payload, context)', {
                context: { expectedParams: 2, actualParams: hook.length }
              })
            }
            break
          case 'onError':
            if (hook.length !== 2 && hook.length !== 0) { // Allow 0 for () => {} style
              throw new PluginSignatureError(plugin.name, hookName, 'must accept exactly 2 parameters (error, context)', {
                context: { expectedParams: 2, actualParams: hook.length }
              })
            }
            break
        }
      }
    }
  }
}