/**
 * Plugin verification system for AgentKit SDK
 * 
 * Verifies plugin signatures against trusted key registry before loading.
 * Supports development mode flexibility with configurable warnings.
 */

import { readFile, access } from 'fs/promises'
import { resolve, dirname, basename, extname } from 'path'
import { 
  verifySignature, 
  findTrustedKey, 
  loadTrustedKeys,
  type PluginSignature, 
  type TrustedKey 
} from './crypto-utils'
import { 
  PluginVerificationError, 
  UntrustedPluginError, 
  ExpiredSignatureError,
  MissingSignatureError
} from '../errors'

export interface PluginVerificationOptions {
  /** Allow unsigned plugins in development mode */
  allowUnverifiedPlugins?: boolean
  /** Path to trusted keys registry */
  trustedKeysPath?: string
  /** Enable development mode warnings */
  developmentMode?: boolean
  /** Custom logger for warnings */
  logger?: {
    warn: (message: string, ...args: any[]) => void
  }
}

export interface PluginVerificationResult {
  /** Whether plugin passed verification */
  verified: boolean
  /** Trusted key used for verification (if any) */
  trustedKey?: TrustedKey
  /** Plugin signature (if any) */
  signature?: PluginSignature
  /** Verification warnings */
  warnings: string[]
  /** Verification errors */
  errors: string[]
}

/**
 * Default path to trusted keys registry
 */
function getDefaultTrustedKeysPath(): string {
  // Look for trusted-keys.json in repository root
  return resolve(process.cwd(), 'trusted-keys.json')
}

/**
 * Get signature file path for a plugin
 */
function getSignaturePath(pluginPath: string): string {
  const dir = dirname(pluginPath)
  const name = basename(pluginPath, extname(pluginPath))
  return resolve(dir, `${name}.sig`)
}

/**
 * Check if we're in development mode
 */
function isDevelopmentMode(): boolean {
  return process.env.NODE_ENV === 'development' || 
         process.env.NODE_ENV === 'dev' ||
         process.env.NODE_ENV === 'test'
}

/**
 * Load plugin signature file
 */
async function loadPluginSignature(signaturePath: string): Promise<PluginSignature | null> {
  try {
    const content = await readFile(signaturePath, 'utf8')
    const signature = JSON.parse(content) as PluginSignature
    
    // Basic signature format validation
    if (!signature.hash || !signature.signature || !signature.keyId) {
      throw new Error('Invalid signature format')
    }
    
    return signature
  } catch {
    return null
  }
}

/**
 * Verify a plugin file against its signature and trusted keys
 */
export async function verifyPluginFile(
  pluginPath: string,
  options: PluginVerificationOptions = {}
): Promise<PluginVerificationResult> {
  const result: PluginVerificationResult = {
    verified: false,
    warnings: [],
    errors: []
  }

  const devMode = options.developmentMode ?? isDevelopmentMode()
  const trustedKeysPath = options.trustedKeysPath ?? getDefaultTrustedKeysPath()
  const signaturePath = getSignaturePath(pluginPath)

  try {
    // Check if plugin file exists
    await access(pluginPath)
  } catch {
    result.errors.push(`Plugin file not found: ${pluginPath}`)
    throw new PluginVerificationError(
      `Plugin file not found: ${pluginPath}`,
      { context: { pluginPath } }
    )
  }

  // Load plugin signature
  const signature = await loadPluginSignature(signaturePath)
  
  if (!signature) {
    const error = `No signature found for plugin: ${basename(pluginPath)}`
    result.errors.push(error)

    // In development mode, allow unsigned plugins with warning
    if (devMode && options.allowUnverifiedPlugins) {
      const warning = `WARNING: Loading unsigned plugin in development mode: ${basename(pluginPath)}`
      result.warnings.push(warning)
      
      if (options.logger) {
        options.logger.warn(warning)
      } else {
        console.warn(`🚨 ${warning}`)
      }
      
      result.verified = true // Allow in dev mode
      return result
    }

    throw new MissingSignatureError(
      `Plugin signature required: ${basename(pluginPath)}`,
      { context: { pluginPath, signaturePath } }
    )
  }

  result.signature = signature

  // Check signature expiration
  const now = Math.floor(Date.now() / 1000)
  if (signature.expires < now) {
    const error = `Plugin signature has expired: ${basename(pluginPath)}`
    result.errors.push(error)
    
    throw new ExpiredSignatureError(
      error,
      { 
        context: { 
          pluginPath, 
          expired: new Date(signature.expires * 1000).toISOString(),
          now: new Date().toISOString()
        } 
      }
    )
  }

  // Load trusted keys and find matching key
  try {
    const trustedKey = await findTrustedKey(signature.keyId, trustedKeysPath)
    
    if (!trustedKey) {
      const error = `Untrusted signing key: ${signature.keyId}`
      result.errors.push(error)
      
      throw new UntrustedPluginError(
        `Plugin signed with untrusted key: ${basename(pluginPath)}`,
        { 
          context: { 
            pluginPath, 
            keyId: signature.keyId,
            trustedKeysPath 
          } 
        }
      )
    }

    result.trustedKey = trustedKey

    // Verify signature
    const isValid = await verifySignature(pluginPath, signature, trustedKey.pubkey)
    
    if (!isValid) {
      const error = `Invalid signature for plugin: ${basename(pluginPath)}`
      result.errors.push(error)
      
      throw new PluginVerificationError(
        error,
        { 
          context: { 
            pluginPath, 
            keyId: signature.keyId,
            trustedKey: trustedKey.name
          } 
        }
      )
    }

    // Signature is valid!
    result.verified = true

    // Add informational warnings for development keys in production
    if (!devMode && trustedKey.type === 'dev') {
      const warning = `Using development key in production: ${trustedKey.name}`
      result.warnings.push(warning)
      
      if (options.logger) {
        options.logger.warn(warning)
      }
    }

  } catch (error) {
    // If we can't load trusted keys, treat as verification failure
    if (!result.errors.length) {
      result.errors.push(`Failed to verify plugin: ${error instanceof Error ? error.message : String(error)}`)
    }
    throw error
  }

  return result
}

