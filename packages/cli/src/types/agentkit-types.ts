/**
 * Local type definitions for AgentKit CLI
 * These are minimal versions to avoid workspace dependencies
 */

export interface AgentKitPlugin {
  name: string
  version: string
  description?: string
  onInit?: (context: AgentContext) => Promise<void>
  onSend?: (payload: SendPayload, context: AgentContext) => Promise<SendPayload>
  onError?: (error: Error, context: AgentContext) => Promise<void>
  onShutdown?: (context: AgentContext) => Promise<void>
}

export interface AgentContext {
  agentId: string
  transportId: string
  scope: string[]
  config: Record<string, unknown>
}

export interface SendPayload {
  message?: string
  data?: unknown
  metadata?: Record<string, unknown>
}

export type PluginHookName = 'onInit' | 'onSend' | 'onError' | 'onShutdown'