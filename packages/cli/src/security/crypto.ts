/**
 * Cryptographic utilities for plugin signing and verification
 * 
 * Implements lightweight plugin signature trust model with:
 * - SHA-256 hashing for plugin content integrity
 * - Ed25519 signatures for authenticity
 * - Key management for development and production
 */

import { createHash, randomBytes } from 'crypto'
import { sign, verify, generateKeyPair } from 'crypto'
import { promisify } from 'util'
import { readFile, writeFile, mkdir, access } from 'fs/promises'
import { join, dirname } from 'path'
import { homedir } from 'os'

const generateKeyPairAsync = promisify(generateKeyPair)

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

export interface KeyPair {
  /** Ed25519 private key in PEM format */
  privateKey: string
  /** Ed25519 public key in PEM format */
  publicKey: string
  /** Key identifier (hash of public key) */
  keyId: string
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
 * Generate a new Ed25519 key pair for signing
 */
export async function generateSigningKeyPair(): Promise<KeyPair> {
  const { publicKey, privateKey } = await generateKeyPairAsync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })

  // Generate key ID from public key hash
  const keyId = hashContent(publicKey).substring(0, 16)

  return {
    privateKey,
    publicKey,
    keyId
  }
}

/**
 * Get the AgentKit keys directory (~/.agentkit/keys)
 */
export function getKeysDirectory(): string {
  return join(homedir(), '.agentkit', 'keys')
}

/**
 * Get path to development key file
 */
export function getDevKeyPath(): string {
  return join(getKeysDirectory(), 'dev.key')
}

/**
 * Check if development key exists
 */
export async function hasDevKey(): Promise<boolean> {
  try {
    await access(getDevKeyPath())
    return true
  } catch {
    return false
  }
}

/**
 * Load development key pair
 */
export async function loadDevKey(): Promise<KeyPair> {
  const keyPath = getDevKeyPath()
  const keyData = await readFile(keyPath, 'utf8')
  return JSON.parse(keyData)
}

/**
 * Save development key pair
 */
export async function saveDevKey(keyPair: KeyPair): Promise<void> {
  const keysDir = getKeysDirectory()
  const keyPath = getDevKeyPath()
  
  // Ensure directory exists
  await mkdir(keysDir, { recursive: true })
  
  // Save with restricted permissions
  await writeFile(keyPath, JSON.stringify(keyPair, null, 2), {
    mode: 0o600 // Read/write for owner only
  })
}

/**
 * Generate or load development key
 */
export async function ensureDevKey(): Promise<KeyPair> {
  if (await hasDevKey()) {
    return loadDevKey()
  }
  
  const keyPair = await generateSigningKeyPair()
  await saveDevKey(keyPair)
  return keyPair
}

/**
 * Sign plugin content with private key
 */
export async function signPlugin(
  filePath: string,
  privateKey: string,
  keyId: string,
  expirationDays: number = 365
): Promise<PluginSignature> {
  const hash = await hashFile(filePath)
  const timestamp = Math.floor(Date.now() / 1000)
  const expires = timestamp + (expirationDays * 24 * 60 * 60)
  
  // Create message to sign: hash + timestamp + expires
  const message = `${hash}:${timestamp}:${expires}`
  const messageBuffer = Buffer.from(message, 'utf8')
  
  // Sign the message
  const signature = sign(null, messageBuffer, privateKey).toString('base64')
  
  return {
    hash,
    timestamp,
    expires,
    keyId,
    signature,
    version: '1.0'
  }
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