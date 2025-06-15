/**
 * AsyncLock - Thread-safe async lock for preventing race conditions
 * Provides sequential execution guarantees for async operations
 */

interface QueuedOperation<T> {
  resolve: (value: T) => void
  reject: (error: Error) => void
  fn: () => Promise<T>
}

/**
 * Async lock implementation that ensures sequential execution of async operations
 * Prevents race conditions between concurrent async function calls
 */
export class AsyncLock {
  private queue: Array<QueuedOperation<any>> = []
  private isLocked = false
  
  /**
   * Execute a function exclusively with the lock
   * @param fn The async function to execute with exclusive access
   * @returns Promise that resolves with the function's result
   */
  async lock<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const operation: QueuedOperation<T> = { resolve, reject, fn }
      this.queue.push(operation)
      this.processQueue()
    })
  }
  
  /**
   * Process the queue of pending operations sequentially
   */
  private async processQueue(): Promise<void> {
    if (this.isLocked || this.queue.length === 0) {
      return
    }
    
    this.isLocked = true
    
    const operation = this.queue.shift()!
    
    try {
      const result = await operation.fn()
      operation.resolve(result)
    } catch (error) {
      operation.reject(error instanceof Error ? error : new Error(String(error)))
    } finally {
      this.isLocked = false
      // Process next operation if any
      if (this.queue.length > 0) {
        // Use setImmediate/setTimeout to prevent stack overflow on deep queues
        setImmediate(() => this.processQueue())
      }
    }
  }
  
  /**
   * Get the number of operations waiting in the queue
   */
  get queueSize(): number {
    return this.queue.length
  }
  
  /**
   * Check if the lock is currently held
   */
  get locked(): boolean {
    return this.isLocked
  }
}

/**
 * Shared AsyncLock instance for AgentManager operations
 * Ensures send/shutdown operations are properly serialized
 */
export class SharedAsyncLock {
  private static instance: AsyncLock | undefined
  
  /**
   * Get the singleton AsyncLock instance
   */
  static getInstance(): AsyncLock {
    if (!SharedAsyncLock.instance) {
      SharedAsyncLock.instance = new AsyncLock()
    }
    return SharedAsyncLock.instance
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   */
  static reset(): void {
    SharedAsyncLock.instance = undefined
  }
}