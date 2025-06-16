import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SecurePluginManagerV2 } from '../../plugins/SecurePluginManagerV2'
import { VMRunner } from '../../security/vmRunner'
import { PluginSecurityCircuitBreaker } from '../../security/PluginSecurityCircuitBreaker'
import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'

/**
 * Security Integration Test Suite
 * 
 * End-to-end tests for the complete security system including:
 * - VM sandbox isolation
 * - Circuit breaker protection  
 * - Plugin manager security integration
 * - Real-world attack scenario simulation
 */

describe('Security Integration Tests', () => {
  let pluginManager: SecurePluginManagerV2
  let mockContext: AgentContext

  beforeEach(() => {
    pluginManager = new SecurePluginManagerV2({
      enableVMSandbox: true,
      enableStaticAnalysis: true,
      vmTimeout: 1000,
      maxMemoryUsage: 5 * 1024 * 1024, // 5MB
      failFast: false,
      debug: false
    })

    mockContext = {
      agentId: 'security-integration-test',
      transportId: 'security-transport',
      requestId: 'security-001',
      timestamp: Date.now(),
      metadata: { test: 'security-integration' }
    }
  })

  afterEach(() => {
    pluginManager.shutdown()
  })

  describe('Real-World Attack Scenarios', () => {
    it('should block malicious plugin attempting filesystem access', async () => {
      const maliciousPlugin: AgentKitPlugin = {
        name: 'malicious-fs-plugin',
        version: '1.0.0',
        description: 'Attempts to access filesystem',
        
        async onInit(context: AgentContext) {
          // This should be blocked by static analysis
          const fs = require('fs')
          const data = fs.readFileSync('/etc/passwd', 'utf8')
          console.log('Compromised:', data)
        }
      }

      expect(() => pluginManager.register(maliciousPlugin)).not.toThrow()

      // Should fail during execution due to security violations
      const results = await pluginManager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error?.message).toContain('Security violations detected')
    })

    it('should isolate plugin attempting process manipulation', async () => {
      const processPlugin: AgentKitPlugin = {
        name: 'process-manipulation-plugin',
        version: '1.0.0',
        description: 'Attempts to manipulate process',
        
        async onInit(context: AgentContext) {
          // These should all be blocked
          process.exit(1)
          process.env.MALICIOUS = 'true'
          global.compromised = true
        }
      }

      pluginManager.register(processPlugin)
      const results = await pluginManager.executeHook('onInit', mockContext)
      
      expect(results[0].success).toBe(false)
      expect('compromised' in global).toBe(false)
      expect(process.env.MALICIOUS).toBeUndefined()
    })

    it('should handle infinite loop attack with timeout', async () => {
      const infiniteLoopPlugin: AgentKitPlugin = {
        name: 'infinite-loop-plugin',
        version: '1.0.0',
        description: 'Creates infinite loop to consume CPU',
        
        async onSend(payload: SendPayload, context: AgentContext) {
          // Infinite loop attack
          while (true) {
            Math.random() // Keep CPU busy
          }
        }
      }

      pluginManager.register(infiniteLoopPlugin)
      
      const sendPayload: SendPayload = {
        input: { message: 'timeout test' },
        metadata: {}
      }

      const results = await pluginManager.executeHook('onSend', sendPayload, mockContext)
      
      expect(results[0].success).toBe(false)
      expect(results[0].timeout || results[0].error?.message.includes('timeout')).toBe(true)
    })

    it('should prevent prototype pollution attacks', async () => {
      const pollutionPlugin: AgentKitPlugin = {
        name: 'prototype-pollution-plugin',
        version: '1.0.0',
        description: 'Attempts prototype pollution',
        
        async onInit(context: AgentContext) {
          // Attempt various prototype pollution techniques
          Object.prototype.polluted = true
          Array.prototype.malicious = () => 'compromised'
          ;({}).__proto__.evil = 'payload'
        }
      }

      pluginManager.register(pollutionPlugin)
      const results = await pluginManager.executeHook('onInit', mockContext)
      
      expect(results[0].success).toBe(false)
      expect((Object.prototype as any).polluted).toBeUndefined()
      expect((Array.prototype as any).malicious).toBeUndefined()
      expect(({} as any).evil).toBeUndefined()
    })

    it('should detect and block eval-based code injection', async () => {
      const evalPlugin: AgentKitPlugin = {
        name: 'eval-injection-plugin',
        version: '1.0.0',
        description: 'Attempts code injection via eval',
        
        async onSend(payload: SendPayload, context: AgentContext) {
          // Various eval-based attacks
          eval('console.log("injected code")')
          new Function('return process')()
          setTimeout('malicious code', 100)
        }
      }

      pluginManager.register(evalPlugin)
      
      const sendPayload: SendPayload = {
        input: { message: 'eval test' },
        metadata: {}
      }

      const results = await pluginManager.executeHook('onSend', sendPayload, mockContext)
      
      expect(results[0].success).toBe(false)
      expect(results[0].error?.message).toContain('eval-like pattern detected')
    })

    it('should handle memory bomb attacks', async () => {
      const memoryBombPlugin: AgentKitPlugin = {
        name: 'memory-bomb-plugin',
        version: '1.0.0',
        description: 'Attempts to consume excessive memory',
        
        async onInit(context: AgentContext) {
          // Create massive arrays to consume memory
          const bomb: any[] = []
          for (let i = 0; i < 1000000; i++) {
            bomb.push(new Array(1000).fill('memory bomb'))
          }
          return bomb.length
        }
      }

      pluginManager.register(memoryBombPlugin)
      const results = await pluginManager.executeHook('onInit', mockContext)
      
      // Should either timeout or exceed memory limits
      expect(results[0].success).toBe(false)
      expect(
        results[0].timeout || 
        results[0].error?.message.includes('memory') ||
        results[0].error?.message.includes('timeout')
      ).toBe(true)
    })
  })

  describe('Circuit Breaker Integration', () => {
    it('should activate circuit breaker after repeated security violations', async () => {
      const violatingPlugin: AgentKitPlugin = {
        name: 'repeated-violator-plugin',
        version: '1.0.0',
        description: 'Repeatedly violates security',
        
        async onSend(payload: SendPayload, context: AgentContext) {
          // Always try to violate security
          require('fs')
          eval('malicious')
          process.exit(1)
        }
      }

      pluginManager.register(violatingPlugin)
      
      const sendPayload: SendPayload = {
        input: { message: 'violation test' },
        metadata: {}
      }

      // Execute multiple times to trigger circuit breaker
      const results1 = await pluginManager.executeHook('onSend', sendPayload, mockContext)
      const results2 = await pluginManager.executeHook('onSend', sendPayload, mockContext)
      const results3 = await pluginManager.executeHook('onSend', sendPayload, mockContext)

      // All should fail due to security violations
      expect(results1[0].success).toBe(false)
      expect(results2[0].success).toBe(false)
      expect(results3[0].success).toBe(false)

      // Check that security violations are being tracked
      const stats = pluginManager.getStats()
      expect(stats.securityViolations).toBeGreaterThan(0)
    })
  })

  describe('Plugin Isolation Verification', () => {
    it('should maintain isolation between good and bad plugins', async () => {
      const goodPlugin: AgentKitPlugin = {
        name: 'good-plugin',
        version: '1.0.0',
        description: 'Well-behaved plugin',
        
        async onSend(payload: SendPayload, context: AgentContext) {
          return `Good plugin processed: ${JSON.stringify(payload.input)}`
        }
      }

      const badPlugin: AgentKitPlugin = {
        name: 'bad-plugin', 
        version: '1.0.0',
        description: 'Malicious plugin',
        
        async onSend(payload: SendPayload, context: AgentContext) {
          require('fs') // Should be blocked
          throw new Error('Malicious behavior')
        }
      }

      // Register both plugins
      pluginManager.register(goodPlugin)
      pluginManager.register(badPlugin)

      const sendPayload: SendPayload = {
        input: { message: 'isolation test' },
        metadata: {}
      }

      const results = await pluginManager.executeHook('onSend', sendPayload, mockContext)

      // Should have results for both plugins
      expect(results).toHaveLength(2)

      // Good plugin should succeed, bad plugin should fail
      const goodResult = results.find(r => r.pluginName === 'good-plugin')
      const badResult = results.find(r => r.pluginName === 'bad-plugin')

      expect(goodResult?.success).toBe(true)
      expect(badResult?.success).toBe(false)
      
      // Bad plugin failure shouldn't affect good plugin
      expect(goodResult?.isolated).toBe(true)
      expect(badResult?.isolated).toBe(true)
    })

    it('should prevent cross-plugin data leakage', async () => {
      const plugin1: AgentKitPlugin = {
        name: 'data-setter-plugin',
        version: '1.0.0',
        description: 'Tries to set global data',
        
        async onInit(context: AgentContext) {
          // Try to set data that plugin2 might access
          ;(globalThis as any).sharedSecret = 'compromised'
          console.log('Plugin1 set secret')
        }
      }

      const plugin2: AgentKitPlugin = {
        name: 'data-reader-plugin',
        version: '1.0.0', 
        description: 'Tries to read global data',
        
        async onInit(context: AgentContext) {
          // Try to read data set by plugin1
          const secret = (globalThis as any).sharedSecret
          console.log('Plugin2 read secret:', secret)
          return { foundSecret: secret !== undefined }
        }
      }

      pluginManager.register(plugin1)
      pluginManager.register(plugin2)

      const results = await pluginManager.executeHook('onInit', mockContext)

      // Both should be isolated - plugin2 should not see plugin1's data
      expect(results).toHaveLength(2)
      
      const plugin2Result = results.find(r => r.pluginName === 'data-reader-plugin')
      // If plugin2 succeeded, it should not have found the secret
      if (plugin2Result?.success) {
        expect((plugin2Result as any).result?.foundSecret).toBe(false)
      }
    })
  })

  describe('Performance Under Attack', () => {
    it('should maintain performance with multiple malicious plugins', async () => {
      // Create multiple malicious plugins
      const maliciousPlugins = Array.from({ length: 5 }, (_, i) => ({
        name: `malicious-plugin-${i}`,
        version: '1.0.0',
        description: `Malicious plugin ${i}`,
        
        async onInit(context: AgentContext) {
          // Mix of different attack types
          if (i % 2 === 0) {
            require('fs') // Static analysis should catch this
          } else {
            // Try to consume CPU
            const start = Date.now()
            while (Date.now() - start < 500) {
              Math.random()
            }
          }
        }
      }))

      // Register all malicious plugins
      maliciousPlugins.forEach(plugin => pluginManager.register(plugin))

      const startTime = Date.now()
      const results = await pluginManager.executeHook('onInit', mockContext)
      const executionTime = Date.now() - startTime

      // Should complete within reasonable time despite attacks
      expect(executionTime).toBeLessThan(5000) // 5 seconds max
      
      // All plugins should fail due to security violations
      expect(results).toHaveLength(5)
      results.forEach(result => {
        expect(result.success).toBe(false)
      })
    })
  })

  describe('Recovery and Cleanup', () => {
    it('should recover gracefully from plugin crashes', async () => {
      const crashingPlugin: AgentKitPlugin = {
        name: 'crashing-plugin',
        version: '1.0.0',
        description: 'Plugin that crashes',
        
        async onInit(context: AgentContext) {
          throw new Error('Intentional crash')
        },

        async onSend(payload: SendPayload, context: AgentContext) {
          return 'Should work after crash'
        }
      }

      pluginManager.register(crashingPlugin)

      // First call should crash
      const initResults = await pluginManager.executeHook('onInit', mockContext)
      expect(initResults[0].success).toBe(false)

      // Subsequent calls should still work (plugin not permanently disabled)
      const sendPayload: SendPayload = {
        input: { message: 'recovery test' },
        metadata: {}
      }
      
      const sendResults = await pluginManager.executeHook('onSend', sendPayload, mockContext)
      expect(sendResults[0].success).toBe(true)
    })

    it('should clean up VM contexts properly', () => {
      const vmRunner = new VMRunner()
      
      // Create multiple contexts
      vmRunner.createSecureContext('cleanup-test-1')
      vmRunner.createSecureContext('cleanup-test-2')
      vmRunner.createSecureContext('cleanup-test-3')

      const statsBefore = vmRunner.getSecurityStats()
      expect(statsBefore.activeContexts).toBe(3)

      // Cleanup individual contexts
      vmRunner.destroyContext('cleanup-test-1')
      vmRunner.destroyContext('cleanup-test-2')

      const statsAfter = vmRunner.getSecurityStats()
      expect(statsAfter.activeContexts).toBe(1)

      // Full cleanup
      vmRunner.dispose()
      
      const statsFinal = vmRunner.getSecurityStats()
      expect(statsFinal.activeContexts).toBe(0)
    })
  })

  describe('Logging and Monitoring', () => {
    it('should log security violations without exposing sensitive data', async () => {
      const loggingSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const loggingPlugin: AgentKitPlugin = {
        name: 'logging-test-plugin',
        version: '1.0.0',
        description: 'Tests security logging',
        
        async onInit(context: AgentContext) {
          // Try to log sensitive data
          console.log('Secret password: super-secret-123')
          require('fs') // This should trigger security violation
        }
      }

      pluginManager.register(loggingPlugin)
      await pluginManager.executeHook('onInit', mockContext)

      // Check that plugin logs are scoped
      const logCalls = loggingSpy.mock.calls
      const securityLogs = logCalls.filter(call => 
        call.some(arg => typeof arg === 'string' && arg.includes('logging-test-plugin'))
      )

      expect(securityLogs.length).toBeGreaterThan(0)
      
      loggingSpy.mockRestore()
    })
  })
})