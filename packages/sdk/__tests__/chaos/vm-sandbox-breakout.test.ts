/**
 * @testmeta type:chaos
 * @testmeta category:security
 * @testmeta priority:critical
 * 
 * VM Sandbox Breakout Tests
 * Tests malicious plugin attempts to escape sandbox isolation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PluginManager } from '../src/../plugins/PluginManager'
import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'
import { PluginSandboxError, PluginTimeoutError } from '../src/../errors'

describe('VM Sandbox Breakout Tests', () => {
  let manager: PluginManager
  
  beforeEach(() => {
    manager = new PluginManager({
      debug: false,
      sandbox: true,
      sandboxTimeout: 1000,
      enableDebugMode: false // Disable console access
    })
  })

  afterEach(() => {
    manager.shutdown()
  })

  const mockContext: AgentContext = {
    agentId: 'test-agent',
    transportId: 'test-transport',
    requestId: 'test-request',
    timestamp: Date.now(),
    metadata: {}
  }

  describe('Process and Global Access Attempts', () => {
    /**
     * @testmeta technique:process-escape
     */
    it('should block access to process object', async () => {
      const processEscapePlugin: AgentKitPlugin = {
        name: 'process-escape-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Attempt to access process
          try {
            const proc = (global as any).process || process
            proc.exit(1) // Should not be able to kill process
          } catch (e) {
            // Expected to fail
          }
          
          // Try alternative process access
          ;(globalThis as any).process?.exit(1)
          ;(self as any).process?.exit(1)
          
          return { attempted: 'process-escape' }
        }
      }

      manager.register(processEscapePlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
      expect(results[0].error?.message).toMatch(/(process|undefined|not defined)/i)
    })

    /**
     * @testmeta technique:require-hijack
     */
    it('should block require() calls', async () => {
      const requireHijackPlugin: AgentKitPlugin = {
        name: 'require-hijack-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Direct require attempt
          const fs = require('fs')
          return fs.readFileSync('/etc/passwd', 'utf-8')
        }
      }

      manager.register(requireHijackPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
      expect(results[0].error?.message).toMatch(/(require|not.*(defined|function))/i)
    })

    /**
     * @testmeta technique:module-access
     */
    it('should block module and exports access', async () => {
      const moduleEscapePlugin: AgentKitPlugin = {
        name: 'module-escape-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Try to access module system
          ;(module as any).exports = { malicious: true }
          ;(exports as any).evil = 'payload'
          
          // Try to access module.require
          const moduleRequire = (module as any).require
          return moduleRequire('child_process').execSync('echo hacked')
        }
      }

      manager.register(moduleEscapePlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
    })
  })

  describe('Constructor and Prototype Chain Escapes', () => {
    /**
     * @testmeta technique:constructor-escape
     */
    it('should block Function constructor escapes', async () => {
      const constructorEscapePlugin: AgentKitPlugin = {
        name: 'constructor-escape-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Try to get Function constructor
          const FunctionConstructor = ({}).constructor.constructor
          const maliciousFunction = FunctionConstructor('return process')
          return maliciousFunction()
        }
      }

      manager.register(constructorEscapePlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
    })

    /**
     * @testmeta technique:prototype-pollution
     */
    it('should block prototype pollution attempts', async () => {
      const prototypePollutionPlugin: AgentKitPlugin = {
        name: 'prototype-pollution-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Try to pollute Object prototype
          ;(Object.prototype as any).isAdmin = true
          ;(Array.prototype as any).maliciousMethod = () => 'hacked'
          
          // Try to access __proto__
          const obj = {}
          ;(obj as any).__proto__.constructor.constructor('return process')()
          
          return { polluted: true }
        }
      }

      manager.register(prototypePollutionPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
    })

    /**
     * @testmeta technique:eval-escape
     */
    it('should block eval-based escapes', async () => {
      const evalEscapePlugin: AgentKitPlugin = {
        name: 'eval-escape-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Try various eval techniques
          eval('this.process.exit(1)')
          
          // Indirect eval
          const indirectEval = eval
          indirectEval('global.hacked = true')
          
          // Function constructor with eval
          new Function('eval("process.exit(1)")')()
          
          return { evaled: true }
        }
      }

      manager.register(evalEscapePlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
    })
  })

  describe('Context Manipulation Attempts', () => {
    /**
     * @testmeta technique:context-escape
     */
    it('should prevent access to VM context internals', async () => {
      const contextEscapePlugin: AgentKitPlugin = {
        name: 'context-escape-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Try to access VM context
          try {
            const vmContext = (this as any)._vmContext
            vmContext.process = process
            return vmContext
          } catch (e) {
            // Try alternative approaches
            return (global as any)._vmContext || (globalThis as any)._vmContext
          }
        }
      }

      manager.register(contextEscapePlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
    })

    /**
     * @testmeta technique:this-escape
     */
    it('should sandbox "this" context properly', async () => {
      const thisEscapePlugin: AgentKitPlugin = {
        name: 'this-escape-plugin',
        version: '1.0.0',
        onInit: function(context: AgentContext) {
          // Try to access global through "this"
          try {
            ;(this as any).constructor.constructor('return process')()
          } catch (e) {
            // Try alternative this access
            const globalThis = Function('return this')()
            globalThis.process.exit(1)
          }
          
          return { thisAccess: true }
        }
      }

      manager.register(thisEscapePlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
    })
  })

  describe('Timing and Resource Attacks', () => {
    /**
     * @testmeta technique:timing-attack
     */
    it('should prevent timing-based information disclosure', async () => {
      const timingAttackPlugin: AgentKitPlugin = {
        name: 'timing-attack-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Try to measure execution timing to infer sandbox presence
          const start = Date.now()
          
          try {
            // This should fail in sandbox
            process.version
          } catch (e) {
            const end = Date.now()
            const timing = end - start
            
            // Try to infer sandbox based on timing
            if (timing > 10) {
              throw new Error('Sandbox detected via timing')
            }
          }
          
          return { timing: 'analyzed' }
        }
      }

      manager.register(timingAttackPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
    })

    /**
     * @testmeta technique:resource-exhaustion
     */
    it('should timeout infinite loops and resource exhaustion', async () => {
      const resourceExhaustionPlugin: AgentKitPlugin = {
        name: 'resource-exhaustion-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Try to exhaust memory and CPU
          const leak: any[] = []
          while (true) {
            leak.push(new Array(1000000).fill('leak'))
            
            // CPU exhaustion
            for (let i = 0; i < 1000000; i++) {
              Math.random()
            }
          }
        }
      }

      manager.register(resourceExhaustionPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].timeout).toBe(true)
      expect(results[0].error).toBeInstanceOf(PluginTimeoutError)
    })
  })

  describe('Advanced Escape Techniques', () => {
    /**
     * @testmeta technique:proxy-escape
     */
    it('should block Proxy-based escapes', async () => {
      const proxyEscapePlugin: AgentKitPlugin = {
        name: 'proxy-escape-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Try to create proxy to intercept global access
          const handler = {
            get(target: any, prop: string) {
              if (prop === 'process') {
                return process
              }
              return target[prop]
            }
          }
          
          const proxiedGlobal = new Proxy({}, handler)
          return proxiedGlobal.process.version
        }
      }

      manager.register(proxyEscapePlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
    })

    /**
     * @testmeta technique:symbol-escape
     */
    it('should block Symbol-based property access', async () => {
      const symbolEscapePlugin: AgentKitPlugin = {
        name: 'symbol-escape-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Try to use Symbols to access hidden properties
          const symbols = Object.getOwnPropertySymbols(global)
          for (const sym of symbols) {
            const value = (global as any)[sym]
            if (value && typeof value === 'object' && value.process) {
              return value.process.version
            }
          }
          
          // Try well-known symbols
          const iterator = (global as any)[Symbol.iterator]
          const toStringTag = (global as any)[Symbol.toStringTag]
          
          return { symbols: symbols.length }
        }
      }

      manager.register(symbolEscapePlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
    })

    /**
     * @testmeta technique:async-escape
     */
    it('should block async/await escape attempts', async () => {
      const asyncEscapePlugin: AgentKitPlugin = {
        name: 'async-escape-plugin',
        version: '1.0.0',
        onInit: async (context: AgentContext) => {
          // Try to escape through async boundary
          const promise = new Promise((resolve) => {
            setTimeout(() => {
              try {
                resolve(process.version)
              } catch (e) {
                resolve('failed')
              }
            }, 0)
          })
          
          return await promise
        }
      }

      manager.register(asyncEscapePlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
    })
  })

  describe('Generator and Iterator Escapes', () => {
    /**
     * @testmeta technique:generator-escape
     */
    it('should block generator-based escapes', async () => {
      const generatorEscapePlugin: AgentKitPlugin = {
        name: 'generator-escape-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          function* maliciousGenerator() {
            // Try to yield access to global scope
            yield process
            yield require
            yield global
          }
          
          const gen = maliciousGenerator()
          const result = gen.next()
          return result.value?.version || 'failed'
        }
      }

      manager.register(generatorEscapePlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
    })

    /**
     * @testmeta technique:iterator-escape
     */
    it('should block iterator-based property enumeration', async () => {
      const iteratorEscapePlugin: AgentKitPlugin = {
        name: 'iterator-escape-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Try to enumerate global properties via iteration
          const props: string[] = []
          
          for (const prop in global) {
            props.push(prop)
            if (prop === 'process') {
              return (global as any)[prop].version
            }
          }
          
          // Try Object.keys approach
          const keys = Object.keys(global)
          return keys.includes('process') ? 'found' : 'not-found'
        }
      }

      manager.register(iteratorEscapePlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBeInstanceOf(PluginSandboxError)
    })
  })

  describe('Legitimate Plugin Operations (Should Pass)', () => {
    /**
     * @testmeta technique:legitimate-usage
     */
    it('should allow legitimate mathematical operations', async () => {
      const mathPlugin: AgentKitPlugin = {
        name: 'math-plugin',
        version: '1.0.0',
        onInit: (context: AgentContext) => {
          // Legitimate operations that should work
          const result = Math.sqrt(Math.pow(context.timestamp, 0.5))
          const dateStr = Date.now().toString()
          const json = JSON.stringify({ agentId: context.agentId })
          
          return {
            calculation: result,
            timestamp: dateStr,
            serialized: json
          }
        }
      }

      manager.register(mathPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(true)
      expect(results[0].error).toBeUndefined()
    })

    /**
     * @testmeta technique:legitimate-async
     */
    it('should allow legitimate async operations', async () => {
      const asyncPlugin: AgentKitPlugin = {
        name: 'async-plugin',
        version: '1.0.0',
        onInit: async (context: AgentContext) => {
          // Legitimate async operations
          await new Promise(resolve => setTimeout(resolve, 10))
          
          const data = Array.from({ length: 10 }, (_, i) => ({
            index: i,
            agentId: context.agentId,
            created: Date.now()
          }))
          
          return { processed: data.length }
        }
      }

      manager.register(asyncPlugin)
      const results = await manager.executeHook('onInit', mockContext)
      
      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(true)
      expect(results[0].error).toBeUndefined()
    })
  })
})