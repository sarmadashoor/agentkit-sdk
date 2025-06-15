/**
 * Unit tests for PluginExecutionTimeline - Plugin execution debugger
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PluginExecutionTimeline, TimelineSchema, TimelineEntrySchema } from '../PluginExecutionTimeline'

describe('PluginExecutionTimeline', () => {
  let timeline: PluginExecutionTimeline

  beforeEach(() => {
    timeline = new PluginExecutionTimeline({
      platform: 'test',
      warningThreshold: 50,
      enableConsoleWarnings: false // Disable for tests
    })
  })

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      const customTimeline = new PluginExecutionTimeline({
        platform: 'browser',
        warningThreshold: 100,
        enableConsoleWarnings: true
      })
      
      const timelineData = customTimeline.getTimeline()
      expect(timelineData.metadata.platform).toBe('browser')
      expect(timelineData.metadata.warningThreshold).toBe(100)
    })

    it('should use default configuration', () => {
      const defaultTimeline = new PluginExecutionTimeline()
      const timelineData = defaultTimeline.getTimeline()
      
      expect(timelineData.metadata.platform).toBe('default')
      expect(timelineData.metadata.warningThreshold).toBe(75) // Default threshold
    })

    it('should set platform-specific thresholds', () => {
      const browserTimeline = new PluginExecutionTimeline({ platform: 'browser' })
      const nodeTimeline = new PluginExecutionTimeline({ platform: 'node' })
      
      expect(browserTimeline.getTimeline().metadata.warningThreshold).toBe(50)
      expect(nodeTimeline.getTimeline().metadata.warningThreshold).toBe(100)
    })
  })

  describe('Timeline Entry Management', () => {
    it('should start and end execution tracking', () => {
      const id = timeline.startExecution('onInit', 'TestPlugin', { test: 'metadata' })
      expect(id).toBeDefined()
      
      // Let some time pass
      const startTime = Date.now()
      timeline.endExecution(id, 'success')
      
      const timelineData = timeline.getTimeline()
      expect(timelineData.entries).toHaveLength(1)
      
      const entry = timelineData.entries[0]
      expect(entry.id).toBe(id)
      expect(entry.hookName).toBe('onInit')
      expect(entry.pluginName).toBe('TestPlugin')
      expect(entry.status).toBe('success')
      expect(entry.start).toBeGreaterThan(0)
      expect(entry.end).toBeGreaterThanOrEqual(entry.start)
      expect(entry.duration).toBeGreaterThanOrEqual(0)
      expect(entry.metadata).toEqual({ test: 'metadata' })
    })

    it('should handle execution tracking with errors', () => {
      const id = timeline.startExecution('onSend', 'ErrorPlugin')
      timeline.endExecution(id, 'error', 'Test error message')
      
      const entry = timeline.getTimeline().entries[0]
      expect(entry.status).toBe('error')
      expect(entry.error).toBe('Test error message')
    })

    it('should handle execution tracking with timeouts', () => {
      const id = timeline.startExecution('onSend', 'SlowPlugin')
      timeline.endExecution(id, 'timeout')
      
      const entry = timeline.getTimeline().entries[0]
      expect(entry.status).toBe('timeout')
    })

    it('should handle invalid execution IDs gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      timeline.endExecution('invalid-id', 'success')
      
      expect(consoleSpy).toHaveBeenCalledWith('Timeline entry not found for ID: invalid-id')
      consoleSpy.mockRestore()
    })

    it('should add complete executions in one call', () => {
      timeline.addExecution('onInit', 'QuickPlugin', 25, 'success', undefined, { quick: true })
      
      const entry = timeline.getTimeline().entries[0]
      expect(entry.hookName).toBe('onInit')
      expect(entry.pluginName).toBe('QuickPlugin')
      expect(entry.duration).toBe(25)
      expect(entry.status).toBe('success')
      expect(entry.metadata).toEqual({ quick: true })
      expect(entry.start).toBeGreaterThan(0)
      expect(entry.end).toBeGreaterThan(entry.start)
    })
  })

  describe('Performance Warnings', () => {
    it('should warn on threshold violations when enabled', () => {
      const warnTimeline = new PluginExecutionTimeline({
        platform: 'test',
        warningThreshold: 30,
        enableConsoleWarnings: true
      })
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      warnTimeline.addExecution('onSend', 'SlowPlugin', 50, 'success')
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '⚠️  Plugin performance warning: SlowPlugin.onSend took 50ms (threshold: 30ms)'
      )
      
      consoleSpy.mockRestore()
    })

    it('should not warn when disabled', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      timeline.addExecution('onSend', 'SlowPlugin', 100, 'success')
      
      expect(consoleSpy).not.toHaveBeenCalled()
      
      consoleSpy.mockRestore()
    })

    it('should not warn below threshold', () => {
      const warnTimeline = new PluginExecutionTimeline({
        platform: 'test',
        warningThreshold: 100,
        enableConsoleWarnings: true
      })
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      warnTimeline.addExecution('onSend', 'FastPlugin', 50, 'success')
      
      expect(consoleSpy).not.toHaveBeenCalled()
      
      consoleSpy.mockRestore()
    })
  })

  describe('Timeline Summary', () => {
    beforeEach(() => {
      // Add diverse execution data
      timeline.addExecution('onInit', 'Plugin1', 20, 'success')
      timeline.addExecution('onSend', 'Plugin1', 30, 'success')
      timeline.addExecution('onSend', 'Plugin2', 40, 'error', 'Test error')
      timeline.addExecution('onSend', 'Plugin3', 100, 'timeout')
      timeline.addExecution('onShutdown', 'Plugin1', 15, 'success')
    })

    it('should calculate summary statistics correctly', () => {
      const timelineData = timeline.getTimeline()
      const summary = timelineData.summary
      
      expect(summary.totalEntries).toBe(5)
      expect(summary.completedEntries).toBe(5) // All have end times
      expect(summary.errorEntries).toBe(1)
      expect(summary.timeoutEntries).toBe(1)
      expect(summary.totalDuration).toBe(205) // 20+30+40+100+15
      expect(summary.averageDuration).toBe(41) // 205/5
      expect(summary.longestDuration).toBe(100)
      expect(summary.shortestDuration).toBe(15)
    })

    it('should handle empty timeline', () => {
      const emptyTimeline = new PluginExecutionTimeline()
      const summary = emptyTimeline.getTimeline().summary
      
      expect(summary.totalEntries).toBe(0)
      expect(summary.completedEntries).toBe(0)
      expect(summary.errorEntries).toBe(0)
      expect(summary.timeoutEntries).toBe(0)
      expect(summary.totalDuration).toBe(0)
      expect(summary.averageDuration).toBe(0)
      expect(summary.longestDuration).toBe(0)
      expect(summary.shortestDuration).toBe(0)
    })

    it('should handle pending executions', () => {
      const pendingTimeline = new PluginExecutionTimeline()
      const id = pendingTimeline.startExecution('onInit', 'PendingPlugin')
      
      const summary = pendingTimeline.getTimeline().summary
      expect(summary.totalEntries).toBe(1)
      expect(summary.completedEntries).toBe(0) // No end time yet
    })
  })

  describe('Plugin and Hook Filtering', () => {
    beforeEach(() => {
      timeline.addExecution('onInit', 'Plugin1', 20, 'success')
      timeline.addExecution('onSend', 'Plugin1', 30, 'success')
      timeline.addExecution('onSend', 'Plugin2', 40, 'error')
      timeline.addExecution('onInit', 'Plugin2', 25, 'success')
    })

    it('should filter timeline by plugin', () => {
      const plugin1Timeline = timeline.getPluginTimeline('Plugin1')
      
      expect(plugin1Timeline).toHaveLength(2)
      expect(plugin1Timeline.every(e => e.pluginName === 'Plugin1')).toBe(true)
      expect(plugin1Timeline.map(e => e.hookName).sort()).toEqual(['onInit', 'onSend'])
    })

    it('should filter timeline by hook', () => {
      const sendTimeline = timeline.getHookTimeline('onSend')
      
      expect(sendTimeline).toHaveLength(2)
      expect(sendTimeline.every(e => e.hookName === 'onSend')).toBe(true)
      expect(sendTimeline.map(e => e.pluginName).sort()).toEqual(['Plugin1', 'Plugin2'])
    })

    it('should return empty arrays for non-existent filters', () => {
      expect(timeline.getPluginTimeline('NonExistentPlugin')).toHaveLength(0)
      expect(timeline.getHookTimeline('onReceive' as any)).toHaveLength(0)
    })

    it('should sort filtered results by start time', () => {
      const plugin1Timeline = timeline.getPluginTimeline('Plugin1')
      
      for (let i = 1; i < plugin1Timeline.length; i++) {
        expect(plugin1Timeline[i].start).toBeGreaterThanOrEqual(plugin1Timeline[i - 1].start)
      }
    })
  })

  describe('Performance Statistics', () => {
    beforeEach(() => {
      // Create performance test data
      timeline.addExecution('onInit', 'FastPlugin', 10, 'success')
      timeline.addExecution('onInit', 'FastPlugin', 15, 'success')
      timeline.addExecution('onSend', 'FastPlugin', 20, 'success')
      
      timeline.addExecution('onInit', 'SlowPlugin', 80, 'success')
      timeline.addExecution('onSend', 'SlowPlugin', 120, 'error') // Over threshold
      timeline.addExecution('onSend', 'SlowPlugin', 60, 'timeout') // Over threshold
      
      timeline.addExecution('onSend', 'MediumPlugin', 40, 'success')
    })

    it('should calculate performance statistics correctly', () => {
      const stats = timeline.getPerformanceStats()
      
      expect(stats.totalPlugins).toBe(3)
      expect(stats.totalHooks).toBe(2) // onInit, onSend
      
      expect(stats.averageDurationByPlugin['FastPlugin']).toBeCloseTo(15) // (10+15+20)/3
      expect(stats.averageDurationByPlugin['SlowPlugin']).toBeCloseTo(86.67, 1) // (80+120+60)/3
      expect(stats.averageDurationByPlugin['MediumPlugin']).toBe(40)
      
      expect(stats.averageDurationByHook['onInit']).toBeCloseTo(35) // (10+15+80)/3
      expect(stats.averageDurationByHook['onSend']).toBe(60) // (20+120+60+40)/4
    })

    it('should identify slowest plugins and hooks', () => {
      const stats = timeline.getPerformanceStats()
      
      expect(stats.slowestPlugins[0].plugin).toBe('SlowPlugin')
      expect(stats.slowestPlugins[1].plugin).toBe('MediumPlugin')
      expect(stats.slowestPlugins[2].plugin).toBe('FastPlugin')
      
      expect(stats.slowestHooks[0].hook).toBe('onSend')
      expect(stats.slowestHooks[1].hook).toBe('onInit')
    })

    it('should track threshold violations', () => {
      const stats = timeline.getPerformanceStats()
      
      expect(stats.thresholdViolations).toHaveLength(2) // SlowPlugin onSend executions
      expect(stats.thresholdViolations[0].duration).toBe(120) // Sorted by duration desc
      expect(stats.thresholdViolations[1].duration).toBe(60)
      
      expect(stats.thresholdViolations.every(v => v.plugin === 'SlowPlugin')).toBe(true)
      expect(stats.thresholdViolations.every(v => v.hook === 'onSend')).toBe(true)
    })
  })

  describe('Console Table Output', () => {
    beforeEach(() => {
      timeline.addExecution('onInit', 'Plugin1', 20, 'success')
      timeline.addExecution('onSend', 'Plugin2', 100, 'timeout')
    })

    it('should generate table data correctly', () => {
      const tableData = timeline.getTableData()
      
      expect(tableData).toHaveLength(2)
      
      const row1 = tableData[0]
      expect(row1.Plugin).toBe('Plugin1')
      expect(row1.Hook).toBe('onInit')
      expect(row1.Duration).toBe('20ms')
      expect(row1.Status).toBe('success')
      expect(row1.Start).toMatch(/^\d{2}:\d{2}:\d{2}$/) // HH:MM:SS format
      expect(row1.End).toMatch(/^\d{2}:\d{2}:\d{2}$/)
      
      const row2 = tableData[1]
      expect(row2.Plugin).toBe('Plugin2')
      expect(row2.Status).toBe('timeout')
    })

    it('should handle pending executions in table', () => {
      const id = timeline.startExecution('onInit', 'PendingPlugin')
      const tableData = timeline.getTableData()
      
      const pendingRow = tableData.find(row => row.Plugin === 'PendingPlugin')
      expect(pendingRow?.Duration).toBe('pending')
      expect(pendingRow?.End).toBe('pending')
    })

    it('should print timeline to console', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const tablespy = vi.spyOn(console, 'table').mockImplementation(() => {})
      
      timeline.printTimeline()
      
      expect(tablespy).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith('📊 Plugin Execution Timeline:')
      expect(consoleSpy).toHaveBeenCalledWith('📈 Summary:')
      
      consoleSpy.mockRestore()
      tablespy.mockRestore()
    })

    it('should handle empty timeline in print', () => {
      const emptyTimeline = new PluginExecutionTimeline()
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      emptyTimeline.printTimeline()
      
      expect(consoleSpy).toHaveBeenCalledWith('📊 No plugin executions recorded yet')
      
      consoleSpy.mockRestore()
    })
  })

  describe('Zod Schema Validation', () => {
    it('should validate timeline entries against schema', () => {
      timeline.addExecution('onInit', 'ValidPlugin', 25, 'success')
      
      const timelineData = timeline.getTimeline()
      
      expect(() => TimelineSchema.parse(timelineData)).not.toThrow()
      expect(() => TimelineEntrySchema.parse(timelineData.entries[0])).not.toThrow()
    })

    it('should handle validation failures gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      // Try to start execution with invalid hook name
      const id = timeline.startExecution('invalidHook' as any, 'TestPlugin')
      
      // Should handle gracefully and not add invalid entry
      const timelineData = timeline.getTimeline()
      expect(timelineData.entries).toHaveLength(0)
      expect(consoleSpy).toHaveBeenCalledWith('Failed to validate timeline entry:', expect.any(Error))
      
      consoleSpy.mockRestore()
    })

    it('should return safe timeline on validation failure', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      // Create timeline with some data
      timeline.addExecution('onInit', 'TestPlugin', 25, 'success')
      
      // Mock getTimeline to return invalid data
      const originalGetTimeline = timeline.getTimeline
      timeline.getTimeline = () => {
        const validTimeline = originalGetTimeline.call(timeline)
        // Corrupt the timeline data
        ;(validTimeline as any).summary.totalEntries = 'invalid'
        return validTimeline as any
      }
      
      const result = timeline.getTimeline()
      
      // Should return safe fallback
      expect(result.entries).toEqual([])
      expect(result.summary.totalEntries).toBe(0)
      expect(consoleSpy).toHaveBeenCalledWith('Timeline validation failed:', expect.any(Error))
      
      consoleSpy.mockRestore()
    })
  })

  describe('Timeline Management', () => {
    it('should clear timeline', () => {
      timeline.addExecution('onInit', 'TestPlugin', 25, 'success')
      expect(timeline.getTimeline().entries).toHaveLength(1)
      
      timeline.clear()
      
      const timelineData = timeline.getTimeline()
      expect(timelineData.entries).toHaveLength(0)
      expect(timelineData.metadata.endTime).toBeUndefined()
    })

    it('should finalize timeline', () => {
      timeline.addExecution('onInit', 'TestPlugin', 25, 'success')
      
      const beforeFinalize = timeline.getTimeline()
      expect(beforeFinalize.metadata.endTime).toBeUndefined()
      
      timeline.finalize()
      
      const afterFinalize = timeline.getTimeline()
      expect(afterFinalize.metadata.endTime).toBeGreaterThan(beforeFinalize.metadata.startTime)
    })
  })

  describe('Browser Export', () => {
    it('should export timeline for browser debugging', () => {
      timeline.addExecution('onInit', 'BrowserPlugin', 30, 'success')
      
      const exported = timeline.exportForBrowser()
      
      expect(exported.entries).toHaveLength(1)
      expect(exported.tableData).toHaveLength(1)
      expect(exported.performanceStats).toBeDefined()
      expect(typeof exported.printTimeline).toBe('function')
    })

    it('should include callable printTimeline function', () => {
      const exported = timeline.exportForBrowser()
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      exported.printTimeline()
      
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('Edge Cases', () => {
    it('should handle concurrent executions', () => {
      const id1 = timeline.startExecution('onInit', 'Plugin1')
      const id2 = timeline.startExecution('onSend', 'Plugin2')
      const id3 = timeline.startExecution('onInit', 'Plugin3')
      
      timeline.endExecution(id2, 'success')
      timeline.endExecution(id1, 'error', 'Test error')
      timeline.endExecution(id3, 'timeout')
      
      const entries = timeline.getTimeline().entries
      expect(entries).toHaveLength(3)
      expect(entries.every(e => e.duration !== undefined)).toBe(true)
    })

    it('should handle very large durations', () => {
      timeline.addExecution('onInit', 'SlowPlugin', 999999, 'success')
      
      const stats = timeline.getPerformanceStats()
      expect(stats.averageDurationByPlugin['SlowPlugin']).toBe(999999)
      expect(stats.thresholdViolations).toHaveLength(1)
    })

    it('should handle zero and negative durations gracefully', () => {
      timeline.addExecution('onInit', 'ZeroPlugin', 0, 'success')
      
      const entry = timeline.getTimeline().entries[0]
      expect(entry.duration).toBe(0)
      
      const stats = timeline.getPerformanceStats()
      expect(stats.averageDurationByPlugin['ZeroPlugin']).toBe(0)
    })

    it('should handle plugins with special characters in names', () => {
      timeline.addExecution('onInit', 'Plugin-With-Dashes_And_Underscores', 25, 'success')
      timeline.addExecution('onSend', 'Plugin With Spaces', 30, 'success')
      
      const entries = timeline.getTimeline().entries
      expect(entries).toHaveLength(2)
      expect(entries[0].pluginName).toBe('Plugin-With-Dashes_And_Underscores')
      expect(entries[1].pluginName).toBe('Plugin With Spaces')
    })
  })
})