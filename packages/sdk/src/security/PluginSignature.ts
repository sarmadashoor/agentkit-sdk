import { createHash, createVerify } from 'crypto'
import type { AgentKitPlugin, PluginSignatureManifest } from '@agentkit/types'
import { EnvironmentGuard } from './EnvironmentGuard'

export interface PluginSignatureConfig {
  publicKey: string;
  allowUnsigned: boolean;
  trustedKeys?: string[];
}

/**
 * Enhanced plugin signature verification with manifest support
 * 
 * Implements Stripe-level security standards:
 * - Manifest-based capability verification
 * - Fingerprint integrity checking
 * - Multi-key signature verification
 * - Performance-optimized caching
 */
export class PluginSignature {
  // Signature verification results cache for performance
  private signatureCache = new Map<string, boolean>();
  // Manifest verification results cache
  private manifestCache = new Map<string, PluginSignatureManifest | null>();

  constructor(private config: PluginSignatureConfig) {}

  /**
   * Generate cryptographic fingerprint of plugin content
   * Used for integrity verification and cache keys
   */
  private getPluginFingerprint(plugin: AgentKitPlugin): string {
    const normalized = {
      name: plugin.name,
      version: plugin.version,
      capabilities: plugin.capabilities || [],
      hooks: {
        onInit: plugin.onInit?.toString() || '',
        onSend: plugin.onSend?.toString() || '',
        onError: plugin.onError?.toString() || '',
        onShutdown: plugin.onShutdown?.toString() || ''
      }
    };

    return createHash('sha256')
      .update(JSON.stringify(normalized, null, 0)) // Consistent serialization
      .digest('hex');
  }

  /**
   * Verify plugin signature and manifest integrity
   * 
   * Security checks performed:
   * 1. Signature verification against trusted keys
   * 2. Manifest integrity verification
   * 3. Hook capability validation
   * 4. Fingerprint consistency check
   */
  verifyPlugin(plugin: AgentKitPlugin & { signature?: string }): boolean {
    const cacheKey = `${plugin.name}@${plugin.version}`;
    
    // Return cached result if available
    if (this.signatureCache.has(cacheKey)) {
      return this.signatureCache.get(cacheKey)!;
    }

    // Allow unsigned plugins in development mode only
    if (!EnvironmentGuard.isProduction() && this.config.allowUnsigned) {
      this.signatureCache.set(cacheKey, true);
      return true;
    }

    // Require signature in production or when configured
    if (!plugin.signature) {
      console.warn(`[AgentKit Security] Plugin "${plugin.name}" is unsigned - rejected in production mode`);
      this.signatureCache.set(cacheKey, false);
      return false;
    }

    try {
      // Verify basic signature first
      const signatureValid = this.verifyBasicSignature(plugin);
      if (!signatureValid) {
        this.signatureCache.set(cacheKey, false);
        return false;
      }

      // Verify manifest if present
      if (plugin.signatureManifest) {
        const manifestValid = this.verifyManifest(plugin, plugin.signatureManifest);
        if (!manifestValid) {
          this.signatureCache.set(cacheKey, false);
          return false;
        }
      }

      this.signatureCache.set(cacheKey, true);
      return true;
    } catch (error) {
      console.error(`[AgentKit Security] Signature verification failed for plugin "${plugin.name}":`, error);
      this.signatureCache.set(cacheKey, false);
      return false;
    }
  }

  /**
   * Verify basic plugin signature using RSA with SHA256
   */
  private verifyBasicSignature(plugin: AgentKitPlugin & { signature?: string }): boolean {
    if (!plugin.signature) return false;

    const fingerprint = this.getPluginFingerprint(plugin);

    // Try verification with all trusted keys
    const keys = [this.config.publicKey, ...(this.config.trustedKeys || [])].filter(Boolean);
    
    return keys.some(key => {
      try {
        // Create new verifier for each key as they can only be used once
        const verifier = createVerify('SHA256');
        verifier.update(fingerprint);
        return verifier.verify(key, plugin.signature!, 'base64');
      } catch (error) {
        // Log key-specific failures in debug mode
        if (!EnvironmentGuard.isProduction()) {
          console.debug(`[AgentKit Security] Key verification failed:`, error);
        }
        return false;
      }
    });
  }

  /**
   * Verify plugin manifest integrity and capability restrictions
   * 
   * Checks performed:
   * 1. Manifest metadata matches plugin metadata
   * 2. Fingerprint hash matches actual plugin content
   * 3. Plugin hooks are within allowedHooks constraints
   */
  private verifyManifest(plugin: AgentKitPlugin, manifest: PluginSignatureManifest): boolean {
    const cacheKey = `${plugin.name}@${plugin.version}:manifest`;
    
    // Return cached manifest verification result
    if (this.manifestCache.has(cacheKey)) {
      const cachedManifest = this.manifestCache.get(cacheKey);
      return cachedManifest !== null;
    }

    try {
      // Verify manifest metadata matches plugin
      if (manifest.name !== plugin.name) {
        console.error(`[AgentKit Security] Manifest name mismatch: expected "${plugin.name}", got "${manifest.name}"`);
        this.manifestCache.set(cacheKey, null);
        return false;
      }

      if (manifest.version !== plugin.version) {
        console.error(`[AgentKit Security] Manifest version mismatch: expected "${plugin.version}", got "${manifest.version}"`);
        this.manifestCache.set(cacheKey, null);
        return false;
      }

      // Verify fingerprint integrity
      const actualFingerprint = this.getPluginFingerprint(plugin);
      if (manifest.fingerprintHash !== actualFingerprint) {
        console.error(`[AgentKit Security] Plugin fingerprint mismatch - content may have been tampered with`);
        this.manifestCache.set(cacheKey, null);
        return false;
      }

      // Verify hook capabilities
      const implementedHooks = this.getImplementedHooks(plugin);
      const unauthorizedHooks = implementedHooks.filter(hook => !manifest.allowedHooks.includes(hook));
      
      if (unauthorizedHooks.length > 0) {
        console.error(`[AgentKit Security] Plugin "${plugin.name}" implements unauthorized hooks: ${unauthorizedHooks.join(', ')}`);
        this.manifestCache.set(cacheKey, null);
        return false;
      }

      // Cache successful verification
      this.manifestCache.set(cacheKey, manifest);
      return true;
    } catch (error) {
      console.error(`[AgentKit Security] Manifest verification failed for plugin "${plugin.name}":`, error);
      this.manifestCache.set(cacheKey, null);
      return false;
    }
  }

  /**
   * Get list of hooks implemented by a plugin
   */
  private getImplementedHooks(plugin: AgentKitPlugin): string[] {
    const hooks: string[] = [];
    
    if (typeof plugin.onInit === 'function') hooks.push('onInit');
    if (typeof plugin.onSend === 'function') hooks.push('onSend');
    if (typeof plugin.onError === 'function') hooks.push('onError');
    if (typeof plugin.onShutdown === 'function') hooks.push('onShutdown');
    
    return hooks;
  }

  /**
   * Clear verification caches (useful for testing or key rotation)
   */
  clearCache(): void {
    this.signatureCache.clear();
    this.manifestCache.clear();
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): { signatureCache: number; manifestCache: number } {
    return {
      signatureCache: this.signatureCache.size,
      manifestCache: this.manifestCache.size
    };
  }
}