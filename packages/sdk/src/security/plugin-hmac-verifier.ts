/**
 * Plugin HMAC Verification Enforcement System
 * 
 * Implements trust policy enforcement for plugin signatures:
 * - strict: Reject unsigned/invalid plugins
 * - warn: Log warnings but allow execution
 * - off: Disable verification (dev only)
 */

import type { AgentKitPlugin } from '@agentkit/types'
import { verifyPluginSignature, validatePluginSignatureFields } from './plugin-signer'
import { verifyPluginInBrowser, isBrowserCryptoAvailable } from './browser-verifier'
import { verifyPluginWithPolyfill } from './crypto-polyfill'

export type VerificationMode = 'strict' | 'warn' | 'off'

export interface VerificationResult {
  success: boolean
  plugin: AgentKitPlugin
  errors: string[]
  warnings: string[]
}

export interface VerificationOptions {
  mode?: VerificationMode
  secret?: string
  logger?: {
    warn: (message: string) => void
    error: (message: string) => void
  }
  // SECURITY PATCH: Removed allowOffInProduction option - never allow production bypass
}

/**
 * Verify a single plugin according to trust policy
 */
export async function verifyPlugin(
  plugin: AgentKitPlugin,
  options: VerificationOptions = {}
): Promise<VerificationResult> {
  const {
    mode = getDefaultVerificationMode(),
    secret,
    logger = console
  } = options
  
  const result: VerificationResult = {
    success: false,
    plugin,
    errors: [],
    warnings: []
  }
  
  // SECURITY PATCH: Hardened production environment guardrails
  // Never allow 'off' mode in production - no exceptions, no overrides
  if (isProductionEnvironment() && mode === 'off') {
    result.errors.push("❌ SECURITY VIOLATION: verify: 'off' is NEVER allowed in production environments")
    return result
  }
  
  // Additional security check: Detect production-like environments
  if (isProductionLikeEnvironment() && mode === 'off') {
    result.errors.push("❌ SECURITY VIOLATION: verify: 'off' is not allowed in production-like environments")
    return result
  }
  
  // Skip verification if mode is 'off' (only allowed in development)
  if (mode === 'off') {
    if (isProductionEnvironment() || isProductionLikeEnvironment()) {
      // Double-check: This should never happen due to checks above
      result.errors.push("❌ SECURITY VIOLATION: Production environment detected with verification disabled")
      return result
    }
    result.success = true
    return result
  }
  
  // Validate signature fields
  const validation = validatePluginSignatureFields(plugin)
  if (validation.errors.length > 0) {
    result.errors.push(...validation.errors)
    if (mode === 'strict') {
      return result
    }
  }
  
  // Check if plugin has a signature
  if (!validation.hasSignature) {
    const message = `Plugin ${plugin.name} is unsigned. Trust policy set to '${mode}'.`
    
    if (mode === 'strict') {
      result.errors.push(`❌ Plugin "${plugin.name}" failed verification: signature missing`)
      return result
    } else if (mode === 'warn') {
      result.warnings.push(`⚠️ ${message}`)
      logger.warn(`⚠️ ${message}`)
      result.success = true
      return result
    }
  }
  
  // Verify the signature
  try {
    const isValid = await verifySignatureMultiPlatform(plugin, plugin.signature!, secret)
    
    if (!isValid) {
      const message = `❌ Plugin "${plugin.name}" failed verification: signature mismatch`
      
      if (mode === 'strict') {
        result.errors.push(message)
        return result
      } else if (mode === 'warn') {
        result.warnings.push(`⚠️ ${message}`)
        logger.warn(`⚠️ ${message}`)
        result.success = true
        return result
      }
    }
    
    // Signature is valid
    result.success = true
    
    // Freeze plugin metadata to prevent tampering
    Object.freeze(plugin)
    
  } catch (error) {
    const message = `Plugin "${plugin.name}" verification error: ${error instanceof Error ? error.message : String(error)}`
    
    if (mode === 'strict') {
      result.errors.push(`❌ ${message}`)
      return result
    } else if (mode === 'warn') {
      result.warnings.push(`⚠️ ${message}`)
      logger.warn(`⚠️ ${message}`)
      result.success = true
    }
  }
  
  return result
}

