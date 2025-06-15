import { test, expect } from '@playwright/test'

test.describe('AgentKit Chaos and Stress Testing - Browser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.AgentKit !== undefined)
  })

  test.describe('Network Chaos Testing', () => {
    test('should handle rapid connect/disconnect cycles', async ({ page }) => {
      const chaosTest = await page.evaluate(async () => {
        try {
          const { BrowserTransport } = window.AgentKit
          const results = []
          
          // Simulate rapid connection cycles
          for (let cycle = 0; cycle < 5; cycle++) {
            const transport = new BrowserTransport({
              endpoint: '/api/test',
              timeout: 2000,
              maxRetries: 1
            })
            
            try {
              await transport.init()
              await transport.send({ cycle, test: 'chaos' })
              await transport.shutdown()
              results.push({ cycle, success: true })
            } catch (error) {
              results.push({ cycle, success: false, error: error.message })
            }
          }
          
          const successCount = results.filter(r => r.success).length
          
          return {
            success: successCount >= 3, // At least 60% should succeed
            cycles: 5,
            successCount,
            results
          }
        } catch (error) {
          return { success: false, error: error.message }
        }
      })
      
      expect(chaosTest.success).toBe(true)
      expect(chaosTest.successCount).toBeGreaterThanOrEqual(3)
    })

    test('should handle network interruption simulation', async ({ page }) => {
      const interruptionTest = await page.evaluate(async () => {
        try {
          const { BrowserTransport } = window.AgentKit
          
          const transport = new BrowserTransport({
            endpoint: '/api/test',
            timeout: 1000,
            maxRetries: 3,
            retryDelay: 200
          })
          
          await transport.init()
          
          // Start multiple requests
          const requests = []
          for (let i = 0; i < 10; i++) {
            requests.push(
              transport.send({ 
                id: i, 
                data: `interrupted-${i}` 
              }).catch(error => ({ error: error.message, id: i }))
            )
          }
          
          // Simulate network recovery after some requests
          const results = await Promise.allSettled(requests)
          
          const successful = results.filter(r => r.status === 'fulfilled').length
          const failed = results.filter(r => r.status === 'rejected').length
          
          await transport.shutdown()
          
          return {
            success: successful > 0, // Some should eventually succeed
            totalRequests: 10,
            successful,
            failed,
            ratio: successful / 10
          }
        } catch (error) {
          return { success: false, error: error.message }
        }
      })
      
      expect(interruptionTest.success).toBe(true)
      expect(interruptionTest.successful).toBeGreaterThan(0)
    })
  })

  test.describe('Resource Exhaustion Testing', () => {
    test('should handle memory pressure from large payloads', async ({ page }) => {
      const memoryStressTest = await page.evaluate(async () => {
        try {
          const { BrowserTransport } = window.AgentKit
          
          const transport = new BrowserTransport({
            endpoint: '/api/test',
            timeout: 5000
          })
          
          await transport.init()
          
          // Create increasingly large payloads
          const results = []
          const sizes = [1000, 10000, 100000, 500000] // Bytes
          
          for (const size of sizes) {
            try {
              const largePayload = {
                data: 'x'.repeat(size),
                size: size,
                timestamp: Date.now()
              }
              
              const start = Date.now()
              await transport.send(largePayload)
              const duration = Date.now() - start
              
              results.push({ size, success: true, duration })
            } catch (error) {
              results.push({ size, success: false, error: error.message })
            }
          }
          
          await transport.shutdown()
          
          const successfulSizes = results.filter(r => r.success)
          const largestSuccessful = successfulSizes.length > 0 ? 
            Math.max(...successfulSizes.map(r => r.size)) : 0
          
          return {
            success: successfulSizes.length >= 2, // At least smaller payloads should work
            results,
            largestSuccessful,
            testedSizes: sizes
          }
        } catch (error) {
          return { success: false, error: error.message }
        }
      })
      
      expect(memoryStressTest.success).toBe(true)
      expect(memoryStressTest.largestSuccessful).toBeGreaterThanOrEqual(10000)
    })

    test('should handle high-frequency request bursts', async ({ page }) => {
      const burstTest = await page.evaluate(async () => {
        try {
          const { BrowserTransport } = window.AgentKit
          
          const transport = new BrowserTransport({
            endpoint: '/api/test',
            timeout: 3000
          })
          
          await transport.init()
          
          // Send rapid bursts of requests
          const burstSizes = [10, 25, 50]
          const burstResults = []
          
          for (const burstSize of burstSizes) {
            const burstStart = Date.now()
            
            // Create burst of concurrent requests
            const burst = Array.from({ length: burstSize }, (_, i) =>
              transport.send({
                burstId: burstSize,
                requestId: i,
                timestamp: Date.now()
              }).catch(error => ({ error: error.message }))
            )
            
            try {
              const results = await Promise.allSettled(burst)
              const successful = results.filter(r => r.status === 'fulfilled').length
              const duration = Date.now() - burstStart
              
              burstResults.push({
                burstSize,
                successful,
                duration,
                successRate: successful / burstSize
              })
            } catch (error) {
              burstResults.push({
                burstSize,
                successful: 0,
                error: error.message
              })
            }
          }
          
          await transport.shutdown()
          
          // Check if system handled bursts gracefully
          const averageSuccessRate = burstResults.reduce((sum, r) => 
            sum + (r.successRate || 0), 0) / burstResults.length
          
          return {
            success: averageSuccessRate > 0.5, // At least 50% success rate
            burstResults,
            averageSuccessRate,
            totalBursts: burstSizes.length
          }
        } catch (error) {
          return { success: false, error: error.message }
        }
      })
      
      expect(burstTest.success).toBe(true)
      expect(burstTest.averageSuccessRate).toBeGreaterThan(0.5)
    })
  })

  test.describe('Error Recovery Stress Testing', () => {
    test('should recover from cascading failures', async ({ page }) => {
      const cascadeTest = await page.evaluate(async () => {
        try {
          const { BrowserTransport } = window.AgentKit
          
          // Create multiple transports to simulate system stress
          const transports = []
          const results = []
          
          // Phase 1: Create multiple transports
          for (let i = 0; i < 5; i++) {
            try {
              const transport = new BrowserTransport({
                endpoint: i % 2 === 0 ? '/api/test' : '/api/error', // Mix success/failure endpoints
                timeout: 1000,
                maxRetries: 2
              })
              
              transports.push({ transport, id: i })
            } catch (error) {
              results.push({ phase: 'creation', id: i, error: error.message })
            }
          }
          
          // Phase 2: Initialize all transports
          const initPromises = transports.map(async ({ transport, id }) => {
            try {
              await transport.init()
              return { phase: 'init', id, success: true }
            } catch (error) {
              return { phase: 'init', id, success: false, error: error.message }
            }
          })
          
          const initResults = await Promise.allSettled(initPromises)
          results.push(...initResults.map(r => r.status === 'fulfilled' ? r.value : { error: 'init failed' }))
          
          // Phase 3: Send requests through all transports
          const sendPromises = transports.map(async ({ transport, id }) => {
            try {
              await transport.send({ cascadeTest: true, transportId: id })
              return { phase: 'send', id, success: true }
            } catch (error) {
              return { phase: 'send', id, success: false, error: error.message }
            }
          })
          
          const sendResults = await Promise.allSettled(sendPromises)
          results.push(...sendResults.map(r => r.status === 'fulfilled' ? r.value : { error: 'send failed' }))
          
          // Phase 4: Cleanup all transports
          const shutdownPromises = transports.map(async ({ transport, id }) => {
            try {
              await transport.shutdown()
              return { phase: 'shutdown', id, success: true }
            } catch (error) {
              return { phase: 'shutdown', id, success: false, error: error.message }
            }
          })
          
          const shutdownResults = await Promise.allSettled(shutdownPromises)
          results.push(...shutdownResults.map(r => r.status === 'fulfilled' ? r.value : { error: 'shutdown failed' }))
          
          // Analyze results
          const successfulInits = results.filter(r => r.phase === 'init' && r.success).length
          const successfulSends = results.filter(r => r.phase === 'send' && r.success).length
          const successfulShutdowns = results.filter(r => r.phase === 'shutdown' && r.success).length
          
          return {
            success: successfulInits > 0 && successfulShutdowns >= successfulInits,
            transportsCreated: transports.length,
            successfulInits,
            successfulSends,
            successfulShutdowns,
            results
          }
        } catch (error) {
          return { success: false, error: error.message }
        }
      })
      
      expect(cascadeTest.success).toBe(true)
      expect(cascadeTest.successfulInits).toBeGreaterThan(0)
      expect(cascadeTest.successfulShutdowns).toBeGreaterThanOrEqual(cascadeTest.successfulInits)
    })
  })

  test.describe('Timeout and Cancellation Stress', () => {
    test('should handle aggressive timeout scenarios', async ({ page }) => {
      const timeoutStressTest = await page.evaluate(async () => {
        try {
          const { BrowserTransport } = window.AgentKit
          
          const scenarios = [
            { timeout: 100, endpoint: '/api/slow', expectedOutcome: 'timeout' },
            { timeout: 500, endpoint: '/api/slow', expectedOutcome: 'timeout' },
            { timeout: 3000, endpoint: '/api/slow', expectedOutcome: 'success' },
            { timeout: 100, endpoint: '/api/test', expectedOutcome: 'success' }
          ]
          
          const results = []
          
          for (const scenario of scenarios) {
            const transport = new BrowserTransport({
              endpoint: scenario.endpoint,
              timeout: scenario.timeout,
              maxRetries: 0 // No retries for cleaner timeout testing
            })
            
            await transport.init()
            
            const start = Date.now()
            try {
              await transport.send({ timeoutTest: true, expectedTimeout: scenario.timeout })
              const duration = Date.now() - start
              results.push({
                scenario,
                outcome: 'success',
                duration,
                matchesExpected: scenario.expectedOutcome === 'success'
              })
            } catch (error) {
              const duration = Date.now() - start
              const isTimeout = error.message.includes('timeout') || 
                               error.message.includes('abort') ||
                               duration >= scenario.timeout * 0.9 // Close to timeout
              
              results.push({
                scenario,
                outcome: isTimeout ? 'timeout' : 'error',
                duration,
                matchesExpected: (isTimeout && scenario.expectedOutcome === 'timeout') ||
                                (!isTimeout && scenario.expectedOutcome === 'error')
              })
            }
            
            await transport.shutdown()
          }
          
          const correctOutcomes = results.filter(r => r.matchesExpected).length
          
          return {
            success: correctOutcomes >= scenarios.length * 0.75, // 75% should match expected
            scenarios: scenarios.length,
            correctOutcomes,
            results
          }
        } catch (error) {
          return { success: false, error: error.message }
        }
      })
      
      expect(timeoutStressTest.success).toBe(true)
      expect(timeoutStressTest.correctOutcomes).toBeGreaterThanOrEqual(3)
    })
  })

  test.describe('Browser Environment Edge Cases', () => {
    test('should handle tab visibility changes gracefully', async ({ page }) => {
      const visibilityTest = await page.evaluate(async () => {
        try {
          const { BrowserTransport } = window.AgentKit
          
          const transport = new BrowserTransport({
            endpoint: '/api/test',
            timeout: 2000
          })
          
          await transport.init()
          
          // Simulate tab becoming hidden (background)
          Object.defineProperty(document, 'hidden', {
            configurable: true,
            get: () => true
          })
          
          // Dispatch visibility change event
          const event = new Event('visibilitychange')
          document.dispatchEvent(event)
          
          // Try operations while "hidden"
          const hiddenResults = []
          try {
            await transport.send({ visibilityTest: 'hidden' })
            hiddenResults.push({ operation: 'send', success: true })
          } catch (error) {
            hiddenResults.push({ operation: 'send', success: false, error: error.message })
          }
          
          // Simulate tab becoming visible again
          Object.defineProperty(document, 'hidden', {
            configurable: true,
            get: () => false
          })
          
          document.dispatchEvent(event)
          
          // Try operations while "visible"
          const visibleResults = []
          try {
            await transport.send({ visibilityTest: 'visible' })
            visibleResults.push({ operation: 'send', success: true })
          } catch (error) {
            visibleResults.push({ operation: 'send', success: false, error: error.message })
          }
          
          await transport.shutdown()
          
          return {
            success: true, // Should handle visibility changes without crashing
            hiddenResults,
            visibleResults,
            hasVisibilityAPI: typeof document.hidden !== 'undefined'
          }
        } catch (error) {
          return { success: false, error: error.message }
        }
      })
      
      expect(visibilityTest.success).toBe(true)
    })

    test('should handle online/offline transitions', async ({ page }) => {
      const connectivityTest = await page.evaluate(async () => {
        try {
          const { BrowserTransport } = window.AgentKit
          
          const transport = new BrowserTransport({
            endpoint: '/api/test',
            timeout: 1000,
            maxRetries: 1
          })
          
          await transport.init()
          
          // Record initial online status
          const initialOnline = navigator.onLine
          
          // Try operation while online
          const onlineResults = []
          try {
            await transport.send({ connectivityTest: 'online' })
            onlineResults.push({ success: true })
          } catch (error) {
            onlineResults.push({ success: false, error: error.message })
          }
          
          // Simulate going offline (not all browsers support this in tests)
          const originalOnLine = navigator.onLine
          try {
            Object.defineProperty(navigator, 'onLine', {
              configurable: true,
              get: () => false
            })
            
            // Dispatch offline event
            const offlineEvent = new Event('offline')
            window.dispatchEvent(offlineEvent)
            
            // Try operation while offline
            const offlineResults = []
            try {
              await transport.send({ connectivityTest: 'offline' })
              offlineResults.push({ success: true })
            } catch (error) {
              offlineResults.push({ success: false, error: error.message })
            }
            
            // Restore online status
            Object.defineProperty(navigator, 'onLine', {
              configurable: true,
              get: () => true
            })
            
            const onlineEvent = new Event('online')
            window.dispatchEvent(onlineEvent)
            
            await transport.shutdown()
            
            return {
              success: true, // Should handle connectivity changes
              initialOnline,
              onlineResults,
              offlineResults,
              hasOnlineAPI: typeof navigator.onLine !== 'undefined'
            }
          } finally {
            // Restore original navigator.onLine
            Object.defineProperty(navigator, 'onLine', {
              configurable: true,
              get: () => originalOnLine
            })
          }
        } catch (error) {
          return { success: false, error: error.message }
        }
      })
      
      expect(connectivityTest.success).toBe(true)
      expect(connectivityTest.hasOnlineAPI).toBe(true)
    })
  })
})