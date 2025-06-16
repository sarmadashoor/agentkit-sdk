export { BrowserTransport } from './BrowserTransport'
export type { BrowserTransportConfig } from './BrowserTransport'

// WebWorker-based plugin isolation
export { PluginWorker } from './worker/PluginWorker'
export type { PluginWorkerConfig, WorkerState } from './worker/PluginWorker'

export { 
  PluginWorkerHost, 
  PluginWorkerPool,
  wrapPluginWithWorker,
  isWebWorkerSupported 
} from './worker/PluginWorkerHost'
export type { 
  PluginWorkerHostConfig, 
  ExecutionMetrics, 
  PluginLifecycleEvents 
} from './worker/PluginWorkerHost'

// WebWorker message types
export * from './WebWorkerMessages'