import { test, expect } from '@playwright/test'

test.describe('AgentKit SDK Integration with BrowserTransport', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.AgentKit !== undefined)
  })

  test('should integrate BrowserTransport with SDK patterns', async ({ page }) => {
    // Test that BrowserTransport follows SDK patterns
    const integrationTest = await page.evaluate(async () => {
      try {
        const { BrowserTransport } = window.AgentKit
        
        // Create transport instance
        const transport = new BrowserTransport({
          endpoint: '/api/test',
          timeout: 5000,
          headers: {
            'X-SDK-Version': '1.0.0',
            'X-Client': 'browser-test'
          }
        })
        
        // Test Transport interface compliance
        const hasRequiredMethods = [
          'init', 'send', 'receive', 'shutdown'
        ].every(method => typeof transport[method] === 'function')
        
        if (!hasRequiredMethods) {
          return { success: false, error: 'Missing required Transport methods' }
        }
        
        // Test required properties
        const hasRequiredProps = transport.id && transport.name && transport.config
        if (!hasRequiredProps) {
          return { success: false, error: 'Missing required Transport properties' }
        }
        
        // Test full lifecycle
        await transport.init()
        
        // Test send with SDK-like message format
        await transport.send({
          jsonrpc: '2.0',
          id: 'test-request-1',
          method: 'completion',
          params: {
            prompt: 'Hello from browser test',
            max_tokens: 100
          }
        })
        
        // Test receive
        const response = await transport.receive()
        
        // Test shutdown
        await transport.shutdown()
        
        return { 
          success: true, 
          transportId: transport.id,
          response: response ? JSON.stringify(response).substring(0, 200) : null
        }
      } catch (error) {
        return { success: false, error: error.message }
      }
    })
    
    expect(integrationTest.success).toBe(true)
    expect(integrationTest.transportId).toBe('browser')
    
    if (!integrationTest.success) {
      console.error('Integration test failed:', integrationTest.error)
    }
  })

  test('should handle concurrent requests like SDK would', async ({ page }) => {
    const concurrencyTest = await page.evaluate(async () => {
      try {
        const { BrowserTransport } = window.AgentKit
        
        const transport = new BrowserTransport({
          endpoint: '/api/test',
          timeout: 10000,
          maxRetries: 1
        })
        
        await transport.init()
        
        // Send multiple concurrent requests (simulating SDK behavior)
        const requests = Array.from({ length: 5 }, (_, i) => 
          transport.send({
            id: `concurrent-${i}`,
            method: 'test',
            params: { requestId: i, timestamp: Date.now() }
          })
        )
        
        // Wait for all requests to complete
        await Promise.all(requests)
        
        await transport.shutdown()
        
        return { success: true, requestCount: requests.length }
      } catch (error) {
        return { success: false, error: error.message }
      }
    })
    
    expect(concurrencyTest.success).toBe(true)
    expect(concurrencyTest.requestCount).toBe(5)
  })

  test('should handle SDK-style error recovery', async ({ page }) => {
    const errorRecoveryTest = await page.evaluate(async () => {
      try {
        const { BrowserTransport, errors } = window.AgentKit
        
        const transport = new BrowserTransport({
          endpoint: '/api/error', // This endpoint returns 500
          timeout: 5000,
          maxRetries: 2,
          retryDelay: 100
        })
        
        let errorCaught = null
        
        try {
          await transport.send({ test: 'error-recovery' })
        } catch (error) {
          errorCaught = error
        }
        
        await transport.shutdown()
        
        // Should have caught a proper SDK-style error
        const isSDKError = errorCaught && errorCaught.constructor.name === 'TransportSendError'
        const hasContext = errorCaught && errorCaught.context && errorCaught.context.transportId
        
        return { 
          success: isSDKError && hasContext,
          errorType: errorCaught?.constructor.name,
          errorCode: errorCaught?.code,
          errorCategory: errorCaught?.category,
          hasContext: !!hasContext
        }
      } catch (error) {
        return { success: false, error: error.message }
      }
    })
    
    expect(errorRecoveryTest.success).toBe(true)
    expect(errorRecoveryTest.errorType).toBe('TransportSendError')
    expect(errorRecoveryTest.errorCode).toBe('TRANSPORT_SEND_FAILED')
    expect(errorRecoveryTest.hasContext).toBe(true)
  })

  test('should validate configurations like SDK would', async ({ page }) => {
    const configValidationTest = await page.evaluate(() => {
      try {
        const { BrowserTransport } = window.AgentKit
        
        const tests = []
        
        // Test 1: Missing endpoint
        try {
          new BrowserTransport({})
          tests.push({ test: 'missing-endpoint', passed: false })
        } catch (error) {
          tests.push({ 
            test: 'missing-endpoint', 
            passed: error.message.includes('Endpoint is required')
          })
        }
        
        // Test 2: Invalid URL
        try {
          new BrowserTransport({ endpoint: 'not-a-url' })
          tests.push({ test: 'invalid-url', passed: false })
        } catch (error) {
          tests.push({ 
            test: 'invalid-url', 
            passed: error.message.includes('Invalid endpoint URL')
          })
        }
        
        // Test 3: Invalid protocol
        try {
          new BrowserTransport({ endpoint: 'ftp://invalid.com' })
          tests.push({ test: 'invalid-protocol', passed: false })
        } catch (error) {
          tests.push({ 
            test: 'invalid-protocol', 
            passed: error.message.includes('Invalid protocol')
          })
        }
        
        // Test 4: Valid configuration
        try {
          const transport = new BrowserTransport({ endpoint: 'https://valid.com/api' })
          tests.push({ 
            test: 'valid-config', 
            passed: transport.config.endpoint === 'https://valid.com/api'
          })
        } catch (error) {
          tests.push({ test: 'valid-config', passed: false })
        }
        
        return { 
          success: tests.every(t => t.passed),
          tests: tests
        }
      } catch (error) {
        return { success: false, error: error.message }
      }
    })
    
    expect(configValidationTest.success).toBe(true)
    
    // Verify specific validation tests
    const tests = configValidationTest.tests
    expect(tests.find(t => t.test === 'missing-endpoint')?.passed).toBe(true)
    expect(tests.find(t => t.test === 'invalid-url')?.passed).toBe(true)
    expect(tests.find(t => t.test === 'invalid-protocol')?.passed).toBe(true)
    expect(tests.find(t => t.test === 'valid-config')?.passed).toBe(true)
  })

  test('should handle timeout scenarios like SDK would', async ({ page }) => {
    const timeoutTest = await page.evaluate(async () => {
      try {
        const { BrowserTransport } = window.AgentKit
        
        const transport = new BrowserTransport({
          endpoint: '/api/slow', // Takes 2 seconds to respond
          timeout: 1000, // 1 second timeout
          maxRetries: 0 // No retries to make test faster
        })
        
        const startTime = Date.now()
        let timeoutError = null
        
        try {
          await transport.send({ test: 'timeout-scenario' })
        } catch (error) {
          timeoutError = error
        }
        
        const elapsed = Date.now() - startTime
        await transport.shutdown()
        
        // Should have timed out with proper error
        const isTimeoutError = timeoutError && (
          timeoutError.constructor.name === 'RequestTimeoutError' ||
          timeoutError.message.includes('timeout') ||
          timeoutError.message.includes('abort')
        )
        
        return {
          success: isTimeoutError && elapsed < 2000,
          elapsed: elapsed,
          errorType: timeoutError?.constructor.name,
          errorMessage: timeoutError?.message.substring(0, 100)
        }
      } catch (error) {
        return { success: false, error: error.message }
      }
    })
    
    expect(timeoutTest.success).toBe(true)
    expect(timeoutTest.elapsed).toBeGreaterThan(900) // Should be close to 1000ms
    expect(timeoutTest.elapsed).toBeLessThan(2000) // But less than the server response time
  })

  test('should support SDK-style configuration with defaults', async ({ page }) => {
    const defaultsTest = await page.evaluate(() => {
      try {
        const { BrowserTransport } = window.AgentKit
        
        // Test minimal configuration
        const transport1 = new BrowserTransport({
          endpoint: 'https://api.example.com'
        })
        
        // Test custom configuration
        const transport2 = new BrowserTransport({
          endpoint: 'https://api.example.com',
          timeout: 15000,
          maxRetries: 5,
          retryDelay: 2000,
          headers: {
            'Authorization': 'Bearer test-token',
            'X-Custom': 'value'
          }
        })
        
        return {
          success: true,
          defaults: {
            timeout: transport1.config.timeout,
            maxRetries: transport1.config.maxRetries,
            retryDelay: transport1.config.retryDelay,
            headers: transport1.config.headers
          },
          custom: {
            timeout: transport2.config.timeout,
            maxRetries: transport2.config.maxRetries,
            retryDelay: transport2.config.retryDelay,
            customHeader: transport2.config.headers['X-Custom']
          }
        }
      } catch (error) {
        return { success: false, error: error.message }
      }
    })
    
    expect(defaultsTest.success).toBe(true)
    
    // Check defaults
    expect(defaultsTest.defaults.timeout).toBe(10000)
    expect(defaultsTest.defaults.maxRetries).toBe(3)
    expect(defaultsTest.defaults.retryDelay).toBe(1000)
    expect(defaultsTest.defaults.headers).toEqual({})
    
    // Check custom values
    expect(defaultsTest.custom.timeout).toBe(15000)
    expect(defaultsTest.custom.maxRetries).toBe(5)
    expect(defaultsTest.custom.retryDelay).toBe(2000)
    expect(defaultsTest.custom.customHeader).toBe('value')
  })
})