import { test, expect } from '@playwright/test'

test.describe('BrowserTransport Cross-Browser Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    
    // Wait for page to load and AgentKit to be available
    await page.waitForFunction(() => window.AgentKit !== undefined)
    await page.waitForFunction(() => window.testFunctions !== undefined)
  })

  test('should display browser environment information', async ({ page, browserName }) => {
    // Check that browser info is displayed
    const browserInfo = page.locator('#browser-info')
    await expect(browserInfo).toBeVisible()
    
    // Check for user agent containing the browser name
    const userAgent = await browserInfo.locator('p').first().textContent()
    expect(userAgent).toContain('User Agent:')
    
    // Log browser-specific information
    console.log(`Testing on ${browserName}`)
    console.log(`User Agent: ${userAgent}`)
  })

  test('should show all required browser APIs as available', async ({ page }) => {
    const polyfillStatus = page.locator('#polyfill-status')
    await expect(polyfillStatus).toBeVisible()
    
    // Check that all required APIs are available (or polyfilled)
    const requiredApis = ['fetch', 'AbortController', 'Promise', 'JSON', 'XMLHttpRequest', 'setTimeout', 'console']
    
    for (const api of requiredApis) {
      const apiStatus = polyfillStatus.locator(`div:has-text("${api}: Available")`)
      await expect(apiStatus).toBeVisible()
    }
  })

  test('should complete transport lifecycle successfully', async ({ page }) => {
    // Click the lifecycle test button
    await page.click('button:has-text("Test Transport Lifecycle")')
    
    // Wait for all lifecycle tests to complete
    await page.waitForSelector('#lifecycle-results .test-result.success', { timeout: 10000 })
    
    // Check that all lifecycle steps passed
    const successResults = await page.locator('#lifecycle-results .test-result.success').count()
    expect(successResults).toBeGreaterThanOrEqual(5) // init, send, receive, shutdown, post-shutdown check
    
    // Verify no error results
    const errorResults = await page.locator('#lifecycle-results .test-result.error').count()
    expect(errorResults).toBe(0)
  })

  test('should handle error recovery correctly', async ({ page }) => {
    // Click the error recovery test button
    await page.click('button:has-text("Test Error Recovery")')
    
    // Wait for error test to complete
    await page.waitForSelector('#error-results .test-result', { timeout: 10000 })
    
    // Check that server error was handled correctly
    const successResults = await page.locator('#error-results .test-result.success').count()
    expect(successResults).toBeGreaterThanOrEqual(1)
    
    // Should have at least one success (error correctly handled)
    const errorHandled = page.locator('#error-results .test-result.success:has-text("Server error correctly handled")')
    await expect(errorHandled).toBeVisible()
  })

  test('should handle timeouts correctly', async ({ page }) => {
    // Click the timeout test button
    await page.click('button:has-text("Test Timeouts")')
    
    // Wait for timeout test to complete (should be quick since it times out)
    await page.waitForSelector('#timeout-results .test-result', { timeout: 15000 })
    
    // Check that timeout was handled correctly
    const timeoutHandled = page.locator('#timeout-results .test-result.success:has-text("correctly timed out")')
    await expect(timeoutHandled).toBeVisible()
    
    // Verify the timeout happened within reasonable time
    const timeoutMessage = await timeoutHandled.textContent()
    const timeMatch = timeoutMessage?.match(/after (\d+)ms/)
    if (timeMatch) {
      const timeoutDuration = parseInt(timeMatch[1])
      expect(timeoutDuration).toBeGreaterThan(900) // Should be close to 1000ms
      expect(timeoutDuration).toBeLessThan(2000) // But not too much over
    }
  })

  test('should handle large payloads safely', async ({ page }) => {
    // Click the large payload test button
    await page.click('button:has-text("Test Large Payloads")')
    
    // Wait for large payload test to complete (may take longer)
    await page.waitForSelector('#payload-results .test-result', { timeout: 20000 })
    
    // Check that both send and receive of large payloads worked
    const sendSuccess = page.locator('#payload-results .test-result.success:has-text("Large payload send successful")')
    await expect(sendSuccess).toBeVisible()
    
    const receiveSuccess = page.locator('#payload-results .test-result.success:has-text("Large payload receive successful")')
    await expect(receiveSuccess).toBeVisible()
  })

  test('should invoke hooks correctly', async ({ page }) => {
    // Click the hook invocation test button
    await page.click('button:has-text("Test Hooks")')
    
    // Wait for hook test to complete
    await page.waitForSelector('#hook-results .test-result', { timeout: 10000 })
    
    // Check that all hooks were called
    const hooksSuccess = page.locator('#hook-results .test-result.success:has-text("All hooks called")')
    await expect(hooksSuccess).toBeVisible()
    
    // Verify the hook names are included
    const hookMessage = await hooksSuccess.textContent()
    expect(hookMessage).toContain('onInit')
    expect(hookMessage).toContain('onSend')
    expect(hookMessage).toContain('onShutdown')
  })

  test('should log test activities properly', async ({ page }) => {
    // Run a simple test to generate logs
    await page.click('button:has-text("Test Transport Lifecycle")')
    await page.waitForSelector('#lifecycle-results .test-result', { timeout: 10000 })
    
    // Check that logs are being generated
    const logs = page.locator('#test-logs')
    await expect(logs).toBeVisible()
    
    // Should have multiple log entries
    const logEntries = await logs.locator('div').count()
    expect(logEntries).toBeGreaterThan(3)
    
    // Check that logs contain timestamp and useful information
    const firstLog = logs.locator('div').first()
    const logText = await firstLog.textContent()
    expect(logText).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) // ISO timestamp format
  })

  test('should clear logs when requested', async ({ page }) => {
    // Generate some logs first
    await page.click('button:has-text("Test Transport Lifecycle")')
    await page.waitForSelector('#test-logs div', { timeout: 5000 })
    
    // Verify logs exist
    let logCount = await page.locator('#test-logs div').count()
    expect(logCount).toBeGreaterThan(0)
    
    // Clear logs
    await page.click('button:has-text("Clear Logs")')
    
    // Verify logs are cleared
    logCount = await page.locator('#test-logs div').count()
    expect(logCount).toBe(0)
  })
})

