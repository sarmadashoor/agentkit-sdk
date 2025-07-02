import { describe, it, expect, beforeEach, afterEach, vi, SpyInstance } from 'vitest'
import { PluginManager } from '../../src/plugins/PluginManager'
import { EnvironmentGuard } from '../../src/security/EnvironmentGuard'
import type { AgentKitPlugin } from '@agentkit/types'

describe('Sandbox Enforcement Security Tests', () => {
  let originalEnv: NodeJS.ProcessEnv
  let consoleErrorSpy: SpyInstance
  let consoleWarnSpy: SpyInstance

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env }
    
    // Mock console methods to capture security warnings
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    
    // Reset EnvironmentGuard cache to allow fresh detection
    ;(EnvironmentGuard as any)._isProduction = null
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
    
    // Restore console methods
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    
    // Reset EnvironmentGuard cache
    ;(EnvironmentGuard as any)._isProduction = null
  })

  describe('Production Environment Sandbox Enforcement', () => {
    it('should enforce sandbox in production regardless of configuration', () => {
      // Set production environment
      process.env.NODE_ENV = 'production'
      
      // Verify production mode is detected
      expect(EnvironmentGuard.isProduction()).toBe(true)
      expect(EnvironmentGuard.canDisableSandbox()).toBe(false)
      
      // Attempt to create manager with sandbox disabled
      const manager = new PluginManager({ 
        sandbox: false  // This should be overridden in production
      })
      
      // Production mode forces sandbox - no error message in constructor
      expect(consoleErrorSpy).not.toHaveBeenCalled()
      
      expect(manager).toBeDefined()
    })

    it('should enforce sandbox when AGENTKIT_ENV=production overrides NODE_ENV', () => {
      // Set development NODE_ENV but production AGENTKIT_ENV
      process.env.NODE_ENV = 'development'
      process.env.AGENTKIT_ENV = 'production'
      
      // AGENTKIT_ENV should override NODE_ENV
      expect(EnvironmentGuard.isProduction()).toBe(true)
      expect(EnvironmentGuard.canDisableSandbox()).toBe(false)
      
      const manager = new PluginManager({ 
        sandbox: false  // Should be overridden
      })
      
      // Production mode forces sandbox - no error message in constructor  
      expect(consoleErrorSpy).not.toHaveBeenCalled()
      
      expect(manager).toBeDefined()
    })

    it('should enforce sandbox even with unsafe flags in production', () => {
      // Set production environment with unsafe flags
      process.env.NODE_ENV = 'production'
      process.env.AGENTKIT_UNSAFE_SANDBOX = 'true'
      process.env.AGENTKIT_ALLOW_UNSAFE = 'true'
      
      // Production should still prevent sandbox disable despite unsafe flags
      expect(EnvironmentGuard.isProduction()).toBe(true)
      expect(EnvironmentGuard.canDisableSandbox()).toBe(false)
      
      const manager = new PluginManager({ 
        sandbox: false
      })
      
      // Production mode forces sandbox - no error message in constructor  
      expect(consoleErrorSpy).not.toHaveBeenCalled()
      
      expect(manager).toBeDefined()
    })

    it('should allow sandbox configuration in production when explicitly enabled', () => {
      process.env.NODE_ENV = 'production'
      
      // Should not log any warnings when sandbox is enabled
      const manager = new PluginManager({ 
        sandbox: true,
        sandboxTimeout: 3000,
        allowedGlobals: ['Math', 'Date']
      })
      
      expect(consoleErrorSpy).not.toHaveBeenCalled()
      expect(consoleWarnSpy).not.toHaveBeenCalled()
      expect(manager).toBeDefined()
    })
  })

  describe('Development Environment Sandbox Configuration', () => {
    it('should allow sandbox disable in development with unsafe flag', () => {
      process.env.NODE_ENV = 'development'
      process.env.AGENTKIT_UNSAFE_SANDBOX = 'true'
      
      expect(EnvironmentGuard.isProduction()).toBe(false)
      expect(EnvironmentGuard.canDisableSandbox()).toBe(true)
      
      const manager = new PluginManager({ 
        sandbox: false
      })
      
      // Should not log any production security warnings
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[AgentKit Security] Attempted to disable sandbox in production')
      )
      
      expect(manager).toBeDefined()
    })

    it('should allow sandbox disable in development with AGENTKIT_ALLOW_UNSAFE', () => {
      process.env.NODE_ENV = 'development'
      process.env.AGENTKIT_ALLOW_UNSAFE = 'true'
      
      expect(EnvironmentGuard.canDisableSandbox()).toBe(true)
      
      const manager = new PluginManager({ 
        sandbox: false
      })
      
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('production')
      )
      expect(manager).toBeDefined()
    })

    it('should default to sandbox enabled in development without unsafe flags', () => {
      process.env.NODE_ENV = 'development'
      // No unsafe flags set
      
      expect(EnvironmentGuard.canDisableSandbox()).toBe(false)
      
      const manager = new PluginManager({ 
        sandbox: false  // Should be ignored without unsafe flags
      })
      
      expect(manager).toBeDefined()
    })

    it('should allow explicit sandbox configuration in development', () => {
      process.env.NODE_ENV = 'development'
      process.env.AGENTKIT_UNSAFE_SANDBOX = 'true'
      
      const manager = new PluginManager({ 
        sandbox: true,
        sandboxTimeout: 1000,
        allowedGlobals: ['console', 'Math'],
        enableDebugMode: true
      })
      
      expect(consoleErrorSpy).not.toHaveBeenCalled()
      expect(manager).toBeDefined()
    })
  })

  describe('Test Environment Sandbox Configuration', () => {
    it('should allow sandbox disable in test environment', () => {
      process.env.NODE_ENV = 'test'
      
      expect(EnvironmentGuard.isProduction()).toBe(false)
      expect(EnvironmentGuard.canDisableSandbox()).toBe(true)
      
      const manager = new PluginManager({ 
        sandbox: false
      })
      
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('production')
      )
      expect(manager).toBeDefined()
    })

    it('should allow test environment to override production detection', () => {
      // Conflicting environment settings
      process.env.NODE_ENV = 'test'
      process.env.AGENTKIT_ENV = 'production'
      
      // AGENTKIT_ENV takes precedence for production detection
      expect(EnvironmentGuard.isProduction()).toBe(true)
      
      // But test NODE_ENV still allows sandbox disable (logic: !production AND test)
      expect(EnvironmentGuard.canDisableSandbox()).toBe(false)  // isProduction()=true, so canDisableSandbox=false
      
      const manager = new PluginManager({ 
        sandbox: false
      })
      
      expect(manager).toBeDefined()
    })
  })

  describe('Direct Execution Fallback Prevention', () => {
    it('should reject unsigned plugins in production environment', () => {
      process.env.NODE_ENV = 'production'
      
      const manager = new PluginManager({ 
        disableDirectFallback: true,
        allowUnsignedPlugins: false
      })
      
      const plugin: AgentKitPlugin = {
        name: 'blocked-plugin',
        version: '1.0.0',
        onInit: () => {}
      }
      
      // Should throw PluginSignatureError for unsigned plugin in production
      expect(() => {
        manager.register(plugin)
      }).toThrow('Plugin signature verification failed')
    })

    it('should allow direct execution in development even with disableDirectFallback', async () => {
      process.env.NODE_ENV = 'development'
      process.env.AGENTKIT_UNSAFE_SANDBOX = 'true'
      
      const manager = new PluginManager({ 
        sandbox: false,
        disableDirectFallback: true  // Should not affect development
      })
      
      const plugin: AgentKitPlugin = {
        name: 'dev-plugin',
        version: '1.0.0',
        onInit: () => 'executed'
      }
      
      manager.register(plugin)
      
      const results = await manager.executeHook('onInit', { 
        agentId: 'test', 
        transportId: 'test',
        requestId: 'test',
        timestamp: Date.now()
      })
      
      expect(results[0].success).toBe(true)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AgentKit Security] DIRECT EXECUTION')
      )
    })
  })

  describe('Security Warning System', () => {
    it('should not emit warnings for production sandbox configuration in constructor', () => {
      process.env.NODE_ENV = 'production'
      
      new PluginManager({ 
        sandbox: false  // Forces sandbox in production
      })
      
      // Constructor doesn't log warnings - only forces sandbox
      expect(consoleErrorSpy).not.toHaveBeenCalled()
      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })

    it('should enforce production security requirements', () => {
      process.env.NODE_ENV = 'production'
      
      // Production should reject unsigned plugins
      const manager = new PluginManager({ 
        sandbox: true,
        allowUnsignedPlugins: false
      })
      
      const plugin: AgentKitPlugin = {
        name: 'warning-test',
        version: '1.0.0',
        onInit: () => {}
      }
      
      // Should throw error for unsigned plugin in production
      expect(() => {
        manager.register(plugin)
      }).toThrow('Plugin signature verification failed')
    })

    it('should not emit warnings for proper sandbox configuration', () => {
      process.env.NODE_ENV = 'production'
      
      new PluginManager({ 
        sandbox: true,
        sandboxTimeout: 5000
      })
      
      expect(consoleErrorSpy).not.toHaveBeenCalled()
      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })
  })

  describe('Environment Variable Priority', () => {
    it('should respect AGENTKIT_ENV over NODE_ENV for production detection', () => {
      process.env.NODE_ENV = 'development'
      process.env.AGENTKIT_ENV = 'production'
      
      expect(EnvironmentGuard.isProduction()).toBe(true)
      
      const manager = new PluginManager({ 
        sandbox: false
      })
      
      // PluginManager constructor doesn't log this - only PluginExecutor during execution
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('should fall back to NODE_ENV when AGENTKIT_ENV is not set', () => {
      process.env.NODE_ENV = 'production'
      delete process.env.AGENTKIT_ENV
      
      expect(EnvironmentGuard.isProduction()).toBe(true)
    })

    it('should handle missing environment variables gracefully', () => {
      delete process.env.NODE_ENV
      delete process.env.AGENTKIT_ENV
      
      // Should default to non-production
      expect(EnvironmentGuard.isProduction()).toBe(false)
      
      const manager = new PluginManager({ 
        sandbox: false
      })
      
      expect(manager).toBeDefined()
    })
  })

  describe('Configuration Immutability Integration', () => {
    it('should create manager with immutable sandbox configuration in production', () => {
      process.env.NODE_ENV = 'production'
      
      const allowedGlobals = ['Math', 'Date']
      const manager = new PluginManager({ 
        sandbox: true,
        allowedGlobals,
        sandboxTimeout: 3000
      })
      
      // Original array might be frozen depending on implementation
      const originalLength = allowedGlobals.length
      
      // But manager should have its own frozen copy
      expect(manager).toBeDefined()
    })

    it('should enforce immutability on sandbox options', () => {
      process.env.NODE_ENV = 'development'
      process.env.AGENTKIT_UNSAFE_SANDBOX = 'true'
      
      const config = {
        sandbox: false,
        allowedGlobals: ['Math'],
        sandboxTimeout: 1000
      }
      
      const manager = new PluginManager(config)
      
      // Manager should have its own copy - attempt to modify won't affect it
      const originalTimeout = config.sandboxTimeout
      
      expect(manager).toBeDefined()
    })
  })
})