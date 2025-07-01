import { createHash, createVerify } from 'crypto'
import type { AgentKitPlugin } from '@agentkit/types'
import { EnvironmentGuard } from './EnvironmentGuard'

export interface PluginSignatureConfig {
  publicKey: string;
  allowUnsigned: boolean;
  trustedKeys?: string[];
}

export class PluginSignature {
  private signatureCache = new Map<string, boolean>();

  constructor(private config: PluginSignatureConfig) {}

  private getPluginFingerprint(plugin: AgentKitPlugin): string {
    const normalized = {
      name: plugin.name,
      version: plugin.version,
      hooks: {
        onInit: plugin.onInit?.toString() || '',
        onSend: plugin.onSend?.toString() || '',
        onError: plugin.onError?.toString() || '',
        onShutdown: plugin.onShutdown?.toString() || ''
      }
    };

    return createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');
  }

  verifyPlugin(plugin: AgentKitPlugin & { signature?: string }): boolean {
    const cacheKey = `${plugin.name}@${plugin.version}`;
    if (this.signatureCache.has(cacheKey)) {
      return this.signatureCache.get(cacheKey)!;
    }

    if (!EnvironmentGuard.isProduction() && this.config.allowUnsigned) {
      this.signatureCache.set(cacheKey, true);
      return true;
    }

    if (!plugin.signature) {
      console.error(`[AgentKit Security] Plugin "${plugin.name}" is unsigned`);
      this.signatureCache.set(cacheKey, false);
      return false;
    }

    try {
      const fingerprint = this.getPluginFingerprint(plugin);
      const verifier = createVerify('SHA256');
      verifier.update(fingerprint);

      const keys = [this.config.publicKey, ...(this.config.trustedKeys || [])];
      const result = keys.some(key => {
        try {
          return verifier.verify(key, plugin.signature!, 'base64');
        } catch {
          return false;
        }
      });

      this.signatureCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('[AgentKit Security] Signature verification failed:', error);
      this.signatureCache.set(cacheKey, false);
      return false;
    }
  }
}