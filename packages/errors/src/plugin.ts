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
 * Error thrown when plugin signature verification fails
 */
export class PluginSignatureVerificationError extends AgentKitError {
  readonly code = 'PLUGIN_SIGNATURE_VERIFICATION_FAILED' as const
  readonly category = 'security' as const

  constructor(pluginName: string, version: string, reason: string, options?: AgentKitErrorOptions) {
    const docsUrl = 'https://docs.agentkit.com/security/plugin-signing'
    const devSolution = 'You can allow unsigned plugins in development by setting AGENTKIT_ALLOW_UNSIGNED=true'
    
    super(
      `[AgentKit Security] Plugin "${pluginName}" (v${version}) failed signature verification. ${reason}. See: ${docsUrl}. ${devSolution}.`,
      options
    )
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

/**
 * Error thrown when plugin sandbox execution fails
 */
export class PluginSandboxError extends AgentKitError {
  readonly code = 'PLUGIN_SANDBOX_VIOLATION' as const
  readonly category = 'security' as const

  constructor(pluginName: string, hookName: string, reason: string, options?: AgentKitErrorOptions) {
    super(`Plugin "${pluginName}" hook "${hookName}" sandbox violation: ${reason}`, options)
  }
}

/**
 * Error thrown when plugin verification fails
 */
export class PluginVerificationError extends AgentKitError {
  readonly code = 'PLUGIN_VERIFICATION_FAILED' as const
  readonly category = 'security' as const

  constructor(message: string, options?: AgentKitErrorOptions) {
    super(message, options)
  }
}

/**
 * Error thrown when plugin is signed with untrusted key
 */
export class UntrustedPluginError extends AgentKitError {
  readonly code = 'PLUGIN_UNTRUSTED_KEY' as const
  readonly category = 'security' as const

  constructor(message: string, options?: AgentKitErrorOptions) {
    super(message, options)
  }
}

/**
 * Error thrown when plugin signature has expired
 */
export class ExpiredSignatureError extends AgentKitError {
  readonly code = 'PLUGIN_SIGNATURE_EXPIRED' as const
  readonly category = 'security' as const

  constructor(message: string, options?: AgentKitErrorOptions) {
    super(message, options)
  }
}

/**
 * Error thrown when plugin signature is missing
 */
export class MissingSignatureError extends AgentKitError {
  readonly code = 'PLUGIN_SIGNATURE_MISSING' as const
  readonly category = 'security' as const

  constructor(message: string, options?: AgentKitErrorOptions) {
    super(message, options)
  }
}