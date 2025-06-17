/**
 * Web Worker utilities for secure plugin execution in browsers
 * Provides worker pool management and communication abstractions
 */

import { debugLog } from '../log'
import { PluginTimeoutError, PluginSandboxError } from '../errors'
import type { PluginHookName } from '@agentkit/types'

/**
 * Message types for worker communication
 */
export interface WorkerMessage {
  id: string
  type: 'execute' | 'result' | 'error' | 'timeout'
  payload?: {
    functionSource: string
    args: unknown[]
    allowedGlobals: string[]
    timeout: number
  }
  result?: unknown
  error?: {
    message: string
    stack?: string
    name: string
  }
}

/**
 * Worker execution options
 */
export interface WorkerExecutionOptions {
  pluginName: string
  hookName: PluginHookName
  functionSource: string
  args: unknown[]
  timeout: number
  allowedGlobals: string[]
  debug: boolean
}

/**
 * Worker pool configuration
 */
export interface WorkerPoolOptions {
  maxWorkers?: number
  maxIdleTime?: number
  debug?: boolean
  preWarm?: boolean
}

/**
 * Individual worker wrapper with lifecycle management
 */
class PooledWorker {
  private worker: Worker
  private busy = false
  private lastUsed = Date.now()
  private activeExecution: {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timeoutId?: number | NodeJS.Timeout
  } | null = null

  constructor(private debug = false) {
    this.worker = this.createWorker()
    this.setupMessageHandling()
  }

  /**
   * Create a new Web Worker with the plugin execution script
   */
  private createWorker(): Worker {
    // Create worker script as blob to avoid CSP issues
    const workerScript = `
      // Plugin execution environment in Web Worker
      self.onmessage = function(event) {
        const { id, type, payload } = event.data;
        
        if (type !== 'execute') return;
        
        try {
          const { functionSource, args, allowedGlobals, timeout } = payload;
          
          // Create restricted global context
          const restrictedGlobals = {
            // Explicitly undefined dangerous globals
            window: undefined,
            document: undefined,
            location: undefined,
            history: undefined,
            navigator: undefined,
            localStorage: undefined,
            sessionStorage: undefined,
            indexedDB: undefined,
            fetch: undefined,
            XMLHttpRequest: undefined,
            WebSocket: undefined,
            
            // Safe globals
            ...allowedGlobals.reduce((acc, name) => {
              try {
                if (self[name] !== undefined) {
                  acc[name] = self[name];
                }
              } catch (e) {
                // Ignore globals that can't be accessed
              }
              return acc;
            }, {})
          };
          
          // Execute function in restricted context
          const executePlugin = new Function('context', 'args', \`
            // Override dangerous globals in execution scope
            const window = undefined;
            const document = undefined;
            const location = undefined;
            const history = undefined;
            const navigator = undefined;
            const localStorage = undefined;
            const sessionStorage = undefined;
            const indexedDB = undefined;
            const fetch = undefined;
            const XMLHttpRequest = undefined;
            const WebSocket = undefined;
            
            // Make safe globals available
            \${Object.keys(restrictedGlobals).map(key => 
              \`const \${key} = context[\${JSON.stringify(key)}];\`
            ).join('\\n')}
            
            // Execute the plugin function
            const pluginFn = \${functionSource};
            return pluginFn.apply(null, args);
          \`);
          
          const result = executePlugin(restrictedGlobals, args);
          
          // Handle async results
          if (result && typeof result.then === 'function') {
            result
              .then(asyncResult => {
                self.postMessage({
                  id,
                  type: 'result',
                  result: asyncResult
                });
              })
              .catch(asyncError => {
                self.postMessage({
                  id,
                  type: 'error',
                  error: {
                    message: asyncError.message,
                    stack: asyncError.stack,
                    name: asyncError.name
                  }
                });
              });
          } else {
            self.postMessage({
              id,
              type: 'result',
              result
            });
          }
          
        } catch (error) {
          self.postMessage({
            id,
            type: 'error',
            error: {
              message: error.message,
              stack: error.stack,
              name: error.name
            }
          });
        }
      };
    `

    const blob = new Blob([workerScript], { type: 'application/javascript' })
    const workerURL = URL.createObjectURL(blob)
    
    const worker = new Worker(workerURL)
    
    // Clean up blob URL
    setTimeout(() => URL.revokeObjectURL(workerURL), 1000)
    
    return worker
  }

