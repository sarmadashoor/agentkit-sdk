/**
 * Security Module for AgentKit SDK
 * 
 * Provides secure execution environments and validation for plugin code.
 * Implements defense-in-depth security measures including VM isolation,
 * static analysis, and runtime monitoring.
 */

export {
  VMRunner,
  getVMRunner,
  createVMRunner,
  secureClone,
  type VMSecurityConfig,
  type VMExecutionResult,
  type SecureVMContext
} from './vmRunner'

export {
  PluginSecurityCircuitBreaker,
  type SecurityViolationType,
  type SecurityViolationEvent,
  type CircuitBreakerState,
  type PluginSecurityStats,
  type SecurityCircuitBreakerConfig
} from './PluginSecurityCircuitBreaker'