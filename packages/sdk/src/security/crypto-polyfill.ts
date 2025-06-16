/**
 * Crypto Polyfill for Plugin Signature Verification
 * 
 * Provides HMAC-SHA256 implementation for environments
 * without native crypto support (legacy browsers, etc.)
 */

import type { AgentKitPlugin } from '@agentkit/types'
import { serializePluginForSigning } from './plugin-signer'

/**
 * Simple SHA-256 implementation for polyfill
 * Based on the SHA-256 specification
 */
class SHA256 {
  private h: number[] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]
  
  private k: number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]
  
  hash(message: string): string {
    const bytes = new TextEncoder().encode(message)
    const bits = bytes.length * 8
    
    // Pre-processing: adding padding bits
    const paddedLength = Math.ceil((bits + 65) / 512) * 512
    const padded = new Uint8Array(paddedLength / 8)
    padded.set(bytes)
    padded[bytes.length] = 0x80
    
    // Append length as 64-bit big-endian integer
    const view = new DataView(padded.buffer)
    view.setUint32(padded.length - 4, bits, false)
    
    // Process in 512-bit chunks
    for (let i = 0; i < padded.length; i += 64) {
      this.processChunk(padded.slice(i, i + 64))
    }
    
    // Convert hash to hex string
    return this.h.map(h => h.toString(16).padStart(8, '0')).join('')
  }
  
  private processChunk(chunk: Uint8Array): void {
    const w = new Array(64)
    const view = new DataView(chunk.buffer, chunk.byteOffset)
    
    // Break chunk into sixteen 32-bit big-endian words
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(i * 4, false)
    }
    
    // Extend the sixteen 32-bit words into sixty-four 32-bit words
    for (let i = 16; i < 64; i++) {
      const s0 = this.rightRotate(w[i - 15], 7) ^ this.rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = this.rightRotate(w[i - 2], 17) ^ this.rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    
    // Initialize working variables
    let [a, b, c, d, e, f, g, h] = this.h
    
    // Main loop
    for (let i = 0; i < 64; i++) {
      const S1 = this.rightRotate(e, 6) ^ this.rightRotate(e, 11) ^ this.rightRotate(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + this.k[i] + w[i]) >>> 0
      const S0 = this.rightRotate(a, 2) ^ this.rightRotate(a, 13) ^ this.rightRotate(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0
      
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    
    // Add this chunk's hash to result
    this.h[0] = (this.h[0] + a) >>> 0
    this.h[1] = (this.h[1] + b) >>> 0
    this.h[2] = (this.h[2] + c) >>> 0
    this.h[3] = (this.h[3] + d) >>> 0
    this.h[4] = (this.h[4] + e) >>> 0
    this.h[5] = (this.h[5] + f) >>> 0
    this.h[6] = (this.h[6] + g) >>> 0
    this.h[7] = (this.h[7] + h) >>> 0
  }
  
  private rightRotate(n: number, b: number): number {
    return (n >>> b) | (n << (32 - b))
  }
}

/**
 * HMAC-SHA256 polyfill implementation
 */
function hmacSha256Polyfill(key: string, message: string): string {
  const keyBytes = new TextEncoder().encode(key)
  const blockSize = 64 // SHA-256 block size
  
  // Prepare key
  let keyPadded: Uint8Array
  if (keyBytes.length > blockSize) {
    const sha = new SHA256()
    const hashedKey = sha.hash(key)
    keyPadded = new Uint8Array(blockSize)
    const hashedBytes = new TextEncoder().encode(hashedKey)
    keyPadded.set(hashedBytes.slice(0, Math.min(hashedBytes.length, blockSize)))
  } else {
    keyPadded = new Uint8Array(blockSize)
    keyPadded.set(keyBytes)
  }
  
  // Create inner and outer padded keys
  const iKeyPad = new Uint8Array(blockSize)
  const oKeyPad = new Uint8Array(blockSize)
  
  for (let i = 0; i < blockSize; i++) {
    iKeyPad[i] = keyPadded[i] ^ 0x36
    oKeyPad[i] = keyPadded[i] ^ 0x5c
  }
  
  // Inner hash
  const sha1 = new SHA256()
  const innerInput = new TextDecoder().decode(iKeyPad) + message
  const innerHash = sha1.hash(innerInput)
  
  // Outer hash
  const sha2 = new SHA256()
  const outerInput = new TextDecoder().decode(oKeyPad) + innerHash
  
  return sha2.hash(outerInput)
}

/**
 * Verify plugin signature using polyfill crypto
 */
export async function verifyPluginWithPolyfill(
  plugin: AgentKitPlugin,
  secret: string,
  expectedSignature: string
): Promise<boolean> {
  try {
    const serialized = serializePluginForSigning(plugin)
    const computedSignature = hmacSha256Polyfill(secret, serialized)
    
    return timingSafeEqual(computedSignature, expectedSignature)
  } catch (error) {
    console.warn('Polyfill signature verification failed:', error)
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
 * Generate signature using polyfill (for testing)
 */
export function signPluginWithPolyfill(plugin: AgentKitPlugin, secret: string): string {
  const serialized = serializePluginForSigning(plugin)
  return hmacSha256Polyfill(secret, serialized)
}