/**
 * Verify in-memory plugin objects
 */
export async function verifyPluginObject(
  plugin: any,
  options: PluginVerificationOptions = {}
): Promise<PluginVerificationResult> {
  const result: PluginVerificationResult = {
    verified: false,
    warnings: [],
    errors: []
  }

  const devMode = options.developmentMode ?? isDevelopmentMode()
  
  // Check if plugin has signature metadata
  if (plugin.__signature && plugin.__signaturePath) {
    // Plugin has embedded signature metadata - verify against file
    try {
      const fileResult = await verifyPluginFile(plugin.__signaturePath, options)
      return fileResult
    } catch (error) {
      result.errors.push(`Failed to verify plugin signature: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // No signature metadata found
  const warning = `Plugin "${plugin.name || 'unknown'}" has no signature`
  result.errors.push(warning)

  // In development mode, allow unsigned plugins with warning
  if (devMode && options.allowUnverifiedPlugins) {
    const devWarning = `WARNING: Loading unsigned plugin in development mode: ${plugin.name || 'unknown'}`
    result.warnings.push(devWarning)
    
    if (options.logger) {
      options.logger.warn(devWarning)
    } else {
      console.warn(`🚨 ${devWarning}`)
    }
    
    result.verified = true // Allow in dev mode
    return result
  }

  // In production, reject unsigned plugins
  throw new MissingSignatureError(
    `Plugin signature required: ${plugin.name || 'unknown'}`,
    { context: { pluginName: plugin.name } }
  )
}

/**
 * Verify plugin (auto-detects file vs object)
 */
export async function verifyPlugin(
  pluginOrPath: string | any,
  options: PluginVerificationOptions = {}
): Promise<PluginVerificationResult> {
  if (typeof pluginOrPath === 'string') {
    return verifyPluginFile(pluginOrPath, options)
  } else {
    return verifyPluginObject(pluginOrPath, options)
  }
}

/**
 * Verify plugin and throw on failure (convenience function)
 */
export async function requireVerifiedPlugin(
  pluginOrPath: string | any,
  options: PluginVerificationOptions = {}
): Promise<PluginVerificationResult> {
  const result = await verifyPlugin(pluginOrPath, options)
  
  if (!result.verified) {
    const name = typeof pluginOrPath === 'string' ? basename(pluginOrPath) : (pluginOrPath.name || 'unknown')
    throw new PluginVerificationError(
      `Plugin verification failed: ${name}`,
      { context: { plugin: pluginOrPath, errors: result.errors } }
    )
  }
  
  return result
}

/**
 * Create verification options based on environment and user preferences
 */
export function createVerificationOptions(
  allowUnverifiedPlugins?: boolean,
  trustedKeysPath?: string
): PluginVerificationOptions {
  return {
    allowUnverifiedPlugins: allowUnverifiedPlugins ?? isDevelopmentMode(),
    trustedKeysPath,
    developmentMode: isDevelopmentMode(),
    logger: console
  }
}