/**
 * Verify multiple plugins with batch processing
 */
export async function verifyPlugins(
  plugins: AgentKitPlugin[],
  options: VerificationOptions = {}
): Promise<{
  success: boolean
  results: VerificationResult[]
  totalErrors: number
  totalWarnings: number
}> {
  const results = await Promise.all(
    plugins.map(plugin => verifyPlugin(plugin, options))
  )
  
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0)
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0)
  const success = results.every(r => r.success)
  
  return {
    success,
    results,
    totalErrors,
    totalWarnings
  }
}

/**
 * Cross-platform signature verification
 */
async function verifySignatureMultiPlatform(
  plugin: AgentKitPlugin,
  expectedSignature: string,
  secret?: string
): Promise<boolean> {
  const signingSecret = secret || process.env.AGENTKIT_SIGNING_SECRET
  
  if (!signingSecret) {
    throw new Error('AGENTKIT_SIGNING_SECRET environment variable is required')
  }
  
  // Try Node.js crypto first
  try {
    if (typeof require !== 'undefined') {
      return verifyPluginSignature(plugin, expectedSignature, signingSecret)
    }
  } catch (error) {
    // Fall through to browser methods
  }
  
  // Try browser SubtleCrypto
  if (isBrowserCryptoAvailable()) {
    try {
      return await verifyPluginInBrowser(plugin, signingSecret, expectedSignature)
    } catch (error) {
      // Fall through to polyfill
    }
  }
  
  // Fallback to polyfill
  try {
    return await verifyPluginWithPolyfill(plugin, signingSecret, expectedSignature)
  } catch (error) {
    throw new Error(`All signature verification methods failed: ${error}`)
  }
}

/**
 * Get default verification mode based on environment
 */
function getDefaultVerificationMode(): VerificationMode {
  if (isProductionEnvironment()) {
    return 'strict'
  }
  
  // In development, default to warn to help developers
  return 'warn'
}

/**
 * Check if we're in a production environment
 * SECURITY PATCH: Hardened production detection with anti-spoofing
 */
function isProductionEnvironment(): boolean {
  const nodeEnv = process.env.NODE_ENV
  if (!nodeEnv) {
    // No NODE_ENV set - assume production for security
    return true
  }
  return nodeEnv.toLowerCase() === 'production'
}

/**
 * Check if we're in a production-like environment
 * SECURITY PATCH: Detect production-like environments that should have verification
 */
function isProductionLikeEnvironment(): boolean {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase()
  const prodLikeEnvs = ['prod', 'staging', 'stage', 'release', 'live']
  
  // Check for production-like environment names
  if (nodeEnv && prodLikeEnvs.includes(nodeEnv)) {
    return true
  }
  
  // Check for CI/CD environments which should be secure
  if (process.env.CI === 'true' || process.env.CONTINUOUS_INTEGRATION === 'true') {
    return true
  }
  
  // Check for cloud deployment environments
  if (process.env.AWS_LAMBDA_FUNCTION_NAME || 
      process.env.VERCEL || 
      process.env.HEROKU_APP_NAME ||
      process.env.GOOGLE_CLOUD_PROJECT) {
    return true
  }
  
  return false
}

/**
 * Create verification options with environment-aware defaults
 */
export function createVerificationOptions(
  mode?: VerificationMode,
  secret?: string,
  logger?: VerificationOptions['logger']
): VerificationOptions {
  return {
    mode: mode || getDefaultVerificationMode(),
    secret,
    logger: logger || console
  }
}

/**
 * Validate verification mode for current environment
 */
export function validateVerificationMode(mode: VerificationMode): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []
  
  // SECURITY PATCH: Enhanced production environment detection
  if ((isProductionEnvironment() || isProductionLikeEnvironment()) && mode === 'off') {
    errors.push("❌ SECURITY VIOLATION: Verification mode 'off' is NEVER allowed in production or production-like environments")
  }
  
  if (!['strict', 'warn', 'off'].includes(mode)) {
    errors.push(`Invalid verification mode: ${mode}. Must be 'strict', 'warn', or 'off'`)
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}