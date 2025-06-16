import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { execSync } from 'child_process'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { CreatePluginCommand } from '../src/commands/create-plugin'
import { PluginTemplate } from '../src/templates/PluginTemplate'

describe('Create Plugin CLI', () => {
  let tmpDir: string
  let originalCwd: string

  beforeEach(() => {
    // Create temporary directory for tests
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentkit-cli-test-'))
    originalCwd = process.cwd()
    process.chdir(tmpDir)
  })

  afterEach(() => {
    // Clean up
    process.chdir(originalCwd)
    fs.removeSync(tmpDir)
  })

  describe('CLI Command', () => {
    it('should create plugin with all required files', async () => {
      const pluginName = 'test-logger'
      const command = new CreatePluginCommand()
      
      await command.execute({
        name: pluginName,
        hooks: ['onInit', 'onSend'],
        author: 'Test Author',
        license: 'MIT'
      })

      // Check that all files were created
      expect(fs.existsSync(path.join('plugins', pluginName))).toBe(true)
      expect(fs.existsSync(path.join('plugins', pluginName, 'index.ts'))).toBe(true)
      expect(fs.existsSync(path.join('plugins', pluginName, 'plugin.test.ts'))).toBe(true)
      expect(fs.existsSync(path.join('plugins', pluginName, 'plugin.json'))).toBe(true)
      expect(fs.existsSync(path.join('plugins', pluginName, 'README.md'))).toBe(true)
      expect(fs.existsSync(path.join('plugins', pluginName, 'tsconfig.json'))).toBe(true)
      expect(fs.existsSync(path.join('plugins', pluginName, '.eslintrc.js'))).toBe(true)
      expect(fs.existsSync(path.join('plugins', pluginName, 'package.json'))).toBe(true)
    })

    it('should warn if plugin already exists', async () => {
      const pluginName = 'existing-plugin'
      const pluginDir = path.join('plugins', pluginName)
      
      // Create existing plugin directory
      fs.ensureDirSync(pluginDir)
      
      const command = new CreatePluginCommand()
      const consoleSpy = vi.spyOn(console, 'warn')
      
      await expect(command.execute({
        name: pluginName,
        hooks: ['onInit'],
        author: 'Test',
        license: 'MIT'
      })).rejects.toThrow(/already exists/)
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'))
    })

    it('should generate valid TypeScript that compiles', async () => {
      const pluginName = 'compile-test'
      const command = new CreatePluginCommand()
      
      await command.execute({
        name: pluginName,
        hooks: ['onInit', 'onError'],
        author: 'Test',
        license: 'MIT'
      })

      // Try to compile the generated TypeScript
      const pluginDir = path.join('plugins', pluginName)
      process.chdir(pluginDir)
      
      // Install dependencies and compile
      execSync('npm install', { stdio: 'pipe' })
      const compileResult = execSync('npx tsc --noEmit', { stdio: 'pipe' })
      
      // Should compile without errors
      expect(compileResult.toString()).toBe('')
    })

    it('should pass linting with no errors', async () => {
      const pluginName = 'lint-test'
      const command = new CreatePluginCommand()
      
      await command.execute({
        name: pluginName,
        hooks: ['onSend'],
        author: 'Test',
        license: 'MIT'
      })

      const pluginDir = path.join('plugins', pluginName)
      process.chdir(pluginDir)
      
      // Install and run linter
      execSync('npm install', { stdio: 'pipe' })
      const lintResult = execSync('npm run lint', { stdio: 'pipe' })
      
      // Should have no lint errors
      expect(lintResult.toString()).not.toContain('error')
    })
  })

  describe('Plugin Template', () => {
    it('should generate correct plugin interface implementation', () => {
      const template = new PluginTemplate()
      const code = template.generate({
        name: 'test-plugin',
        hooks: ['onInit', 'onSend', 'onError', 'onShutdown'],
        author: 'Test Author',
        description: 'Test plugin description'
      })

      // Check that all hooks are implemented
      expect(code).toContain('onInit(context: AgentContext)')
      expect(code).toContain('onSend(payload: SendPayload, context: AgentContext)')
      expect(code).toContain('onError(error: Error, context: AgentContext)')
      expect(code).toContain('onShutdown(context: AgentContext)')
      
      // Check imports
      expect(code).toContain("import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'")
      expect(code).toContain("import { z } from 'zod'")
    })

    it('should generate Zod validation schema', () => {
      const template = new PluginTemplate()
      const code = template.generateConfigSchema({
        name: 'config-plugin',
        configFields: [
          { name: 'apiKey', type: 'string', required: true },
          { name: 'endpoint', type: 'string', required: false },
          { name: 'retries', type: 'number', required: false }
        ]
      })

      expect(code).toContain('const ConfigSchema = z.object({')
      expect(code).toContain('apiKey: z.string()')
      expect(code).toContain('endpoint: z.string().optional()')
      expect(code).toContain('retries: z.number().optional()')
    })

    it('should generate browser-safe plugin when flag is set', () => {
      const template = new PluginTemplate()
      const code = template.generate({
        name: 'browser-plugin',
        hooks: ['onInit'],
        browserSafe: true,
        author: 'Test'
      })

      // Should not use any Node.js-specific APIs
      expect(code).not.toContain("require('fs')")
      expect(code).not.toContain("require('path')")
      expect(code).not.toContain('process.')
      
      // Should include browser compatibility marker
      expect(code).toContain('// @browser-safe')
      expect(code).toContain('compatibility: {')
      expect(code).toContain('browserCompatibility: {')
    })
  })

  describe('Test Template', () => {
    it('should generate comprehensive test suite', () => {
      const template = new PluginTemplate()
      const testCode = template.generateTests({
        name: 'test-plugin',
        hooks: ['onInit', 'onSend'],
        browserSafe: true
      })

      // Check test structure
      expect(testCode).toContain("describe('TestPlugin', () => {")
      expect(testCode).toContain("it('should initialize successfully'")
      expect(testCode).toContain("it('should handle onSend hook'")
      
      // Check imports
      expect(testCode).toContain("import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'")
      expect(testCode).toContain("import { TestPlugin } from './index'")
    })

    it('should include Playwright tests for browser-safe plugins', () => {
      const template = new PluginTemplate()
      const playwrightTests = template.generatePlaywrightTests({
        name: 'browser-plugin',
        hooks: ['onInit']
      })

      expect(playwrightTests).toContain("import { test, expect } from '@playwright/test'")
      expect(playwrightTests).toContain("test('plugin loads in browser environment'")
      expect(playwrightTests).toContain("test('plugin respects CSP headers'")
      expect(playwrightTests).toContain("test('plugin works in Web Worker context'")
    })
  })

  describe('CLI Flags', () => {
    it('should handle --with-tests flag', async () => {
      const command = new CreatePluginCommand()
      
      await command.execute({
        name: 'with-tests',
        hooks: ['onInit'],
        withTests: true,
        author: 'Test',
        license: 'MIT'
      })

      // Should create additional test files
      expect(fs.existsSync(path.join('plugins', 'with-tests', 'plugin.test.ts'))).toBe(true)
      expect(fs.existsSync(path.join('plugins', 'with-tests', 'plugin.integration.test.ts'))).toBe(true)
      expect(fs.existsSync(path.join('plugins', 'with-tests', 'vitest.config.ts'))).toBe(true)
    })

    it('should handle --browser-safe flag', async () => {
      const command = new CreatePluginCommand()
      
      await command.execute({
        name: 'browser-safe',
        hooks: ['onInit'],
        browserSafe: true,
        author: 'Test',
        license: 'MIT'
      })

      const pluginJson = fs.readJsonSync(path.join('plugins', 'browser-safe', 'plugin.json'))
      expect(pluginJson.browserSafe).toBe(true)
      expect(pluginJson.compatibility.browserCompatibility).toBeDefined()
      
      // Should include Playwright config
      expect(fs.existsSync(path.join('plugins', 'browser-safe', 'playwright.config.ts'))).toBe(true)
    })

    it('should handle --scoped flag', async () => {
      const command = new CreatePluginCommand()
      
      await command.execute({
        name: 'scoped-plugin',
        hooks: ['onInit'],
        scoped: '@myorg',
        author: 'Test',
        license: 'MIT'
      })

      const packageJson = fs.readJsonSync(path.join('plugins', 'scoped-plugin', 'package.json'))
      expect(packageJson.name).toBe('@myorg/agentkit-plugin-scoped-plugin')
      expect(packageJson.publishConfig).toEqual({ access: 'restricted' })
    })
  })

  describe('Developer Experience', () => {
    it('should create plugin in less than 90 seconds', async () => {
      const command = new CreatePluginCommand()
      const startTime = Date.now()
      
      await command.execute({
        name: 'performance-test',
        hooks: ['onInit', 'onSend', 'onError', 'onShutdown'],
        withTests: true,
        browserSafe: true,
        author: 'Test',
        license: 'MIT'
      })
      
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(90000) // 90 seconds
    })

    it('should generate helpful README with examples', async () => {
      const command = new CreatePluginCommand()
      
      await command.execute({
        name: 'readme-test',
        hooks: ['onInit'],
        author: 'Test',
        license: 'MIT'
      })

      const readme = fs.readFileSync(path.join('plugins', 'readme-test', 'README.md'), 'utf-8')
      
      // Check README contents
      expect(readme).toContain('# readme-test')
      expect(readme).toContain('## Installation')
      expect(readme).toContain('## Usage')
      expect(readme).toContain('## Configuration')
      expect(readme).toContain('## Development')
      expect(readme).toContain('## Testing')
      expect(readme).toContain('```typescript')
    })

    it('should include hot-reload setup for development', async () => {
      const command = new CreatePluginCommand()
      
      await command.execute({
        name: 'hot-reload',
        hooks: ['onInit'],
        author: 'Test',
        license: 'MIT'
      })

      const packageJson = fs.readJsonSync(path.join('plugins', 'hot-reload', 'package.json'))
      
      // Check development scripts
      expect(packageJson.scripts.dev).toContain('--watch')
      expect(packageJson.scripts['plugin:dev']).toBeDefined()
      expect(packageJson.devDependencies['nodemon']).toBeDefined()
    })
  })

  describe('Auto-registration', () => {
    it('should auto-register plugin if registry is watching', async () => {
      // Mock registry watcher
      const mockWatcher = {
        addPlugin: vi.fn()
      }
      vi.mock('../../registry/src/plugin-loader', () => ({
        PluginWatcher: vi.fn(() => mockWatcher)
      }))

      const command = new CreatePluginCommand()
      
      await command.execute({
        name: 'auto-register',
        hooks: ['onInit'],
        author: 'Test',
        license: 'MIT'
      })

      // Check if plugin was registered
      expect(mockWatcher.addPlugin).toHaveBeenCalledWith('auto-register')
    })
  })

  describe('Input Validation', () => {
    it('should validate plugin name', async () => {
      const command = new CreatePluginCommand()
      
      // Invalid names
      await expect(command.execute({
        name: '123-invalid',
        hooks: ['onInit'],
        author: 'Test',
        license: 'MIT'
      })).rejects.toThrow(/Invalid plugin name/)

      await expect(command.execute({
        name: 'my plugin', // spaces not allowed
        hooks: ['onInit'],
        author: 'Test',
        license: 'MIT'
      })).rejects.toThrow(/Invalid plugin name/)
    })

    it('should validate hook names', async () => {
      const command = new CreatePluginCommand()
      
      await expect(command.execute({
        name: 'valid-name',
        hooks: ['onInit', 'invalidHook'],
        author: 'Test',
        license: 'MIT'
      })).rejects.toThrow(/Invalid hook name/)
    })
  })
})