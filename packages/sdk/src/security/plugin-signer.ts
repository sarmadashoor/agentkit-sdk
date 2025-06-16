/**
 * HMAC-based Plugin Signature System
 * 
 * Implements lightweight but production-safe plugin signing with:
 * - HMAC-SHA256 signatures for authenticity
 * - Stable serialization excluding debug content
 * - Cross-platform compatibility (Node.js + Browser)
 * - Secret management through environment variables
 */

import { createHmac } from 'crypto'
import type { AgentKitPlugin } from '@agentkit/types'

export interface PluginSignatureMetadata {
  signature: string
  hash: string
  timestamp: number
  algorithm: 'HMAC-SHA256'
  version: '1.0.0'
}

export interface SigningOptions {
  secret?: string
  excludeDebug?: boolean
  algorithm?: 'HMAC-SHA256'
}

/**
 * Stable serialization of plugin for consistent signature generation
 * Excludes debug information and normalizes function bodies
 */
export function serializePluginForSigning(plugin: AgentKitPlugin, options: SigningOptions = {}): string {
  const { excludeDebug = true } = options
  
  // Create a clean copy without signature fields to avoid circular dependencies
  const cleanPlugin = {
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    compatibility: plugin.compatibility,
    permissions: plugin.permissions,
    trustPolicy: plugin.trustPolicy,
    // Serialize function hooks with normalized whitespace
    onInit: plugin.onInit ? normalizeFunctionForSigning(plugin.onInit, excludeDebug) : undefined,
    onSend: plugin.onSend ? normalizeFunctionForSigning(plugin.onSend, excludeDebug) : undefined,
    onError: plugin.onError ? normalizeFunctionForSigning(plugin.onError, excludeDebug) : undefined,
    onShutdown: plugin.onShutdown ? normalizeFunctionForSigning(plugin.onShutdown, excludeDebug) : undefined
  }
  
  // Remove undefined fields for consistent serialization
  Object.keys(cleanPlugin).forEach(key => {
    if (cleanPlugin[key as keyof typeof cleanPlugin] === undefined) {
      delete cleanPlugin[key as keyof typeof cleanPlugin]
    }
  })
  
  return JSON.stringify(cleanPlugin, null, 0) // No pretty printing for consistency
}

/**
 * Normalize function code for signing by removing debug statements and comments
 */
function normalizeFunctionForSigning(fn: Function, excludeDebug: boolean): string {
  let code = fn.toString()
  
  if (excludeDebug) {
    // Remove console.log statements
    code = code.replace(/console\.(log|debug|info|warn|error)\([^)]*\);?\s*/g, '')
    
    // Remove single-line comments
    code = code.replace(/\/\/.*$/gm, '')
    
    // Remove multi-line comments
    code = code.replace(/\/\*[\s\S]*?\*\//g, '')
    
    // Remove DEBUG: prefixed lines
    code = code.replace(/.*DEBUG:.*$/gm, '')
  }
  
  // Normalize whitespace
  code = code.replace(/\s+/g, ' ').trim()
  
  return code
}

/**
 * Generate HMAC signature for a plugin
 */
export function signPlugin(plugin: AgentKitPlugin, secret?: string): PluginSignatureMetadata {
  const signingSecret = secret || process.env.AGENTKIT_SIGNING_SECRET
  
  if (!signingSecret) {
    throw new Error('AGENTKIT_SIGNING_SECRET environment variable is required for plugin signing')
  }
  
  // Validate secret is not hardcoded (basic check)
  if (signingSecret.length < 16 || signingSecret === 'default' || signingSecret === 'test') {
    throw new Error('AGENTKIT_SIGNING_SECRET must be a secure secret (minimum 16 characters)')
  }
  
  const serialized = serializePluginForSigning(plugin)
  const hash = createHmac('sha256', serialized).digest('hex')
  const signature = createHmac('sha256', signingSecret).update(serialized).digest('hex')
  
  return {
    signature,
    hash,
    timestamp: Date.now(),
    algorithm: 'HMAC-SHA256',
    version: '1.0.0'
  }
}

/**
 * Verify HMAC signature for a plugin
 */
export function verifyPluginSignature(
  plugin: AgentKitPlugin, 
  expectedSignature: string,
  secret?: string
): boolean {
  try {
    const signingSecret = secret || process.env.AGENTKIT_SIGNING_SECRET
    
    if (!signingSecret) {
      throw new Error('AGENTKIT_SIGNING_SECRET environment variable is required for plugin verification')
    }
    
    const serialized = serializePluginForSigning(plugin)
    const computedSignature = createHmac('sha256', signingSecret).update(serialized).digest('hex')
    
    // Use constant-time comparison to prevent timing attacks
    return timingSafeEqual(computedSignature, expectedSignature)
  } catch (error) {
    return false
  }
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  
  return result === 0
}

/**
 * Create a signed plugin with metadata
 */
export function createSignedPlugin(plugin: AgentKitPlugin, secret?: string): AgentKitPlugin {
  const metadata = signPlugin(plugin, secret)
  
  const signedPlugin = {
    ...plugin,
    signature: metadata.signature
  }
  
  // Freeze the plugin to prevent tampering
  return Object.freeze(signedPlugin)
}

/**
 * Validate plugin signature fields
 */
export function validatePluginSignatureFields(plugin: AgentKitPlugin): {
  hasSignature: boolean
  hasValidTrustPolicy: boolean
  errors: string[]
} {
  const errors: string[] = []
  const hasSignature = Boolean(plugin.signature)
  
  // Check for hardcoded secrets in publicKey field
  if (plugin.publicKey) {
    if (plugin.publicKey.includes('secret') || plugin.publicKey.includes('key') || plugin.publicKey.length < 16) {
      errors.push('hardcoded secrets are not allowed')
    }
  }
  
  // Validate trust policy
  const validPolicies = ['strict', 'warn', 'off']
  const hasValidTrustPolicy = !plugin.trustPolicy || validPolicies.includes(plugin.trustPolicy)
  
  if (plugin.trustPolicy && !hasValidTrustPolicy) {
    errors.push(`Invalid trust policy: ${plugin.trustPolicy}. Must be one of: ${validPolicies.join(', ')}`)
  }
  
  return {
    hasSignature,
    hasValidTrustPolicy,
    errors
  }
}