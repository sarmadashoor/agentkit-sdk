/**
 * Simple async mutex implementation for critical sections
 * Prevents race conditions in async operations
 */

export class Mutex {
  private locked = false
  private waiting: Array<() => void> = []

  /**
   * Acquire the mutex lock
   * Returns a promise that resolves when the lock is acquired
   */
  async acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      if (!this.locked) {
        this.locked = true
        resolve(() => this.release())
      } else {
        this.waiting.push(() => {
          this.locked = true
          resolve(() => this.release())
        })
      }
    })
  }

  /**
   * Release the mutex lock
   * Allows the next waiting operation to proceed
   */
  private release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift()!
      next()
    } else {
      this.locked = false
    }
  }

  /**
   * Execute a function with exclusive access (convenience method)
   */
  async withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    const release = await this.acquire()
    try {
      return await fn()
    } finally {
      release()
    }
  }

  /**
   * Check if the mutex is currently locked
   */
  isLocked(): boolean {
    return this.locked
  }

  /**
   * Get the number of operations waiting for the lock
   */
  getWaitingCount(): number {
    return this.waiting.length
  }
}