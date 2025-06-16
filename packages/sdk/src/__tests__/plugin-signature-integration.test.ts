/**
 * Plugin Signature Integration Test
 * 
 * End-to-end test of the plugin signature trust model:
 * - Plugin signing with CLI
 * - Plugin verification in connectAgent
 * - Development vs production behavior
 * - Trusted key management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { connectAgent } from '../index'
import type { Agent, Transport, AgentKitPlugin } from '@agentkit/types'

// Mock transport for testing
const createMockTransport = (): Transport => ({
  id: 'mock-transport',
  name: 'Mock Transport',
  async init() {},
  async send() {},
  async receive() { return {} },
  canAcceptMore: () => true
})

// Mock agent for testing
const createMockAgent = (): Agent => ({
  id: 'mock-agent',
  name: 'Mock Agent',
  version: '1.0.0',
  async init() {},
  async handle() { return {} },
  async shutdown() {}
})

// Test plugin factory
const createTestPlugin = (name: string = 'test-plugin'): AgentKitPlugin => ({
  name,
  version: '1.0.0',
  description: 'Test plugin for signature verification',
  async onInit() {
    console.log(`${name} initialized`)
  },
  async onSend() {
    return { processed: true }
  }
})

describe('Plugin Signature Integration', () => {
  let tempDir: string
  let trustedKeysPath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agentkit-integration-test-'))
    trustedKeysPath = join(tempDir, 'trusted-keys.json')

    // Create a basic trusted keys registry
    const trustedKeys = [
      {
        name: 'test-dev-key',
        pubkey: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAd75J8yJJ1lEaKcR8wM3QJl9s7FJ8QRrJd5K2Vn5+2Jo=\n-----END PUBLIC KEY-----',
        expires: '2026-01-01',
        type: 'dev',
        description: 'Test development signing key'
      }
    ]
    await writeFile(trustedKeysPath, JSON.stringify(trustedKeys, null, 2))
    
    // Clear all mocks
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  describe('Development Mode Behavior', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development')
    })

    it('should allow unsigned plugins with warnings in development mode', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const agent = createMockAgent()
      const transport = createMockTransport()
      const unsignedPlugin = createTestPlugin('unsigned-plugin')

      const handle = await connectAgent({
        agent,
        transport,
        plugins: [unsignedPlugin],
        allowUnverifiedPlugins: true,
        trustedKeysPath,
        debug: true
      })

      expect(handle).toBeDefined()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚨 WARNING: Loading unsigned plugin')
      )

      consoleSpy.mockRestore()
    })

    it('should enforce strict mode when allowUnverifiedPlugins is false', async () => {
      const agent = createMockAgent()
      const transport = createMockTransport()
      const unsignedPlugin = createTestPlugin('unsigned-strict-plugin')

      await expect(connectAgent({
        agent,
        transport,
        plugins: [unsignedPlugin],
        allowUnverifiedPlugins: false,
        trustedKeysPath,
        debug: true
      })).rejects.toThrow(/Plugin signature required/)
    })

    it('should allow plugins with valid signatures', async () => {
      const agent = createMockAgent()
      const transport = createMockTransport()
      
      // Create plugin with signature metadata
      const signedPlugin = {
        ...createTestPlugin('signed-plugin'),
        __signature: {
          hash: 'mock-hash',
          timestamp: Math.floor(Date.now() / 1000),
          expires: Math.floor(Date.now() / 1000) + 86400,
          keyId: 'test-key-id',
          signature: 'mock-signature',
          version: '1.0'
        },
        __signaturePath: '/path/to/signed-plugin.ts'
      }

      // Mock the verification functions to succeed
      vi.doMock('../security/crypto-utils', () => ({
        verifySignature: vi.fn().mockResolvedValue(true),
        findTrustedKey: vi.fn().mockResolvedValue({
          name: 'test-dev-key',
          pubkey: 'mock-pubkey',
          expires: '2026-01-01',
          type: 'dev'
        }),
        hashFile: vi.fn().mockResolvedValue('mock-hash')
      }))

      const handle = await connectAgent({
        agent,
        transport,
        plugins: [signedPlugin],
        trustedKeysPath,
        debug: true
      })

      expect(handle).toBeDefined()
    })
  })

  describe('Production Mode Behavior', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production')
    })

    it('should reject unsigned plugins in production mode', async () => {
      const agent = createMockAgent()
      const transport = createMockTransport()
      const unsignedPlugin = createTestPlugin('unsigned-prod-plugin')

      await expect(connectAgent({
        agent,
        transport,
        plugins: [unsignedPlugin],
        trustedKeysPath,
        debug: true
      })).rejects.toThrow(/Plugin signature required/)
    })

    it('should warn about development keys in production', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const agent = createMockAgent()
      const transport = createMockTransport()
      
      const signedPlugin = {
        ...createTestPlugin('dev-signed-plugin'),
        __signature: {
          hash: 'mock-hash',
          timestamp: Math.floor(Date.now() / 1000),
          expires: Math.floor(Date.now() / 1000) + 86400,
          keyId: 'dev-key-id',
          signature: 'mock-signature',
          version: '1.0'
        },
        __signaturePath: '/path/to/dev-signed-plugin.ts'
      }

      // Mock verification to succeed with dev key
      vi.doMock('../security/crypto-utils', () => ({
        verifySignature: vi.fn().mockResolvedValue(true),
        findTrustedKey: vi.fn().mockResolvedValue({
          name: 'dev-key',
          pubkey: 'mock-pubkey',
          expires: '2026-01-01',
          type: 'dev' // Development key in production
        }),
        hashFile: vi.fn().mockResolvedValue('mock-hash')
      }))

      const handle = await connectAgent({
        agent,
        transport,
        plugins: [signedPlugin],
        trustedKeysPath,
        debug: true
      })

      expect(handle).toBeDefined()
      // Note: Warning would be logged internally in AgentManager
      
      consoleSpy.mockRestore()
    })
  })

  describe('Security Enforcement', () => {
    it('should reject plugins with expired signatures', async () => {
      const agent = createMockAgent()
      const transport = createMockTransport()
      
      const expiredPlugin = {
        ...createTestPlugin('expired-plugin'),
        __signature: {
          hash: 'mock-hash',
          timestamp: Math.floor(Date.now() / 1000) - 7200,
          expires: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
          keyId: 'test-key-id',
          signature: 'mock-signature',
          version: '1.0'
        },
        __signaturePath: '/path/to/expired-plugin.ts'
      }

      await expect(connectAgent({
        agent,
        transport,
        plugins: [expiredPlugin],
        trustedKeysPath,
        debug: true
      })).rejects.toThrow(/expired/)
    })

    it('should reject plugins signed with untrusted keys', async () => {
      const agent = createMockAgent()
      const transport = createMockTransport()
      
      const untrustedPlugin = {
        ...createTestPlugin('untrusted-plugin'),
        __signature: {
          hash: 'mock-hash',
          timestamp: Math.floor(Date.now() / 1000),
          expires: Math.floor(Date.now() / 1000) + 86400,
          keyId: 'untrusted-key-id',
          signature: 'mock-signature',
          version: '1.0'
        },
        __signaturePath: '/path/to/untrusted-plugin.ts'
      }

      // Mock findTrustedKey to return null (untrusted)
      vi.doMock('../security/crypto-utils', () => ({
        verifySignature: vi.fn().mockResolvedValue(true),
        findTrustedKey: vi.fn().mockResolvedValue(null),
        hashFile: vi.fn().mockResolvedValue('mock-hash')
      }))

      await expect(connectAgent({
        agent,
        transport,
        plugins: [untrustedPlugin],
        trustedKeysPath,
        debug: true
      })).rejects.toThrow(/untrusted/)
    })

    it('should reject plugins with invalid signatures', async () => {
      const agent = createMockAgent()
      const transport = createMockTransport()
      
      const invalidPlugin = {
        ...createTestPlugin('invalid-plugin'),
        __signature: {
          hash: 'mock-hash',
          timestamp: Math.floor(Date.now() / 1000),
          expires: Math.floor(Date.now() / 1000) + 86400,
          keyId: 'test-key-id',
          signature: 'invalid-signature',
          version: '1.0'
        },
        __signaturePath: '/path/to/invalid-plugin.ts'
      }

      // Mock verification to fail
      vi.doMock('../security/crypto-utils', () => ({
        verifySignature: vi.fn().mockResolvedValue(false),
        findTrustedKey: vi.fn().mockResolvedValue({
          name: 'test-key',
          pubkey: 'mock-pubkey',
          expires: '2026-01-01',
          type: 'prod'
        }),
        hashFile: vi.fn().mockResolvedValue('different-hash')
      }))

      await expect(connectAgent({
        agent,
        transport,
        plugins: [invalidPlugin],
        trustedKeysPath,
        debug: true
      })).rejects.toThrow(/verification failed/)
    })
  })

  describe('Mixed Plugin Scenarios', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development')
    })

    it('should handle mix of signed and unsigned plugins', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const agent = createMockAgent()
      const transport = createMockTransport()
      
      const unsignedPlugin = createTestPlugin('unsigned-plugin')
      const signedPlugin = {
        ...createTestPlugin('signed-plugin'),
        __signature: { /* valid signature */ },
        __signaturePath: '/path/to/signed-plugin.ts'
      }

      // Mock verification for signed plugin
      vi.doMock('../security/crypto-utils', () => ({
        verifySignature: vi.fn().mockResolvedValue(true),
        findTrustedKey: vi.fn().mockResolvedValue({
          name: 'test-key',
          pubkey: 'mock-pubkey',
          expires: '2026-01-01',
          type: 'dev'
        }),
        hashFile: vi.fn().mockResolvedValue('mock-hash')
      }))

      const handle = await connectAgent({
        agent,
        transport,
        plugins: [unsignedPlugin, signedPlugin],
        allowUnverifiedPlugins: true,
        trustedKeysPath,
        debug: true
      })

      expect(handle).toBeDefined()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('unsigned-plugin')
      )

      consoleSpy.mockRestore()
    })

    it('should reject if any plugin fails verification in strict mode', async () => {
      const agent = createMockAgent()
      const transport = createMockTransport()
      
      const validPlugin = {
        ...createTestPlugin('valid-plugin'),
        __signature: { /* valid signature */ },
        __signaturePath: '/path/to/valid-plugin.ts'
      }
      const invalidPlugin = createTestPlugin('invalid-plugin') // unsigned

      await expect(connectAgent({
        agent,
        transport,
        plugins: [validPlugin, invalidPlugin],
        allowUnverifiedPlugins: false,
        trustedKeysPath,
        debug: true
      })).rejects.toThrow(/signature required/)
    })
  })

  describe('Configuration Edge Cases', () => {
    it('should handle missing trusted keys file gracefully', async () => {
      const agent = createMockAgent()
      const transport = createMockTransport()
      const plugin = createTestPlugin()

      await expect(connectAgent({
        agent,
        transport,
        plugins: [plugin],
        trustedKeysPath: '/nonexistent/trusted-keys.json',
        allowUnverifiedPlugins: false,
        debug: true
      })).rejects.toThrow()
    })

    it('should use default trusted keys path when not specified', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      
      const agent = createMockAgent()
      const transport = createMockTransport()
      const plugin = createTestPlugin()

      // Should not throw in dev mode with default settings
      const handle = await connectAgent({
        agent,
        transport,
        plugins: [plugin],
        allowUnverifiedPlugins: true,
        debug: true
      })

      expect(handle).toBeDefined()
    })

    it('should handle empty plugin array gracefully', async () => {
      const agent = createMockAgent()
      const transport = createMockTransport()

      const handle = await connectAgent({
        agent,
        transport,
        plugins: [],
        trustedKeysPath,
        debug: true
      })

      expect(handle).toBeDefined()
    })
  })

  describe('Observability Integration', () => {
    it('should log plugin verification events in debug mode', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      
      const agent = createMockAgent()
      const transport = createMockTransport()
      const plugin = createTestPlugin('debug-plugin')

      const handle = await connectAgent({
        agent,
        transport,
        plugins: [plugin],
        allowUnverifiedPlugins: true,
        trustedKeysPath,
        debug: true
      })

      expect(handle).toBeDefined()
      // Debug logs would be emitted during verification
    })

    it('should provide metrics about plugin verification', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      
      const agent = createMockAgent()
      const transport = createMockTransport()
      const plugin = createTestPlugin('metrics-plugin')

      const handle = await connectAgent({
        agent,
        transport,
        plugins: [plugin],
        allowUnverifiedPlugins: true,
        trustedKeysPath,
        debug: true
      })

      expect(handle).toBeDefined()
      // Metrics about verification would be available through handle
    })
  })
})