import { describe, it, expect } from 'vitest'
import { PluginManager } from '../../src/plugins/PluginManager'
// Simple deep frozen check for testing
function isDeeplyFrozen(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null || !Object.isFrozen(obj)) {
    return false
  }
  
  for (const prop in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, prop)) {
      const value = (obj as Record<string, unknown>)[prop]
      if (value && typeof value === 'object' && !isDeeplyFrozen(value)) {
        return false
      }
    }
  }
  
  return true
}

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
    
    // Main options object should be frozen
    expect(() => {
      ;(manager as any).options.hookTimeout = 10000
    }).toThrow()
    
    // Nested observabilityHooks should also be deeply frozen
    expect(() => {
      ;(manager as any).options.observabilityHooks.onPluginSuccess = () => { console.log('compromised') }
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

  it('should ensure options are deeply frozen', () => {
    const manager = new PluginManager({
      debug: true,
      observabilityHooks: {
        onPluginSuccess: () => {},
        onPluginError: () => {}
      },
      allowedGlobals: ['Math', 'Date']
    })
    
    // Verify that the options object is deeply frozen
    expect(isDeeplyFrozen((manager as any).options)).toBe(true)
  })

  it('should prevent deep nested mutations', () => {
    const nestedConfig = {
      level1: {
        level2: {
          value: 'original'
        }
      }
    }
    
    const manager = new PluginManager({
      observabilityHooks: {
        onPluginSuccess: () => {},
        onPluginError: () => {},
        // @ts-expect-error - Adding nested property for testing
        nestedConfig
      }
    })
    
    // Attempt to modify deep nested properties should fail
    expect(() => {
      ;((manager as any).options.observabilityHooks.nestedConfig.level1.level2.value = 'compromised')
    }).toThrow()
  })
})