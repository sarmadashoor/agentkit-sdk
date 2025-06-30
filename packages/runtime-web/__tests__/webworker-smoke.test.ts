/**
 * WebWorker Smoke Test Suite
 * 
 * Validates basic plugin execution within a WebWorker sandbox using inline workers.
 * Tests fundamental isolation, communication, and security boundaries for browser-based
 * plugin systems. Ensures zero global mutations and cross-state leaks.
 * 
 * @author SDET Team
 * @security Critical - Tests plugin sandboxing isolation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Skip entire test suite if WebWorker is not available
if (!globalThis.Worker) {
  describe.skip('WebWorker Smoke Test', () => {
    it('skipped - WebWorker not available', () => {})
  })
} else {
  describe('WebWorker Smoke Test', () => {
    let workerInstance: Worker | null = null
    let consoleInterceptor: string[] = []
    let originalConsoleLog: typeof console.log

    beforeEach(() => {
      // Intercept console.log to capture plugin output
      consoleInterceptor = []
      originalConsoleLog = console.log
      console.log = (...args: any[]) => {
        consoleInterceptor.push(args.map(arg => String(arg)).join(' '))
        originalConsoleLog.apply(console, args)
      }
    })

    afterEach(() => {
      // Restore console.log
      console.log = originalConsoleLog
      
      // Terminate any active workers
      if (workerInstance) {
        workerInstance.terminate()
        workerInstance = null
      }
    })

    it('should execute basic plugin in isolated WebWorker', async () => {
      // Create inline WebWorker with security-hardened plugin environment
      const workerCode = `
        'use strict';
        
        // Disable Function constructor for security isolation
        globalThis.Function = function() {
          throw new Error('Function constructor disabled for security');
        };
        
        // Freeze prototypes to prevent tampering
        Object.freeze(Object.prototype);
        Object.freeze(Array.prototype);
        Object.freeze(Function.prototype);
        
        // Mock console.log to capture output
        let capturedLogs = [];
        console.log = function(...args) {
          capturedLogs.push(args.map(arg => String(arg)).join(' '));
        };
        
        // Define basic plugin
        const plugin = {
          name: 'smoke-test-plugin',
          version: '1.0.0',
          
          processMessage: function(message) {
            console.log('Plugin received:', message.type);
            
            if (message.type === 'ping') {
              console.log('Processing ping message');
              return { type: 'pong', timestamp: Date.now(), data: 'Plugin processed successfully' };
            }
            
            return { type: 'error', message: 'Unknown message type' };
          }
        };
        
        // Message handler for WebWorker communication
        self.onmessage = function(event) {
          try {
            const message = event.data;
            
            if (message.type === 'execute') {
              console.log('Executing plugin with message:', message.payload.type);
              const result = plugin.processMessage(message.payload);
              
              // Send result back with captured logs
              self.postMessage({
                type: 'result',
                success: true,
                result: result,
                logs: capturedLogs
              });
              
              // Clear logs after sending
              capturedLogs = [];
            } else if (message.type === 'ping') {
              self.postMessage({ type: 'pong' });
            }
          } catch (error) {
            self.postMessage({
              type: 'result',
              success: false,
              error: error.message,
              logs: capturedLogs
            });
          }
        };
        
        // Signal ready
        self.postMessage({ type: 'ready' });
      `

      // Create blob URL for inline worker
      const blob = new Blob([workerCode], { type: 'application/javascript' })
      const workerUrl = URL.createObjectURL(blob)
      
      try {
        // Create worker instance
        workerInstance = new Worker(workerUrl)
        
        // Wait for worker to be ready
        const readyPromise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Worker initialization timeout'))
          }, 5000)
          
          workerInstance!.onmessage = (event) => {
            if (event.data.type === 'ready') {
              clearTimeout(timeout)
              resolve()
            }
          }
          
          workerInstance!.onerror = (error) => {
            clearTimeout(timeout)
            reject(new Error(`Worker error: ${error.message}`))
          }
        })

        await readyPromise

        // Test plugin execution
        const executionPromise = new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Plugin execution timeout'))
          }, 3000)

          workerInstance!.onmessage = (event) => {
            const data = event.data
            if (data.type === 'result') {
              clearTimeout(timeout)
              resolve(data)
            }
          }
        })

        // Send test message to plugin
        workerInstance.postMessage({
          type: 'execute',
          payload: { type: 'ping' }
        })

        const result = await executionPromise

        // Validate execution results
        expect(result.success).toBe(true)
        expect(result.result).toEqual({
          type: 'pong',
          timestamp: expect.any(Number),
          data: 'Plugin processed successfully'
        })

        // Validate console output was captured
        expect(result.logs).toContain('Plugin received: ping')
        expect(result.logs).toContain('Processing ping message')
        expect(result.logs).toContain('Executing plugin with message: ping')

      } finally {
        // Clean up blob URL
        URL.revokeObjectURL(workerUrl)
      }
    })

    it('should enforce Function constructor isolation', async () => {
      const workerCode = `
        'use strict';
        
        // Disable Function constructor
        globalThis.Function = function() {
          throw new Error('Function constructor disabled for security');
        };
        
        self.onmessage = function(event) {
          try {
            // Attempt to use Function constructor (should fail)
            const maliciousCode = new Function('return "security breach"');
            self.postMessage({ type: 'result', success: false, error: 'Security breach detected' });
          } catch (error) {
            // This is expected - Function constructor should be disabled
            self.postMessage({ 
              type: 'result', 
              success: true, 
              message: 'Function constructor properly disabled',
              error: error.message 
            });
          }
        };
        
        self.postMessage({ type: 'ready' });
      `

      const blob = new Blob([workerCode], { type: 'application/javascript' })
      const workerUrl = URL.createObjectURL(blob)
      
      try {
        workerInstance = new Worker(workerUrl)

        const testPromise = new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Security test timeout'))
          }, 3000)

          let ready = false
          workerInstance!.onmessage = (event) => {
            if (event.data.type === 'ready' && !ready) {
              ready = true
              // Send test message
              workerInstance!.postMessage({ type: 'test' })
            } else if (event.data.type === 'result') {
              clearTimeout(timeout)
              resolve(event.data)
            }
          }
        })

        const result = await testPromise

        // Validate that Function constructor was properly disabled
        expect(result.success).toBe(true)
        expect(result.message).toBe('Function constructor properly disabled')
        expect(result.error).toContain('Function constructor disabled for security')

      } finally {
        URL.revokeObjectURL(workerUrl)
      }
    })

    it('should prevent global mutations and cross-state leaks', async () => {
      // Store original global state
      const originalGlobalKeys = Object.keys(globalThis)
      const testGlobalValue = (globalThis as any).testValue

      const workerCode = `
        'use strict';
        
        // Attempt to pollute global scope
        globalThis.maliciousGlobal = 'compromised';
        globalThis.testValue = 'worker-modified';
        
        // Try to access main thread globals
        let mainThreadAccess = false;
        try {
          if (typeof window !== 'undefined') {
            mainThreadAccess = true;
          }
        } catch (e) {
          // Expected in worker context
        }
        
        self.onmessage = function(event) {
          self.postMessage({
            type: 'result',
            workerGlobals: {
              maliciousGlobal: globalThis.maliciousGlobal,
              testValue: globalThis.testValue
            },
            mainThreadAccess: mainThreadAccess,
            workerContext: typeof self !== 'undefined',
            isolatedEnvironment: typeof window === 'undefined' && typeof document === 'undefined'
          });
        };
        
        self.postMessage({ type: 'ready' });
      `

      const blob = new Blob([workerCode], { type: 'application/javascript' })
      const workerUrl = URL.createObjectURL(blob)
      
      try {
        workerInstance = new Worker(workerUrl)

        const isolationTestPromise = new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Isolation test timeout'))
          }, 3000)

          let ready = false
          workerInstance!.onmessage = (event) => {
            if (event.data.type === 'ready' && !ready) {
              ready = true
              workerInstance!.postMessage({ type: 'test' })
            } else if (event.data.type === 'result') {
              clearTimeout(timeout)
              resolve(event.data)
            }
          }
        })

        const result = await isolationTestPromise

        // Validate worker isolation
        expect(result.workerContext).toBe(true)
        expect(result.isolatedEnvironment).toBe(true)
        expect(result.mainThreadAccess).toBe(false)

        // Validate worker can set its own globals
        expect(result.workerGlobals.maliciousGlobal).toBe('compromised')
        expect(result.workerGlobals.testValue).toBe('worker-modified')

        // Validate main thread globals are NOT affected
        expect((globalThis as any).maliciousGlobal).toBeUndefined()
        expect((globalThis as any).testValue).toBe(testGlobalValue)
        expect(Object.keys(globalThis)).toEqual(originalGlobalKeys)

      } finally {
        URL.revokeObjectURL(workerUrl)
      }
    })

    it('should handle plugin errors gracefully', async () => {
      const workerCode = `
        'use strict';
        
        const plugin = {
          processMessage: function(message) {
            if (message.type === 'error-test') {
              throw new Error('Intentional plugin error');
            }
            return { type: 'success' };
          }
        };
        
        self.onmessage = function(event) {
          try {
            const result = plugin.processMessage(event.data.payload);
            self.postMessage({ type: 'result', success: true, result: result });
          } catch (error) {
            self.postMessage({ 
              type: 'result', 
              success: false, 
              error: error.message,
              errorType: error.constructor.name
            });
          }
        };
        
        self.postMessage({ type: 'ready' });
      `

      const blob = new Blob([workerCode], { type: 'application/javascript' })
      const workerUrl = URL.createObjectURL(blob)
      
      try {
        workerInstance = new Worker(workerUrl)

        const errorTestPromise = new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Error handling test timeout'))
          }, 3000)

          let ready = false
          workerInstance!.onmessage = (event) => {
            if (event.data.type === 'ready' && !ready) {
              ready = true
              workerInstance!.postMessage({
                type: 'execute',
                payload: { type: 'error-test' }
              })
            } else if (event.data.type === 'result') {
              clearTimeout(timeout)
              resolve(event.data)
            }
          }
        })

        const result = await errorTestPromise

        // Validate error handling
        expect(result.success).toBe(false)
        expect(result.error).toBe('Intentional plugin error')
        expect(result.errorType).toBe('Error')

      } finally {
        URL.revokeObjectURL(workerUrl)
      }
    })

    it('should enforce communication protocol integrity', async () => {
      const workerCode = `
        'use strict';
        
        let messageCount = 0;
        
        self.onmessage = function(event) {
          messageCount++;
          
          // Validate message structure
          const message = event.data;
          const isValidMessage = message && 
                                typeof message === 'object' && 
                                typeof message.type === 'string';
          
          self.postMessage({
            type: 'protocol-test-result',
            messageCount: messageCount,
            isValidMessage: isValidMessage,
            receivedMessage: message,
            protocolIntegrity: true
          });
        };
        
        self.postMessage({ type: 'ready' });
      `

      const blob = new Blob([workerCode], { type: 'application/javascript' })
      const workerUrl = URL.createObjectURL(blob)
      
      try {
        workerInstance = new Worker(workerUrl)

        const protocolTestPromise = new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Protocol test timeout'))
          }, 3000)

          let ready = false
          const results: any[] = []

          workerInstance!.onmessage = (event) => {
            if (event.data.type === 'ready' && !ready) {
              ready = true
              // Send multiple test messages
              workerInstance!.postMessage({ type: 'test1', data: 'first' })
              workerInstance!.postMessage({ type: 'test2', data: 'second' })
              workerInstance!.postMessage({ invalid: 'message' }) // Invalid format
            } else if (event.data.type === 'protocol-test-result') {
              results.push(event.data)
              if (results.length === 3) {
                clearTimeout(timeout)
                resolve(results)
              }
            }
          }
        })

        const results = await protocolTestPromise

        // Validate protocol handling
        expect(results).toHaveLength(3)
        expect(results[0].isValidMessage).toBe(true)
        expect(results[1].isValidMessage).toBe(true)
        expect(results[2].isValidMessage).toBe(true) // Still valid object structure
        expect(results[0].messageCount).toBe(1)
        expect(results[1].messageCount).toBe(2)
        expect(results[2].messageCount).toBe(3)

      } finally {
        URL.revokeObjectURL(workerUrl)
      }
    })
  })
}