  /**
   * Set up message handling for the worker
   */
  private setupMessageHandling(): void {
    this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (!this.activeExecution) return

      const { type, result, error } = event.data

      if (type === 'result') {
        this.resolveExecution(result)
      } else if (type === 'error') {
        this.rejectExecution(new Error(error?.message || 'Worker execution failed'))
      }
    }

    this.worker.onerror = (error: ErrorEvent) => {
      if (this.activeExecution) {
        this.rejectExecution(new Error(`Worker error: ${error.message}`))
      }
    }

    this.worker.onmessageerror = (error: MessageEvent) => {
      if (this.activeExecution) {
        this.rejectExecution(new Error('Worker message error'))
      }
    }
  }

  /**
   * Execute a plugin in this worker
   */
  async execute(options: WorkerExecutionOptions): Promise<unknown> {
    if (this.busy) {
      throw new Error('Worker is busy')
    }

    this.busy = true
    this.lastUsed = Date.now()

    return new Promise((resolve, reject) => {
      const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      this.activeExecution = { resolve, reject }

      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.rejectExecution(
          new PluginTimeoutError(
            `${options.pluginName}.${options.hookName}`,
            options.timeout,
            { context: { type: 'worker', executionId } }
          )
        )
        // Terminate and recreate worker on timeout
        this.terminate()
        this.worker = this.createWorker()
        this.setupMessageHandling()
      }, options.timeout)

      this.activeExecution.timeoutId = timeoutId

      // Send execution message to worker
      const message: WorkerMessage = {
        id: executionId,
        type: 'execute',
        payload: {
          functionSource: options.functionSource,
          args: options.args,
          allowedGlobals: options.allowedGlobals,
          timeout: options.timeout
        }
      }

      try {
        this.worker.postMessage(message)
      } catch (error) {
        this.rejectExecution(new Error(`Failed to send message to worker: ${error}`))
      }
    })
  }

  /**
   * Resolve the current execution
   */
  private resolveExecution(result: unknown): void {
    if (!this.activeExecution) return

    if (this.activeExecution.timeoutId) {
      clearTimeout(this.activeExecution.timeoutId)
    }

    this.activeExecution.resolve(result)
    this.activeExecution = null
    this.busy = false
  }

  /**
   * Reject the current execution
   */
  private rejectExecution(error: Error): void {
    if (!this.activeExecution) return

    if (this.activeExecution.timeoutId) {
      clearTimeout(this.activeExecution.timeoutId)
    }

    this.activeExecution.reject(error)
    this.activeExecution = null
    this.busy = false
  }

  /**
   * Check if worker is available for use
   */
  isAvailable(): boolean {
    return !this.busy
  }

  /**
   * Check if worker should be garbage collected
   */
  shouldGarbageCollect(maxIdleTime: number): boolean {
    return !this.busy && (Date.now() - this.lastUsed) > maxIdleTime
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.activeExecution) {
      this.rejectExecution(new Error('Worker terminated'))
    }
    this.worker.terminate()
  }
}

/**
 * Pool of Web Workers for plugin execution
 */
export class WorkerPool {
  private workers: PooledWorker[] = []
  private maxWorkers: number
  private maxIdleTime: number
  private debug: boolean
  private gcInterval?: number

  constructor(options: WorkerPoolOptions = {}) {
    this.maxWorkers = options.maxWorkers ?? 3
    this.maxIdleTime = options.maxIdleTime ?? 30000 // 30 seconds
    this.debug = options.debug ?? false

    if (options.preWarm) {
      this.preWarmWorkers()
    }

    this.startGarbageCollection()

    debugLog.lifecycle('worker pool created', 'WorkerPool', {
      maxWorkers: this.maxWorkers,
      maxIdleTime: this.maxIdleTime,
      preWarm: options.preWarm
    }, this.debug)
  }

