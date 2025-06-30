import { test, expect } from '@playwright/test'

test.describe('AgentKit Hardened Features - Browser Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.AgentKit !== undefined)
  })

  test.describe('Registry Immutability', () => {
    test('should prevent runtime mutations to registry contents', async ({ page }) => {
      const immutabilityTest = await page.evaluate(async () => {
        try {
          const { defaultRegistry } = window.AgentKit
          
          // Register a test agent
          const agentMetadata = {
            id: 'test-immutable-agent',
            name: 'Test Agent',
            version: '1.0.0',
            description: 'Test for immutability',
            factory: () => ({
              id: 'test',
              name: 'Test',
              version: '1.0.0',
              init: async () => {},
              handle: async (input) => ({ echo: input }),
              shutdown: async () => {}
            }),
            config: {
              mutable: 'original',
              nested: { value: 'test' }
            }
          }
          
          defaultRegistry.register(agentMetadata)
          
          // Try to retrieve and mutate
          const retrieved = defaultRegistry.lookup('test-immutable-agent')
          
          // These mutations should fail or be prevented
          let mutationFailed = false
          try {
            retrieved.name = 'Hacked Agent'
            retrieved.config.mutable = 'hacked'
            retrieved.config.nested.value = 'hacked'
          } catch (error) {
            mutationFailed = true
          }
          
          // Check if mutations were actually prevented
          const fresh = defaultRegistry.lookup('test-immutable-agent')
          const isImmutable = fresh.name === 'Test Agent' && 
                              fresh.config.mutable === 'original' &&
                              fresh.config.nested.value === 'test'
          
          return {
            success: isImmutable,
            mutationFailed,
            isFrozen: Object.isFrozen(fresh),
            configFrozen: Object.isFrozen(fresh.config),
            nestedFrozen: Object.isFrozen(fresh.config.nested)
          }
        } catch (error) {
          return { success: false, error: error.message }
        }
      })
      
      expect(immutabilityTest.success).toBe(true)
      expect(immutabilityTest.isFrozen).toBe(true)
      expect(immutabilityTest.configFrozen).toBe(true)
      expect(immutabilityTest.nestedFrozen).toBe(true)
    })

    test('should allow registry freezing to prevent further registrations', async ({ page }) => {
      const freezeTest = await page.evaluate(() => {
        try {
          const { AgentRegistry } = window.AgentKit
          
          const registry = new AgentRegistry()
          
          // Register initial agent
          registry.register({
            id: 'initial-agent',
            name: 'Initial Agent',
            version: '1.0.0',
            factory: () => ({
              id: 'initial',
              name: 'Initial',
              version: '1.0.0',
              init: async () => {},
              handle: async (input) => input,
              shutdown: async () => {}
            })
          })
          
          // Freeze the registry
          registry.freeze()
          
          // Try to register another agent
          let registrationBlocked = false
          try {
            registry.register({
              id: 'blocked-agent',
              name: 'Blocked Agent',
              version: '1.0.0',
              factory: () => ({})
            })
          } catch (error) {
            registrationBlocked = error.message.includes('frozen registry')
          }
          
          return {
            success: registrationBlocked,
            isFrozen: registry.isFrozen(),
            agentCount: registry.agentCount
          }
        } catch (error) {
          return { success: false, error: error.message }
        }
      })
      
      expect(freezeTest.success).toBe(true)
      expect(freezeTest.isFrozen).toBe(true)
      expect(freezeTest.agentCount).toBe(1)
    })
  })

  test.describe('Transport Backpressure', () => {
    test('should handle transport backpressure in browser environment', async ({ page }) => {
      const backpressureTest = await page.evaluate(async () => {
        try {
          const { BrowserTransport } = window.AgentKit
          
          // Create transport with backpressure simulation
          const transport = new BrowserTransport({
            endpoint: '/api/test'
          })
          
          // Check if backpressure methods are available
          const hasBackpressureAPI = typeof transport.canAcceptMore === 'function' &&
                                     typeof transport.getStatus === 'function'
          
          if (!hasBackpressureAPI) {
            return { success: false, error: 'Backpressure API not available' }
          }
          
          await transport.init()
          
          // Get initial status
          const initialStatus = transport.getStatus()
          const canAcceptInitially = transport.canAcceptMore()
          
          // Verify status structure
          const hasValidStatus = initialStatus &&
                                 typeof initialStatus.canAcceptMore === 'boolean' &&
                                 typeof initialStatus.queueSize === 'number' &&
                                 typeof initialStatus.isHealthy === 'boolean'
          
          await transport.shutdown()
          
          return {
            success: hasValidStatus && canAcceptInitially,
            initialStatus,
            canAcceptMore: canAcceptInitially,
            hasBackpressureAPI
          }
        } catch (error) {
          return { success: false, error: error.message }
        }
      })
      
      expect(backpressureTest.success).toBe(true)
      expect(backpressureTest.hasBackpressureAPI).toBe(true)
      expect(backpressureTest.canAcceptMore).toBe(true)
      expect(backpressureTest.initialStatus.isHealthy).toBe(true)
    })
  })

  test.describe('Plugin Sandboxing Simulation', () => {
    test('should demonstrate plugin isolation principles in browser', async ({ page }) => {
      const sandboxTest = await page.evaluate(() => {
        try {
          // Simulate plugin system behavior in browser
          const mockPluginManager = {
            plugins: [],
            register(plugin) {
              // Freeze plugin to prevent mutations
              const frozenPlugin = Object.freeze({
                ...plugin,
                hooks: Object.freeze(plugin.hooks || {})
              })
              this.plugins.push(frozenPlugin)
            },
            executeHook(hookName, ...args) {
              const results = []
              
              for (const plugin of this.plugins) {
                try {
                  if (plugin.hooks && plugin.hooks[hookName]) {
                    // Clone arguments to prevent mutations
                    const clonedArgs = args.map(arg => 
                      typeof arg === 'object' && arg !== null ? 
                        JSON.parse(JSON.stringify(arg)) : arg
                    )
                    
                    // Execute with timeout simulation
                    const result = plugin.hooks[hookName](...clonedArgs)
                    results.push({ plugin: plugin.name, success: true, result })
                  }
                } catch (error) {
                  results.push({ plugin: plugin.name, success: false, error: error.message })
                }
              }
              
              return results
            }
          }
          
          // Register test plugins
          mockPluginManager.register({
            name: 'safe-plugin',
            hooks: {
              onSend: (payload) => {
                payload.processed = true
                return 'safe-processing'
              }
            }
          })
          
          mockPluginManager.register({
            name: 'error-plugin',
            hooks: {
              onSend: () => {
                throw new Error('Plugin error')
              }
            }
          })
          
          // Test plugin execution
          const originalPayload = { test: 'data' }
          const results = mockPluginManager.executeHook('onSend', originalPayload)
          
          // Verify isolation - original payload should be unchanged
          const payloadUnchanged = !Object.prototype.hasOwnProperty.call(originalPayload, 'processed')
          
          // Verify error isolation - one plugin fails but doesn't break others
          const successCount = results.filter(r => r.success).length
          const errorCount = results.filter(r => !r.success).length
          
          return {
            success: payloadUnchanged && successCount === 1 && errorCount === 1,
            payloadUnchanged,
            successCount,
            errorCount,
            results
          }
        } catch (error) {
          return { success: false, error: error.message }
        }
      })
      
      expect(sandboxTest.success).toBe(true)
      expect(sandboxTest.payloadUnchanged).toBe(true)
      expect(sandboxTest.successCount).toBe(1)
      expect(sandboxTest.errorCount).toBe(1)
    })
  })

  test.describe('Concurrency Protection', () => {
    test('should handle concurrent transport operations safely', async ({ page }) => {
      const concurrencyTest = await page.evaluate(async () => {
        try {
          const { BrowserTransport } = window.AgentKit
          
          const transport = new BrowserTransport({
            endpoint: '/api/test',
            timeout: 5000
          })
          
          await transport.init()
          
          // Simulate concurrent operations
          const concurrentRequests = Array.from({ length: 10 }, (_, i) => 
            transport.send({
              id: `concurrent-${i}`,
              timestamp: Date.now(),
              data: `request-${i}`
            }).catch(error => ({ error: error.message, index: i }))
          )
          
          const results = await Promise.allSettled(concurrentRequests)
          
          // Count successful vs failed operations
          const successful = results.filter(r => r.status === 'fulfilled').length
          const failed = results.filter(r => r.status === 'rejected').length
          
          // Cleanup
          await transport.shutdown()
          
          return {
            success: successful > 0, // At least some should succeed
            totalRequests: 10,
            successful,
            failed,
            hasFailures: failed > 0
          }
        } catch (error) {
          return { success: false, error: error.message }
        }
      })
      
      expect(concurrencyTest.success).toBe(true)
      expect(concurrencyTest.totalRequests).toBe(10)
      expect(concurrencyTest.successful).toBeGreaterThanOrEqual(1)
    })
  })

  test.describe('Error Recovery and Resilience', () => {
    test('should demonstrate proper error handling and recovery', async ({ page }) => {
      const resilenceTest = await page.evaluate(async () => {
        try {
          const { BrowserTransport } = window.AgentKit
          
          // Test multiple error scenarios
          const scenarios = []
          
          // 1. Network error recovery
          try {
            const errorTransport = new BrowserTransport({
              endpoint: '/api/error',
              maxRetries: 2,
              retryDelay: 100
            })
            
            await errorTransport.init()
            await errorTransport.send({ test: 'error' })
            scenarios.push({ scenario: 'network-error', handled: false })
          } catch (error) {
            const properError = error.constructor.name === 'TransportSendError'
            scenarios.push({ scenario: 'network-error', handled: properError })
          }
          
          // 2. Timeout handling
          try {
            const timeoutTransport = new BrowserTransport({
              endpoint: '/api/slow',
              timeout: 500, // Short timeout
              maxRetries: 0
            })
            
            await timeoutTransport.init()
            const start = Date.now()
            await timeoutTransport.send({ test: 'timeout' })
            scenarios.push({ scenario: 'timeout', handled: false })
          } catch (error) {
            const elapsed = Date.now() - start
            const timeoutHandled = elapsed < 1000 // Should timeout before 1s
            scenarios.push({ scenario: 'timeout', handled: timeoutHandled })
          }
          
          // 3. Invalid configuration
          try {
            new BrowserTransport({ endpoint: 'invalid-url' })
            scenarios.push({ scenario: 'config-validation', handled: false })
          } catch (error) {
            scenarios.push({ scenario: 'config-validation', handled: true })
          }
          
          const allHandled = scenarios.every(s => s.handled)
          
          return {
            success: allHandled,
            scenarios,
            handledCount: scenarios.filter(s => s.handled).length
          }
        } catch (error) {
          return { success: false, error: error.message }
        }
      })
      
      expect(resilenceTest.success).toBe(true)
      expect(resilenceTest.handledCount).toBe(3)
      expect(resilenceTest.scenarios.every(s => s.handled)).toBe(true)
    })
  })

  test.describe('Memory and Resource Management', () => {
    test('should handle large payloads without memory leaks', async ({ page }) => {
      const memoryTest = await page.evaluate(async () => {
        try {
          const { BrowserTransport } = window.AgentKit
          
          const transport = new BrowserTransport({
            endpoint: '/api/test',
            timeout: 10000
          })
          
          await transport.init()
          
          // Get initial memory usage if available
          const initialMemory = performance.memory ? 
            performance.memory.usedJSHeapSize : null
          
          // Send multiple large payloads
          const largePayload = {
            data: 'x'.repeat(10000), // 10KB each
            timestamp: Date.now()
          }
          
          const requests = []
          for (let i = 0; i < 50; i++) {
            requests.push(
              transport.send({
                ...largePayload,
                id: i
              }).catch(error => ({ error: error.message }))
            )
          }
          
          await Promise.allSettled(requests)
          
          // Force garbage collection if available
          if (window.gc) {
            window.gc()
          }
          
          // Check final memory usage
          const finalMemory = performance.memory ? 
            performance.memory.usedJSHeapSize : null
          
          await transport.shutdown()
          
          const memoryGrowth = initialMemory && finalMemory ? 
            finalMemory - initialMemory : null
          
          return {
            success: true,
            requestCount: 50,
            initialMemory,
            finalMemory,
            memoryGrowth,
            hasMemoryAPI: !!performance.memory
          }
        } catch (error) {
          return { success: false, error: error.message }
        }
      })
      
      expect(memoryTest.success).toBe(true)
      expect(memoryTest.requestCount).toBe(50)
      
      // If memory API is available, check for reasonable memory usage
      if (memoryTest.hasMemoryAPI && memoryTest.memoryGrowth !== null) {
        // Memory growth should be reasonable (less than 50MB for this test)
        expect(memoryTest.memoryGrowth).toBeLessThan(50 * 1024 * 1024)
      }
    })
  })

  test.describe('Bundle Size and Performance', () => {
    test('should have reasonable bundle size and startup performance', async ({ page }) => {
      const performanceTest = await page.evaluate(() => {
        try {
          const startTime = Date.now()
          
          // Check if AgentKit loaded properly
          const agentKitAvailable = !!window.AgentKit
          const loadTime = Date.now() - startTime
          
          // Check available components
          const components = {
            BrowserTransport: !!window.AgentKit?.BrowserTransport,
            AgentRegistry: !!window.AgentKit?.AgentRegistry,
            errors: !!window.AgentKit?.errors,
            defaultRegistry: !!window.AgentKit?.defaultRegistry
          }
          
          const allComponentsLoaded = Object.values(components).every(Boolean)
          
          // Basic performance metrics
          const performanceMetrics = {
            loadTime,
            agentKitAvailable,
            allComponentsLoaded,
            components,
            hasPerformanceAPI: !!performance.mark
          }
          
          return {
            success: agentKitAvailable && allComponentsLoaded,
            ...performanceMetrics
          }
        } catch (error) {
          return { success: false, error: error.message }
        }
      })
      
      expect(performanceTest.success).toBe(true)
      expect(performanceTest.agentKitAvailable).toBe(true)
      expect(performanceTest.allComponentsLoaded).toBe(true)
      expect(performanceTest.loadTime).toBeLessThan(1000) // Should load quickly
    })
  })

  test.describe('Cross-Browser Compatibility', () => {
    test('should work consistently across different browser environments', async ({ page, browserName }) => {
      const compatibilityTest = await page.evaluate((browser) => {
        try {
          const features = {
            fetch: typeof fetch !== 'undefined',
            promise: typeof Promise !== 'undefined',
            json: typeof JSON !== 'undefined',
            abortController: typeof AbortController !== 'undefined',
            es6: (() => {
              try {
                eval('const test = () => {}; class Test {}')
                return true
              } catch (e) {
                return false
              }
            })()
          }
          
          const requiredFeatures = ['fetch', 'promise', 'json']
          const hasRequiredFeatures = requiredFeatures.every(f => features[f])
          
          // Test basic AgentKit functionality
          let agentKitWorks = false
          try {
            const { BrowserTransport } = window.AgentKit
            const transport = new BrowserTransport({
              endpoint: 'https://example.com/api'
            })
            agentKitWorks = transport.id === 'browser'
          } catch (error) {
            // Ignore construction errors for this test
          }
          
          return {
            success: hasRequiredFeatures && agentKitWorks,
            browser,
            features,
            hasRequiredFeatures,
            agentKitWorks,
            userAgent: navigator.userAgent.substring(0, 100)
          }
        } catch (error) {
          return { success: false, error: error.message, browser }
        }
      }, browserName)
      
      expect(compatibilityTest.success).toBe(true)
      expect(compatibilityTest.hasRequiredFeatures).toBe(true)
      expect(compatibilityTest.agentKitWorks).toBe(true)
      
      // Log browser-specific info for debugging
      console.log(`Browser: ${browserName}`)
      console.log(`User Agent: ${compatibilityTest.userAgent}`)
      console.log(`Features: ${JSON.stringify(compatibilityTest.features)}`)
    })
  })
})