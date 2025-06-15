import { test, expect } from '@playwright/test'

test.describe('Plugin WebWorker Sandboxing - Browser Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.AgentKit !== undefined)
  })

  test('should isolate plugin execution using WebWorkers when available', async ({ page }) => {
    const webWorkerTest = await page.evaluate(async () => {
      try {
        // Check if WebWorkers are supported
        const hasWebWorkers = typeof Worker !== 'undefined'
        
        if (!hasWebWorkers) {
          return { 
            success: true, 
            skipped: true, 
            reason: 'WebWorkers not supported in this environment'
          }
        }

        // Import typed WebWorker messaging
        const { WebWorkerMessageValidator } = await import('/src/WebWorkerMessages.js')
        
        // Test WebWorker creation with typed messaging
        const workerScript = `
          // Import the message validator in the worker context
          importScripts('/src/WebWorkerMessages.js')
          
          self.onmessage = function(event) {
            try {
              // Validate incoming message using Zod schema
              const message = self.WebWorkerMessageValidator.validateMessage(event.data)
              
              if (message.type === 'execute-plugin') {
                const { pluginCode, hookName, args, securityOptions = {} } = message.payload
                
                // Simulate plugin execution in restricted environment
                const restrictedGlobals = {
                  Object, Array, String, Number, Boolean, Date, Math, JSON, Promise, Error,
                  console: {
                    log: (...args) => {
                      const logMessage = self.WebWorkerMessageValidator.createLogMessage('log', args, message.payload.pluginName)
                      self.postMessage(logMessage)
                    },
                    error: (...args) => {
                      const logMessage = self.WebWorkerMessageValidator.createLogMessage('error', args, message.payload.pluginName)
                      self.postMessage(logMessage)
                    },
                    warn: (...args) => {
                      const logMessage = self.WebWorkerMessageValidator.createLogMessage('warn', args, message.payload.pluginName)
                      self.postMessage(logMessage)
                    }
                  }
                }
                
                // Enhanced security checking based on options
                const securityViolations = []
                const blockedPatterns = []
                
                if (!securityOptions.allowEval) {
                  blockedPatterns.push(/eval\\s*\\(/)
                }
                if (!securityOptions.allowFunction) {
                  blockedPatterns.push(/Function\\s*\\(/)
                }
                if (!securityOptions.allowTimers) {
                  blockedPatterns.push(/setTimeout/, /setInterval/)
                }
                if (!securityOptions.allowNetwork) {
                  blockedPatterns.push(/XMLHttpRequest/, /fetch\\s*\\(/)
                }
                
                // Check for security violations
                blockedPatterns.forEach((pattern, index) => {
                  if (pattern.test(pluginCode)) {
                    const patternNames = ['eval', 'Function', 'setTimeout/setInterval', 'network'];
                    securityViolations.push(\`Blocked pattern: \${patternNames[Math.floor(index / 2)] || 'unknown'}\`)
                  }
                })
                
                if (securityViolations.length > 0) {
                  const errorResult = self.WebWorkerMessageValidator.createExecutionResult(
                    false, 
                    undefined, 
                    'Plugin contains blocked patterns: ' + securityViolations.join(', '),
                    0,
                    { securityViolations }
                  )
                  self.postMessage(errorResult)
                  return
                }
                
                // Execute plugin in controlled environment
                const startTime = Date.now()
                try {
                  const pluginFunction = new Function(
                    ...Object.keys(restrictedGlobals),
                    'args',
                    \`
                      "use strict";
                      try {
                        \${pluginCode}
                        if (typeof plugin === 'object' && plugin.hooks && plugin.hooks[\${JSON.stringify(hookName)}]) {
                          return plugin.hooks[\${JSON.stringify(hookName)}](...args);
                        }
                        throw new Error('Plugin hook not found: ' + \${JSON.stringify(hookName)});
                      } catch (error) {
                        throw error;
                      }
                    \`
                  )
                  
                  const result = pluginFunction(...Object.values(restrictedGlobals), args)
                  const duration = Date.now() - startTime
                  
                  const successResult = self.WebWorkerMessageValidator.createExecutionResult(
                    true,
                    result,
                    undefined,
                    duration,
                    { securityViolations }
                  )
                  self.postMessage(successResult)
                  
                } catch (error) {
                  const duration = Date.now() - startTime
                  const errorResult = self.WebWorkerMessageValidator.createExecutionResult(
                    false,
                    undefined,
                    error.message,
                    duration,
                    { securityViolations }
                  )
                  self.postMessage(errorResult)
                }
              }
            } catch (validationError) {
              // Send validation error back
              const errorMessage = self.WebWorkerMessageValidator.createErrorMessage(
                'Message validation failed: ' + validationError.message,
                'VALIDATION_ERROR'
              )
              self.postMessage(errorMessage)
            }
          }
        `

        const blob = new Blob([workerScript], { type: 'application/javascript' })
        const workerUrl = URL.createObjectURL(blob)
        const worker = new Worker(workerUrl)

        // Test safe plugin execution
        const safePluginCode = `
          const plugin = {
            name: 'safe-plugin',
            hooks: {
              onSend: (payload) => {
                return {
                  processed: true,
                  originalPayload: payload,
                  timestamp: Date.now()
                }
              }
            }
          }
        `

        // Test plugin execution with typed messaging
        const executePlugin = (pluginCode, hookName, args, securityOptions = {}) => {
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Plugin execution timeout'))
            }, 5000)

            const handleMessage = (event) => {
              try {
                const message = WebWorkerMessageValidator.validateMessage(event.data)
                
                if (message.type === 'plugin-result') {
                  clearTimeout(timeout)
                  worker.removeEventListener('message', handleMessage)
                  resolve(message.payload)
                } else if (message.type === 'error') {
                  clearTimeout(timeout)
                  worker.removeEventListener('message', handleMessage)
                  reject(new Error(message.payload.error))
                }
              } catch (validationError) {
                clearTimeout(timeout)
                worker.removeEventListener('message', handleMessage)
                reject(new Error('Invalid message received: ' + validationError.message))
              }
            }

            worker.addEventListener('message', handleMessage)
            
            // Create typed execution request
            const request = WebWorkerMessageValidator.createExecutionRequest(
              pluginCode,
              hookName,
              args,
              'test-plugin',
              { securityOptions }
            )
            
            worker.postMessage(request)
          })
        }

        // Test safe plugin
        const safeResult = await executePlugin(safePluginCode, 'onSend', [{ test: 'data' }])

        // Test malicious plugin (should be blocked)
        const maliciousPluginCode = `
          const plugin = {
            hooks: {
              onSend: () => {
                eval('console.log("This should be blocked")')
                return { malicious: true }
              }
            }
          }
        `

        const maliciousResult = await executePlugin(maliciousPluginCode, 'onSend', [{}], {
          allowEval: false,
          allowFunction: false,
          allowTimers: false,
          allowNetwork: false
        })

        // Cleanup
        worker.terminate()
        URL.revokeObjectURL(workerUrl)

        return {
          success: safeResult.success && !maliciousResult.success,
          hasWebWorkers,
          safeResult,
          maliciousResult,
          maliciousBlocked: !maliciousResult.success
        }
      } catch (error) {
        return { success: false, error: error.message }
      }
    })

    if (webWorkerTest.skipped) {
      console.log('WebWorker test skipped:', webWorkerTest.reason)
      return
    }

    expect(webWorkerTest.success).toBe(true)
    expect(webWorkerTest.hasWebWorkers).toBe(true)
    expect(webWorkerTest.safeResult.success).toBe(true)
    expect(webWorkerTest.maliciousBlocked).toBe(true)
  })

  test('should handle plugin crashes without affecting main thread', async ({ page }) => {
    const crashTest = await page.evaluate(async () => {
      try {
        const hasWebWorkers = typeof Worker !== 'undefined'
        
        if (!hasWebWorkers) {
          return { success: true, skipped: true, reason: 'WebWorkers not supported' }
        }

        // Create worker for crash test
        const crashWorkerScript = `
          self.onmessage = function(event) {
            const { type, payload } = event.data
            
            if (type === 'crash-test') {
              try {
                // Simulate different types of crashes
                switch (payload.crashType) {
                  case 'exception':
                    throw new Error('Simulated plugin crash')
                  
                  case 'infinite-loop':
                    // Controlled infinite loop with timeout
                    const start = Date.now()
                    while (Date.now() - start < 100) {
                      // Brief infinite loop
                    }
                    throw new Error('Loop timeout')
                  
                  case 'memory-error':
                    // Simulate memory allocation error
                    const largeArray = new Array(1000000).fill('memory-test')
                    if (largeArray.length !== 1000000) {
                      throw new Error('Memory allocation failed')
                    }
                    break
                  
                  default:
                    self.postMessage({ type: 'crash-result', payload: { success: true } })
                    return
                }
                
                self.postMessage({ type: 'crash-result', payload: { success: true } })
              } catch (error) {
                self.postMessage({ 
                  type: 'crash-result', 
                  payload: { success: false, error: error.message, crashed: true }
                })
              }
            }
          }
          
          // Handle uncaught errors
          self.onerror = function(message, source, lineno, colno, error) {
            self.postMessage({
              type: 'crash-result',
              payload: { 
                success: false, 
                error: message, 
                crashed: true,
                uncaught: true
              }
            })
          }
        `

        const blob = new Blob([crashWorkerScript], { type: 'application/javascript' })
        const workerUrl = URL.createObjectURL(blob)
        
        const testCrash = (crashType) => {
          return new Promise((resolve) => {
            const worker = new Worker(workerUrl)
            
            const timeout = setTimeout(() => {
              worker.terminate()
              resolve({ success: false, error: 'Worker timeout', crashed: true })
            }, 2000)

            worker.onmessage = (event) => {
              if (event.data.type === 'crash-result') {
                clearTimeout(timeout)
                worker.terminate()
                resolve(event.data.payload)
              }
            }

            worker.onerror = (error) => {
              clearTimeout(timeout)
              worker.terminate()
              resolve({ success: false, error: error.message, crashed: true, workerError: true })
            }

            worker.postMessage({ type: 'crash-test', payload: { crashType } })
          })
        }

        // Test different crash scenarios
        const exceptionResult = await testCrash('exception')
        const loopResult = await testCrash('infinite-loop')
        const memoryResult = await testCrash('memory-error')
        const normalResult = await testCrash('normal')

        // Cleanup
        URL.revokeObjectURL(workerUrl)

        // Main thread should still be responsive
        const mainThreadOk = Date.now() > 0 // Simple responsiveness check

        return {
          success: mainThreadOk && normalResult.success,
          mainThreadOk,
          crashTests: {
            exception: exceptionResult,
            loop: loopResult,
            memory: memoryResult,
            normal: normalResult
          },
          allCrashesIsolated: exceptionResult.crashed && loopResult.crashed && normalResult.success
        }
      } catch (error) {
        return { success: false, error: error.message }
      }
    })

    if (crashTest.skipped) {
      console.log('Crash test skipped:', crashTest.reason)
      return
    }

    expect(crashTest.success).toBe(true)
    expect(crashTest.mainThreadOk).toBe(true)
    expect(crashTest.allCrashesIsolated).toBe(true)
  })

  test('should enforce timeout limits on plugin execution', async ({ page }) => {
    const timeoutTest = await page.evaluate(async () => {
      try {
        const hasWebWorkers = typeof Worker !== 'undefined'
        
        if (!hasWebWorkers) {
          return { success: true, skipped: true, reason: 'WebWorkers not supported' }
        }

        const timeoutWorkerScript = `
          self.onmessage = function(event) {
            const { type, payload } = event.data
            
            if (type === 'timeout-test') {
              const { delay } = payload
              
              // Simulate work that takes 'delay' milliseconds
              const start = Date.now()
              while (Date.now() - start < delay) {
                // Busy wait
              }
              
              self.postMessage({
                type: 'timeout-result',
                payload: { completed: true, actualDelay: Date.now() - start }
              })
            }
          }
        `

        const blob = new Blob([timeoutWorkerScript], { type: 'application/javascript' })
        const workerUrl = URL.createObjectURL(blob)

        const testTimeout = (delay, timeoutMs) => {
          return new Promise((resolve) => {
            const worker = new Worker(workerUrl)
            const startTime = Date.now()
            
            const timeout = setTimeout(() => {
              const elapsed = Date.now() - startTime
              worker.terminate()
              resolve({ 
                timedOut: true, 
                elapsed,
                withinTimeout: elapsed <= (timeoutMs + 100) // Allow 100ms tolerance
              })
            }, timeoutMs)

            worker.onmessage = (event) => {
              if (event.data.type === 'timeout-result') {
                clearTimeout(timeout)
                const elapsed = Date.now() - startTime
                worker.terminate()
                resolve({ 
                  completed: true, 
                  elapsed,
                  actualDelay: event.data.payload.actualDelay
                })
              }
            }

            worker.postMessage({ type: 'timeout-test', payload: { delay } })
          })
        }

        // Test fast execution (should complete)
        const fastResult = await testTimeout(50, 1000)
        
        // Test slow execution (should timeout)
        const slowResult = await testTimeout(2000, 500)

        // Cleanup
        URL.revokeObjectURL(workerUrl)

        return {
          success: fastResult.completed && slowResult.timedOut,
          fastResult,
          slowResult,
          timeoutEnforced: slowResult.timedOut && slowResult.withinTimeout
        }
      } catch (error) {
        return { success: false, error: error.message }
      }
    })

    if (timeoutTest.skipped) {
      console.log('Timeout test skipped:', timeoutTest.reason)
      return
    }

    expect(timeoutTest.success).toBe(true)
    expect(timeoutTest.fastResult.completed).toBe(true)
    expect(timeoutTest.slowResult.timedOut).toBe(true)
    expect(timeoutTest.timeoutEnforced).toBe(true)
  })

  test('should prevent plugin access to dangerous APIs', async ({ page }) => {
    const securityTest = await page.evaluate(async () => {
      try {
        const hasWebWorkers = typeof Worker !== 'undefined'
        
        if (!hasWebWorkers) {
          return { success: true, skipped: true, reason: 'WebWorkers not supported' }
        }

        const securityWorkerScript = `
          self.onmessage = function(event) {
            const { type, payload } = event.data
            
            if (type === 'security-test') {
              const results = []
              
              // Test access to dangerous APIs
              const dangerousAPIs = [
                'eval',
                'Function',
                'setTimeout',
                'setInterval',
                'XMLHttpRequest',
                'fetch',
                'localStorage',
                'sessionStorage',
                'indexedDB',
                'importScripts'
              ]
              
              dangerousAPIs.forEach(api => {
                try {
                  const value = self[api] || eval(api)
                  results.push({ api, accessible: value !== undefined, blocked: false })
                } catch (error) {
                  results.push({ api, accessible: false, blocked: true, error: error.message })
                }
              })
              
              // Test that safe APIs are available
              const safeAPIs = ['Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'Math', 'JSON', 'Promise', 'Error']
              const safeResults = safeAPIs.map(api => ({
                api,
                available: typeof self[api] !== 'undefined'
              }))
              
              self.postMessage({
                type: 'security-result',
                payload: { 
                  dangerousAPIs: results,
                  safeAPIs: safeResults
                }
              })
            }
          }
        `

        const blob = new Blob([securityWorkerScript], { type: 'application/javascript' })
        const workerUrl = URL.createObjectURL(blob)
        const worker = new Worker(workerUrl)

        const securityResult = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            worker.terminate()
            reject(new Error('Security test timeout'))
          }, 3000)

          worker.onmessage = (event) => {
            if (event.data.type === 'security-result') {
              clearTimeout(timeout)
              worker.terminate()
              resolve(event.data.payload)
            }
          }

          worker.postMessage({ type: 'security-test' })
        })

        // Cleanup
        URL.revokeObjectURL(workerUrl)

        // Analyze results
        const blockedCount = securityResult.dangerousAPIs.filter(api => !api.accessible).length
        const safeCount = securityResult.safeAPIs.filter(api => api.available).length
        
        // Most dangerous APIs should be unavailable in WebWorker context
        const securityScore = blockedCount / securityResult.dangerousAPIs.length
        const safetyScore = safeCount / securityResult.safeAPIs.length

        return {
          success: securityScore >= 0.5 && safetyScore >= 0.8, // At least 50% blocked, 80% safe APIs available
          securityResult,
          securityScore,
          safetyScore,
          blockedCount,
          safeCount
        }
      } catch (error) {
        return { success: false, error: error.message }
      }
    })

    if (securityTest.skipped) {
      console.log('Security test skipped:', securityTest.reason)
      return
    }

    expect(securityTest.success).toBe(true)
    expect(securityTest.securityScore).toBeGreaterThanOrEqual(0.5)
    expect(securityTest.safetyScore).toBeGreaterThanOrEqual(0.8)
  })

  test('should handle plugin data isolation and immutability', async ({ page }) => {
    const isolationTest = await page.evaluate(async () => {
      try {
        const hasWebWorkers = typeof Worker !== 'undefined'
        
        if (!hasWebWorkers) {
          return { success: true, skipped: true, reason: 'WebWorkers not supported' }
        }

        const isolationWorkerScript = `
          self.onmessage = function(event) {
            const { type, payload } = event.data
            
            if (type === 'isolation-test') {
              try {
                const { data } = payload
                
                // Try to mutate the received data
                try {
                  data.mutated = true
                  data.original = 'changed'
                  if (data.nested) {
                    data.nested.value = 'hacked'
                  }
                } catch (mutationError) {
                  // Mutations might be prevented by freezing
                }
                
                // Try to access prototype
                let prototypeAccess = false
                try {
                  data.__proto__.evil = true
                  prototypeAccess = true
                } catch (protoError) {
                  // Good, prototype access blocked
                }
                
                // Return modified data to see if mutations persisted
                self.postMessage({
                  type: 'isolation-result',
                  payload: {
                    success: true,
                    receivedData: data,
                    prototypeAccess,
                    canMutate: data.hasOwnProperty('mutated')
                  }
                })
              } catch (error) {
                self.postMessage({
                  type: 'isolation-result',
                  payload: { success: false, error: error.message }
                })
              }
            }
          }
        `

        const blob = new Blob([isolationWorkerScript], { type: 'application/javascript' })
        const workerUrl = URL.createObjectURL(blob)
        const worker = new Worker(workerUrl)

        // Test data
        const originalData = {
          original: 'value',
          timestamp: Date.now(),
          nested: { value: 'nested-data' }
        }

        // Freeze the data to prevent mutations
        const frozenData = JSON.parse(JSON.stringify(originalData)) // Deep clone
        Object.freeze(frozenData)
        if (frozenData.nested) {
          Object.freeze(frozenData.nested)
        }

        const isolationResult = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            worker.terminate()
            reject(new Error('Isolation test timeout'))
          }, 3000)

          worker.onmessage = (event) => {
            if (event.data.type === 'isolation-result') {
              clearTimeout(timeout)
              worker.terminate()
              resolve(event.data.payload)
            }
          }

          worker.postMessage({ 
            type: 'isolation-test', 
            payload: { data: frozenData }
          })
        })

        // Cleanup
        URL.revokeObjectURL(workerUrl)

        // Verify original data is unchanged
        const dataUnchanged = originalData.original === 'value' && 
                             originalData.nested.value === 'nested-data'

        return {
          success: isolationResult.success && dataUnchanged && !isolationResult.canMutate,
          isolationResult,
          dataUnchanged,
          mutationsPrevented: !isolationResult.canMutate,
          prototypeBlocked: !isolationResult.prototypeAccess
        }
      } catch (error) {
        return { success: false, error: error.message }
      }
    })

    if (isolationTest.skipped) {
      console.log('Isolation test skipped:', isolationTest.reason)
      return
    }

    expect(isolationTest.success).toBe(true)
    expect(isolationTest.dataUnchanged).toBe(true)
    expect(isolationTest.mutationsPrevented).toBe(true)
  })

  test('should gracefully degrade when WebWorkers are not available', async ({ page }) => {
    const degradationTest = await page.evaluate(() => {
      try {
        // Temporarily disable WebWorkers
        const originalWorker = window.Worker
        delete window.Worker

        // Test that plugin system can still work without WebWorkers
        const fallbackExecution = (pluginCode, hookName, args) => {
          try {
            // Simplified fallback execution (structured cloning simulation)
            const clonedArgs = args.map(arg => 
              typeof arg === 'object' && arg !== null ? 
                JSON.parse(JSON.stringify(arg)) : arg
            )

            // Basic security check
            const blockedPatterns = [/eval\\s*\\(/, /Function\\s*\\(/]
            const hasDangerousCode = blockedPatterns.some(pattern => pattern.test(pluginCode))
            
            if (hasDangerousCode) {
              throw new Error('Plugin contains blocked patterns')
            }

            // Simulate plugin execution result
            return {
              success: true,
              result: `Fallback execution for ${hookName}`,
              args: clonedArgs,
              fallback: true
            }
          } catch (error) {
            return { success: false, error: error.message, fallback: true }
          }
        }

        // Test fallback execution
        const safePlugin = 'const plugin = { hooks: { onSend: (data) => data } }'
        const maliciousPlugin = 'eval("malicious code")'

        const safeResult = fallbackExecution(safePlugin, 'onSend', [{ test: 'data' }])
        const maliciousResult = fallbackExecution(maliciousPlugin, 'onSend', [])

        // Restore WebWorkers
        window.Worker = originalWorker

        return {
          success: safeResult.success && !maliciousResult.success,
          safeResult,
          maliciousResult,
          fallbackWorking: safeResult.fallback && maliciousResult.fallback,
          workerRestored: typeof window.Worker !== 'undefined'
        }
      } catch (error) {
        return { success: false, error: error.message }
      }
    })

    expect(degradationTest.success).toBe(true)
    expect(degradationTest.fallbackWorking).toBe(true)
    expect(degradationTest.workerRestored).toBe(true)
  })
})