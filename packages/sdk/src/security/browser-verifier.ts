/**
 * Browser-compatible Plugin Signature Verification
 * 
 * Uses SubtleCrypto API for HMAC verification in browser environments
 * with fallback to polyfill when crypto APIs are unavailable
 */

import type { AgentKitPlugin } from '@agentkit/types'
import { serializePluginForSigning } from './plugin-signer'

/**
 * Verify plugin signature using browser SubtleCrypto API
 */
export async function verifyPluginInBrowser(
  plugin: AgentKitPlugin,
  secret: string,
  expectedSignature: string
): Promise<boolean> {
  try {
    // Check if we're in a browser environment with SubtleCrypto
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      return await verifyWithSubtleCrypto(plugin, secret, expectedSignature)
    }
    
    // Fallback to Node.js crypto if available
    if (typeof require !== 'undefined') {
      const { createHmac } = require('crypto')
      const serialized = serializePluginForSigning(plugin)
      const computedSignature = createHmac('sha256', secret).update(serialized).digest('hex')
      return timingSafeEqual(computedSignature, expectedSignature)
    }
    
    // No crypto available - this should be caught by polyfill
    throw new Error('No cryptographic implementation available')
  } catch (error) {
    console.warn('Plugin signature verification failed:', error)
    return false
  }
}

/**
 * Verify using browser SubtleCrypto API
 */
async function verifyWithSubtleCrypto(
  plugin: AgentKitPlugin,
  secret: string,
  expectedSignature: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder()
    const serialized = serializePluginForSigning(plugin)
    
    // Import the secret key
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    
    // Sign the serialized plugin
    const signature = await window.crypto.subtle.sign(
      'HMAC',
      keyMaterial,
      encoder.encode(serialized)
    )
    
    // Convert to hex string
    const computedSignature = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    
    return timingSafeEqual(computedSignature, expectedSignature)
  } catch (error) {
    console.warn('SubtleCrypto verification failed:', error)
    return false
  }
}

/**
 * Timing-safe string comparison
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
 * Check if browser crypto APIs are available
 */
export function isBrowserCryptoAvailable(): boolean {
  return typeof window !== 'undefined' && 
         window.crypto && 
         window.crypto.subtle &&
         typeof window.crypto.subtle.importKey === 'function'
}