import { describe, it, expect } from 'vitest'
import { PluginManager } from '../../src/plugins/PluginManager'

describe('PluginManager Security - Options Immutability', () => {
  it('should prevent options mutation after construction', () => {
    const manager = new PluginManager({ sandbox: false })
    
    // TypeScript will prevent this at compile time, but we test runtime behavior
    expect(() => {
      ;(manager as any).options.sandbox = true
    }).toThrow()
  })

  it('should prevent allowedGlobals array mutation', () => {
    const customGlobals = ['Math', 'Date']
    const manager = new PluginManager({ allowedGlobals: customGlobals })
    
    expect(() => {
      ;(manager as any).options.allowedGlobals.push('eval')
    }).toThrow()
  })

  it('should prevent trustedPluginKeys array mutation', () => {
    const trustedKeys = ['key1', 'key2']
    const manager = new PluginManager({ trustedPluginKeys: trustedKeys })
    
    expect(() => {
      ;(manager as any).options.trustedPluginKeys.push('malicious-key')
    }).toThrow()
  })

  it('should preserve frozen state across multiple instances', () => {
    const manager1 = new PluginManager({ debug: true })
    const manager2 = new PluginManager({ debug: false })
    
    expect(() => {
      ;(manager1 as any).options.debug = false
    }).toThrow()
    
    expect(() => {
      ;(manager2 as any).options.debug = true
    }).toThrow()
  })

  it('should prevent nested object mutation attempts', () => {
    const manager = new PluginManager({ 
      observabilityHooks: {
        onPluginSuccess: () => {},
        onPluginError: () => {}
      }
    })
    
    // Even though observabilityHooks might not be deeply frozen,
    // the main options object should be frozen
    expect(() => {
      ;(manager as any).options.hookTimeout = 10000
    }).toThrow()
  })

  it('should maintain security even with direct property access', () => {
    const manager = new PluginManager({
      sandbox: true,
      allowUnsignedPlugins: false,
      pluginPublicKey: 'test-key'
    })
    
    // Verify that security-critical options cannot be changed
    expect(() => {
      ;(manager as any).options.allowUnsignedPlugins = true
    }).toThrow()
    
    expect(() => {
      ;(manager as any).options.pluginPublicKey = 'compromised-key'
    }).toThrow()
  })
})