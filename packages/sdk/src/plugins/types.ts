import { z } from 'zod'
import { AgentKitError } from '../errors'

// Re-export types from @agentkit/types for backwards compatibility
export type { AgentContext, SendPayload, PluginHookName } from '@agentkit/types'

// Import PluginHookName for local usage
import type { PluginHookName } from '@agentkit/types'

/**
 * Plugin execution result with metadata
 */
export interface PluginExecutionResult {
  pluginName: string
  hookName: PluginHookName
  success: boolean
  duration: number
  error?: Error
  timeout?: boolean
}

/**
 * Observability hooks for plugin manager events
 */
export interface PluginManagerObservabilityHooks {
  /** Called when a plugin times out */
  onPluginTimeout?(pluginName: string, hookName: PluginHookName, timeoutMs: number): void
  /** Called when a plugin throws an error */
  onPluginError?(pluginName: string, hookName: PluginHookName, error: Error): void
  /** Called when a plugin executes successfully */
  onPluginSuccess?(pluginName: string, hookName: PluginHookName, duration: number): void
  /** Called before plugin execution starts */
  onPluginStart?(pluginName: string, hookName: PluginHookName): void
  /** Called when a plugin attempts to escape sandbox */
  onPluginSandboxEscape?(pluginName: string, hookName: PluginHookName, attempt: string): void
  /** Called when sandbox execution starts */
  onPluginSandboxStart?(pluginName: string, hookName: PluginHookName): void
  /** Called when sandbox execution completes */
  onPluginSandboxEnd?(pluginName: string, hookName: PluginHookName, duration: number): void
}

// Re-export AgentKitPlugin from @agentkit/types
export type { AgentKitPlugin } from '@agentkit/types'

/**
 * Configuration options for the PluginManager
 */
export interface PluginManagerOptions {
  /** Enable debug logging */
  debug?: boolean
  /** Maximum time to wait for a plugin hook (ms) */
  hookTimeout?: number
  /** Observability hooks for monitoring plugin execution */
  observabilityHooks?: PluginManagerObservabilityHooks
  /** Whether to fail fast on plugin errors (default: false - continue execution) */
  failFast?: boolean
  /** Enable plugin sandboxing with vm.runInContext (Node.js only, default: true) */
  sandbox?: boolean
  /** Custom timeout for sandbox execution (default: 500ms) */
  sandboxTimeout?: number
  /** Allowed global objects in sandbox context */
  allowedGlobals?: string[]
  /** Enable debug mode for sandbox execution */
  enableDebugMode?: boolean
}

/**
 * Zod schemas for runtime validation
 */

// Re-export schemas from @agentkit/types
export { AgentContextSchema, SendPayloadSchema, AgentKitPluginSchema } from '@agentkit/types'

// Re-export type guard from @agentkit/types
export { isAgentKitPlugin } from '@agentkit/types'