test.describe('Browser-Specific Compatibility', () => {
  test('should work in Chrome/Chromium', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Chrome-specific test')
    
    await page.goto('/')
    await page.waitForFunction(() => window.AgentKit !== undefined)
    
    // Test Chrome-specific features
    await page.click('button:has-text("Test Transport Lifecycle")')
    await page.waitForSelector('#lifecycle-results .test-result.success', { timeout: 10000 })
    
    const successResults = await page.locator('#lifecycle-results .test-result.success').count()
    expect(successResults).toBeGreaterThanOrEqual(5)
  })

  test('should work in Firefox', async ({ page, browserName }) => {
    test.skip(browserName !== 'firefox', 'Firefox-specific test')
    
    await page.goto('/')
    await page.waitForFunction(() => window.AgentKit !== undefined)
    
    // Test Firefox-specific features
    await page.click('button:has-text("Test Error Recovery")')
    await page.waitForSelector('#error-results .test-result', { timeout: 10000 })
    
    const successResults = await page.locator('#error-results .test-result.success').count()
    expect(successResults).toBeGreaterThanOrEqual(1)
  })

  test('should work in Safari/WebKit', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'Safari-specific test')
    
    await page.goto('/')
    await page.waitForFunction(() => window.AgentKit !== undefined)
    
    // Test Safari-specific features (Safari can be more strict with CORS/security)
    await page.click('button:has-text("Test Timeouts")')
    await page.waitForSelector('#timeout-results .test-result', { timeout: 15000 })
    
    const timeoutHandled = page.locator('#timeout-results .test-result.success:has-text("correctly timed out")')
    await expect(timeoutHandled).toBeVisible()
  })
})

test.describe('Mobile Browser Compatibility', () => {
  test('should work on mobile Chrome', async ({ page, browserName }) => {
    test.skip(browserName !== 'Mobile Chrome', 'Mobile Chrome-specific test')
    
    await page.goto('/')
    await page.waitForFunction(() => window.AgentKit !== undefined)
    
    // Test basic functionality on mobile
    await page.click('button:has-text("Test Transport Lifecycle")')
    await page.waitForSelector('#lifecycle-results .test-result.success', { timeout: 15000 })
    
    const successResults = await page.locator('#lifecycle-results .test-result.success').count()
    expect(successResults).toBeGreaterThanOrEqual(5)
  })

  test('should work on mobile Safari', async ({ page, browserName }) => {
    test.skip(browserName !== 'Mobile Safari', 'Mobile Safari-specific test')
    
    await page.goto('/')
    await page.waitForFunction(() => window.AgentKit !== undefined)
    
    // Test basic functionality on mobile Safari
    await page.click('button:has-text("Test Large Payloads")')
    await page.waitForSelector('#payload-results .test-result', { timeout: 20000 })
    
    const sendSuccess = page.locator('#payload-results .test-result.success:has-text("Large payload send successful")')
    await expect(sendSuccess).toBeVisible()
  })
})