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
})