import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PluginManager } from '../../src/plugins/PluginManager'
import { EnvironmentGuard } from '../../src/security/EnvironmentGuard'

describe('Sandbox Enforcement', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    // Reset EnvironmentGuard cache
    (EnvironmentGuard as any)._isProduction = null;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    // Reset EnvironmentGuard cache
    (EnvironmentGuard as any)._isProduction = null;
  });

  it('should force sandbox in production', () => {
    process.env.NODE_ENV = 'production';
    const manager = new PluginManager({ sandbox: false });
    expect((manager as any).options.sandbox).toBe(true);
  });

  it('should allow sandbox disable in dev', () => {
    process.env.NODE_ENV = 'development';
    process.env.AGENTKIT_UNSAFE_SANDBOX = 'true';
    const manager = new PluginManager({ sandbox: false });
    expect((manager as any).options.sandbox).toBe(false);
  });

  it('should force sandbox when AGENTKIT_ENV is production', () => {
    process.env.NODE_ENV = 'development';
    process.env.AGENTKIT_ENV = 'production';
    const manager = new PluginManager({ sandbox: false });
    expect((manager as any).options.sandbox).toBe(true);
  });

  it('should respect AGENTKIT_ALLOW_UNSAFE flag', () => {
    process.env.NODE_ENV = 'development';
    process.env.AGENTKIT_ALLOW_UNSAFE = 'true';
    process.env.AGENTKIT_UNSAFE_SANDBOX = 'true';
    const manager = new PluginManager({ sandbox: false });
    expect((manager as any).options.sandbox).toBe(false);
  });

  it('should default to sandbox enabled', () => {
    process.env.NODE_ENV = 'development';
    const manager = new PluginManager({});
    expect((manager as any).options.sandbox).toBe(true);
  });

  it('should allow sandbox disable in test environment', () => {
    process.env.NODE_ENV = 'test';
    const manager = new PluginManager({ sandbox: false });
    expect((manager as any).options.sandbox).toBe(false);
  });
});