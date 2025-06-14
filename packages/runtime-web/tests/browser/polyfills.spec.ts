import { test, expect } from '@playwright/test'

test.describe('Browser Polyfills and Compatibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    
    // Wait for page to load
    await page.waitForFunction(() => window.testFunctions !== undefined)
  })

  test('should provide fetch polyfill if needed', async ({ page }) => {
    // Test that fetch is available (either native or polyfilled)
    const fetchAvailable = await page.evaluate(() => typeof fetch !== 'undefined')
    expect(fetchAvailable).toBe(true)
    
    // Test that fetch can make a basic request
    const fetchWorks = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: 'polyfill-check' })
        })
        return response.ok
      } catch (error) {
        return false
      }
    })
    expect(fetchWorks).toBe(true)
  })

  test('should provide AbortController polyfill if needed', async ({ page }) => {
    // Test that AbortController is available
    const abortControllerAvailable = await page.evaluate(() => typeof AbortController !== 'undefined')
    expect(abortControllerAvailable).toBe(true)
    
    // Test that AbortController works
    const abortControllerWorks = await page.evaluate(() => {
      try {
        const controller = new AbortController()
        const signal = controller.signal
        
        // Check basic properties exist
        if (typeof signal !== 'object' || signal === null) return false
        if (typeof controller.abort !== 'function') return false
        
        // Test abort functionality
        let aborted = signal.aborted
        controller.abort()
        return signal.aborted !== aborted || signal.aborted === true
      } catch (error) {
        return false
      }
    })
    expect(abortControllerWorks).toBe(true)
  })

  test('should handle missing APIs gracefully', async ({ page }) => {
    // Test behavior when AbortController is not available
    await page.evaluate(() => {
      // Temporarily remove AbortController
      const originalAbortController = window.AbortController
      delete window.AbortController
      
      // Test that transport still works
      return new Promise((resolve) => {
        const transport = new window.AgentKit.BrowserTransport({
          endpoint: '/api/test',
          timeout: 1000
        })
        
        transport.send({ test: 'no-abort-controller' })
          .then(() => resolve(true))
          .catch(() => resolve(false))
          .finally(() => {
            // Restore AbortController
            window.AbortController = originalAbortController
          })
      })
    })
  })

  test('should serialize large payloads safely', async ({ page }) => {
    // Test large object serialization
    const serializationWorks = await page.evaluate(() => {
      try {
        // Create a large object
        const largeObject = {
          data: 'x'.repeat(1000000), // 1MB string
          array: Array(10000).fill().map((_, i) => ({ id: i, value: `item-${i}` })),
          nested: {
            deep: {
              structure: {
                with: {
                  many: {
                    levels: 'test'
                  }
                }
              }
            }
          },
          timestamp: Date.now()
        }
        
        // Test JSON serialization
        const serialized = JSON.stringify(largeObject)
        const deserialized = JSON.parse(serialized)
        
        // Verify data integrity
        return deserialized.data.length === 1000000 && 
               deserialized.array.length === 10000 &&
               deserialized.nested.deep.structure.with.many.levels === 'test'
      } catch (error) {
        console.error('Serialization test failed:', error)
        return false
      }
    })
    
    expect(serializationWorks).toBe(true)
  })

  test('should handle circular references in serialization', async ({ page }) => {
    // Test that circular references are handled properly
    const circularHandling = await page.evaluate(() => {
      try {
        // Create object with circular reference
        const obj = { name: 'test' }
        obj.self = obj
        
        // Attempt serialization (should fail gracefully)
        JSON.stringify(obj)
        return false // Should not reach here
      } catch (error) {
        // Should catch circular reference error
        return error.message.includes('circular') || error.message.includes('Converting circular')
      }
    })
    
    expect(circularHandling).toBe(true)
  })

  test('should provide console polyfill information', async ({ page }) => {
    // Check that console is available for logging
    const consoleAvailable = await page.evaluate(() => typeof console !== 'undefined')
    expect(consoleAvailable).toBe(true)
    
    // Test that console methods exist
    const consoleMethods = await page.evaluate(() => {
      const methods = ['log', 'error', 'warn', 'info']
      return methods.every(method => typeof console[method] === 'function')
    })
    expect(consoleMethods).toBe(true)
  })

  test('should handle browser feature detection', async ({ page, browserName }) => {
    // Test feature detection for different browser capabilities
    const features = await page.evaluate(() => {
      return {
        fetch: typeof fetch !== 'undefined',
        abortController: typeof AbortController !== 'undefined',
        promise: typeof Promise !== 'undefined',
        json: typeof JSON !== 'undefined',
        xmlHttpRequest: typeof XMLHttpRequest !== 'undefined',
        setTimeout: typeof setTimeout !== 'undefined',
        webWorkers: typeof Worker !== 'undefined',
        serviceWorker: 'serviceWorker' in navigator,
        localStorage: typeof localStorage !== 'undefined',
        sessionStorage: typeof sessionStorage !== 'undefined',
        indexedDB: typeof indexedDB !== 'undefined',
        webSockets: typeof WebSocket !== 'undefined',
        geolocation: 'geolocation' in navigator,
        userAgent: navigator.userAgent
      }
    })
    
    // All browsers should have these basic features
    expect(features.fetch).toBe(true)
    expect(features.abortController).toBe(true)
    expect(features.promise).toBe(true)
    expect(features.json).toBe(true)
    expect(features.setTimeout).toBe(true)
    
    // Log browser-specific capabilities
    console.log(`${browserName} features:`, features)
    
    // Browser-specific expectations
    if (browserName === 'webkit') {
      // Safari might have different behavior for some features
      expect(features.userAgent).toContain('Safari')
    } else if (browserName === 'firefox') {
      expect(features.userAgent).toContain('Firefox')
    } else if (browserName === 'chromium') {
      expect(features.userAgent).toContain('Chrome')
    }
  })

  test('should handle network connectivity changes', async ({ page }) => {
    // Test online/offline detection
    const networkStatus = await page.evaluate(() => {
      return {
        online: navigator.onLine,
        connectionType: navigator.connection?.effectiveType || 'unknown',
        hasConnectionAPI: 'connection' in navigator
      }
    })
    
    // Should detect online status
    expect(typeof networkStatus.online).toBe('boolean')
    
    console.log('Network status:', networkStatus)
  })

  test('should handle different content types safely', async ({ page }) => {
    // Test various content type handling
    const contentTypeTests = await page.evaluate(async () => {
      const results = []
      
      try {
        // Test JSON content
        const jsonResponse = await fetch('/api/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'json', data: 'test' })
        })
        results.push({ type: 'json', success: jsonResponse.ok })
      } catch (error) {
        results.push({ type: 'json', success: false, error: error.message })
      }
      
      try {
        // Test text content
        const textResponse = await fetch('/api/test', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: 'plain text data'
        })
        results.push({ type: 'text', success: textResponse.ok })
      } catch (error) {
        results.push({ type: 'text', success: false, error: error.message })
      }
      
      return results
    })
    
    // At least JSON should work
    const jsonTest = contentTypeTests.find(t => t.type === 'json')
    expect(jsonTest?.success).toBe(true)
    
    console.log('Content type test results:', contentTypeTests)
  })
})