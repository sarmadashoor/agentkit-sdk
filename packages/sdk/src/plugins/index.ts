/**
 * @agentkit/sdk Plugin System
 * 
 * Provides a robust and extensible plugin interface for AgentKit
 * Plugins can hook into agent lifecycle events without affecting core functionality
 */

export { PluginManager } from './PluginManager'
export { LoggingPlugin, createLoggingPlugin } from './LoggingPlugin'
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