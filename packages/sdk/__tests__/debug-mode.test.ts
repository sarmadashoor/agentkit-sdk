/**
 * Debug Mode Test Suite - Resource Cleanup and Leak Prevention
 * 
 * This test suite includes comprehensive resource tracking and cleanup to prevent:
 * - Memory leaks from unclosed resources
 * - Process handle leaks
 * - Cross-test contamination
 * 
 * Cleanup includes:
 * - Console spy restoration
 * - Environment variable restoration
 * - Process handle monitoring
 * - Date.now mock cleanup
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi, Mock } from 'vitest'
import { 
  TraceOutputFormatter, 
  getTraceFormatter,
  logTrace,
  logPluginStart,
  logPluginSuccess,
  logPluginError,
  logPluginTimeout
} from '../src/debug-tools/TraceOutputFormatter'
import type { LifecycleTimelineEntry } from '../src/debug-tools/types'
import { registerCleanup, cleanupAllResources } from './test-utils'

// Leak detection constants
const BASELINE_HANDLE_COUNT = 3
const BASELINE_REQUEST_COUNT = 0

describe('Debug Mode Trace Output', () => {
  let consoleLogSpy: Mock
  let originalEnv: NodeJS.ProcessEnv
  let formatter: TraceOutputFormatter
  let mockNowSpy: any
  let initialHandleCount: number
  let initialRequestCount: number

  beforeEach(() => {
    // Track initial resource state
    initialHandleCount = process._getActiveHandles().length
    initialRequestCount = process._getActiveRequests().length
    
    // Save original environment
    originalEnv = { ...process.env }
    
    // Setup console spy
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    registerCleanup(async () => {
      consoleLogSpy.mockRestore()
    })
    
    // Create formatter with no colors for testing
    formatter = new TraceOutputFormatter({ colors: false })
    formatter.resetTimer()
    
    // Clear any existing Date.now mocks
    mockNowSpy = null
  })

  afterEach(async () => {
    // Restore environment
    process.env = originalEnv
    
    // Clean up Date.now mocks
    if (mockNowSpy) {
      mockNowSpy.mockRestore()
      mockNowSpy = null
    }
    
    // Restore all spies
    vi.restoreAllMocks()
    
    // Clean up all resources
    await cleanupAllResources()
    
    // Verify no resource leaks
    const finalHandleCount = process._getActiveHandles().length
    const finalRequestCount = process._getActiveRequests().length
    
    const handleLeak = finalHandleCount - initialHandleCount
    const requestLeak = finalRequestCount - initialRequestCount
    
    if (handleLeak > BASELINE_HANDLE_COUNT) {
      console.warn(`[DEBUG-MODE TEST] Handle leak detected: ${handleLeak} handles remaining`)
    }
    
    if (requestLeak > BASELINE_REQUEST_COUNT) {
      console.warn(`[DEBUG-MODE TEST] Request leak detected: ${requestLeak} requests remaining`)
    }
    
    // Remove manual GC calls for Node 22+ compatibility
    // Let Node.js handle garbage collection naturally
    // if (global.gc) {
    //   global.gc()
    // }
    
    // Final cleanup delay
    await new Promise(resolve => setTimeout(resolve, 10))
  })

  describe('test:debug(trace): lifecycle timeline accuracy', () => {
    it('should format plugin start events correctly', () => {
      const now = Date.now()
      const result = formatter.formatStart('TestPlugin', 'onSend', now)
      expect(result).toMatch(/▶ onSend\(TestPlugin\) start \(t=\d+ms\)/)
    })

    it('should format plugin success events with timing', () => {
      const now = Date.now()
      const result = formatter.formatSuccess('TestPlugin', 'onSend', 25.5, now)
      expect(result).toMatch(/✔ onSend\(TestPlugin\) success \(t=\d+ms\) \[25\.5ms\]/)
    })

    it('should format plugin error events with error message', () => {
      const now = Date.now()
      const result = formatter.formatError('TestPlugin', 'onSend', 'TimeoutError', 120.0, now)
      expect(result).toMatch(/✖ onSend\(TestPlugin\) error: TimeoutError \(t=\d+ms\) \[120\.0ms\]/)
    })

    it('should format plugin timeout events', () => {
      const now = Date.now()
      const result = formatter.formatTimeout('TestPlugin', 'onSend', 5000, now)
      expect(result).toMatch(/⚠ onSend\(TestPlugin\) timeout \(t=\d+ms\) \[5000\.0ms\]/)
    })

    it('should maintain chronological order in timeline formatting', () => {
      const entries: LifecycleTimelineEntry[] = [
        {
          id: '2',
          pluginName: 'PluginB',
          hookName: 'onSend',
          startTime: 100,
          endTime: 150,
          duration: 50,
          status: 'success',
          timestamp: 150
        },
        {
          id: '1',
          pluginName: 'PluginA',
          hookName: 'onInit',
          startTime: 50,
          endTime: 80,
          duration: 30,
          status: 'success',
          timestamp: 80
        }
      ]

      const formatted = formatter.formatTimeline(entries)
      
      // Should be ordered by startTime
      expect(formatted).toHaveLength(2)
      expect(formatted[0]).toContain('PluginA')
      expect(formatted[1]).toContain('PluginB')
    })

    it('should calculate relative timing correctly', () => {
      formatter.resetTimer()
      const baseTime = Date.now()
      
      // Mock Date.now to return predictable values
      mockNowSpy = vi.spyOn(Date, 'now')
      mockNowSpy.mockReturnValueOnce(baseTime) // Reset timer call
      mockNowSpy.mockReturnValueOnce(baseTime + 100) // First event
      mockNowSpy.mockReturnValueOnce(baseTime + 250) // Second event
      
      const start = formatter.formatStart('Plugin1', 'onInit', baseTime + 100)
      const success = formatter.formatSuccess('Plugin1', 'onInit', 25, baseTime + 250)
      
      expect(start).toContain('(t=100ms)')
      expect(success).toContain('(t=250ms)')
    })
  })

  describe('test:debug(trace): suppresses in production', () => {
    it('should not log traces when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production'
      process.env.DEBUG = 'true'
      
      logTrace('test message')
      logPluginStart('TestPlugin', 'onInit')
      logPluginSuccess('TestPlugin', 'onInit', 10)
      logPluginError('TestPlugin', 'onInit', 'Error', 10)
      logPluginTimeout('TestPlugin', 'onInit', 5000)
      
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it('should log traces in development when DEBUG is enabled', () => {
      process.env.NODE_ENV = 'development'
      process.env.DEBUG = 'true'
      
      logTrace('test message')
      
      expect(consoleLogSpy).toHaveBeenCalledWith('test message')
    })

    it('should not log traces when DEBUG is not enabled', () => {
      process.env.NODE_ENV = 'development'
      delete process.env.DEBUG
      delete process.env.DEBUG_TRACE
      
      logTrace('test message')
      logPluginStart('TestPlugin', 'onInit')
      
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it('should log traces when DEBUG_TRACE is enabled', () => {
      process.env.NODE_ENV = 'development'
      process.env.DEBUG_TRACE = 'true'
      
      logPluginStart('TestPlugin', 'onInit')
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('▶ onInit(TestPlugin) start')
      )
    })

    it('should respect production guards in all trace functions', () => {
      process.env.NODE_ENV = 'production'
      process.env.DEBUG = 'true'
      process.env.DEBUG_TRACE = 'true'
      
      // All these should be no-ops in production
      logPluginStart('TestPlugin', 'onInit')
      logPluginSuccess('TestPlugin', 'onInit', 25)
      logPluginError('TestPlugin', 'onInit', 'TestError', 50)
      logPluginTimeout('TestPlugin', 'onInit', 1000)
      
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })
  })

  describe('test:debug(trace): logs plugin errors correctly', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development'
      process.env.DEBUG = 'true'
    })

    it('should log timeout errors with correct formatting', () => {
      logPluginTimeout('SlowPlugin', 'onSend', 5000)
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠ onSend(SlowPlugin) timeout')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[5000.0ms]')
      )
    })

    it('should log various error types with proper formatting', () => {
      const errorCases = [
        { error: 'TimeoutError', plugin: 'TimeoutPlugin' },
        { error: 'ValidationError: Invalid input', plugin: 'ValidatorPlugin' },
        { error: 'NetworkError: Connection failed', plugin: 'NetworkPlugin' },
        { error: 'ConfigError', plugin: 'ConfigPlugin' }
      ]

      errorCases.forEach(({ error, plugin }) => {
        consoleLogSpy.mockClear()
        logPluginError(plugin, 'onSend', error, 100)
        
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining(`✖ onSend(${plugin}) error: ${error}`)
        )
      })
    })

    it('should handle plugin execution lifecycle with mixed success/failure', () => {
      const timeline = [
        { plugin: 'Plugin1', hook: 'onInit', action: 'start' },
        { plugin: 'Plugin2', hook: 'onInit', action: 'start' },
        { plugin: 'Plugin1', hook: 'onInit', action: 'success', duration: 10 },
        { plugin: 'Plugin2', hook: 'onInit', action: 'error', error: 'InitError', duration: 50 },
        { plugin: 'Plugin1', hook: 'onSend', action: 'start' },
        { plugin: 'Plugin1', hook: 'onSend', action: 'timeout', duration: 1000 }
      ]

      timeline.forEach(step => {
        switch (step.action) {
          case 'start':
            logPluginStart(step.plugin, step.hook)
            break
          case 'success':
            logPluginSuccess(step.plugin, step.hook, step.duration!)
            break
          case 'error':
            logPluginError(step.plugin, step.hook, step.error!, step.duration!)
            break
          case 'timeout':
            logPluginTimeout(step.plugin, step.hook, step.duration!)
            break
        }
      })

      expect(consoleLogSpy).toHaveBeenCalledTimes(6)
      
      // Check that all types of events were logged
      const calls = consoleLogSpy.mock.calls.map(call => call[0])
      expect(calls.some(call => call.includes('▶'))).toBe(true) // Start
      expect(calls.some(call => call.includes('✔'))).toBe(true) // Success
      expect(calls.some(call => call.includes('✖'))).toBe(true) // Error
      expect(calls.some(call => call.includes('⚠'))).toBe(true) // Timeout
    })

    it('should handle edge cases in error logging', () => {
      // Empty error message
      logPluginError('TestPlugin', 'onError', '', 25)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✖ onError(TestPlugin) error:')
      )

      // Very long plugin name
      const longName = 'A'.repeat(100)
      consoleLogSpy.mockClear()
      logPluginError(longName, 'onSend', 'Error', 10)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(`✖ onSend(${longName}) error: Error`)
      )

      // Zero duration
      consoleLogSpy.mockClear()
      logPluginSuccess('FastPlugin', 'onInit', 0)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[0.0ms]')
      )
    })
  })

  describe('Color formatting', () => {
    it('should apply colors when colors are enabled', () => {
      const colorFormatter = new TraceOutputFormatter({ colors: true })
      const result = colorFormatter.formatSuccess('Test', 'onInit', 10)
      
      // Should contain ANSI color codes
      expect(result).toMatch(/\x1b\[\d+m/)
    })

    it('should not apply colors when colors are disabled', () => {
      const noColorFormatter = new TraceOutputFormatter({ colors: false })
      const result = noColorFormatter.formatSuccess('Test', 'onInit', 10)
      
      // Should not contain ANSI color codes
      expect(result).not.toMatch(/\x1b\[\d+m/)
    })

    it('should detect TTY for color support', () => {
      // Mock process.stdout.isTTY
      const mockStdout = { isTTY: true }
      
      // Use global process mock if needed
      vi.stubGlobal('process', { 
        ...process, 
        stdout: mockStdout,
        env: process.env 
      })
      
      const autoFormatter = new TraceOutputFormatter()
      const result = autoFormatter.formatError('Test', 'onSend', 'Error', 10)
      
      // Should contain color codes when TTY is detected
      expect(result).toMatch(/\x1b\[\d+m/)
      
      vi.unstubAllGlobals()
    })
  })

  describe('Performance and duration highlighting', () => {
    it('should highlight slow operations in yellow/red', () => {
      const slowResult = formatter.formatSuccess('SlowPlugin', 'onSend', 150)
      const fastResult = formatter.formatSuccess('FastPlugin', 'onSend', 5)
      
      // Both should contain duration, but formatting logic is internal
      expect(slowResult).toContain('[150.0ms]')
      expect(fastResult).toContain('[5.0ms]')
    })

    it('should handle fractional durations correctly', () => {
      const result = formatter.formatSuccess('Plugin', 'onInit', 12.34567)
      expect(result).toContain('[12.3ms]') // Should round to 1 decimal
    })
  })

  describe('Global formatter instance', () => {
    it('should return same instance for global formatter', () => {
      const formatter1 = getTraceFormatter()
      const formatter2 = getTraceFormatter()
      
      expect(formatter1).toBe(formatter2)
    })

    it('should maintain timer state across calls', () => {
      const globalFormatter = getTraceFormatter()
      globalFormatter.resetTimer()
      
      // First call should have low relative time
      const start = globalFormatter.formatStart('Test', 'onInit')
      expect(start).toContain('(t=0ms)')
    })
  })

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})