  /**
   * Execute a plugin using an available worker from the pool
   */
  async execute(options: WorkerExecutionOptions): Promise<unknown> {
    const startTime = Date.now()

    try {
      // Find or create an available worker
      let worker = this.findAvailableWorker()
      
      if (!worker) {
        if (this.workers.length < this.maxWorkers) {
          worker = this.createWorker()
        } else {
          // Wait for a worker to become available
          worker = await this.waitForAvailableWorker()
        }
      }

      debugLog.operation('worker pool executing plugin', {
        plugin: options.pluginName,
        hook: options.hookName,
        workerIndex: this.workers.indexOf(worker),
        poolSize: this.workers.length
      }, this.debug)

      // Execute the plugin
      const result = await worker.execute(options)

      const duration = Date.now() - startTime
      debugLog.operation('worker pool execution completed', {
        plugin: options.pluginName,
        hook: options.hookName,
        duration,
        success: true
      }, this.debug)

      return result

    } catch (error) {
      const duration = Date.now() - startTime
      debugLog.operation('worker pool execution failed', {
        plugin: options.pluginName,
        hook: options.hookName,
        duration,
        error: (error as Error).message
      }, this.debug)

      // Wrap worker-specific errors as sandbox errors
      if (error instanceof PluginTimeoutError) {
        throw error
      }

      throw new PluginSandboxError(
        options.pluginName,
        options.hookName,
        (error as Error).message,
        { context: { type: 'worker', duration } }
      )
    }
  }

  /**
   * Find an available worker in the pool
   */
  private findAvailableWorker(): PooledWorker | null {
    return this.workers.find(worker => worker.isAvailable()) || null
  }

  /**
   * Create a new worker and add it to the pool
   */
  private createWorker(): PooledWorker {
    const worker = new PooledWorker(this.debug)
    this.workers.push(worker)
    return worker
  }

  /**
   * Wait for a worker to become available
   */
  private async waitForAvailableWorker(): Promise<PooledWorker> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const availableWorker = this.findAvailableWorker()
        if (availableWorker) {
          clearInterval(checkInterval)
          resolve(availableWorker)
        }
      }, 10) // Check every 10ms
    })
  }

  /**
   * Pre-warm workers for faster execution
   */
  private preWarmWorkers(): void {
    const warmupCount = Math.min(2, this.maxWorkers)
    for (let i = 0; i < warmupCount; i++) {
      this.createWorker()
    }
  }

  /**
   * Start garbage collection for idle workers
   */
  private startGarbageCollection(): void {
    this.gcInterval = setInterval(() => {
      this.workers = this.workers.filter(worker => {
        if (worker.shouldGarbageCollect(this.maxIdleTime)) {
          worker.terminate()
          return false
        }
        return true
      })
    }, this.maxIdleTime / 2) as unknown as number
  }

  /**
   * Get pool statistics for monitoring
   */
  getStats(): {
    totalWorkers: number
    availableWorkers: number
    busyWorkers: number
  } {
    const available = this.workers.filter(w => w.isAvailable()).length
    return {
      totalWorkers: this.workers.length,
      availableWorkers: available,
      busyWorkers: this.workers.length - available
    }
  }

  /**
   * Shutdown the worker pool
   */
  shutdown(): void {
    if (this.gcInterval) {
      clearInterval(this.gcInterval)
    }

    this.workers.forEach(worker => worker.terminate())
    this.workers = []

    debugLog.lifecycle('worker pool shutdown', 'WorkerPool', {
      terminatedWorkers: this.workers.length
    }, this.debug)
  }
}

/**
 * Detect if Web Workers are supported in the current environment
 */
export function isWebWorkerSupported(): boolean {
  try {
    return typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined'
  } catch {
    return false
  }
}

/**
 * Detect if we're running in a browser environment
 */
export function isBrowserEnvironment(): boolean {
  try {
    return typeof window !== 'undefined' && typeof document !== 'undefined'
  } catch {
    return false
  }
}