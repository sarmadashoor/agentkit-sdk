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

// Enhanced V2 sandboxing system
export { SecurePluginManagerV2 } from './SecurePluginManagerV2'
export { PluginSandboxV2 } from './PluginSandboxV2'

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

// Enhanced V2 types
export type {
  SecurePluginExecutionResult,
  SecurePluginManagerOptions as SecurePluginManagerV2Options
} from './SecurePluginManagerV2'

export type {
  SandboxExecutionResult as SandboxV2ExecutionResult,
  PluginErrorEvent,
  SandboxOptions as SandboxV2Options
} from './PluginSandboxV2'