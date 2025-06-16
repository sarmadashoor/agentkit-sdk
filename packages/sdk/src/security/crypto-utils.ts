/**
 * Lightweight crypto utilities for plugin verification
 * 
 * This is a minimal implementation focused on verification only.
 * The full crypto functionality is in the CLI package.
 */

import { createHash } from 'crypto'
import { verify } from 'crypto'
import { readFile } from 'fs/promises'

export interface PluginSignature {
  /** SHA-256 hash of the plugin file content */
  hash: string
  /** Unix timestamp when signature was created */
  timestamp: number
  /** Unix timestamp when signature expires */
  expires: number
  /** Reference to the public key used for signing */
  keyId: string
  /** Ed25519 signature of hash + timestamp + expires */
  signature: string
  /** Version of signature format */
  version: string
}

export interface TrustedKey {
  /** Human-readable name for the key */
  name: string
  /** Ed25519 public key in base64 format */
  pubkey: string
  /** ISO date string when key expires */
  expires: string
  /** Key type (dev, prod, ci) */
  type: 'dev' | 'prod' | 'ci'
  /** Optional description */
  description?: string
}

/**
 * Generate SHA-256 hash of file content
 */
export async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Generate SHA-256 hash of string content
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * Verify plugin signature
 */
export async function verifySignature(
  filePath: string,
  signature: PluginSignature,
  publicKey: string
): Promise<boolean> {
  try {
    // Check if signature has expired
    const now = Math.floor(Date.now() / 1000)
    if (signature.expires < now) {
      return false
    }

    // Verify file hash matches
    const currentHash = await hashFile(filePath)
    if (currentHash !== signature.hash) {
      return false
    }

    // Recreate signed message
    const message = `${signature.hash}:${signature.timestamp}:${signature.expires}`
    const messageBuffer = Buffer.from(message, 'utf8')
    const signatureBuffer = Buffer.from(signature.signature, 'base64')

    // Verify signature
    return verify(null, messageBuffer, publicKey, signatureBuffer)
  } catch {
    return false
  }
}

/**
 * Load trusted keys registry
 */
export async function loadTrustedKeys(registryPath: string): Promise<TrustedKey[]> {
  try {
    const content = await readFile(registryPath, 'utf8')
    return JSON.parse(content)
  } catch {
    return []
  }
}

/**
 * Find trusted key by ID
 */
export async function findTrustedKey(
  keyId: string,
  registryPath: string
): Promise<TrustedKey | null> {
  const trustedKeys = await loadTrustedKeys(registryPath)
  
  for (const key of trustedKeys) {
    const computedKeyId = hashContent(key.pubkey).substring(0, 16)
    if (computedKeyId === keyId) {
      // Check if key has expired
      const now = new Date()
      const expiry = new Date(key.expires)
      if (expiry > now) {
        return key
      }
    }
  }
  
  return null
}

/**
 * Extract key ID from public key
 */
export function getKeyId(publicKey: string): string {
  return hashContent(publicKey).substring(0, 16)
}