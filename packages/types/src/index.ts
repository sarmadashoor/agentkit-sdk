import { z } from 'zod'

export interface Agent {
  id: string
  name: string
  version: string
  init: (config?: unknown) => Promise<void>
  handle: (input: unknown) => Promise<unknown>
  shutdown: () => Promise<void>
}

export interface Transport {
  id: string
  name: string
  init: (config?: unknown) => Promise<void>
  send: (message: unknown) => Promise<void>
  receive: () => Promise<unknown>
  config?: unknown
}

export interface ObservabilityHooks {
  onRequestStart?: (metadata: RequestMetadata) => void
  onRequestEnd?: (metadata: RequestMetadata, duration: number) => void
  onError?: (error: Error, context: ErrorContext) => void
}

export interface RequestMetadata {
  requestId: string
  operation: 'init' | 'send' | 'shutdown'
  agentId: string
  transportId: string
  timestamp: string
  context?: Record<string, unknown>
}

export interface ErrorContext {
  requestId?: string
  operation?: string
  agentId: string
  transportId: string
  timestamp: string
  phase: 'init' | 'handle' | 'send' | 'shutdown' | 'cleanup'
  error: Error
  context?: Record<string, unknown>
}

export interface ConnectAgentOptions {
  agent: string | Agent
  transport: string | Transport
  scope?: string[]
  techStack?: string
  onOutput?: (message: unknown) => void
  debug?: boolean
  // Registry instance for agent/transport lookup
  registry?: any // Will be typed as AgentRegistry in the SDK package to avoid circular dependency
  // Lifecycle event hooks
  onInit?: (agentId: string) => void
  onShutdown?: (agentId: string) => void
  onError?: (err: Error) => void
  onCleanup?: (agentId: string) => void
  // Observability hooks
  observability?: ObservabilityHooks
}

export interface AgentRuntimeHandle {
  send: (input: unknown) => Promise<void>
  shutdown: () => Promise<void>
  metadata: {
    agentId: string
    transportId: string
    registeredScopes: string[]
    requestedScopes: string[]
  }
}

export interface AgentMetadata {
  id: string
  name: string
  version: string
  description?: string
  supportedScopes?: string[]
  factory: () => Agent
}

export const AgentSchema = z.object({
  id: z.string().min(1, 'Agent ID cannot be empty'),
  name: z.string().min(1, 'Agent name cannot be empty'),
  version: z.string().min(1, 'Agent version cannot be empty'),
  init: z.function().args(z.unknown().optional()).returns(z.promise(z.void())),
  handle: z.function().args(z.unknown()).returns(z.promise(z.unknown())),
  shutdown: z.function().returns(z.promise(z.void()))
})

export const TransportSchema = z.object({
  id: z.string().min(1, 'Transport ID cannot be empty'),
  name: z.string().min(1, 'Transport name cannot be empty'),
  init: z.function().args(z.unknown().optional()).returns(z.promise(z.void())),
  send: z.function().args(z.unknown()).returns(z.promise(z.void())),
  receive: z.function().returns(z.promise(z.unknown())),
  config: z.unknown().optional()
})

const RequestMetadataSchema = z.object({
  requestId: z.string(),
  operation: z.enum(['init', 'send', 'shutdown']),
  agentId: z.string(),
  transportId: z.string(),
  timestamp: z.string(),
  context: z.record(z.unknown()).optional()
})

const ErrorContextSchema = z.object({
  requestId: z.string().optional(),
  operation: z.string().optional(),
  agentId: z.string(),
  transportId: z.string(),
  timestamp: z.string(),
  phase: z.enum(['init', 'handle', 'send', 'shutdown', 'cleanup']),
  error: z.instanceof(Error),
  context: z.record(z.unknown()).optional()
})

const ObservabilityHooksSchema = z.object({
  onRequestStart: z.function().args(RequestMetadataSchema).returns(z.void()).optional(),
  onRequestEnd: z.function().args(RequestMetadataSchema, z.number()).returns(z.void()).optional(),
  onError: z.function().args(z.instanceof(Error), ErrorContextSchema).returns(z.void()).optional()
}).optional()

export const ConnectAgentOptionsSchema = z.object({
  agent: z.union([z.string(), AgentSchema]),
  transport: z.union([z.string(), TransportSchema]),
  scope: z.array(z.string()).optional(),
  techStack: z.string().optional(),
  onOutput: z.function().args(z.unknown()).returns(z.void()).optional(),
  debug: z.boolean().optional(),
  // Registry instance for agent/transport lookup
  registry: z.any().optional(), // Will be validated in the SDK package
  // Lifecycle event hooks
  onInit: z.function().args(z.string()).returns(z.void()).optional(),
  onShutdown: z.function().args(z.string()).returns(z.void()).optional(),
  onError: z.function().args(z.instanceof(Error)).returns(z.void()).optional(),
  onCleanup: z.function().args(z.string()).returns(z.void()).optional(),
  // Observability hooks
  observability: ObservabilityHooksSchema
})

export const AgentMetadataSchema = z.object({
  id: z.string().min(1, 'Agent ID cannot be empty'),
  name: z.string().min(1, 'Agent name cannot be empty'),
  version: z.string().min(1, 'Agent version cannot be empty'),
  description: z.string().optional(),
  supportedScopes: z.array(z.string()).optional(),
  factory: z.function().returns(AgentSchema)
})

export type ValidatedAgent = z.infer<typeof AgentSchema>
export type ValidatedTransport = z.infer<typeof TransportSchema>
export type ValidatedConnectAgentOptions = z.infer<typeof ConnectAgentOptionsSchema>
export type ValidatedAgentMetadata = z.infer<typeof AgentMetadataSchema>