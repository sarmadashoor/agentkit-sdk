import { PluginConfig } from '../../types'
import { PluginTemplateUtils } from '../utils/PluginTemplateUtils'

/**
 * Generates test files for the plugin
 */
export class PluginTestGenerator {
  /**
   * Generate unit tests for the plugin
   */
  generateTests(config: PluginConfig): string {
    const className = PluginTemplateUtils.toPascalCase(config.name)
    
    return `import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ${className} } from './index'
import type { AgentContext${config.hooks.includes('onSend') ? ', SendPayload' : ''} } from '../types/agentkit-types'

describe('${className}', () => {
  let plugin: ${className}
  let mockContext: AgentContext

  beforeEach(() => {
    plugin = new ${className}()
    mockContext = {
      agentId: 'test-agent',
      transportId: 'test-transport',
      requestId: 'test-request',
      timestamp: Date.now(),
      metadata: {}
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should have correct metadata', () => {
      expect(plugin.name).toBe('${config.name}')
      expect(plugin.version).toBe('1.0.0')
      expect(plugin.description).toBeDefined()
    })

    it('should validate config on construction', () => {
      expect(() => new ${className}({ enabled: true })).not.toThrow()
      expect(() => new ${className}({ enabled: 'invalid' as any })).toThrow()
    })
  })

${this.generateHookTests(config)}
})
`
  }

  /**
   * Generate integration tests for the plugin
   */
  generateIntegrationTests(config: PluginConfig): string {
    const className = PluginTemplateUtils.toPascalCase(config.name)
    
    return `import { describe, it, expect, beforeEach, afterEach } from 'vitest'
// import { connectAgent } from '@agentkit/sdk'
import { ${className} } from './index'

describe('${className} Integration', () => {
  let plugin: ${className}
  let cleanup: (() => Promise<void>) | undefined

  beforeEach(() => {
    plugin = new ${className}()
  })

  afterEach(async () => {
    if (cleanup) {
      await cleanup()
      cleanup = undefined
    }
  })

  it('should integrate with AgentKit SDK', async () => {
    const { shutdown } = await connectAgent({
      agent: 'test-agent',
      transport: 'test-transport',
      plugins: [plugin]
    })
    
    cleanup = shutdown
    
    // Add integration test assertions
    expect(plugin).toBeDefined()
  })

  it('should work with multiple plugins', async () => {
    const otherPlugin = new ${className}({ logLevel: 'debug' })
    
    const { shutdown } = await connectAgent({
      agent: 'test-agent',
      transport: 'test-transport',
      plugins: [plugin, otherPlugin]
    })
    
    cleanup = shutdown
    
    // Add multi-plugin test assertions
  })
})
`
  }

  /**
   * Generate Playwright browser tests (for browser-safe plugins)
   */
  generatePlaywrightTests(config: PluginConfig): string {
    const className = PluginTemplateUtils.toPascalCase(config.name)
    
    return `import { test, expect } from '@playwright/test'

test.describe('${className} Browser Tests', () => {
  test('plugin loads in browser environment', async ({ page }) => {
    await page.goto('/test-harness.html')
    
    // Load the plugin
    const result = await page.evaluate(async () => {
      const { ${className} } = await import('./index.js')
      const plugin = new ${className}()
      return {
        name: plugin.name,
        version: plugin.version
      }
    })
    
    expect(result.name).toBe('${config.name}')
    expect(result.version).toBe('1.0.0')
  })

  test('plugin respects CSP headers', async ({ page }) => {
    // Set strict CSP
    await page.route('**/*', (route) => {
      route.fulfill({
        headers: {
          'Content-Security-Policy': "default-src 'self'; script-src 'self'"
        }
      })
    })
    
    await page.goto('/test-harness.html')
    
    // Plugin should still work under CSP
    const works = await page.evaluate(async () => {
      try {
        const { ${className} } = await import('./index.js')
        new ${className}()
        return true
      } catch {
        return false
      }
    })
    
    expect(works).toBe(true)
  })

  test('plugin works in Web Worker context', async ({ page }) => {
    await page.goto('/test-harness.html')
    
    const result = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const worker = new Worker(
          URL.createObjectURL(new Blob([\`
            importScripts('./index.js');
            const plugin = new ${className}();
            postMessage({ name: plugin.name });
          \`], { type: 'application/javascript' }))
        )
        
        worker.onmessage = (e) => resolve(e.data)
      })
    })
    
    expect(result).toEqual({ name: '${config.name}' })
  })
})
`
  }

  /**
   * Generate hook-specific test cases
   */
  private generateHookTests(config: PluginConfig): string {
    const tests: string[] = []

    if (config.hooks.includes('onInit')) {
      tests.push(`
  describe('onInit', () => {
    it('should initialize successfully', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      await plugin.onInit(mockContext)
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Initializing')
      )
    })

    it('should handle initialization errors gracefully', async () => {
      // Add error scenario test
    })
  })`)
    }

    if (config.hooks.includes('onSend')) {
      tests.push(`
  describe('onSend', () => {
    it('should process send payloads', async () => {
      const mockPayload: SendPayload = {
        input: { message: 'test' },
        metadata: {}
      }
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      await plugin.onSend(mockPayload, mockContext)
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Processing send')
      )
    })
  })`)
    }

    if (config.hooks.includes('onError')) {
      tests.push(`
  describe('onError', () => {
    it('should handle errors', async () => {
      const testError = new Error('Test error')
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      await plugin.onError(testError, mockContext)
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error'),
        testError
      )
    })
  })`)
    }

    if (config.hooks.includes('onShutdown')) {
      tests.push(`
  describe('onShutdown', () => {
    it('should cleanup on shutdown', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      await plugin.onShutdown(mockContext)
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Shutting down')
      )
    })
  })`)
    }

    return tests.join('\n')
  }
}