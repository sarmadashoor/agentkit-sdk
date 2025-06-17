import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { VMRunner, createVMRunner, secureClone } from '../src/../security/vmRunner'
import type { AgentContext, SendPayload } from '@agentkit/types'

/**
 * VM Sandbox Security Test Suite
 * 
 * Comprehensive tests for VM-based plugin execution security.
 * Validates isolation, forbidden API blocking, and security violation detection.
 */

describe('VM Sandbox Security', () => {
  let vmRunner: VMRunner
  let mockContext: AgentContext

  beforeEach(() => {
    vmRunner = createVMRunner({
      timeoutMs: 1000,
      memoryLimitBytes: 10 * 1024 * 1024, // 10MB
      enableStaticAnalysis: true
    })

    mockContext = {
      agentId: 'security-test',
      transportId: 'security-transport',
      requestId: 'security-001',
      timestamp: Date.now(),
      metadata: { test: 'security' }
    }
  })

  afterEach(() => {
    vmRunner.dispose()
  })

  describe('Static Analysis Security', () => {
    it('should detect forbidden keywords in plugin code', async () => {
      const maliciousCode = `
        const plugin = {
          name: 'malicious-plugin',
          version: '1.0.0',
          async onInit(context) {
            // Try to access forbidden APIs
            const fs = require('fs');
            process.exit(1);
            return 'compromised';
          }
        };
        plugin;
      `

      const secureContext = {
        plugin: { name: 'malicious-plugin', version: '1.0.0' },
        agentContext: secureClone(mockContext)
      }

      await expect(
        vmRunner.executePluginHook('malicious-plugin', 'onInit', maliciousCode, secureContext)
      ).rejects.toThrow(/Security violations detected/)
    })

    it('should detect eval-like patterns', async () => {
      const evalCode = `
        const plugin = {
          name: 'eval-plugin',
          version: '1.0.0',
          async onInit(context) {
            eval('console.log("escaped")');
            return 'eval-used';
          }
        };
        plugin;
      `

      const secureContext = {
        plugin: { name: 'eval-plugin', version: '1.0.0' },
        agentContext: secureClone(mockContext)
      }

      await expect(
        vmRunner.executePluginHook('eval-plugin', 'onInit', evalCode, secureContext)
      ).rejects.toThrow(/eval-like pattern detected/)
    })

    it('should detect prototype pollution attempts', async () => {
      const pollutionCode = `
        const plugin = {
          name: 'pollution-plugin',
          version: '1.0.0',
          async onInit(context) {
            Object.prototype.polluted = true;
            return 'polluted';
          }
        };
        plugin;
      `

      const secureContext = {
        plugin: { name: 'pollution-plugin', version: '1.0.0' },
        agentContext: secureClone(mockContext)
      }

      await expect(
        vmRunner.executePluginHook('pollution-plugin', 'onInit', pollutionCode, secureContext)
      ).rejects.toThrow(/Security violations detected.*prototype/)
    })
  })

  describe('Runtime Isolation', () => {
    it('should prevent access to global scope', async () => {
      const globalAccessCode = `
        const plugin = {
          name: 'global-access-plugin',
          version: '1.0.0',
          async onInit(context) {
            try {
              global.compromised = true;
              return { success: true };
            } catch (error) {
              return { error: error.message, isolated: true };
            }
          }
        };
        plugin;
      `

      const secureContext = {
        plugin: { name: 'global-access-plugin', version: '1.0.0' },
        agentContext: secureClone(mockContext)
      }

      // This should fail at static analysis stage since 'global' is forbidden
      await expect(
        vmRunner.executePluginHook('global-access-plugin', 'onInit', globalAccessCode, secureContext)
      ).rejects.toThrow(/Security violations detected.*global/)
      
      expect('compromised' in global).toBe(false)
    })

    it('should provide safe console API', async () => {
      const consoleTestCode = `
        const plugin = {
          name: 'console-test-plugin',
          version: '1.0.0',
          async onInit(context) {
            console.log('Safe console usage');
            console.error('Safe error logging');
            return { consoleAvailable: typeof console !== 'undefined' };
          }
        };
        plugin;
      `

      const secureContext = {
        plugin: { name: 'console-test-plugin', version: '1.0.0' },
        agentContext: secureClone(mockContext)
      }

      const result = await vmRunner.executePluginHook(
        'console-test-plugin',
        'onInit',
        consoleTestCode,
        secureContext
      )

      expect(result.result.consoleAvailable).toBe(true)
      expect(result.withinLimits).toBe(true)
    })

    it('should block access to Node.js built-in modules', async () => {
      const builtinAccessCode = `
        const plugin = {
          name: 'builtin-access-plugin',
          version: '1.0.0',
          async onInit(context) {
            const results = {};
            
            // Try to access various built-ins
            try { results.fs = typeof require('fs') } catch (e) { results.fsError = e.message }
            try { results.crypto = typeof require('crypto') } catch (e) { results.cryptoError = e.message }
            try { results.child_process = typeof require('child_process') } catch (e) { results.childProcessError = e.message }
            
            return results;
          }
        };
        plugin;
      `

      const secureContext = {
        plugin: { name: 'builtin-access-plugin', version: '1.0.0' },
        agentContext: secureClone(mockContext)
      }

      // This should fail at static analysis stage
      await expect(
        vmRunner.executePluginHook('builtin-access-plugin', 'onInit', builtinAccessCode, secureContext)
      ).rejects.toThrow()
    })
  })

  describe('Timeout and Memory Limits', () => {
    it('should enforce execution timeout', async () => {
      const timeoutCode = `
        const plugin = {
          name: 'timeout-plugin',
          version: '1.0.0',
          async onInit(context) {
            // Infinite loop to trigger timeout
            while (true) {
              // Busy wait
            }
            return 'should-not-reach';
          }
        };
        plugin;
      `

      const secureContext = {
        plugin: { name: 'timeout-plugin', version: '1.0.0' },
        agentContext: secureClone(mockContext)
      }

      await expect(
        vmRunner.executePluginHook('timeout-plugin', 'onInit', timeoutCode, secureContext)
      ).rejects.toThrow(/timed out/)
    })

    it('should track memory usage', async () => {
      const memoryTestCode = `
        const plugin = {
          name: 'memory-test-plugin',
          version: '1.0.0',
          async onInit(context) {
            // Create some objects to use memory
            const data = [];
            for (let i = 0; i < 1000; i++) {
              data.push({ index: i, data: 'memory test data'.repeat(10) });
            }
            return { created: data.length };
          }
        };
        plugin;
      `

      const secureContext = {
        plugin: { name: 'memory-test-plugin', version: '1.0.0' },
        agentContext: secureClone(mockContext)
      }

      const result = await vmRunner.executePluginHook(
        'memory-test-plugin',
        'onInit',
        memoryTestCode,
        secureContext
      )

      expect(result.memoryUsageBytes).toBeGreaterThan(0)
      expect(result.withinLimits).toBe(true)
    })
  })

  describe('Data Cloning Security', () => {
    it('should deep clone input data', () => {
      const originalData = {
        simple: 'value',
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' }
        },
        date: new Date()
      }

      const cloned = secureClone(originalData)

      // Modify cloned data
      cloned.nested.array.push(4)
      cloned.nested.object.key = 'modified'

      // Original should be unchanged
      expect(originalData.nested.array).toEqual([1, 2, 3])
      expect(originalData.nested.object.key).toBe('value')
    })

    it('should handle circular references safely', () => {
      const circularData: any = { key: 'value' }
      circularData.self = circularData

      expect(() => secureClone(circularData)).toThrow(/Failed to clone object/)
    })

    it('should preserve data types correctly', () => {
      const typedData = {
        string: 'test',
        number: 42,
        boolean: true,
        null: null,
        undefined: undefined,
        array: [1, 2, 3],
        date: new Date('2023-01-01')
      }

      const cloned = secureClone(typedData)

      expect(typeof cloned.string).toBe('string')
      expect(typeof cloned.number).toBe('number')
      expect(typeof cloned.boolean).toBe('boolean')
      expect(cloned.null).toBe(null)
      expect(Array.isArray(cloned.array)).toBe(true)
      // Note: JSON.parse/stringify converts Date to string, which is expected for security
      expect(typeof cloned.date).toBe('string')
      expect(cloned.date).toBe('2023-01-01T00:00:00.000Z')
    })
  })

  describe('Hook-Specific Security', () => {
    it('should securely execute onSend hook', async () => {
      const sendHookCode = `
        const plugin = {
          name: 'send-hook-plugin',
          version: '1.0.0',
          async onSend(payload, context) {
            // Verify payload and context are available
            return {
              hasPayload: typeof payload !== 'undefined',
              hasContext: typeof context !== 'undefined',
              payloadMessage: payload?.input?.message,
              agentId: context?.agentId
            };
          }
        };
        plugin;
      `

      const sendPayload: SendPayload = {
        input: { message: 'test message' },
        metadata: { test: true }
      }

      const secureContext = {
        plugin: { name: 'send-hook-plugin', version: '1.0.0' },
        sendPayload: secureClone(sendPayload),
        agentContext: secureClone(mockContext)
      }

      const result = await vmRunner.executePluginHook(
        'send-hook-plugin',
        'onSend',
        sendHookCode,
        secureContext
      )

      expect(result.result.hasPayload).toBe(true)
      expect(result.result.hasContext).toBe(true)
      expect(result.result.payloadMessage).toBe('test message')
      expect(result.result.agentId).toBe('security-test')
    })

    it('should securely execute onError hook', async () => {
      const errorHookCode = `
        const plugin = {
          name: 'error-hook-plugin',
          version: '1.0.0',
          async onError(error, context) {
            return {
              hasError: typeof error !== 'undefined',
              hasContext: typeof context !== 'undefined',
              errorMessage: error?.message,
              errorName: error?.name
            };
          }
        };
        plugin;
      `

      const testError = new Error('Test error message')
      const secureContext = {
        plugin: { name: 'error-hook-plugin', version: '1.0.0' },
        error: {
          message: testError.message,
          name: testError.name,
          stack: testError.stack
        },
        agentContext: secureClone(mockContext)
      }

      const result = await vmRunner.executePluginHook(
        'error-hook-plugin',
        'onError',
        errorHookCode,
        secureContext
      )

      expect(result.result.hasError).toBe(true)
      expect(result.result.hasContext).toBe(true)
      expect(result.result.errorMessage).toBe('Test error message')
      expect(result.result.errorName).toBe('Error')
    })
  })

  describe('Security Violation Reporting', () => {
    it('should report security violations with details', async () => {
      const violatingCode = `
        const plugin = {
          name: 'violating-plugin',
          version: '1.0.0',
          async onInit(context) {
            // Multiple violations
            eval('malicious code');
            process.exit(1);
            require('fs');
            return 'violated';
          }
        };
        plugin;
      `

      const secureContext = {
        plugin: { name: 'violating-plugin', version: '1.0.0' },
        agentContext: secureClone(mockContext)
      }

      try {
        await vmRunner.executePluginHook(
          'violating-plugin',
          'onInit',
          violatingCode,
          secureContext
        )
        expect.fail('Should have thrown security violation error')
      } catch (error) {
        expect((error as Error).message).toContain('Security violations detected')
        expect((error as Error).message).toContain('eval')
        expect((error as Error).message).toContain('process')
        expect((error as Error).message).toContain('require')
      }
    })
  })

  describe('VM Context Management', () => {
    it('should create isolated contexts per plugin', () => {
      const context1 = vmRunner.createSecureContext('plugin1')
      const context2 = vmRunner.createSecureContext('plugin2')

      expect(context1).not.toBe(context2)
    })

    it('should clean up contexts properly', () => {
      vmRunner.createSecureContext('cleanup-test')
      vmRunner.destroyContext('cleanup-test')
      
      // Should be able to create again
      vmRunner.createSecureContext('cleanup-test')
      vmRunner.destroyContext('cleanup-test')
    })

    it('should track security statistics', () => {
      const stats = vmRunner.getSecurityStats()
      
      expect(typeof stats.activeContexts).toBe('number')
      expect(typeof stats.totalViolations).toBe('number')
      expect(typeof stats.memoryUsage).toBe('number')
    })
  })
})