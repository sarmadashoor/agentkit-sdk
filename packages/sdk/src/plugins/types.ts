import { z } from 'zod'
import { AgentKitError } from '../errors'

/**
 * Context provided to all plugin hooks
 */
export interface AgentContext {
  /** The ID of the agent being used */
  agentId: string
  /** The ID of the transport being used */
  transportId: string
  /** Unique request ID for tracing */
  requestId: string
  /** Timestamp of the operation */
  timestamp: number
  /** Additional metadata that may be available */
  metadata?: Record<string, unknown>
}

/**
 * Payload for the onSend hook
 */
export interface SendPayload {
  /** The input being sent to the agent */
  input: unknown
  /** Additional metadata about the send operation */
  metadata: Record<string, unknown>
}

/**
 * AgentKit Plugin Interface
 * Plugins can hook into various lifecycle events
 */
export interface AgentKitPlugin {
  /** Unique name for the plugin */
  name: string
  /** Semantic version of the plugin */
  version: string
  /** Optional description of what the plugin does */
  description?: string
  
  /**
   * Called when the agent is initialized
   * @param context - The agent context
   */
  onInit?(context: AgentContext): void
  
  /**
   * Called before sending data to the agent
   * @param payload - The data being sent
   * @param context - The agent context
   */
  onSend?(payload: SendPayload, context: AgentContext): void
  
  /**
   * Called when an error occurs
   * @param error - The error that occurred
   * @param context - The agent context
   */
  onError?(error: Error | AgentKitError, context: AgentContext): void
  
  /**
   * Called when the agent is shutting down
   * @param context - The agent context
   */
  onShutdown?(context: AgentContext): void
}

/**
 * Configuration options for the PluginManager
 */
export interface PluginManagerOptions {
  /** Enable debug logging */
  debug?: boolean
  /** Maximum time to wait for a plugin hook (ms) */
  hookTimeout?: number
}

/**
 * Zod schemas for runtime validation
 */

// Context schema
export const AgentContextSchema = z.object({
  agentId: z.string(),
  transportId: z.string(),
  requestId: z.string(),
  timestamp: z.number(),
  metadata: z.record(z.unknown()).optional()
})

// SendPayload schema
export const SendPayloadSchema = z.object({
  input: z.unknown(),
  metadata: z.record(z.unknown())
})

// Plugin hook schemas - simplified for better compatibility
const functionSchema = z.function().optional()

const onInitSchema = functionSchema
const onSendSchema = functionSchema  
const onErrorSchema = functionSchema
const onShutdownSchema = functionSchema

// Complete plugin schema
export const AgentKitPluginSchema = z.object({
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().optional(),
  onInit: onInitSchema,
  onSend: onSendSchema,
  onError: onErrorSchema,
  onShutdown: onShutdownSchema
})

// Type guards
export function isAgentKitPlugin(value: unknown): value is AgentKitPlugin {
  try {
    AgentKitPluginSchema.parse(value)
    return true
  } catch {
    return false
  }
}

// Hook names for type safety
export type PluginHookName = 'onInit' | 'onSend' | 'onError' | 'onShutdown'