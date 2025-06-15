/**
 * Plugin-related error classes
 */

import { AgentKitError, type AgentKitErrorOptions } from './base'

/**
 * Error thrown when plugin validation fails
 */
export class PluginValidationError extends AgentKitError {
  readonly code = 'PLUGIN_VALIDATION_FAILED' as const
  readonly category = 'config' as const

  constructor(pluginName: string, reason: string, options?: AgentKitErrorOptions) {
    super(`Plugin "${pluginName}" validation failed: ${reason}`, options)
  }
}

/**
 * Error thrown when plugin compatibility checks fail
 */
export class PluginCompatibilityError extends AgentKitError {
  readonly code = 'PLUGIN_COMPATIBILITY_FAILED' as const
  readonly category = 'config' as const

  constructor(pluginName: string, reason: string, options?: AgentKitErrorOptions) {
    super(`Plugin "${pluginName}" compatibility check failed: ${reason}`, options)
  }
}

/**
 * Error thrown when plugin hook execution fails
 */
export class PluginHookError extends AgentKitError {
  readonly code = 'PLUGIN_HOOK_FAILED' as const
  readonly category = 'plugin' as const

  constructor(pluginName: string, hookName: string, reason: string, options?: AgentKitErrorOptions) {
    super(`Plugin "${pluginName}" hook "${hookName}" failed: ${reason}`, options)
  }
}

/**
 * Error thrown when plugin registration fails
 */
export class PluginRegistrationError extends AgentKitError {
  readonly code = 'PLUGIN_REGISTRATION_FAILED' as const
  readonly category = 'config' as const

  constructor(pluginName: string, reason: string, options?: AgentKitErrorOptions) {
    super(`Failed to register plugin "${pluginName}": ${reason}`, options)
  }
}

/**
 * Error thrown when plugin execution times out
 */
export class PluginTimeoutError extends AgentKitError {
  readonly code = 'PLUGIN_TIMEOUT' as const
  readonly category = 'resource' as const

  constructor(operation: string, timeoutMs: number, options?: AgentKitErrorOptions) {
    super(`Plugin operation "${operation}" timed out after ${timeoutMs}ms`, options)
  }
}

/**
 * Error thrown when plugin signature is invalid
 */
export class PluginSignatureError extends AgentKitError {
  readonly code = 'PLUGIN_INVALID_SIGNATURE' as const
  readonly category = 'validation' as const

  constructor(pluginName: string, hookName: string, reason: string, options?: AgentKitErrorOptions) {
    super(`Plugin "${pluginName}" hook "${hookName}" has invalid signature: ${reason}`, options)
  }
}

/**
 * Error thrown when plugin attempts recursive SDK calls
 */
export class RecursivePluginCallError extends AgentKitError {
  readonly code = 'PLUGIN_RECURSIVE_CALL' as const
  readonly category = 'security' as const

  constructor(pluginName: string, hookName: string, recursiveCall: string, options?: AgentKitErrorOptions) {
    super(`Plugin "${pluginName}" hook "${hookName}" attempted recursive SDK call: ${recursiveCall}. This is not allowed to prevent infinite recursion.`, options)
  }
}