/**
 * Lightweight browser runtime for AgentKit SDK
 * Optimized for minimal bundle size with typed WebWorker messaging
 */
export { BrowserTransportLite as BrowserTransport } from './BrowserTransportLite.js'
export type { BrowserTransportConfig } from './BrowserTransportLite.js'

// Typed WebWorker messaging system
export { 
  WebWorkerMessageValidator,
  WebWorkerCommunicator,
  type WebWorkerMessage,
  type PluginExecutionRequest,
  type PluginExecutionResult,
  type PluginLogMessage,
  type HealthCheckMessage,
  type TerminationMessage,
  type ErrorMessage,
  type WebWorkerMessageHandler,
  isPluginExecutionRequest,
  isPluginExecutionResult,
  isPluginLogMessage,
  isHealthCheckMessage,
  isTerminationMessage,
  isErrorMessage
} from './WebWorkerMessages.js'

// Runtime info utility
export { getRuntimeInfo } from './utils/runtimeInfo.js'