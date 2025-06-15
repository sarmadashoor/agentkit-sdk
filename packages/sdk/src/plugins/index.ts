/**
 * @agentkit/sdk Plugin System
 * 
 * Provides a robust and extensible plugin interface for AgentKit
 * Plugins can hook into agent lifecycle events without affecting core functionality
 */

export { PluginManager } from './PluginManager'
export { LoggingPlugin, createLoggingPlugin } from './LoggingPlugin'

// New secure plugin system exports
export { SecurePluginManager } from './SecurePluginManager'
export { PluginSandbox } from './PluginSandbox'
export { PluginCompatibilityValidator } from './PluginCompatibilityValidator'

export {
  AgentKitPlugin,
  AgentContext,
  SendPayload,
  PluginManagerOptions,
  PluginHookName,
  AgentContextSchema,
  SendPayloadSchema,
  AgentKitPluginSchema,
  isAgentKitPlugin
} from './types'

export type {
  PluginExecutionSummary,
  HookExecutionOrder,
  SecurePluginManagerOptions
} from './SecurePluginManager'

export type {
  SandboxExecutionResult,
  SandboxOptions
} from './PluginSandbox'

export type {
  CompatibilityResult
} from './PluginCompatibilityValidator'