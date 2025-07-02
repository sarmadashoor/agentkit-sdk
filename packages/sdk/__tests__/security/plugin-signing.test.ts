import { describe, it, expect, beforeEach, afterEach, vi, SpyInstance } from 'vitest'
import { PluginManager } from '../../src/plugins/PluginManager'
import { PluginSignature } from '../../src/security/PluginSignature'
import { EnvironmentGuard } from '../../src/security/EnvironmentGuard'
import { PluginValidationError, PluginSignatureError } from '../../src/errors'
import type { AgentKitPlugin, PluginSignatureManifest } from '@agentkit/types'
import { createHash, createSign, createVerify, generateKeyPairSync } from 'crypto'

describe('Plugin Signing Security Tests', () => {
  let originalEnv: NodeJS.ProcessEnv
  let consoleErrorSpy: SpyInstance
  let consoleWarnSpy: SpyInstance
  let testKeyPair: { publicKey: string; privateKey: string }
  let alternateKeyPair: { publicKey: string; privateKey: string }

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env }
    
    // Mock console methods to capture security warnings
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    
    // Reset EnvironmentGuard cache to allow fresh detection
    ;(EnvironmentGuard as any)._isProduction = null
    
    // Generate test key pairs for signing tests
    const mainKeys = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    })
    
    const altKeys = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    })
    
    testKeyPair = {
      publicKey: mainKeys.publicKey,
      privateKey: mainKeys.privateKey
    }
    
    alternateKeyPair = {
      publicKey: altKeys.publicKey,
      privateKey: altKeys.privateKey
    }
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

  // Helper function to create a properly signed plugin
  function createSignedPlugin(
    name: string, 
    version: string = '1.0.0',
    privateKey: string = testKeyPair.privateKey,
    capabilities?: string[]
  ): AgentKitPlugin & { signature: string; signatureManifest?: PluginSignatureManifest } {
    const basePlugin = {
      name,
      version,
      onInit: () => {},
      capabilities
    }
    
    // Create fingerprint exactly like PluginSignature.getPluginFingerprint()
    const normalized = {
      name,
      version,
      capabilities: capabilities || [],
      hooks: {
        onInit: basePlugin.onInit?.toString() || '',
        onSend: '',
        onError: '',
        onShutdown: ''
      }
    }
    
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(normalized, null, 0))
      .digest('hex')
    
    // Create manifest
    const manifest: PluginSignatureManifest = {
      name,
      version,
      allowedHooks: ['onInit'],
      fingerprintHash: fingerprint
    }
    
    // Sign the plugin fingerprint
    const signer = createSign('SHA256')
    signer.update(fingerprint)
    const signature = signer.sign(privateKey, 'base64')
    
    return {
      ...basePlugin,
      signature,
      signatureManifest: manifest
    }
  }

  // Helper function to create an unsigned plugin
  function createUnsignedPlugin(name: string, version: string = '1.0.0'): AgentKitPlugin {
    return {
      name,
      version,
      onInit: () => {}
    }
  }

  describe('Production Environment Plugin Signing Enforcement', () => {
    it('should reject unsigned plugins in production environment', () => {
      process.env.NODE_ENV = 'production'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: false
      })
      
      const unsignedPlugin = createUnsignedPlugin('unsigned-plugin')
      
      expect(() => {
        manager.register(unsignedPlugin)
      }).toThrow(PluginSignatureError)
      
      expect(() => {
        manager.register(unsignedPlugin)
      }).toThrow('Plugin signature verification failed')
    })

    it('should accept properly signed plugins in production', () => {
      process.env.NODE_ENV = 'production'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: false
      })
      
      const signedPlugin = createSignedPlugin('signed-plugin')
      
      expect(() => {
        manager.register(signedPlugin)
      }).not.toThrow()
    })

    it('should reject plugins with invalid signatures in production', () => {
      process.env.NODE_ENV = 'production'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: false
      })
      
      const invalidSignedPlugin = {
        ...createUnsignedPlugin('invalid-signed'),
        signature: 'invalid-signature-data'
      }
      
      expect(() => {
        manager.register(invalidSignedPlugin)
      }).toThrow(PluginSignatureError)
    })

    it('should reject plugins signed with wrong key in production', () => {
      process.env.NODE_ENV = 'production'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: false
      })
      
      // Plugin signed with alternate key
      const wrongKeyPlugin = createSignedPlugin('wrong-key-plugin', '1.0.0', alternateKeyPair.privateKey)
      
      expect(() => {
        manager.register(wrongKeyPlugin)
      }).toThrow(PluginSignatureError)
    })

    it('should enforce plugin signing even when allowUnsignedPlugins is true in production', () => {
      process.env.NODE_ENV = 'production'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: true  // Should be ignored in production
      })
      
      const unsignedPlugin = createUnsignedPlugin('production-unsigned')
      
      expect(() => {
        manager.register(unsignedPlugin)
      }).toThrow(PluginSignatureError)
    })

    it('should respect AGENTKIT_ENV=production for signing enforcement', () => {
      process.env.NODE_ENV = 'development'
      process.env.AGENTKIT_ENV = 'production'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: true  // Should be ignored due to AGENTKIT_ENV
      })
      
      const unsignedPlugin = createUnsignedPlugin('agentkit-env-test')
      
      expect(() => {
        manager.register(unsignedPlugin)
      }).toThrow(PluginSignatureError)
    })
  })

  describe('Development Environment Plugin Signing Configuration', () => {
    it('should allow unsigned plugins in development when explicitly configured', () => {
      process.env.NODE_ENV = 'development'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: true
      })
      
      const unsignedPlugin = createUnsignedPlugin('dev-unsigned')
      
      expect(() => {
        manager.register(unsignedPlugin)
      }).not.toThrow()
    })

    it('should still verify signed plugins in development', () => {
      process.env.NODE_ENV = 'development'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: true
      })
      
      const signedPlugin = createSignedPlugin('dev-signed')
      
      expect(() => {
        manager.register(signedPlugin)
      }).not.toThrow()
    })

    it('should reject invalid signatures in development even with allowUnsignedPlugins', () => {
      process.env.NODE_ENV = 'development'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: true
      })
      
      const invalidSignedPlugin = {
        ...createUnsignedPlugin('dev-invalid'),
        signature: 'invalid-signature'
      }
      
      expect(() => {
        manager.register(invalidSignedPlugin)
      }).toThrow(PluginSignatureError)
    })

    it('should enforce signatures in development when allowUnsignedPlugins is false', () => {
      process.env.NODE_ENV = 'development'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: false
      })
      
      const unsignedPlugin = createUnsignedPlugin('dev-strict')
      
      expect(() => {
        manager.register(unsignedPlugin)
      }).toThrow(PluginSignatureError)
    })
  })

  describe('Test Environment Plugin Signing Configuration', () => {
    it('should allow unsigned plugins in test environment', () => {
      process.env.NODE_ENV = 'test'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: true
      })
      
      const unsignedPlugin = createUnsignedPlugin('test-unsigned')
      
      expect(() => {
        manager.register(unsignedPlugin)
      }).not.toThrow()
    })

    it('should validate signatures when provided in test environment', () => {
      process.env.NODE_ENV = 'test'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: true
      })
      
      const signedPlugin = createSignedPlugin('test-signed')
      
      expect(() => {
        manager.register(signedPlugin)
      }).not.toThrow()
    })
  })

  describe('Multi-Key Plugin Signing Support', () => {
    it('should accept plugins signed with trusted keys', () => {
      process.env.NODE_ENV = 'production'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        trustedPluginKeys: [alternateKeyPair.publicKey],
        allowUnsignedPlugins: false
      })
      
      // Plugin signed with alternate trusted key
      const trustedKeyPlugin = createSignedPlugin('trusted-key-plugin', '1.0.0', alternateKeyPair.privateKey)
      
      expect(() => {
        manager.register(trustedKeyPlugin)
      }).not.toThrow()
    })

    it('should accept plugins signed with primary key', () => {
      process.env.NODE_ENV = 'production'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        trustedPluginKeys: [alternateKeyPair.publicKey],
        allowUnsignedPlugins: false
      })
      
      const primaryKeyPlugin = createSignedPlugin('primary-key-plugin')
      
      expect(() => {
        manager.register(primaryKeyPlugin)
      }).not.toThrow()
    })

    it('should reject plugins signed with unknown keys', () => {
      process.env.NODE_ENV = 'production'
      
      // Generate a completely unknown key
      const unknownKeyPair = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      })
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        trustedPluginKeys: [alternateKeyPair.publicKey],
        allowUnsignedPlugins: false
      })
      
      const unknownKeyPlugin = createSignedPlugin('unknown-key-plugin', '1.0.0', unknownKeyPair.privateKey)
      
      expect(() => {
        manager.register(unknownKeyPlugin)
      }).toThrow(PluginSignatureError)
    })
  })

  describe('Plugin Signature Manifest Validation', () => {
    it('should validate manifest-based signatures', () => {
      process.env.NODE_ENV = 'production'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: false
      })
      
      const manifestPlugin = createSignedPlugin('manifest-plugin', '2.0.0', testKeyPair.privateKey, ['read', 'write'])
      
      expect(() => {
        manager.register(manifestPlugin)
      }).not.toThrow()
    })

    it('should reject plugins with tampered manifests', () => {
      process.env.NODE_ENV = 'production'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: false
      })
      
      const signedPlugin = createSignedPlugin('tampered-manifest')
      
      // Tamper with the manifest after signing
      if (signedPlugin.signatureManifest) {
        signedPlugin.signatureManifest.allowedHooks = ['onInit', 'onSend']  // Add unauthorized hook
      }
      
      expect(() => {
        manager.register(signedPlugin)
      }).toThrow(PluginSignatureError)
    })

    it('should validate fingerprint hash in manifest', () => {
      process.env.NODE_ENV = 'production'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: false
      })
      
      const signedPlugin = createSignedPlugin('fingerprint-test')
      
      // Tamper with the fingerprint
      if (signedPlugin.signatureManifest) {
        signedPlugin.signatureManifest.fingerprintHash = 'invalid-fingerprint-hash'
      }
      
      expect(() => {
        manager.register(signedPlugin)
      }).toThrow(PluginSignatureError)
    })
  })

  describe('Plugin Signature Error Handling', () => {
    it('should provide clear error messages for missing signatures', () => {
      process.env.NODE_ENV = 'production'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: false
      })
      
      const unsignedPlugin = createUnsignedPlugin('error-test')
      
      try {
        manager.register(unsignedPlugin)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(PluginSignatureError)
        expect((error as Error).message).toContain('Plugin signature verification failed')
      }
    })

    it('should provide clear error messages for invalid signatures', () => {
      process.env.NODE_ENV = 'production'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: false
      })
      
      const invalidPlugin = {
        ...createUnsignedPlugin('invalid-sig'),
        signature: 'clearly-invalid-signature'
      }
      
      try {
        manager.register(invalidPlugin)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(PluginSignatureError)
        expect((error as Error).message).toContain('Plugin signature verification failed')
      }
    })

    it('should handle signature verification failures gracefully', () => {
      process.env.NODE_ENV = 'production'
      
      const manager = new PluginManager({
        pluginPublicKey: 'invalid-public-key-format',
        allowUnsignedPlugins: false
      })
      
      const signedPlugin = createSignedPlugin('graceful-fail')
      
      expect(() => {
        manager.register(signedPlugin)
      }).toThrow(PluginSignatureError)
    })
  })

  describe('Environment Override and Fallback Behavior', () => {
    it('should fall back to allowUnsignedPlugins when no public key is provided in development', () => {
      process.env.NODE_ENV = 'development'
      
      const manager = new PluginManager({
        pluginPublicKey: '',  // No public key provided
        allowUnsignedPlugins: true
      })
      
      const unsignedPlugin = createUnsignedPlugin('no-key-fallback')
      
      expect(() => {
        manager.register(unsignedPlugin)
      }).not.toThrow()
    })

    it('should require explicit configuration in production even without public key', () => {
      process.env.NODE_ENV = 'production'
      
      const manager = new PluginManager({
        pluginPublicKey: '',  // No public key provided
        allowUnsignedPlugins: true  // Should be ignored in production
      })
      
      const unsignedPlugin = createUnsignedPlugin('prod-no-key')
      
      expect(() => {
        manager.register(unsignedPlugin)
      }).toThrow(PluginSignatureError)
    })

    it('should handle environment variable overrides for plugin signing', () => {
      process.env.NODE_ENV = 'development'
      process.env.AGENTKIT_PUBLIC_KEY = testKeyPair.publicKey
      
      const manager = new PluginManager({
        allowUnsignedPlugins: false
      })
      
      const signedPlugin = createSignedPlugin('env-override')
      
      expect(() => {
        manager.register(signedPlugin)
      }).not.toThrow()
    })
  })

  describe('Capability-Based Access Control', () => {
    it('should enforce capability restrictions from manifests', () => {
      process.env.NODE_ENV = 'production'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: false
      })
      
      const restrictedPlugin = createSignedPlugin('restricted-plugin', '1.0.0', testKeyPair.privateKey, ['read-only'])
      
      expect(() => {
        manager.register(restrictedPlugin)
      }).not.toThrow()
      
      // Plugin should be registered with restricted capabilities
      const registeredPlugin = manager.getPlugin('restricted-plugin')
      expect(registeredPlugin?.capabilities).toEqual(['read-only'])
    })

    it('should validate allowed hooks against manifest', () => {
      process.env.NODE_ENV = 'production'
      
      const manager = new PluginManager({
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: false
      })
      
      // Create plugin with additional hooks not in manifest
      const hookPlugin = {
        ...createSignedPlugin('hook-validation'),
        onSend: () => {},  // This hook not in allowedHooks
        onError: () => {}
      }
      
      expect(() => {
        manager.register(hookPlugin)
      }).toThrow(PluginSignatureError)
    })
  })

  describe('Security Integration Tests', () => {
    it('should combine sandbox enforcement with plugin signing in production', () => {
      process.env.NODE_ENV = 'production'
      
      const manager = new PluginManager({
        sandbox: true,  // Should be enforced
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: false
      })
      
      const securePlugin = createSignedPlugin('secure-plugin')
      
      expect(() => {
        manager.register(securePlugin)
      }).not.toThrow()
      
      // Should not have logged any security warnings
      expect(consoleErrorSpy).not.toHaveBeenCalled()
      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })

    it('should reject any security bypass attempts in production', () => {
      process.env.NODE_ENV = 'production'
      process.env.AGENTKIT_UNSAFE_SANDBOX = 'true'  // Should be ignored
      process.env.AGENTKIT_ALLOW_UNSAFE = 'true'    // Should be ignored
      
      const manager = new PluginManager({
        sandbox: false,  // Should be overridden
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: true,  // Should be ignored
        disableDirectFallback: false  // Should be enforced anyway
      })
      
      const unsignedPlugin = createUnsignedPlugin('bypass-attempt')
      
      expect(() => {
        manager.register(unsignedPlugin)
      }).toThrow(PluginSignatureError)
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AgentKit Security] Attempted to disable sandbox in production')
      )
    })

    it('should allow flexible configuration in development with proper warnings', () => {
      process.env.NODE_ENV = 'development'
      process.env.AGENTKIT_UNSAFE_SANDBOX = 'true'
      
      const manager = new PluginManager({
        sandbox: false,
        pluginPublicKey: testKeyPair.publicKey,
        allowUnsignedPlugins: true,
        debug: true
      })
      
      const unsignedPlugin = createUnsignedPlugin('dev-flexible')
      
      expect(() => {
        manager.register(unsignedPlugin)
      }).not.toThrow()
      
      // Should not have production security errors
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('production')
      )
    })
  })

  describe('Signature Verification Caching', () => {
    it('should cache signature verification results for valid plugins', () => {
      process.env.NODE_ENV = 'production'
      
      const signature = new PluginSignature({
        publicKey: testKeyPair.publicKey,
        allowUnsigned: false
      })
      
      const signedPlugin = createSignedPlugin('cache-test-valid')
      
      // Spy on the private verifyBasicSignature method
      const verifyBasicSignatureSpy = vi.spyOn(signature as any, 'verifyBasicSignature')
      
      // First verification should call the verification method
      const result1 = signature.verifyPlugin(signedPlugin)
      expect(result1).toBe(true)
      expect(verifyBasicSignatureSpy).toHaveBeenCalledTimes(1)
      
      // Second verification should use cache and not call verification method again
      const result2 = signature.verifyPlugin(signedPlugin)
      expect(result2).toBe(true)
      expect(verifyBasicSignatureSpy).toHaveBeenCalledTimes(1) // Still 1, not 2
      
      // Third verification should also use cache
      const result3 = signature.verifyPlugin(signedPlugin)
      expect(result3).toBe(true)
      expect(verifyBasicSignatureSpy).toHaveBeenCalledTimes(1) // Still 1
      
      verifyBasicSignatureSpy.mockRestore()
    })

    it('should cache signature verification results for invalid plugins', () => {
      process.env.NODE_ENV = 'production'
      
      const signature = new PluginSignature({
        publicKey: testKeyPair.publicKey,
        allowUnsigned: false
      })
      
      const invalidPlugin = {
        ...createUnsignedPlugin('cache-test-invalid'),
        signature: 'invalid-signature-data'
      }
      
      // Spy on the private verifyBasicSignature method
      const verifyBasicSignatureSpy = vi.spyOn(signature as any, 'verifyBasicSignature')
      
      // First verification should call the verification method
      const result1 = signature.verifyPlugin(invalidPlugin)
      expect(result1).toBe(false)
      expect(verifyBasicSignatureSpy).toHaveBeenCalledTimes(1)
      
      // Second verification should use cache and not call verification method again
      const result2 = signature.verifyPlugin(invalidPlugin)
      expect(result2).toBe(false)
      expect(verifyBasicSignatureSpy).toHaveBeenCalledTimes(1) // Still 1, not 2
      
      verifyBasicSignatureSpy.mockRestore()
    })

    it('should cache unsigned plugin results in development mode', () => {
      process.env.NODE_ENV = 'development'
      
      const signature = new PluginSignature({
        publicKey: testKeyPair.publicKey,
        allowUnsigned: true
      })
      
      const unsignedPlugin = createUnsignedPlugin('cache-test-unsigned')
      
      // Spy on the private verifyBasicSignature method to ensure it's not called for unsigned plugins
      const verifyBasicSignatureSpy = vi.spyOn(signature as any, 'verifyBasicSignature')
      
      // First verification should not call signature verification (allowed unsigned)
      const result1 = signature.verifyPlugin(unsignedPlugin)
      expect(result1).toBe(true)
      expect(verifyBasicSignatureSpy).toHaveBeenCalledTimes(0)
      
      // Second verification should use cache
      const result2 = signature.verifyPlugin(unsignedPlugin)
      expect(result2).toBe(true)
      expect(verifyBasicSignatureSpy).toHaveBeenCalledTimes(0)
      
      verifyBasicSignatureSpy.mockRestore()
    })

    it('should maintain separate cache entries for different plugin versions', () => {
      process.env.NODE_ENV = 'production'
      
      const signature = new PluginSignature({
        publicKey: testKeyPair.publicKey,
        allowUnsigned: false
      })
      
      const pluginV1 = createSignedPlugin('version-test', '1.0.0')
      const pluginV2 = createSignedPlugin('version-test', '2.0.0')
      
      const verifyBasicSignatureSpy = vi.spyOn(signature as any, 'verifyBasicSignature')
      
      // Verify v1.0.0
      const result1 = signature.verifyPlugin(pluginV1)
      expect(result1).toBe(true)
      expect(verifyBasicSignatureSpy).toHaveBeenCalledTimes(1)
      
      // Verify v2.0.0 - should call verification method since it's a different version
      const result2 = signature.verifyPlugin(pluginV2)
      expect(result2).toBe(true)
      expect(verifyBasicSignatureSpy).toHaveBeenCalledTimes(2)
      
      // Verify v1.0.0 again - should use cache
      const result3 = signature.verifyPlugin(pluginV1)
      expect(result3).toBe(true)
      expect(verifyBasicSignatureSpy).toHaveBeenCalledTimes(2)
      
      // Verify v2.0.0 again - should use cache
      const result4 = signature.verifyPlugin(pluginV2)
      expect(result4).toBe(true)
      expect(verifyBasicSignatureSpy).toHaveBeenCalledTimes(2)
      
      verifyBasicSignatureSpy.mockRestore()
    })

    it('should maintain separate cache entries for different plugins with same version', () => {
      process.env.NODE_ENV = 'production'
      
      const signature = new PluginSignature({
        publicKey: testKeyPair.publicKey,
        allowUnsigned: false
      })
      
      const pluginA = createSignedPlugin('plugin-a', '1.0.0')
      const pluginB = createSignedPlugin('plugin-b', '1.0.0')
      
      const verifyBasicSignatureSpy = vi.spyOn(signature as any, 'verifyBasicSignature')
      
      // Verify plugin A
      const resultA1 = signature.verifyPlugin(pluginA)
      expect(resultA1).toBe(true)
      expect(verifyBasicSignatureSpy).toHaveBeenCalledTimes(1)
      
      // Verify plugin B - should call verification method since it's a different plugin
      const resultB1 = signature.verifyPlugin(pluginB)
      expect(resultB1).toBe(true)
      expect(verifyBasicSignatureSpy).toHaveBeenCalledTimes(2)
      
      // Verify plugin A again - should use cache
      const resultA2 = signature.verifyPlugin(pluginA)
      expect(resultA2).toBe(true)
      expect(verifyBasicSignatureSpy).toHaveBeenCalledTimes(2)
      
      // Verify plugin B again - should use cache
      const resultB2 = signature.verifyPlugin(pluginB)
      expect(resultB2).toBe(true)
      expect(verifyBasicSignatureSpy).toHaveBeenCalledTimes(2)
      
      verifyBasicSignatureSpy.mockRestore()
    })

    it('should cache manifest verification results separately', () => {
      process.env.NODE_ENV = 'production'
      
      const signature = new PluginSignature({
        publicKey: testKeyPair.publicKey,
        allowUnsigned: false
      })
      
      const pluginWithManifest = createSignedPlugin('manifest-cache-test', '1.0.0')
      
      const verifyManifestSpy = vi.spyOn(signature as any, 'verifyManifest')
      
      // First verification should call manifest verification
      const result1 = signature.verifyPlugin(pluginWithManifest)
      expect(result1).toBe(true)
      expect(verifyManifestSpy).toHaveBeenCalledTimes(1)
      
      // Second verification should use cached results
      const result2 = signature.verifyPlugin(pluginWithManifest)
      expect(result2).toBe(true)
      expect(verifyManifestSpy).toHaveBeenCalledTimes(1) // Still 1, not 2
      
      verifyManifestSpy.mockRestore()
    })

    it('should provide cache statistics', () => {
      process.env.NODE_ENV = 'production'
      
      const signature = new PluginSignature({
        publicKey: testKeyPair.publicKey,
        allowUnsigned: false
      })
      
      // Initially empty cache
      let stats = signature.getCacheStats()
      expect(stats.signatureCache).toBe(0)
      expect(stats.manifestCache).toBe(0)
      
      // Verify one plugin
      const plugin1 = createSignedPlugin('stats-test-1')
      signature.verifyPlugin(plugin1)
      
      stats = signature.getCacheStats()
      expect(stats.signatureCache).toBe(1)
      expect(stats.manifestCache).toBe(1) // Has manifest
      
      // Verify another plugin
      const plugin2 = createSignedPlugin('stats-test-2')
      signature.verifyPlugin(plugin2)
      
      stats = signature.getCacheStats()
      expect(stats.signatureCache).toBe(2)
      expect(stats.manifestCache).toBe(2)
      
      // Verify unsigned plugin in development
      process.env.NODE_ENV = 'development'
      const unsignedPlugin = createUnsignedPlugin('stats-test-unsigned')
      signature.verifyPlugin(unsignedPlugin)
      
      stats = signature.getCacheStats()
      expect(stats.signatureCache).toBe(3) // Unsigned also cached
      expect(stats.manifestCache).toBe(2) // No manifest for unsigned
    })

    it('should clear all caches when clearCache is called', () => {
      process.env.NODE_ENV = 'production'
      
      const signature = new PluginSignature({
        publicKey: testKeyPair.publicKey,
        allowUnsigned: false
      })
      
      // Add entries to cache
      const plugin1 = createSignedPlugin('clear-test-1')
      const plugin2 = createSignedPlugin('clear-test-2')
      
      signature.verifyPlugin(plugin1)
      signature.verifyPlugin(plugin2)
      
      // Verify cache has entries
      let stats = signature.getCacheStats()
      expect(stats.signatureCache).toBe(2)
      expect(stats.manifestCache).toBe(2)
      
      // Clear cache
      signature.clearCache()
      
      // Verify cache is empty
      stats = signature.getCacheStats()
      expect(stats.signatureCache).toBe(0)
      expect(stats.manifestCache).toBe(0)
      
      // Verify that verification still works (will rebuild cache)
      const verifyBasicSignatureSpy = vi.spyOn(signature as any, 'verifyBasicSignature')
      
      const result = signature.verifyPlugin(plugin1)
      expect(result).toBe(true)
      expect(verifyBasicSignatureSpy).toHaveBeenCalledTimes(1) // Called again since cache was cleared
      
      verifyBasicSignatureSpy.mockRestore()
    })

    it('should cache verification failures consistently', () => {
      process.env.NODE_ENV = 'production'
      
      const signature = new PluginSignature({
        publicKey: testKeyPair.publicKey,
        allowUnsigned: false
      })
      
      // Create plugin with tampered manifest
      const tamperedPlugin = createSignedPlugin('tampered-cache-test')
      if (tamperedPlugin.signatureManifest) {
        tamperedPlugin.signatureManifest.fingerprintHash = 'tampered-hash'
      }
      
      const verifyManifestSpy = vi.spyOn(signature as any, 'verifyManifest')
      
      // First verification should fail and cache the failure
      const result1 = signature.verifyPlugin(tamperedPlugin)
      expect(result1).toBe(false)
      expect(verifyManifestSpy).toHaveBeenCalledTimes(1)
      
      // Second verification should use cached failure
      const result2 = signature.verifyPlugin(tamperedPlugin)
      expect(result2).toBe(false)
      expect(verifyManifestSpy).toHaveBeenCalledTimes(1) // Should not be called again
      
      verifyManifestSpy.mockRestore()
    })

    it('should handle cache key generation consistently', () => {
      process.env.NODE_ENV = 'production'
      
      const signature = new PluginSignature({
        publicKey: testKeyPair.publicKey,
        allowUnsigned: false
      })
      
      const plugin = createSignedPlugin('key-generation-test', '1.2.3')
      
      // Verify that the cache key follows the expected format
      const verifyBasicSignatureSpy = vi.spyOn(signature as any, 'verifyBasicSignature')
      
      signature.verifyPlugin(plugin)
      
      // Check cache stats to confirm entry was created
      const stats = signature.getCacheStats()
      expect(stats.signatureCache).toBe(1)
      
      // Verify the same plugin again should use cache
      signature.verifyPlugin(plugin)
      expect(verifyBasicSignatureSpy).toHaveBeenCalledTimes(1) // Should only be called once
      
      verifyBasicSignatureSpy.mockRestore()
    })
  })
})