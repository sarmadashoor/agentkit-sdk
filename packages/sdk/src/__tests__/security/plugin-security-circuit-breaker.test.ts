import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PluginSecurityCircuitBreaker, SecurityViolationType } from '../../security/PluginSecurityCircuitBreaker'

/**
 * Plugin Security Circuit Breaker Test Suite
 * 
 * Tests the circuit breaker pattern for plugin security violations.
 * Validates automatic blocking, recovery mechanisms, and violation tracking.
 */

describe('Plugin Security Circuit Breaker', () => {
  let circuitBreaker: PluginSecurityCircuitBreaker
  let consoleWarnSpy: any
  let consoleErrorSpy: any

  beforeEach(() => {
    circuitBreaker = new PluginSecurityCircuitBreaker({
      maxViolations: 3,
      violationWindow: 60000,
      recoveryTimeout: 1000, // Short for testing
      maxConsecutiveViolations: 2,
      enableAutoBlocking: true,
      riskScoreThreshold: 50
    })

    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    circuitBreaker.dispose()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('Violation Recording', () => {
    it('should record security violations correctly', () => {
      const violation = {
        pluginName: 'test-plugin',
        violationType: 'forbidden-api-access' as SecurityViolationType,
        message: 'Attempted to access process.env',
        timestamp: Date.now(),
        severity: 'high' as const,
        metadata: { api: 'process.env' }
      }

      circuitBreaker.recordViolation(violation)

      const stats = circuitBreaker.getPluginStats('test-plugin')
      expect(stats).not.toBeNull()
      expect(stats!.totalViolations).toBe(1)
      expect(stats!.violationsByType['forbidden-api-access']).toBe(1)
      expect(stats!.riskScore).toBeGreaterThan(0)
    })

    it('should calculate risk scores based on violation severity', () => {
      const lowSeverityViolation = {
        pluginName: 'low-risk-plugin',
        violationType: 'memory-limit-exceeded' as SecurityViolationType,
        message: 'Memory usage exceeded',
        timestamp: Date.now(),
        severity: 'low' as const
      }

      const criticalViolation = {
        pluginName: 'high-risk-plugin',
        violationType: 'prototype-pollution' as SecurityViolationType,
        message: 'Attempted prototype pollution',
        timestamp: Date.now(),
        severity: 'critical' as const
      }

      circuitBreaker.recordViolation(lowSeverityViolation)
      circuitBreaker.recordViolation(criticalViolation)

      const lowRiskStats = circuitBreaker.getPluginStats('low-risk-plugin')!
      const highRiskStats = circuitBreaker.getPluginStats('high-risk-plugin')!

      expect(highRiskStats.riskScore).toBeGreaterThan(lowRiskStats.riskScore)
    })

    it('should track consecutive violations', () => {
      const violation = {
        pluginName: 'consecutive-plugin',
        violationType: 'eval-usage' as SecurityViolationType,
        message: 'Used eval function',
        timestamp: Date.now(),
        severity: 'high' as const
      }

      // Record three consecutive violations
      circuitBreaker.recordViolation(violation)
      circuitBreaker.recordViolation({ ...violation, timestamp: Date.now() })
      circuitBreaker.recordViolation({ ...violation, timestamp: Date.now() })

      const stats = circuitBreaker.getPluginStats('consecutive-plugin')!
      expect(stats.consecutiveViolations).toBe(3)
    })
  })

  describe('Circuit Breaker Logic', () => {
    it('should open circuit after max violations', () => {
      const violation = {
        pluginName: 'violating-plugin',
        violationType: 'forbidden-api-access' as SecurityViolationType,
        message: 'API access violation',
        timestamp: Date.now(),
        severity: 'medium' as const
      }

      // Record violations up to the limit
      for (let i = 0; i < 3; i++) {
        circuitBreaker.recordViolation(violation)
      }

      expect(circuitBreaker.isPluginAllowed('violating-plugin')).toBe(false)
      
      const stats = circuitBreaker.getPluginStats('violating-plugin')!
      expect(stats.circuitBreakerState).toBe('OPEN')
    })

    it('should immediately open circuit for critical violations', () => {
      const criticalViolation = {
        pluginName: 'critical-plugin',
        violationType: 'prototype-pollution' as SecurityViolationType,
        message: 'Critical security violation',
        timestamp: Date.now(),
        severity: 'critical' as const
      }

      circuitBreaker.recordViolation(criticalViolation)

      expect(circuitBreaker.isPluginAllowed('critical-plugin')).toBe(false)
      
      const stats = circuitBreaker.getPluginStats('critical-plugin')!
      expect(stats.circuitBreakerState).toBe('OPEN')
    })

    it('should transition to half-open after recovery timeout', async () => {
      const violation = {
        pluginName: 'recovery-plugin',
        violationType: 'timeout-exceeded' as SecurityViolationType,
        message: 'Execution timeout',
        timestamp: Date.now(),
        severity: 'high' as const
      }

      // Trigger circuit opening
      for (let i = 0; i < 3; i++) {
        circuitBreaker.recordViolation(violation)
      }

      expect(circuitBreaker.isPluginAllowed('recovery-plugin')).toBe(false)

      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100))

      const stats = circuitBreaker.getPluginStats('recovery-plugin')!
      expect(stats.circuitBreakerState).toBe('HALF_OPEN')
    })
  })

  describe('Plugin Blocking', () => {
    it('should block plugins with consecutive critical violations', () => {
      const criticalViolation = {
        pluginName: 'malicious-plugin',
        violationType: 'eval-usage' as SecurityViolationType,
        message: 'Eval usage detected',
        timestamp: Date.now(),
        severity: 'critical' as const
      }

      // Record consecutive critical violations
      circuitBreaker.recordViolation(criticalViolation)
      circuitBreaker.recordViolation({ ...criticalViolation, timestamp: Date.now() })

      const stats = circuitBreaker.getPluginStats('malicious-plugin')!
      expect(stats.isBlocked).toBe(true)
      expect(circuitBreaker.isPluginAllowed('malicious-plugin')).toBe(false)
    })

    it('should not block if auto-blocking is disabled', () => {
      const circuitBreakerNoBlock = new PluginSecurityCircuitBreaker({
        enableAutoBlocking: false,
        maxConsecutiveViolations: 1
      })

      const criticalViolation = {
        pluginName: 'no-block-plugin',
        violationType: 'prototype-pollution' as SecurityViolationType,
        message: 'Should not block',
        timestamp: Date.now(),
        severity: 'critical' as const
      }

      circuitBreakerNoBlock.recordViolation(criticalViolation)
      circuitBreakerNoBlock.recordViolation({ ...criticalViolation, timestamp: Date.now() })

      const stats = circuitBreakerNoBlock.getPluginStats('no-block-plugin')!
      expect(stats.isBlocked).toBe(false)

      circuitBreakerNoBlock.dispose()
    })
  })

  describe('Event Emission', () => {
    it('should emit security violation events', () => {
      const violationHandler = vi.fn()
      circuitBreaker.on('securityViolation', violationHandler)

      const violation = {
        pluginName: 'event-plugin',
        violationType: 'suspicious-code-pattern' as SecurityViolationType,
        message: 'Suspicious pattern detected',
        timestamp: Date.now(),
        severity: 'medium' as const
      }

      circuitBreaker.recordViolation(violation)

      expect(violationHandler).toHaveBeenCalledWith(violation)
    })

    it('should emit circuit breaker state change events', () => {
      const circuitOpenHandler = vi.fn()
      const pluginBlockedHandler = vi.fn()
      
      circuitBreaker.on('circuitOpened', circuitOpenHandler)
      circuitBreaker.on('pluginBlocked', pluginBlockedHandler)

      const violation = {
        pluginName: 'state-change-plugin',
        violationType: 'prototype-pollution' as SecurityViolationType,
        message: 'Critical violation',
        timestamp: Date.now(),
        severity: 'critical' as const
      }

      // This should trigger both circuit open and plugin block
      circuitBreaker.recordViolation(violation)
      circuitBreaker.recordViolation({ ...violation, timestamp: Date.now() })

      expect(circuitOpenHandler).toHaveBeenCalled()
      expect(pluginBlockedHandler).toHaveBeenCalled()
    })
  })

  describe('Statistics and Monitoring', () => {
    it('should provide global statistics', () => {
      const violations = [
        {
          pluginName: 'stats-plugin-1',
          violationType: 'forbidden-api-access' as SecurityViolationType,
          message: 'Violation 1',
          timestamp: Date.now(),
          severity: 'medium' as const
        },
        {
          pluginName: 'stats-plugin-2',
          violationType: 'eval-usage' as SecurityViolationType,
          message: 'Violation 2',
          timestamp: Date.now(),
          severity: 'high' as const
        }
      ]

      violations.forEach(v => circuitBreaker.recordViolation(v))

      const globalStats = circuitBreaker.getGlobalStats()
      
      expect(globalStats.totalPlugins).toBe(2)
      expect(globalStats.totalViolations).toBe(2)
      expect(globalStats.violationsByType['forbidden-api-access']).toBe(1)
      expect(globalStats.violationsByType['eval-usage']).toBe(1)
    })

    it('should track plugin-specific statistics', () => {
      const violation1 = {
        pluginName: 'tracked-plugin',
        violationType: 'memory-limit-exceeded' as SecurityViolationType,
        message: 'Memory violation',
        timestamp: Date.now(),
        severity: 'low' as const
      }

      const violation2 = {
        pluginName: 'tracked-plugin',
        violationType: 'timeout-exceeded' as SecurityViolationType,
        message: 'Timeout violation',
        timestamp: Date.now(),
        severity: 'medium' as const
      }

      circuitBreaker.recordViolation(violation1)
      circuitBreaker.recordViolation(violation2)

      const stats = circuitBreaker.getPluginStats('tracked-plugin')!
      
      expect(stats.totalViolations).toBe(2)
      expect(stats.violationsByType['memory-limit-exceeded']).toBe(1)
      expect(stats.violationsByType['timeout-exceeded']).toBe(1)
      expect(stats.lastViolationTime).toBeGreaterThan(0)
    })
  })

  describe('Plugin Reset and Recovery', () => {
    it('should reset plugin state when requested', () => {
      const violation = {
        pluginName: 'reset-plugin',
        violationType: 'forbidden-api-access' as SecurityViolationType,
        message: 'Should be reset',
        timestamp: Date.now(),
        severity: 'critical' as const
      }

      // Block the plugin
      circuitBreaker.recordViolation(violation)
      circuitBreaker.recordViolation({ ...violation, timestamp: Date.now() })

      expect(circuitBreaker.isPluginAllowed('reset-plugin')).toBe(false)

      // Reset the plugin
      circuitBreaker.resetPlugin('reset-plugin')

      expect(circuitBreaker.isPluginAllowed('reset-plugin')).toBe(true)
      expect(circuitBreaker.getPluginStats('reset-plugin')).toBeNull()
    })

    it('should emit plugin reset event', () => {
      const resetHandler = vi.fn()
      circuitBreaker.on('pluginReset', resetHandler)

      circuitBreaker.resetPlugin('reset-event-plugin')

      expect(resetHandler).toHaveBeenCalledWith({ pluginName: 'reset-event-plugin' })
    })
  })

  describe('Security Attack Simulations', () => {
    it('should handle rapid-fire violation attacks', () => {
      const violation = {
        pluginName: 'rapid-fire-plugin',
        violationType: 'suspicious-code-pattern' as SecurityViolationType,
        message: 'Rapid violation',
        timestamp: Date.now(),
        severity: 'medium' as const
      }

      // Simulate rapid violations
      for (let i = 0; i < 10; i++) {
        circuitBreaker.recordViolation({ ...violation, timestamp: Date.now() + i })
      }

      const stats = circuitBreaker.getPluginStats('rapid-fire-plugin')!
      expect(stats.totalViolations).toBe(10)
      expect(stats.circuitBreakerState).toBe('OPEN')
      expect(circuitBreaker.isPluginAllowed('rapid-fire-plugin')).toBe(false)
    })

    it('should handle mixed severity attack patterns', () => {
      const pluginName = 'mixed-attack-plugin'
      
      const violations = [
        { violationType: 'memory-limit-exceeded' as SecurityViolationType, severity: 'low' as const },
        { violationType: 'timeout-exceeded' as SecurityViolationType, severity: 'medium' as const },
        { violationType: 'eval-usage' as SecurityViolationType, severity: 'high' as const },
        { violationType: 'prototype-pollution' as SecurityViolationType, severity: 'critical' as const }
      ]

      violations.forEach((v, i) => {
        circuitBreaker.recordViolation({
          pluginName,
          violationType: v.violationType,
          message: `Mixed attack ${i}`,
          timestamp: Date.now() + i,
          severity: v.severity
        })
      })

      const stats = circuitBreaker.getPluginStats(pluginName)!
      expect(stats.totalViolations).toBe(4)
      expect(stats.riskScore).toBeGreaterThan(75) // Should be high risk
      expect(circuitBreaker.isPluginAllowed(pluginName)).toBe(false)
    })
  })

  describe('Resource Cleanup', () => {
    it('should clean up resources on dispose', () => {
      const violation = {
        pluginName: 'cleanup-plugin',
        violationType: 'timeout-exceeded' as SecurityViolationType,
        message: 'Cleanup test',
        timestamp: Date.now(),
        severity: 'medium' as const
      }

      circuitBreaker.recordViolation(violation)
      
      const statsBefore = circuitBreaker.getAllStats()
      expect(statsBefore.size).toBe(1)

      circuitBreaker.dispose()

      const statsAfter = circuitBreaker.getAllStats()
      expect(statsAfter.size).toBe(0)
    })
  })
})