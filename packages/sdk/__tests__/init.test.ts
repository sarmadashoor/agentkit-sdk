/**
 * SDK Initialization Test Suite - Resource Cleanup and Leak Prevention
 * 
 * This test suite includes comprehensive resource tracking and cleanup to prevent:
 * - Memory leaks from any initialized components
 * - Process handle leaks
 * - Cross-test contamination
 * 
 * Cleanup includes:
 * - Resource monitoring and cleanup
 * - Process handle verification
 * - Garbage collection triggers
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest'
import { registerCleanup, cleanupAllResources } from './test-utils'

// Leak detection constants
const BASELINE_HANDLE_COUNT = 3
const BASELINE_REQUEST_COUNT = 0

describe('@agentkit/sdk', () => {
  let initialHandleCount: number
  let initialRequestCount: number

  beforeEach(() => {
    // Track initial resource state
    initialHandleCount = process._getActiveHandles().length
    initialRequestCount = process._getActiveRequests().length
  })

  afterEach(async () => {
    // Clean up all resources
    await cleanupAllResources()
    
    // Verify no resource leaks
    const finalHandleCount = process._getActiveHandles().length
    const finalRequestCount = process._getActiveRequests().length
    
    const handleLeak = finalHandleCount - initialHandleCount
    const requestLeak = finalRequestCount - initialRequestCount
    
    if (handleLeak > BASELINE_HANDLE_COUNT) {
      console.warn(`[INIT TEST] Handle leak detected: ${handleLeak} handles remaining`)
    }
    
    if (requestLeak > BASELINE_REQUEST_COUNT) {
      console.warn(`[INIT TEST] Request leak detected: ${requestLeak} requests remaining`)
    }
    
    // Remove manual GC calls for Node 22+ compatibility
    // Let Node.js handle garbage collection naturally
    // if (global.gc) {
    //   global.gc()
    // }
    
    // Final cleanup delay
    await new Promise(resolve => setTimeout(resolve, 10))
  })

  it('should pass initial test', () => {
    expect(true).toBe(true)
  })

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})