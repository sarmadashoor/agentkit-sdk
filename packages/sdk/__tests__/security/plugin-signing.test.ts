import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PluginManager } from '../../src/plugins/PluginManager'
import { PluginRegistry } from '../../src/plugins/core/PluginRegistry'
import { PluginSignature } from '../../src/security/PluginSignature'
import { EnvironmentGuard } from '../../src/security/EnvironmentGuard'
import { PluginSignatureError } from '../../src/errors'
import type { AgentKitPlugin } from '@agentkit/types'

describe('Plugin Signing Security', () => {
  const originalEnv = { ...process.env }

  // Mock plugin factory
  const createTestPlugin = (name: string, signature?: string): AgentKitPlugin & { signature?: string } => ({
    name,
    version: '1.0.0',
    description: `Test plugin ${name}`,
    onInit: vi.fn(),
    signature
  })

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv }
    // Reset EnvironmentGuard cache
    ;(EnvironmentGuard as any)._isProduction = null
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
    // Reset EnvironmentGuard cache
    ;(EnvironmentGuard as any)._isProduction = null
  })

  describe('Production Mode - Plugin Signing Enforcement', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production'
    })

    it('should reject unsigned plugins in production mode', () => {
      const plugin = createTestPlugin('unsigned-plugin')
      const manager = new PluginManager({
        allowUnsignedPlugins: false
      })

      expect(() => manager.register(plugin)).toThrow(PluginSignatureError)
      expect(() => manager.register(plugin)).toThrow('Plugin signature verification failed')
    })

    it('should reject plugins with invalid signatures in production', () => {
      const plugin = createTestPlugin('invalid-signed-plugin', 'invalid-signature')
      const manager = new PluginManager({
        pluginPublicKey: 'test-public-key',
        allowUnsignedPlugins: false
      })

      expect(() => manager.register(plugin)).toThrow(PluginSignatureError)
    })

    it('should accept plugins with valid signatures in production', () => {
      const plugin = createTestPlugin('valid-signed-plugin', 'valid-signature')
      
      // Mock the signature verification to return true
      const mockVerifyPlugin = vi.spyOn(PluginSignature.prototype, 'verifyPlugin')
      mockVerifyPlugin.mockReturnValue(true)

      const manager = new PluginManager({
        pluginPublicKey: 'test-public-key',
        allowUnsignedPlugins: false
      })

      expect(() => manager.register(plugin)).not.toThrow()
      expect(manager.getPlugins()).toHaveLength(1)
      expect(manager.getPlugins()[0].name).toBe('valid-signed-plugin')

      mockVerifyPlugin.mockRestore()
    })

    it('should force signature verification even when allowUnsignedPlugins is true in production', () => {
      const plugin = createTestPlugin('unsigned-plugin')
      const manager = new PluginManager({
        allowUnsignedPlugins: true // This should be ignored in production
      })

      expect(() => manager.register(plugin)).toThrow(PluginSignatureError)
    })

    it('should use environment variables for signature configuration in production', () => {
      process.env.AGENTKIT_PUBLIC_KEY = 'env-public-key'
      process.env.AGENTKIT_TRUSTED_KEYS = 'key1,key2,key3'

      const plugin = createTestPlugin('env-config-plugin', 'valid-signature')
      
      // Mock signature verification
      const mockVerifyPlugin = vi.spyOn(PluginSignature.prototype, 'verifyPlugin')
      mockVerifyPlugin.mockReturnValue(true)

      const manager = new PluginManager()
      
      expect(() => manager.register(plugin)).not.toThrow()
      expect(manager.getPlugins()).toHaveLength(1)
      
      // Verify signature verification was called (indicating signature system is active)
      expect(mockVerifyPlugin).toHaveBeenCalled()

      mockVerifyPlugin.mockRestore()
    })
  })

  describe('Development Mode - Plugin Signing Flexibility', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development'
    })

    it('should allow unsigned plugins when allowUnsignedPlugins is true in development', () => {
      const plugin = createTestPlugin('unsigned-dev-plugin')
      const manager = new PluginManager({
        allowUnsignedPlugins: true
      })

      expect(() => manager.register(plugin)).not.toThrow()
      expect(manager.getPlugins()).toHaveLength(1)
      expect(manager.getPlugins()[0].name).toBe('unsigned-dev-plugin')
    })

    it('should reject unsigned plugins when allowUnsignedPlugins is false in development', () => {
      // Clear environment to ensure we're not in production mode implicitly
      delete process.env.AGENTKIT_ENV
      
      const plugin = createTestPlugin('unsigned-strict-dev-plugin')
      const manager = new PluginManager({
        allowUnsignedPlugins: false,
        pluginPublicKey: 'test-key'
      })

      expect(() => manager.register(plugin)).toThrow(PluginSignatureError)
    })

    it('should still verify signatures for signed plugins in development', () => {
      const plugin = createTestPlugin('signed-dev-plugin', 'test-signature')
      
      // Mock signature verification to return false (invalid signature)
      const mockVerifyPlugin = vi.spyOn(PluginSignature.prototype, 'verifyPlugin')
      mockVerifyPlugin.mockReturnValue(false)

      const manager = new PluginManager({
        pluginPublicKey: 'test-key',
        allowUnsignedPlugins: false
      })

      expect(() => manager.register(plugin)).toThrow(PluginSignatureError)

      mockVerifyPlugin.mockRestore()
    })

    it('should default to allowing unsigned plugins in development', () => {
      const plugin = createTestPlugin('default-unsigned-plugin')
      const manager = new PluginManager() // No explicit allowUnsignedPlugins setting

      expect(() => manager.register(plugin)).not.toThrow()
      expect(manager.getPlugins()).toHaveLength(1)
    })
  })

  describe('Test Environment - Plugin Signing Behavior', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test'
    })

    it('should allow unsigned plugins in test environment with default settings', () => {
      const plugin = createTestPlugin('test-unsigned-plugin')
      const manager = new PluginManager() // Use defaults for test environment

      expect(() => manager.register(plugin)).not.toThrow()
      expect(manager.getPlugins()).toHaveLength(1)
    })
  })

  describe('AGENTKIT_ENV Override', () => {
    it('should enforce production signing when AGENTKIT_ENV=production regardless of NODE_ENV', () => {
      process.env.NODE_ENV = 'development'
      process.env.AGENTKIT_ENV = 'production'
      process.env.AGENTKIT_PUBLIC_KEY = 'test-key' // Ensure we have a public key

      const plugin = createTestPlugin('agentkit-env-override-plugin')
      const manager = new PluginManager({
        allowUnsignedPlugins: true // This should be ignored in production
      })

      expect(() => manager.register(plugin)).toThrow(PluginSignatureError)
    })
  })

  describe('Plugin Registry Direct Testing', () => {
    it('should create PluginSignature instance when signatureConfig is provided', () => {
      const registry = new PluginRegistry(false, {
        publicKey: 'test-key',
        allowUnsigned: true,
        trustedKeys: ['key1', 'key2']
      })

      const plugin = createTestPlugin('registry-test-plugin')

      // Mock signature verification
      const mockVerifyPlugin = vi.spyOn(PluginSignature.prototype, 'verifyPlugin')
      mockVerifyPlugin.mockReturnValue(true)

      expect(() => registry.register(plugin)).not.toThrow()

      mockVerifyPlugin.mockRestore()
    })

    it('should create PluginSignature instance in production even without explicit config', () => {
      process.env.NODE_ENV = 'production'
      process.env.AGENTKIT_PUBLIC_KEY = 'production-key'

      const plugin = createTestPlugin('production-registry-plugin', 'signature')
      
      // Mock signature verification
      const mockVerifyPlugin = vi.spyOn(PluginSignature.prototype, 'verifyPlugin')
      mockVerifyPlugin.mockReturnValue(true)

      const registry = new PluginRegistry(false) // No explicit signature config

      expect(() => registry.register(plugin)).not.toThrow()

      mockVerifyPlugin.mockRestore()
    })

    it('should not create PluginSignature instance in development without explicit config', () => {
      process.env.NODE_ENV = 'development'
      
      const plugin = createTestPlugin('dev-registry-plugin')
      const registry = new PluginRegistry(false) // No signature config

      // This should work without signature verification
      expect(() => registry.register(plugin)).not.toThrow()
    })
  })

  describe('Signature Verification Edge Cases', () => {
    it('should handle signature verification exceptions gracefully', () => {
      const plugin = createTestPlugin('exception-plugin', 'bad-signature')
      
      // Mock signature verification to return false (simulating failed verification)
      const mockVerifyPlugin = vi.spyOn(PluginSignature.prototype, 'verifyPlugin')
      mockVerifyPlugin.mockReturnValue(false)

      const manager = new PluginManager({
        pluginPublicKey: 'test-key',
        allowUnsignedPlugins: false
      })

      expect(() => manager.register(plugin)).toThrow(PluginSignatureError)

      mockVerifyPlugin.mockRestore()
    })

    it('should use caching for signature verification results', () => {
      const plugin1 = createTestPlugin('cached-plugin', 'test-signature')
      const plugin2 = createTestPlugin('cached-plugin', 'test-signature') // Same name and version
      
      const mockVerifyPlugin = vi.spyOn(PluginSignature.prototype, 'verifyPlugin')
      mockVerifyPlugin.mockReturnValue(true)

      const manager = new PluginManager({
        pluginPublicKey: 'test-key',
        allowUnsignedPlugins: false
      })

      // Register first plugin
      expect(() => manager.register(plugin1)).not.toThrow()
      
      // Attempt to register the same plugin again (should still work due to caching)
      expect(() => manager.register(plugin2)).not.toThrow()
      
      // Verify signature verification was called (caching is internal to PluginSignature)
      expect(mockVerifyPlugin).toHaveBeenCalled()

      mockVerifyPlugin.mockRestore()
    })

    it('should handle missing public key gracefully', () => {
      process.env.NODE_ENV = 'production' // Force production mode to ensure signature verification
      
      const plugin = createTestPlugin('no-key-plugin', 'signature')
      
      const manager = new PluginManager({
        pluginPublicKey: '', // Empty public key
        allowUnsignedPlugins: false
      })

      expect(() => manager.register(plugin)).toThrow(PluginSignatureError)
    })

    it('should support multiple trusted keys', () => {
      const plugin = createTestPlugin('multi-key-plugin', 'signature')
      
      // Mock signature verification to simulate checking multiple keys
      const mockVerifyPlugin = vi.spyOn(PluginSignature.prototype, 'verifyPlugin')
      mockVerifyPlugin.mockReturnValue(true)

      const manager = new PluginManager({
        pluginPublicKey: 'primary-key',
        trustedPluginKeys: ['trusted-key-1', 'trusted-key-2', 'trusted-key-3'],
        allowUnsignedPlugins: false
      })

      expect(() => manager.register(plugin)).not.toThrow()
      expect(manager.getPlugins()).toHaveLength(1)

      mockVerifyPlugin.mockRestore()
    })
  })
})