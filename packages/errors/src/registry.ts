/**
 * Registry-specific error classes for AgentKit registry operations
 */

import { AgentKitError, AgentKitErrorOptions, ErrorCode, ErrorCategory } from './base'

/**
 * Base class for all registry-related errors
 */
abstract class RegistryError extends AgentKitError {
  abstract readonly code: ErrorCode
  abstract readonly category: ErrorCategory
}

/**
 * Agent not found in registry
 */
export class AgentNotFoundError extends RegistryError {
  readonly code = 'AGENT_NOT_FOUND' as const
  readonly category = 'client' as const

  constructor(agentId: string, options?: AgentKitErrorOptions) {
    super(`Agent not found in registry: ${agentId}`, options)
  }
}

/**
 * Transport not found in registry
 */
export class TransportNotFoundError extends RegistryError {
  readonly code = 'TRANSPORT_NOT_FOUND' as const
  readonly category = 'client' as const

  constructor(transportId: string, options?: AgentKitErrorOptions) {
    super(`Transport not found in registry: ${transportId}`, options)
  }
}

/**
 * Duplicate agent ID in registry
 */
export class DuplicateAgentIdError extends RegistryError {
  readonly code = 'DUPLICATE_AGENT_ID' as const
  readonly category = 'client' as const

  constructor(agentId: string, options?: AgentKitErrorOptions) {
    super(`Agent with id "${agentId}" is already registered in this registry`, options)
  }
}

/**
 * Duplicate transport ID in registry
 */
export class DuplicateTransportIdError extends RegistryError {
  readonly code = 'DUPLICATE_TRANSPORT_ID' as const
  readonly category = 'client' as const

  constructor(transportId: string, options?: AgentKitErrorOptions) {
    super(`Transport with id "${transportId}" is already registered in this registry`, options)
  }
}

/**
 * Registry validation errors
 */
export class RegistryValidationError extends RegistryError {
  readonly code = 'REGISTRY_VALIDATION_FAILED' as const
  readonly category = 'validation' as const

  constructor(message: string, options?: AgentKitErrorOptions) {
    super(`Registry validation failed: ${message}`, options)
  }
}

/**
 * Registry cleanup errors
 */
export class RegistryCleanupError extends RegistryError {
  readonly code = 'REGISTRY_CLEANUP_FAILED' as const
  readonly category = 'internal' as const

  constructor(message: string, options?: AgentKitErrorOptions) {
    super(`Registry cleanup failed: ${message}`, options)
  }
}

/**
 * Schema validation errors for agent metadata
 */
export class AgentMetadataValidationError extends RegistryError {
  readonly code = 'SCHEMA_VALIDATION_FAILED' as const
  readonly category = 'validation' as const

  constructor(validationError: string, options?: AgentKitErrorOptions) {
    super(`Agent metadata validation failed: ${validationError}`, options)
  }
}

/**
 * Schema validation errors for transport metadata
 */
export class TransportMetadataValidationError extends RegistryError {
  readonly code = 'SCHEMA_VALIDATION_FAILED' as const
  readonly category = 'validation' as const

  constructor(validationError: string, options?: AgentKitErrorOptions) {
    super(`Transport metadata validation failed: ${validationError}`, options)
  }
}

/**
 * Agent compatibility errors
 */
export class AgentCompatibilityError extends RegistryError {
  readonly code = 'INVALID_CONFIGURATION' as const
  readonly category = 'config' as const

  constructor(agentId: string, transportId: string, reason: string, options?: AgentKitErrorOptions) {
    super(`Agent "${agentId}" is not compatible with transport "${transportId}": ${reason}`, options)
  }
}

/**
 * Registry capacity errors
 */
export class RegistryCapacityError extends RegistryError {
  readonly code = 'RESOURCE_EXHAUSTED' as const
  readonly category = 'resource' as const

  constructor(resourceType: 'agents' | 'transports', limit: number, options?: AgentKitErrorOptions) {
    super(`Registry capacity exceeded: maximum ${limit} ${resourceType} allowed`, options)
  }
}