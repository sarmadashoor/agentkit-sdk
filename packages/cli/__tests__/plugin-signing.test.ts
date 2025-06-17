/**
 * Plugin Signing Test Suite
 * 
 * Tests the complete plugin signing and verification workflow:
 * - CLI signing commands
 * - Signature file generation 
 * - Key management
 * - Verification against trusted keys
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { 
  generateSigningKeyPair, 
  signPlugin, 
  verifySignature, 
  hashFile,
  ensureDevKey,
  loadTrustedKeys,
  findTrustedKey,
  type PluginSignature,
  type TrustedKey
} from '../src/security/crypto'

describe('Plugin Signing System', () => {
  let tempDir: string
  let pluginFile: string
  let signatureFile: string
  let trustedKeysFile: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agentkit-test-'))
    pluginFile = join(tempDir, 'test-plugin.ts')
    signatureFile = join(tempDir, 'test-plugin.sig')
    trustedKeysFile = join(tempDir, 'trusted-keys.json')

    // Create a test plugin file
    const pluginContent = `
export const plugin = {
  name: 'test-plugin',
  version: '1.0.0',
  description: 'Test plugin for signature verification',
  async onInit(context) {
    console.log('Plugin initialized')
  },
  async onSend(payload, context) {
    return { processed: true }
  }
}
`
    await writeFile(pluginFile, pluginContent, 'utf8')
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('Key Generation', () => {
    it('should generate a valid Ed25519 key pair', async () => {
      const keyPair = await generateSigningKeyPair()
      
      expect(keyPair.privateKey).toContain('-----BEGIN PRIVATE KEY-----')
      expect(keyPair.privateKey).toContain('-----END PRIVATE KEY-----')
      expect(keyPair.publicKey).toContain('-----BEGIN PUBLIC KEY-----')
      expect(keyPair.publicKey).toContain('-----END PUBLIC KEY-----')
      expect(keyPair.keyId).toHaveLength(16)
      expect(keyPair.keyId).toMatch(/^[a-f0-9]{16}$/)
    })

    it('should generate different key pairs each time', async () => {
      const keyPair1 = await generateSigningKeyPair()
      const keyPair2 = await generateSigningKeyPair()
      
      expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey)
      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey)
      expect(keyPair1.keyId).not.toBe(keyPair2.keyId)
    })

    it('should generate reproducible key IDs from public keys', async () => {
      const keyPair = await generateSigningKeyPair()
      
      // Generate key ID multiple times - should be consistent
      const hash1 = require('crypto').createHash('sha256').update(keyPair.publicKey, 'utf8').digest('hex')
      const hash2 = require('crypto').createHash('sha256').update(keyPair.publicKey, 'utf8').digest('hex')
      
      expect(hash1.substring(0, 16)).toBe(hash2.substring(0, 16))
      expect(keyPair.keyId).toBe(hash1.substring(0, 16))
    })
  })

  describe('Plugin Signing', () => {
    it('should create a valid signature for a plugin file', async () => {
      const keyPair = await generateSigningKeyPair()
      const signature = await signPlugin(pluginFile, keyPair.privateKey, keyPair.keyId)
      
      expect(signature.hash).toHaveLength(64) // SHA-256 hex
      expect(signature.keyId).toBe(keyPair.keyId)
      expect(signature.signature).toBeTruthy()
      expect(signature.timestamp).toBeLessThanOrEqual(Date.now() / 1000)
      expect(signature.expires).toBeGreaterThan(signature.timestamp)
      expect(signature.version).toBe('1.0')
    })

    it('should create reproducible hashes for the same file', async () => {
      const hash1 = await hashFile(pluginFile)
      const hash2 = await hashFile(pluginFile)
      
      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64)
      expect(hash1).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should create different signatures each time (due to timestamp)', async () => {
      const keyPair = await generateSigningKeyPair()
      
      const signature1 = await signPlugin(pluginFile, keyPair.privateKey, keyPair.keyId)
      await new Promise(resolve => setTimeout(resolve, 1100)) // Wait 1.1 seconds
      const signature2 = await signPlugin(pluginFile, keyPair.privateKey, keyPair.keyId)
      
      expect(signature1.hash).toBe(signature2.hash) // Same file
      expect(signature1.signature).not.toBe(signature2.signature) // Different timestamp
      expect(signature1.timestamp).toBeLessThan(signature2.timestamp)
    })

    it('should support custom expiration times', async () => {
      const keyPair = await generateSigningKeyPair()
      const expirationDays = 30
      const signature = await signPlugin(pluginFile, keyPair.privateKey, keyPair.keyId, expirationDays)
      
      const expectedExpiry = signature.timestamp + (expirationDays * 24 * 60 * 60)
      expect(signature.expires).toBe(expectedExpiry)
    })
  })

  describe('Signature Verification', () => {
    it('should verify a valid signature', async () => {
      const keyPair = await generateSigningKeyPair()
      const signature = await signPlugin(pluginFile, keyPair.privateKey, keyPair.keyId)
      
      const isValid = await verifySignature(pluginFile, signature, keyPair.publicKey)
      expect(isValid).toBe(true)
    })

    it('should reject a signature for a different file', async () => {
      const keyPair = await generateSigningKeyPair()
      const signature = await signPlugin(pluginFile, keyPair.privateKey, keyPair.keyId)
      
      // Modify the file
      await writeFile(pluginFile, 'modified content', 'utf8')
      
      const isValid = await verifySignature(pluginFile, signature, keyPair.publicKey)
      expect(isValid).toBe(false)
    })

    it('should reject an expired signature', async () => {
      const keyPair = await generateSigningKeyPair()
      let signature = await signPlugin(pluginFile, keyPair.privateKey, keyPair.keyId)
      
      // Manually set expiry to past
      signature = {
        ...signature,
        expires: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
      }
      
      const isValid = await verifySignature(pluginFile, signature, keyPair.publicKey)
      expect(isValid).toBe(false)
    })

    it('should reject a signature with wrong key', async () => {
      const keyPair1 = await generateSigningKeyPair()
      const keyPair2 = await generateSigningKeyPair()
      
      const signature = await signPlugin(pluginFile, keyPair1.privateKey, keyPair1.keyId)
      
      const isValid = await verifySignature(pluginFile, signature, keyPair2.publicKey)
      expect(isValid).toBe(false)
    })

    it('should reject a tampered signature', async () => {
      const keyPair = await generateSigningKeyPair()
      let signature = await signPlugin(pluginFile, keyPair.privateKey, keyPair.keyId)
      
      // Tamper with signature
      signature = {
        ...signature,
        signature: signature.signature.slice(0, -4) + 'ABCD'
      }
      
      const isValid = await verifySignature(pluginFile, signature, keyPair.publicKey)
      expect(isValid).toBe(false)
    })
  })

  describe('Trusted Keys Registry', () => {
    beforeEach(async () => {
      const trustedKeys: TrustedKey[] = [
        {
          name: 'test-dev-key',
          pubkey: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAd75J8yJJ1lEaKcR8wM3QJl9s7FJ8QRrJd5K2Vn5+2Jo=\n-----END PUBLIC KEY-----',
          expires: '2026-01-01',
          type: 'dev',
          description: 'Test development key'
        },
        {
          name: 'test-prod-key',
          pubkey: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAh1K2Vn5+2Jod75J8yJJ1lEaKcR8wM3QJl9s7FJ8QRrJ=\n-----END PUBLIC KEY-----',
          expires: '2025-12-31',
          type: 'prod',
          description: 'Test production key'
        }
      ]
      
      await writeFile(trustedKeysFile, JSON.stringify(trustedKeys, null, 2))
    })

    it('should load trusted keys from file', async () => {
      const keys = await loadTrustedKeys(trustedKeysFile)
      
      expect(keys).toHaveLength(2)
      expect(keys[0].name).toBe('test-dev-key')
      expect(keys[1].name).toBe('test-prod-key')
    })

    it('should return empty array for missing file', async () => {
      const keys = await loadTrustedKeys(join(tempDir, 'nonexistent.json'))
      expect(keys).toEqual([])
    })

    it('should find trusted key by computed ID', async () => {
      const keys = await loadTrustedKeys(trustedKeysFile)
      const keyId = require('crypto')
        .createHash('sha256')
        .update(keys[0].pubkey, 'utf8')
        .digest('hex')
        .substring(0, 16)
      
      const foundKey = await findTrustedKey(keyId, trustedKeysFile)
      expect(foundKey).toBeTruthy()
      expect(foundKey?.name).toBe('test-dev-key')
    })

    it('should return null for unknown key ID', async () => {
      const unknownKeyId = 'unknown123456789'
      const foundKey = await findTrustedKey(unknownKeyId, trustedKeysFile)
      expect(foundKey).toBeNull()
    })

    it('should return null for expired key', async () => {
      // Create key with past expiry
      const expiredKeys: TrustedKey[] = [{
        name: 'expired-key',
        pubkey: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAd75J8yJJ1lEaKcR8wM3QJl9s7FJ8QRrJd5K2Vn5+2Jo=\n-----END PUBLIC KEY-----',
        expires: '2020-01-01', // Past date
        type: 'dev',
        description: 'Expired test key'
      }]
      
      const expiredKeysFile = join(tempDir, 'expired-keys.json')
      await writeFile(expiredKeysFile, JSON.stringify(expiredKeys, null, 2))
      
      const keyId = require('crypto')
        .createHash('sha256')
        .update(expiredKeys[0].pubkey, 'utf8')
        .digest('hex')
        .substring(0, 16)
      
      const foundKey = await findTrustedKey(keyId, expiredKeysFile)
      expect(foundKey).toBeNull()
    })
  })

  describe('End-to-End Workflow', () => {
    it('should complete full signing and verification workflow', async () => {
      // 1. Generate key pair
      const keyPair = await generateSigningKeyPair()
      
      // 2. Sign plugin
      const signature = await signPlugin(pluginFile, keyPair.privateKey, keyPair.keyId)
      
      // 3. Write signature file
      await writeFile(signatureFile, JSON.stringify(signature, null, 2))
      
      // 4. Create trusted keys registry with our key
      const trustedKeys: TrustedKey[] = [{
        name: 'test-signing-key',
        pubkey: keyPair.publicKey,
        expires: '2026-01-01',
        type: 'dev',
        description: 'Test signing workflow key'
      }]
      await writeFile(trustedKeysFile, JSON.stringify(trustedKeys, null, 2))
      
      // 5. Verify signature against trusted registry
      const foundKey = await findTrustedKey(keyPair.keyId, trustedKeysFile)
      expect(foundKey).toBeTruthy()
      
      // 6. Verify signature
      const isValid = await verifySignature(pluginFile, signature, foundKey!.pubkey)
      expect(isValid).toBe(true)
      
      // 7. Read and verify signature file
      const loadedSignature = JSON.parse(await readFile(signatureFile, 'utf8'))
      const isValidFromFile = await verifySignature(pluginFile, loadedSignature, foundKey!.pubkey)
      expect(isValidFromFile).toBe(true)
    })

    it('should detect tampered plugin after signing', async () => {
      // 1. Sign original plugin
      const keyPair = await generateSigningKeyPair()
      const signature = await signPlugin(pluginFile, keyPair.privateKey, keyPair.keyId)
      
      // 2. Tamper with plugin
      const tamperedContent = (await readFile(pluginFile, 'utf8')) + '\n// malicious code\nconsole.log("hacked");'
      await writeFile(pluginFile, tamperedContent, 'utf8')
      
      // 3. Try to verify - should fail
      const isValid = await verifySignature(pluginFile, signature, keyPair.publicKey)
      expect(isValid).toBe(false)
    })
  })

  describe('Error Handling', () => {
    it('should handle missing plugin file gracefully', async () => {
      const keyPair = await generateSigningKeyPair()
      const missingFile = join(tempDir, 'missing.ts')
      
      await expect(signPlugin(missingFile, keyPair.privateKey, keyPair.keyId))
        .rejects.toThrow()
    })

    it('should handle invalid private key gracefully', async () => {
      const invalidKey = 'invalid-private-key'
      const keyPair = await generateSigningKeyPair()
      
      await expect(signPlugin(pluginFile, invalidKey, keyPair.keyId))
        .rejects.toThrow()
    })

    it('should handle malformed signature gracefully', async () => {
      const keyPair = await generateSigningKeyPair()
      const malformedSignature = {
        hash: 'invalid',
        timestamp: Date.now(),
        expires: Date.now() + 3600,
        keyId: 'invalid',
        signature: 'invalid',
        version: '1.0'
      }
      
      const isValid = await verifySignature(pluginFile, malformedSignature, keyPair.publicKey)
      expect(isValid).toBe(false)
    })
  })
})