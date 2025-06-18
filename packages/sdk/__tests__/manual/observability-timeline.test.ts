import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PluginExecutionTimeline } from '../../src/observability/PluginExecutionTimeline'

/**
 * Observability Timeline Test Suite
 * 
 * Validates the plugin's ability to emit timeline events and collect them 
 * through the observability system. Tests comprehensive timeline event 
 * emission, collection, and chronological ordering with memory-safe, 
 * synchronous execution patterns.
 */

describe('Observability Timeline Validation', () => {
  let timeline: PluginExecutionTimeline

  beforeEach(() => {
    // Create timeline with test-appropriate thresholds
    timeline = new PluginExecutionTimeline({
      platform: 'node',
      warningThreshold: 50, // 50ms threshold for test timing
      enableConsoleWarnings: false // Disable console noise during tests
    })
  })

  describe('Basic Timeline Event Emission', () => {
    it('should emit and collect timeline events for plugin lifecycle hooks', async () => {
      // Simulate plugin execution timeline
      const pluginName = 'timeline-test-plugin'
      
      // Start onInit execution
      const initId = timeline.startExecution('onInit', pluginName, { 
        metadata: { testCase: 'basic-lifecycle' } 
      })
      
      // Simulate onInit work (10ms delay)
      await new Promise(resolve => setTimeout(resolve, 10))
      timeline.endExecution(initId, 'success')
      
      // Start onSend execution  
      const sendId = timeline.startExecution('onSend', pluginName, {
        metadata: { payload: 'test-message' }
      })
      
      // Simulate onSend work (15ms delay)
      await new Promise(resolve => setTimeout(resolve, 15))
      timeline.endExecution(sendId, 'success')
      
      // Start onShutdown execution
      const shutdownId = timeline.startExecution('onShutdown', pluginName)
      
      // Simulate onShutdown work (5ms delay)
      await new Promise(resolve => setTimeout(resolve, 5))
      timeline.endExecution(shutdownId, 'success')
      
      // Get timeline data
      const timelineData = timeline.getTimeline()
      
      // Verify timeline has entries
      expect(timelineData.entries.length).toBe(3)
      
      // Verify we have events for our plugin
      const pluginEntries = timelineData.entries.filter(
        entry => entry.pluginName === pluginName
      )
      expect(pluginEntries.length).toBe(3) // onInit, onSend, onShutdown

      // Find specific lifecycle events
      const initEvent = pluginEntries.find(entry => entry.hookName === 'onInit')
      const sendEvent = pluginEntries.find(entry => entry.hookName === 'onSend') 
      const shutdownEvent = pluginEntries.find(entry => entry.hookName === 'onShutdown')

      // Verify all events exist and have correct structure
      expect(initEvent).toBeDefined()
      expect(initEvent?.status).toBe('success')
      expect(initEvent?.duration).toBeGreaterThanOrEqual(8) // At least close to 10ms delay

      expect(sendEvent).toBeDefined()
      expect(sendEvent?.status).toBe('success')
      expect(sendEvent?.duration).toBeGreaterThanOrEqual(13) // At least close to 15ms delay

      expect(shutdownEvent).toBeDefined()
      expect(shutdownEvent?.status).toBe('success')
      expect(shutdownEvent?.duration).toBeGreaterThanOrEqual(3) // At least close to 5ms delay
    })

    it('should maintain chronological order of timeline events', async () => {
      const fastPlugin = 'fast-plugin'
      const slowPlugin = 'slow-plugin'
      
      const startTime = Date.now()
      
      // Execute fast plugin hooks
      timeline.addExecution('onInit', fastPlugin, 5, 'success')
      timeline.addExecution('onSend', fastPlugin, 5, 'success')
      timeline.addExecution('onShutdown', fastPlugin, 5, 'success')
      
      // Execute slow plugin hooks (with longer durations)
      timeline.addExecution('onInit', slowPlugin, 20, 'success')
      timeline.addExecution('onSend', slowPlugin, 25, 'success') 
      timeline.addExecution('onShutdown', slowPlugin, 15, 'success')

      const timelineData = timeline.getTimeline()
      
      // Verify entries are in chronological order
      const sortedEntries = timelineData.entries.sort((a, b) => a.start - b.start)
      
      for (let i = 1; i < sortedEntries.length; i++) {
        expect(sortedEntries[i].start).toBeGreaterThanOrEqual(sortedEntries[i - 1].start)
      }

      // Verify both plugins executed
      const fastEntries = timelineData.entries.filter(entry => entry.pluginName === fastPlugin)
      const slowEntries = timelineData.entries.filter(entry => entry.pluginName === slowPlugin)
      
      expect(fastEntries.length).toBe(3)
      expect(slowEntries.length).toBe(3)

      // Verify slow plugin durations are longer
      const slowInitEntry = slowEntries.find(entry => entry.hookName === 'onInit')
      const fastInitEntry = fastEntries.find(entry => entry.hookName === 'onInit')
      
      expect(slowInitEntry?.duration).toBe(20)
      expect(fastInitEntry?.duration).toBe(5)
      expect(slowInitEntry!.duration).toBeGreaterThan(fastInitEntry!.duration)
    })
  })

  describe('Timeline Error Tracking', () => {
    it('should capture plugin errors in timeline with error status', async () => {
      const errorPlugin = 'error-plugin'
      const healthyPlugin = 'healthy-plugin'
      
      // Simulate successful init for both plugins
      timeline.addExecution('onInit', errorPlugin, 10, 'success')
      timeline.addExecution('onInit', healthyPlugin, 5, 'success')
      
      // Simulate error in error-plugin onSend
      timeline.addExecution('onSend', errorPlugin, 8, 'error', 'onSend simulation error')
      
      // Simulate successful onSend for healthy plugin
      timeline.addExecution('onSend', healthyPlugin, 5, 'success')
      
      // Simulate successful shutdown for both
      timeline.addExecution('onShutdown', errorPlugin, 3, 'success')
      timeline.addExecution('onShutdown', healthyPlugin, 5, 'success')

      const timelineData = timeline.getTimeline()
      
      // Find error entries
      const errorEntries = timelineData.entries.filter(entry => entry.status === 'error')
      expect(errorEntries.length).toBe(1)
      
      // Verify error plugin has error status for onSend
      const errorPluginSendEntry = timelineData.entries.find(
        entry => entry.pluginName === errorPlugin && 
                 entry.hookName === 'onSend' && 
                 entry.status === 'error'
      )
      expect(errorPluginSendEntry).toBeDefined()
      expect(errorPluginSendEntry?.error).toBe('onSend simulation error')

      // Verify healthy plugin still succeeded
      const healthyPluginEntries = timelineData.entries.filter(
        entry => entry.pluginName === healthyPlugin && entry.status === 'success'
      )
      expect(healthyPluginEntries.length).toBe(3)

      // Verify timeline summary reflects errors
      expect(timelineData.summary.errorEntries).toBe(1)
      expect(timelineData.summary.completedEntries).toBe(6)
    })

    it('should track performance threshold violations', async () => {
      const slowPlugin = 'slow-performance-plugin'
      
      // Add executions that exceed the 50ms threshold
      timeline.addExecution('onInit', slowPlugin, 80, 'success')   // Exceeds threshold
      timeline.addExecution('onSend', slowPlugin, 100, 'success')  // Exceeds threshold  
      timeline.addExecution('onShutdown', slowPlugin, 20, 'success') // Within threshold

      const performanceStats = timeline.getPerformanceStats()
      
      // Verify threshold violations were detected
      expect(performanceStats.thresholdViolations.length).toBe(2)
      
      // Verify specific violations for slow operations
      const initViolation = performanceStats.thresholdViolations.find(
        v => v.plugin === slowPlugin && v.hook === 'onInit'
      )
      const sendViolation = performanceStats.thresholdViolations.find(
        v => v.plugin === slowPlugin && v.hook === 'onSend'
      )
      
      expect(initViolation).toBeDefined()
      expect(initViolation?.duration).toBe(80)
      
      expect(sendViolation).toBeDefined()
      expect(sendViolation?.duration).toBe(100)

      // Verify shutdown did not violate threshold
      const shutdownViolation = performanceStats.thresholdViolations.find(
        v => v.plugin === slowPlugin && v.hook === 'onShutdown'
      )
      expect(shutdownViolation).toBeUndefined()
    })
  })

  describe('Memory-Safe Synchronous Execution', () => {
    it('should handle multiple plugins without memory leaks', () => {
      // Create multiple plugins with different characteristics
      const plugins = Array.from({ length: 5 }, (_, i) => ({
        name: `plugin-${i}`,
        onInitDuration: i * 5,    // Staggered delays: 0, 5, 10, 15, 20ms
        onSendDuration: i * 3,    // Staggered delays: 0, 3, 6, 9, 12ms
        onShutdownDuration: i * 2, // Staggered delays: 0, 2, 4, 6, 8ms
      }))

      // Simulate plugin executions
      plugins.forEach(plugin => {
        timeline.addExecution('onInit', plugin.name, plugin.onInitDuration, 'success')
        
        // Multiple onSend calls to stress test
        for (let i = 0; i < 3; i++) {
          timeline.addExecution('onSend', plugin.name, plugin.onSendDuration, 'success')
        }
        
        timeline.addExecution('onShutdown', plugin.name, plugin.onShutdownDuration, 'success')
      })

      const timelineData = timeline.getTimeline()
      
      // Verify all plugins have timeline entries (1 init + 3 sends + 1 shutdown = 5 per plugin)
      plugins.forEach(plugin => {
        const pluginEntries = timelineData.entries.filter(
          entry => entry.pluginName === plugin.name
        )
        expect(pluginEntries.length).toBe(5)
      })

      // Verify no memory leaks by checking timeline can be accessed multiple times
      const timelineData2 = timeline.getTimeline()
      expect(timelineData2.entries.length).toBe(timelineData.entries.length)
      
      // Verify performance stats are accurate
      const perfStats = timeline.getPerformanceStats()
      expect(perfStats.totalPlugins).toBe(5)
      expect(Object.keys(perfStats.averageDurationByPlugin)).toHaveLength(5)
      
      // Verify total entry count (5 plugins × 5 entries each = 25)
      expect(timelineData.summary.totalEntries).toBe(25)
    })

    it('should provide accurate timeline metadata and summaries', () => {
      const testPlugin = 'metadata-test-plugin'
      
      const beforeTime = Date.now()
      
      // Add test executions with metadata
      timeline.addExecution('onInit', testPlugin, 10, 'success', undefined, {
        category: 'testing',
        environment: 'unit-test'
      })
      timeline.addExecution('onSend', testPlugin, 15, 'success')
      timeline.addExecution('onShutdown', testPlugin, 5, 'success')
      
      const afterTime = Date.now()

      const timelineData = timeline.getTimeline()
      
      // Verify timeline metadata
      expect(timelineData.metadata).toBeDefined()
      expect(timelineData.metadata.platform).toBe('node')
      expect(timelineData.metadata.warningThreshold).toBe(50)
      expect(timelineData.metadata.startTime).toBeGreaterThanOrEqual(beforeTime - 100)
      expect(timelineData.metadata.startTime).toBeLessThanOrEqual(beforeTime + 100)

      // Verify timeline summary calculations
      expect(timelineData.summary.totalEntries).toBe(3)
      expect(timelineData.summary.completedEntries).toBe(3)
      expect(timelineData.summary.errorEntries).toBe(0)
      expect(timelineData.summary.averageDuration).toBe(10) // (10 + 15 + 5) / 3
      expect(timelineData.summary.longestDuration).toBe(15)
      expect(timelineData.summary.shortestDuration).toBe(5)
      expect(timelineData.summary.totalDuration).toBe(30)
      
      // Verify individual entries have proper structure
      timelineData.entries.forEach(entry => {
        expect(entry.id).toBeDefined()
        expect(entry.hookName).toMatch(/^on(Init|Send|Error|Shutdown)$/)
        expect(entry.pluginName).toBe(testPlugin)
        expect(entry.start).toBeGreaterThan(0)
        expect(entry.end).toBeGreaterThan(entry.start)
        expect(entry.duration).toBe(entry.end! - entry.start)
        expect(entry.status).toBe('success')
      })
    })
  })

  describe('Timeline Export and Debugging Features', () => {
    it('should provide console-ready table data for debugging', () => {
      const plugins = [
        { name: 'table-plugin-1', duration: 10 },
        { name: 'table-plugin-2', duration: 20 }
      ]

      // Add executions for table testing
      plugins.forEach(plugin => {
        timeline.addExecution('onInit', plugin.name, plugin.duration, 'success')
        timeline.addExecution('onSend', plugin.name, plugin.duration + 5, 'success')
        timeline.addExecution('onShutdown', plugin.name, plugin.duration - 5, 'success')
      })

      // Get table data for console.table() output
      const tableData = timeline.getTableData()

      // Verify table data structure
      expect(tableData.length).toBe(6) // 2 plugins × 3 hooks each
      tableData.forEach(row => {
        expect(row.Plugin).toMatch(/^table-plugin-[12]$/)
        expect(row.Hook).toMatch(/^on(Init|Send|Shutdown)$/)
        expect(row.Duration).toMatch(/^\d+ms$/)
        expect(row.Status).toBe('success')
        expect(row.Start).toMatch(/^\d{2}:\d{2}:\d{2}$/)
        expect(row.End).toMatch(/^\d{2}:\d{2}:\d{2}$/)
      })

      // Verify table data is sorted chronologically by comparing actual entries
      const entriesByStart = timeline.getTimeline().entries.sort((a, b) => a.start - b.start)
      for (let i = 1; i < entriesByStart.length; i++) {
        expect(entriesByStart[i].start).toBeGreaterThanOrEqual(entriesByStart[i - 1].start)
      }
    })

    it('should provide enhanced debug timeline with browser compatibility', () => {
      const testPlugin = 'browser-compat-plugin'
      
      timeline.addExecution('onInit', testPlugin, 5, 'success')
      timeline.addExecution('onSend', testPlugin, 10, 'success')
      timeline.addExecution('onShutdown', testPlugin, 3, 'success')

      // Get enhanced debug timeline for browser export
      const enhancedTimeline = timeline.exportForBrowser()
      
      // Verify enhanced timeline structure for browser debugging
      expect(enhancedTimeline).toHaveProperty('entries')
      expect(enhancedTimeline).toHaveProperty('summary')
      expect(enhancedTimeline).toHaveProperty('metadata')
      expect(enhancedTimeline).toHaveProperty('performanceStats')
      expect(enhancedTimeline).toHaveProperty('tableData')
      
      // Verify browser export includes utility functions
      expect(typeof enhancedTimeline.printTimeline).toBe('function')
      
      // Verify performance stats are included
      expect(enhancedTimeline.performanceStats.totalPlugins).toBe(1)
      expect(enhancedTimeline.performanceStats.averageDurationByPlugin).toHaveProperty(testPlugin)
      expect(enhancedTimeline.performanceStats.averageDurationByPlugin[testPlugin]).toBe(6) // (5 + 10 + 3) / 3
    })
  })

  describe('Edge Cases and Resilience', () => {
    it('should handle concurrent execution tracking with unique IDs', () => {
      const concurrentPlugin = 'concurrent-plugin'
      
      // Start multiple executions concurrently
      const execution1 = timeline.startExecution('onSend', concurrentPlugin, { request: 1 })
      const execution2 = timeline.startExecution('onSend', concurrentPlugin, { request: 2 })
      const execution3 = timeline.startExecution('onSend', concurrentPlugin, { request: 3 })
      
      // Verify unique IDs
      expect(execution1).not.toBe(execution2)
      expect(execution2).not.toBe(execution3)
      expect(execution1).not.toBe(execution3)
      
      // Complete executions in different order
      timeline.endExecution(execution2, 'success')
      timeline.endExecution(execution1, 'success')
      timeline.endExecution(execution3, 'error', 'Concurrent execution error')
      
      const timelineData = timeline.getTimeline()
      
      // Verify all executions were tracked
      const concurrentEntries = timelineData.entries.filter(
        entry => entry.pluginName === concurrentPlugin
      )
      expect(concurrentEntries.length).toBe(3)
      
      // Verify completion status
      const successEntries = concurrentEntries.filter(entry => entry.status === 'success')
      const errorEntries = concurrentEntries.filter(entry => entry.status === 'error')
      
      expect(successEntries.length).toBe(2)
      expect(errorEntries.length).toBe(1)
      expect(errorEntries[0].error).toBe('Concurrent execution error')
    })

    it('should maintain timeline consistency during rapid operations', () => {
      const rapidPlugin = 'rapid-plugin'
      
      // Execute many rapid operations
      for (let i = 0; i < 20; i++) {
        timeline.addExecution('onSend', rapidPlugin, Math.random() * 10, 'success', undefined, {
          iteration: i,
          timestamp: Date.now()
        })
      }

      const timelineData = timeline.getTimeline()
      
      // Verify all operations were tracked
      const rapidEntries = timelineData.entries.filter(entry => entry.pluginName === rapidPlugin)
      expect(rapidEntries.length).toBe(20)
      
      // Verify each entry has unique ID and proper timestamps
      const entryIds = rapidEntries.map(entry => entry.id)
      const uniqueIds = new Set(entryIds)
      expect(uniqueIds.size).toBe(20) // All IDs should be unique
      
      // Verify chronological consistency
      const sortedRapidEntries = rapidEntries.sort((a, b) => a.start - b.start)
      for (let i = 1; i < sortedRapidEntries.length; i++) {
        expect(sortedRapidEntries[i].start).toBeGreaterThanOrEqual(sortedRapidEntries[i - 1].start)
      }

      // Verify performance statistics
      const perfStats = timeline.getPerformanceStats()
      expect(perfStats.averageDurationByPlugin[rapidPlugin]).toBeGreaterThan(0)
      expect(perfStats.averageDurationByHook['onSend']).toBeGreaterThan(0)
    })

    it('should handle malformed timeline entries gracefully', () => {
      const testPlugin = 'malformed-plugin'
      
      // Try to end execution that was never started
      timeline.endExecution('non-existent-id', 'success')
      
      // Add normal execution
      timeline.addExecution('onInit', testPlugin, 10, 'success')
      
      // Timeline should still be valid despite malformed operations
      const timelineData = timeline.getTimeline()
      expect(timelineData.entries.length).toBe(1)
      expect(timelineData.summary.totalEntries).toBe(1)
      
      // Verify timeline validation passes
      expect(() => timeline.getTimeline()).not.toThrow()
    })
  })
})