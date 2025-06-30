/**
 * Lightweight browser runtime for AgentKit SDK
 * Optimized for minimal bundle size with typed WebWorker messaging
 */
export { BrowserTransportLite as BrowserTransport } from './BrowserTransportLite.js'
export type { BrowserTransportConfig } from './BrowserTransportLite.js'

// Typed WebWorker messaging system - only export commonly used types
export { 
  WebWorkerMessageValidator,
  WebWorkerCommunicator,
  type WebWorkerMessage,
  type WebWorkerMessageHandler
} from './WebWorkerMessages.js'

// Export specific message types only when needed
export type { 
  PluginExecutionRequest,
  PluginExecutionResult,
  PluginLogMessage,
  HealthCheckMessage,
  TerminationMessage,
  ErrorMessage
} from './WebWorkerMessages.js'

// Export type guards for runtime checking
export { 
  isPluginExecutionRequest,
  isPluginExecutionResult,
  isPluginLogMessage,
  isHealthCheckMessage,
  isTerminationMessage,
  isErrorMessage
} from './WebWorkerMessages.js'

// Runtime info utility
export { getRuntimeInfo } from './utils/runtimeInfo.js'