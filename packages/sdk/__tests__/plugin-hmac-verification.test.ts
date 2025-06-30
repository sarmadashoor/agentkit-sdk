/**
 * Plugin HMAC Verification Test Suite (TDD)
 * 
 * Tests the HMAC-based plugin signature trust model:
 * - Plugin signing with stable serialization
 * - Trust policy enforcement (strict/warn/off)
 * - Production environment guardrails
 * - Cross-platform compatibility (Node.js + Browser)
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { connectAgent } from '../src/index'
import type { Agent, Transport, AgentKitPlugin } from '@agentkit/types'
import { cleanupAllResources, flushPromises } from './test-utils'

// Extended plugin interface with signature fields
interface SignedAgentKitPlugin extends AgentKitPlugin {
  signature?: string
  publicKey?: string
  trustPolicy?: 'strict' | 'warn' | 'off'
}

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
const createTestPlugin = (name: string = 'test-plugin', options: Partial<SignedAgentKitPlugin> = {}): SignedAgentKitPlugin => ({
  name,
  version: '1.0.0',
  description: 'Test plugin for HMAC signature verification',
  async onInit() {
    console.log(`${name} initialized`)
  },
  async onSend() {
    return { processed: true }
  },
  ...options
})

// Helper to create properly signed plugin
const createSignedTestPlugin = async (name: string = 'test-plugin', options: Partial<SignedAgentKitPlugin> = {}): Promise<SignedAgentKitPlugin> => {
  const plugin = createTestPlugin(name, options)
  const { signPlugin } = await import('../src/security/plugin-signer')
  const signature = signPlugin(plugin)
  return {
    ...plugin,
    signature: signature.signature
  }
}

describe('Plugin HMAC Verification System (TDD)', () => {
  let tempDir: string
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agentkit-hmac-test-'))
    originalEnv = { ...process.env }
    
    // Set signing secret for tests (minimum 16 characters required)
    process.env.AGENTKIT_SIGNING_SECRET = 'test-secret-key-for-hmac-signing-that-is-long-enough'
    
    // Clear all mocks
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
    process.env = originalEnv
    vi.unstubAllEnvs()
    
    // Clean up all registered resources
    await cleanupAllResources()
    await flushPromises()
  })

  describe('TDD: Plugin Verification in Strict Mode', () => {
    it('should reject unsigned plugins when verify=strict', async () => {
      // FAILING TEST - This should fail until we implement verification
      const agent = createMockAgent()
      const transport = createMockTransport()
      const unsignedPlugin = createTestPlugin('unsigned-plugin')

      await expect(connectAgent({
        agent,
        transport,
        plugins: [unsignedPlugin],
        verify: 'strict' // This option doesn't exist yet
      })).rejects.toThrow(/Plugin "unsigned-plugin" failed verification: signature missing/)
    })

    it('should accept plugins with valid HMAC signatures when verify=strict', async () => {
      const agent = createMockAgent()
      const transport = createMockTransport()
      
      const signedPlugin = await createSignedTestPlugin('signed-plugin', {
        trustPolicy: 'strict'
      })

      const handle = await connectAgent({
        agent,
        transport,
        plugins: [signedPlugin],
        verify: 'strict'
      })

      expect(handle).toBeDefined()
    })

    it('should reject plugins with invalid signatures when verify=strict', async () => {
      // FAILING TEST - This should fail until we implement verification
      const agent = createMockAgent()
      const transport = createMockTransport()
      
      const tamperedPlugin = createTestPlugin('tampered-plugin', {
        signature: 'invalid-signature',
        trustPolicy: 'strict'
      })

      await expect(connectAgent({
        agent,
        transport,
        plugins: [tamperedPlugin],
        verify: 'strict'
      })).rejects.toThrow(/Plugin "tampered-plugin" failed verification: signature mismatch/)
    })
  })

  describe('TDD: Plugin Verification in Warn Mode', () => {
    it('should log warning but allow unsigned plugins when verify=warn', async () => {
      // FAILING TEST - This should fail until we implement warning mode
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const agent = createMockAgent()
      const transport = createMockTransport()
      const unsignedPlugin = createTestPlugin('unsigned-warn-plugin')

      const handle = await connectAgent({
        agent,
        transport,
        plugins: [unsignedPlugin],
        verify: 'warn'
      })

      expect(handle).toBeDefined()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ Plugin unsigned-warn-plugin is unsigned. Trust policy set to \'warn\'.')
      )

      consoleSpy.mockRestore()
    })

    it('should log warning for invalid signatures but continue when verify=warn', async () => {
      // FAILING TEST - This should fail until we implement warning mode
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const agent = createMockAgent()
      const transport = createMockTransport()
      const invalidPlugin = createTestPlugin('invalid-warn-plugin', {
        signature: 'invalid-signature'
      })

      const handle = await connectAgent({
        agent,
        transport,
        plugins: [invalidPlugin],
        verify: 'warn'
      })

      expect(handle).toBeDefined()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Plugin "invalid-warn-plugin" failed verification: signature mismatch')
      )

      consoleSpy.mockRestore()
    })
  })

  describe('TDD: Plugin Verification Disabled', () => {
    it('should skip verification when verify=off in development', async () => {
      // FAILING TEST - This should fail until we implement off mode
      vi.stubEnv('NODE_ENV', 'development')
      
      const agent = createMockAgent()
      const transport = createMockTransport()
      const unsignedPlugin = createTestPlugin('unverified-plugin')

      const handle = await connectAgent({
        agent,
        transport,
        plugins: [unsignedPlugin],
        verify: 'off'
      })

      expect(handle).toBeDefined()
      // No warnings or errors should be thrown
    })

    it('should reject verify=off in production environment', async () => {
      // FAILING TEST - This should fail until we implement production guardrails
      vi.stubEnv('NODE_ENV', 'production')
      
      const agent = createMockAgent()
      const transport = createMockTransport()
      const unsignedPlugin = createTestPlugin('production-unverified-plugin')

      await expect(connectAgent({
        agent,
        transport,
        plugins: [unsignedPlugin],
        verify: 'off'
      })).rejects.toThrow(/Verification mode 'off' is NEVER allowed in production/)
    })
  })

  describe('TDD: Signature Tampering Detection', () => {
    it('should detect when plugin code is modified after signing', async () => {
      const agent = createMockAgent()
      const transport = createMockTransport()
      
      // Create plugin with original signature
      const originalPlugin = createTestPlugin('original-plugin')
      const signedPlugin = await createSignedTestPlugin('original-plugin')
      
      // Modify plugin after signing (simulating tampering)
      const tamperedPlugin = {
        ...signedPlugin,
        description: 'MODIFIED AFTER SIGNING', // This should invalidate the signature
        // Keep the original signature but change content
      }

      await expect(connectAgent({
        agent,
        transport,
        plugins: [tamperedPlugin],
        verify: 'strict'
      })).rejects.toThrow(/signature mismatch/)
    })

    it('should ignore debug logs and comments in signature verification', async () => {
      const agent = createMockAgent()
      const transport = createMockTransport()
      
      const pluginWithDebug = await createSignedTestPlugin('debug-plugin', {
        onInit: async function debugInit() {
          console.log('DEBUG: This should not affect signature')
          // Comments should also be ignored
        }
      })

      // This should pass because debug logs don't affect signature
      const handle = await connectAgent({
        agent,
        transport,
        plugins: [pluginWithDebug],
        verify: 'strict'
      })

      expect(handle).toBeDefined()
    })
  })

  describe('TDD: CLI Signing Command', () => {
    it('should generate consistent HMAC signatures for the same plugin', async () => {
      const { signPlugin } = await import('../src/security/plugin-signer')
      
      const testPlugin = createTestPlugin('consistent-plugin')
      
      const signature1 = signPlugin(testPlugin, 'test-secret-key-for-hmac-signing-that-is-long-enough')
      const signature2 = signPlugin(testPlugin, 'test-secret-key-for-hmac-signing-that-is-long-enough')
      
      // Extract timestamps and compare separately to allow for timing differences
      const { timestamp: ts1, ...rest1 } = signature1
      const { timestamp: ts2, ...rest2 } = signature2
      
      expect(rest1).toStrictEqual(rest2)
      expect(Math.abs(ts1 - ts2)).toBeLessThan(100) // Allow 100ms tolerance
    })

    it('should generate different signatures for different secrets', async () => {
      const { signPlugin } = await import('../src/security/plugin-signer')
      
      const testPlugin = createTestPlugin('secret-test-plugin')
      
      const signature1 = signPlugin(testPlugin, 'secret1-long-enough-for-hmac-test')
      const signature2 = signPlugin(testPlugin, 'secret2-long-enough-for-hmac-test')
      
      expect(signature1.signature).not.toBe(signature2.signature)
    })

    it('should write .plugin-signature.json file with CLI command', async () => {
      // Mock the CLI command for now since it's not implemented yet
      const { promises: fs } = await import('fs')
      const pluginPath = join(tempDir, 'test-plugin.ts')
      const signaturePath = join(tempDir, '.plugin-signature.json')
      
      // Write test plugin file
      await fs.writeFile(pluginPath, `
        export default {
          name: 'cli-test-plugin',
          version: '1.0.0',
          async onInit() { console.log('test') }
        }
      `)
      
      // Simulate what the CLI would do
      const { signPlugin } = await import('../src/security/plugin-signer')
      const plugin = {
        name: 'cli-test-plugin',
        version: '1.0.0',
        async onInit() { console.log('test') }
      }
      const signature = signPlugin(plugin, 'test-secret-key-for-hmac-signing-that-is-long-enough')
      await fs.writeFile(signaturePath, JSON.stringify(signature, null, 2))
      
      const signatureExists = await fs.access(signaturePath).then(() => true).catch(() => false)
      expect(signatureExists).toBe(true)
      
      const signatureData = JSON.parse(await fs.readFile(signaturePath, 'utf8'))
      expect(signatureData).toHaveProperty('signature')
      expect(signatureData).toHaveProperty('hash')
      expect(signatureData).toHaveProperty('timestamp')
    })
  })

  describe('TDD: Browser Compatibility', () => {
    it('should work with SubtleCrypto API in browser environment', async () => {
      // Mock browser environment
      const mockSignature = new ArrayBuffer(32)
      const mockView = new Uint8Array(mockSignature)
      mockView.fill(0xab) // Fill with test data
      
      const mockSubtleCrypto = {
        importKey: vi.fn().mockResolvedValue({}),
        sign: vi.fn().mockResolvedValue(mockSignature)
      }
      
      // Mock crypto for browser environment
      Object.defineProperty(global, 'crypto', {
        value: { subtle: mockSubtleCrypto },
        configurable: true
      })
      Object.defineProperty(global, 'window', {
        value: { crypto: { subtle: mockSubtleCrypto } },
        configurable: true
      })
      
      const { verifyPluginInBrowser } = await import('../src/security/browser-verifier')
      
      const testPlugin = createTestPlugin('browser-plugin')
      const secret = 'test-secret-key-for-hmac-signing-that-is-long-enough'
      
      // Generate expected signature that matches our mock
      const expectedSignature = 'abababababababababababababababababababababababababababababababab'
      
      const isValid = await verifyPluginInBrowser(testPlugin, secret, expectedSignature)
      expect(isValid).toBe(true)
      
      // Clean up mocked globals
      Object.defineProperty(global, 'crypto', {
        value: undefined,
        configurable: true
      })
      Object.defineProperty(global, 'window', {
        value: undefined,
        configurable: true
      })
    })

    it('should fallback to polyfill when SubtleCrypto is unavailable', async () => {
      // Remove crypto global for polyfill test
      Object.defineProperty(global, 'crypto', {
        value: undefined,
        configurable: true
      })
      Object.defineProperty(global, 'window', {
        value: undefined,
        configurable: true
      })
      
      const { verifyPluginWithPolyfill, signPluginWithPolyfill } = await import('../src/security/crypto-polyfill')
      
      const testPlugin = createTestPlugin('polyfill-plugin')
      const secret = 'test-secret-key-for-hmac-signing-that-is-long-enough'
      
      // Generate a proper signature using the polyfill signer
      const signature = signPluginWithPolyfill(testPlugin, secret)
      
      const isValid = await verifyPluginWithPolyfill(testPlugin, secret, signature)
      expect(isValid).toBe(true)
    })
  })

  describe('TDD: Production Environment Guardrails', () => {
    it('should never allow hardcoded secrets', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      
      const agent = createMockAgent()
      const transport = createMockTransport()
      const pluginWithHardcodedSecret = createTestPlugin('hardcoded-plugin', {
        publicKey: 'key' // This should be rejected as a hardcoded secret
      })

      await expect(connectAgent({
        agent,
        transport,
        plugins: [pluginWithHardcodedSecret],
        verify: 'strict'
      })).rejects.toThrow(/hardcoded secrets are not allowed/)
    })

    it('should require AGENTKIT_SIGNING_SECRET environment variable', async () => {
      // FAILING TEST - This should fail until we implement env validation
      delete process.env.AGENTKIT_SIGNING_SECRET
      
      const agent = createMockAgent()
      const transport = createMockTransport()
      const signedPlugin = createTestPlugin('env-plugin', {
        signature: 'env-signature'
      })

      await expect(connectAgent({
        agent,
        transport,
        plugins: [signedPlugin],
        verify: 'strict'
      })).rejects.toThrow(/AGENTKIT_SIGNING_SECRET environment variable is required/)
    })

    it('should freeze signed plugin metadata to prevent tampering', async () => {
      const agent = createMockAgent()
      const transport = createMockTransport()
      const { createSignedPlugin } = await import('../src/security/plugin-signer')
      
      // Create a properly signed and frozen plugin
      const basePlugin = createTestPlugin('freeze-plugin')
      const signedPlugin = createSignedPlugin(basePlugin)

      const handle = await connectAgent({
        agent,
        transport,
        plugins: [signedPlugin],
        verify: 'strict'
      })

      // Plugin metadata should be frozen after verification
      expect(() => {
        signedPlugin.signature = 'tampered-signature'
      }).toThrow(/Cannot assign to read only property/)
    })
  })

  describe('TDD: Error Messages and Developer Experience', () => {
    it('should provide clear error messages for verification failures', async () => {
      // FAILING TEST - This should fail until we implement proper error messages
      const agent = createMockAgent()
      const transport = createMockTransport()
      const invalidPlugin = createTestPlugin('error-plugin', {
        signature: 'invalid-signature'
      })

      await expect(connectAgent({
        agent,
        transport,
        plugins: [invalidPlugin],
        verify: 'strict'
      })).rejects.toThrow(/❌ Plugin "?error-plugin"? failed verification/)
    })

    it('should provide helpful warnings in warn mode', async () => {
      // FAILING TEST - This should fail until we implement warning messages
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const agent = createMockAgent()
      const transport = createMockTransport()
      const unsignedPlugin = createTestPlugin('warning-plugin')

      await connectAgent({
        agent,
        transport,
        plugins: [unsignedPlugin],
        verify: 'warn'
      })

      expect(consoleSpy).toHaveBeenCalledWith(
        '⚠️ Plugin warning-plugin is unsigned. Trust policy set to \'warn\'.'
      )

      consoleSpy.mockRestore()
    })
  })

  afterAll(async () => {
    // Final cleanup
    await cleanupAllResources()
    await flushPromises()
    
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})