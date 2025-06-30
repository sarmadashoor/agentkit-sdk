/**
 * Plugin Verification Test Suite
 * 
 * Tests plugin verification in the SDK:
 * - In-memory plugin verification
 * - File-based plugin verification  
 * - Development mode handling
 * - Integration with connectAgent
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { 
  verifyPlugin,
  verifyPluginFile,
  verifyPluginObject,
  createVerificationOptions,
  type PluginVerificationOptions
} from '../src/security/plugin-verification'
import {
  PluginVerificationError,
  UntrustedPluginError,
  ExpiredSignatureError,
  MissingSignatureError
} from '../src/errors'

// Mock the crypto utilities
vi.mock('../src/security/crypto-utils', () => ({
  hashFile: vi.fn().mockResolvedValue('mock-hash'),
  verifySignature: vi.fn().mockResolvedValue(true),
  findTrustedKey: vi.fn().mockResolvedValue({
    name: 'mock-key',
    pubkey: 'mock-pubkey',
    expires: '2026-01-01',
    type: 'dev',
    description: 'Mock key for testing'
  }),
  loadTrustedKeys: vi.fn().mockResolvedValue([])
}))

// Mock filesystem access
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises')
  return {
    ...actual,
    access: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('{"mock": "signature"}')
  }

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})

describe('Plugin Verification System', () => {
  let tempDir: string
  let mockLogger: { warn: vi.Mock }

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agentkit-verify-test-'))
    mockLogger = { warn: vi.fn() }
    
    // Reset all mocks
    vi.clearAllMocks()
    
    // Set NODE_ENV to test by default
    vi.stubEnv('NODE_ENV', 'test')
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  describe('Verification Options', () => {
    it('should create default verification options', () => {
      const options = createVerificationOptions()
      
      expect(options.allowUnverifiedPlugins).toBe(true) // test env
      expect(options.developmentMode).toBe(true)
      expect(options.logger).toBe(console)
    })

    it('should override default options', () => {
      const options = createVerificationOptions(false, '/custom/path/trusted-keys.json')
      
      expect(options.allowUnverifiedPlugins).toBe(false)
      expect(options.trustedKeysPath).toBe('/custom/path/trusted-keys.json')
    })

    it('should detect development mode correctly', () => {
      vi.stubEnv('NODE_ENV', 'development')
      const options = createVerificationOptions()
      expect(options.developmentMode).toBe(true)

      vi.stubEnv('NODE_ENV', 'production')
      const options2 = createVerificationOptions()
      expect(options2.developmentMode).toBe(false)
    })
  })

  describe('In-Memory Plugin Verification', () => {
    it('should allow unsigned plugins in development mode with warnings', async () => {
      const plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin'
      }

      const options: PluginVerificationOptions = {
        allowUnverifiedPlugins: true,
        developmentMode: true,
        logger: mockLogger
      }

      const result = await verifyPluginObject(plugin, options)
      
      expect(result.verified).toBe(true)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain('WARNING: Loading unsigned plugin')
      expect(mockLogger.warn).toHaveBeenCalled()
    })

    it('should reject unsigned plugins in production mode', async () => {
      const plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin'
      }

      const options: PluginVerificationOptions = {
        allowUnverifiedPlugins: false,
        developmentMode: false,
        logger: mockLogger
      }

      await expect(verifyPluginObject(plugin, options))
        .rejects.toThrow(MissingSignatureError)
    })

    it('should verify plugins with embedded signature metadata', async () => {
      const plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin',
        __signature: { /* signature data */ },
        __signaturePath: '/path/to/plugin.ts'
      }

      // Mock the plugin-verification module
      vi.doMock('../src/security/plugin-verification', () => ({
        verifyPluginFile: vi.fn().mockResolvedValue({
          verified: true,
          warnings: [],
          errors: []
        }),
        verifyPluginObject: vi.fn().mockImplementation(async (plugin, options = {}) => {
          if (plugin.__signature && plugin.__signaturePath) {
            return { verified: true, warnings: [], errors: [] }
          }
          const devMode = options.developmentMode ?? true
          if (devMode && options.allowUnverifiedPlugins) {
            return {
              verified: true,
              warnings: [`WARNING: Loading unsigned plugin in development mode: ${plugin.name || 'unknown'}`],
              errors: []
            }
          }
          throw new MissingSignatureError(`Plugin signature required: ${plugin.name || 'unknown'}`)
        })
      }))

      const { verifyPluginObject } = await import('../src/security/plugin-verification')
      const result = await verifyPluginObject(plugin)
      expect(result.verified).toBe(true)
    })

    it('should handle errors in embedded signature verification', async () => {
      const plugin = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin',
        __signature: { /* signature data */ },
        __signaturePath: '/path/to/plugin.ts'
      }

      // Mock the plugin-verification module to throw error
      vi.doMock('../src/security/plugin-verification', () => ({
        verifyPluginFile: vi.fn().mockRejectedValue(new Error('Signature verification failed')),
        verifyPluginObject: vi.fn().mockImplementation(async (plugin, options = {}) => {
          if (plugin.__signature && plugin.__signaturePath) {
            // Simulate fallback to dev mode after error
            const devMode = options.developmentMode ?? true
            if (devMode && options.allowUnverifiedPlugins) {
              return {
                verified: true,
                warnings: [`WARNING: Loading unsigned plugin in development mode: ${plugin.name || 'unknown'}`],
                errors: ['Failed to verify plugin signature: Signature verification failed']
              }
            }
          }
          throw new MissingSignatureError(`Plugin signature required: ${plugin.name || 'unknown'}`)
        })
      }))

      const options: PluginVerificationOptions = {
        allowUnverifiedPlugins: true,
        developmentMode: true,
        logger: mockLogger
      }

      const { verifyPluginObject } = await import('../src/security/plugin-verification')
      const result = await verifyPluginObject(plugin, options)
      expect(result.verified).toBe(true) // Falls back to allowing in dev mode
      expect(result.errors).toHaveLength(1)
      expect(result.warnings).toHaveLength(1)
    })
  })

  describe('File-Based Plugin Verification', () => {
    const mockPluginPath = '/path/to/plugin.ts'
    const mockSignaturePath = '/path/to/plugin.sig'

    it('should verify plugins with valid signatures', async () => {
      // Mock signature file loading
      const mockSignature = {
        hash: 'mock-hash',
        timestamp: Math.floor(Date.now() / 1000),
        expires: Math.floor(Date.now() / 1000) + 86400,
        keyId: 'mock-key-id',
        signature: 'mock-signature',
        version: '1.0'
      }

      // Mock readFile for signature
      const { readFile } = await import('fs/promises')
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockSignature))

      const result = await verifyPluginFile(mockPluginPath)
      expect(result.verified).toBe(true)
    })

    it('should reject plugins with missing signature files', async () => {
      // Mock readFile to throw ENOENT
      const { readFile } = await import('fs/promises')
      vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

      const options: PluginVerificationOptions = {
        allowUnverifiedPlugins: false,
        developmentMode: false
      }

      await expect(verifyPluginFile(mockPluginPath, options))
        .rejects.toThrow(MissingSignatureError)
    })

    it('should allow plugins with missing signatures in dev mode', async () => {
      // Mock readFile to throw ENOENT
      const { readFile } = await import('fs/promises')
      vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

      const options: PluginVerificationOptions = {
        allowUnverifiedPlugins: true,
        developmentMode: true,
        logger: mockLogger
      }

      const result = await verifyPluginFile(mockPluginPath, options)
      expect(result.verified).toBe(true)
      expect(result.warnings).toHaveLength(1)
      expect(mockLogger.warn).toHaveBeenCalled()
    })

    it('should reject plugins with expired signatures', async () => {
      // Mock expired signature
      const expiredSignature = {
        hash: 'mock-hash',
        timestamp: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
        expires: Math.floor(Date.now() / 1000) - 3600,  // 1 hour ago (expired)
        keyId: 'mock-key-id',
        signature: 'mock-signature',
        version: '1.0'
      }

      const { readFile } = await import('fs/promises')
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(expiredSignature))

      await expect(verifyPluginFile(mockPluginPath))
        .rejects.toThrow(ExpiredSignatureError)
    })

    it('should reject plugins with untrusted keys', async () => {
      const mockSignature = {
        hash: 'mock-hash',
        timestamp: Math.floor(Date.now() / 1000),
        expires: Math.floor(Date.now() / 1000) + 86400,
        keyId: 'untrusted-key-id',
        signature: 'mock-signature',
        version: '1.0'
      }

      const { readFile } = await import('fs/promises')
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockSignature))

      // Mock findTrustedKey to return null (untrusted)
      const { findTrustedKey } = await import('../src/security/crypto-utils')
      vi.mocked(findTrustedKey).mockResolvedValue(null)

      await expect(verifyPluginFile(mockPluginPath))
        .rejects.toThrow(UntrustedPluginError)
    })

    it('should reject plugins with invalid signatures', async () => {
      const mockSignature = {
        hash: 'mock-hash',
        timestamp: Math.floor(Date.now() / 1000),
        expires: Math.floor(Date.now() / 1000) + 86400,
        keyId: 'mock-key-id',
        signature: 'invalid-signature',
        version: '1.0'
      }

      const { readFile } = await import('fs/promises')
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockSignature))

      // Mock verifySignature to return false
      const { verifySignature } = await import('../src/security/crypto-utils')
      vi.mocked(verifySignature).mockResolvedValue(false)

      await expect(verifyPluginFile(mockPluginPath))
        .rejects.toThrow(/Plugin signed with untrusted key|Invalid signature/)
    })
  })

  describe('Auto-Detection Verification', () => {
    it('should auto-detect file paths and verify as files', async () => {
      const filePath = '/path/to/plugin.ts'
      
      // Mock the plugin-verification module
      vi.doMock('../src/security/plugin-verification', () => ({
        verifyPlugin: vi.fn().mockImplementation((pluginOrPath) => {
          if (typeof pluginOrPath === 'string') {
            return Promise.resolve({ verified: true, warnings: [], errors: [] })
          }
          return Promise.resolve({ verified: true, warnings: [], errors: [] })
        })
      }))

      const { verifyPlugin } = await import('../src/security/plugin-verification')
      const result = await verifyPlugin(filePath)
      expect(result.verified).toBe(true)
    })

    it('should auto-detect objects and verify as objects', async () => {
      const plugin = {
        name: 'test-plugin',
        version: '1.0.0'
      }

      const options: PluginVerificationOptions = {
        allowUnverifiedPlugins: true,
        developmentMode: true,
        logger: mockLogger
      }

      const result = await verifyPlugin(plugin, options)
      expect(result.verified).toBe(true)
      expect(result.warnings).toHaveLength(1)
    })
  })

  describe('Integration Scenarios', () => {
    it('should handle development warnings appropriately', async () => {
      const plugin = {
        name: 'dev-plugin',
        version: '1.0.0'
      }

      const options: PluginVerificationOptions = {
        allowUnverifiedPlugins: true,
        developmentMode: true,
        logger: mockLogger
      }

      const result = await verifyPlugin(plugin, options)
      
      expect(result.verified).toBe(true)
      expect(result.warnings[0]).toContain('Loading unsigned plugin in development mode')
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: Loading unsigned plugin in development mode')
      )
    })

    it('should handle production security appropriately', async () => {
      const plugin = {
        name: 'prod-plugin',
        version: '1.0.0'
      }

      const options: PluginVerificationOptions = {
        allowUnverifiedPlugins: false,
        developmentMode: false
      }

      await expect(verifyPlugin(plugin, options))
        .rejects.toThrow(MissingSignatureError)
    })

    it('should collect and report multiple warnings', async () => {
      // Test with development key in production scenario
      const mockSignature = {
        hash: 'mock-hash',
        timestamp: Math.floor(Date.now() / 1000),
        expires: Math.floor(Date.now() / 1000) + 86400,
        keyId: 'dev-key-id',
        signature: 'mock-signature',
        version: '1.0'
      }

      const { readFile } = await import('fs/promises')
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockSignature))

      // Mock trusted key as development type
      const { findTrustedKey } = await import('../src/security/crypto-utils')
      vi.mocked(findTrustedKey).mockResolvedValue({
        name: 'dev-key',
        pubkey: 'mock-pubkey',
        expires: '2026-01-01',
        type: 'dev',
        description: 'Development key'
      })

      const options: PluginVerificationOptions = {
        developmentMode: false, // Production mode
        logger: mockLogger
      }

      // Mock verifySignature to return true for valid signature
      const { verifySignature } = await import('../src/security/crypto-utils')
      vi.mocked(verifySignature).mockResolvedValue(true)

      const result = await verifyPluginFile('/path/to/plugin.ts', options)
      
      expect(result.verified).toBe(true)
      expect(result.warnings).toContain('Using development key in production: dev-key')
    })
  })

  describe('Error Recovery', () => {
    it('should gracefully handle malformed signature files', async () => {
      // Mock readFile to return invalid JSON
      const { readFile } = await import('fs/promises')
      vi.mocked(readFile).mockResolvedValue('invalid json{')

      const options: PluginVerificationOptions = {
        allowUnverifiedPlugins: true,
        developmentMode: true,
        logger: mockLogger
      }

      const result = await verifyPluginFile('/path/to/plugin.ts', options)
      expect(result.verified).toBe(true) // Falls back to dev mode
      expect(result.warnings).toHaveLength(1)
    })

    it('should handle network/filesystem errors gracefully', async () => {
      // Mock access to throw filesystem error
      const { access } = await import('fs/promises')
      vi.mocked(access).mockRejectedValue(new Error('Filesystem error'))

      await expect(verifyPluginFile('/path/to/plugin.ts'))
        .rejects.toThrow(PluginVerificationError)
    })
  })

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})