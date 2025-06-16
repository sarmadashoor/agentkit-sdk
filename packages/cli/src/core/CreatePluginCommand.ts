import fs from 'fs-extra'
import path from 'path'
import { PluginTemplate } from '../templates/PluginTemplate'
import { EnhancedPluginTemplate } from '../templates/EnhancedPluginTemplate'
import { PluginConfig } from '../types'

export class CreatePluginCommand {
  private template: PluginTemplate
  private enhancedTemplate: EnhancedPluginTemplate

  constructor() {
    this.template = new PluginTemplate()
    this.enhancedTemplate = new EnhancedPluginTemplate()
  }

  async execute(config: PluginConfig): Promise<void> {
    const pluginDir = path.join(process.cwd(), 'plugins', config.name)

    // Create plugin directory
    await fs.ensureDir(pluginDir)

    // Generate all files
    await this.generatePluginFiles(pluginDir, config)
    await this.generateTestFiles(pluginDir, config)
    await this.generateConfigFiles(pluginDir, config)
    await this.generateDocumentation(pluginDir, config)

    // Set up git
    await this.initializeGit(pluginDir)

    // Auto-register if possible
    await this.tryAutoRegister(config.name)
  }

  private async generatePluginFiles(pluginDir: string, config: PluginConfig): Promise<void> {
    // Choose template based on debug/DX features
    const useEnhanced = config.withDebug || config.withHotReload || config.withPerformance || config.template === 'enhanced' || config.template === 'advanced' || config.template === 'debug' || config.template === 'performance'
    const activeTemplate = useEnhanced ? this.enhancedTemplate : this.template
    
    // Main plugin file
    const pluginCode = activeTemplate.generate(config)
    await fs.writeFile(path.join(pluginDir, 'index.ts'), pluginCode)

    // Plugin metadata
    const pluginJson = this.template.generatePluginJson(config)
    await fs.writeFile(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify(pluginJson, null, 2)
    )

    // Package.json
    const packageJson = this.template.generatePackageJson(config)
    await fs.writeFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    )
  }

  private async generateTestFiles(pluginDir: string, config: PluginConfig): Promise<void> {
    if (!config.withTests) return

    // Unit tests
    const testCode = this.template.generateTests(config)
    await fs.writeFile(path.join(pluginDir, 'plugin.test.ts'), testCode)

    // Integration tests
    const integrationTests = this.template.generateIntegrationTests(config)
    await fs.writeFile(path.join(pluginDir, 'plugin.integration.test.ts'), integrationTests)

    // Playwright tests for browser-safe plugins
    if (config.browserSafe) {
      const playwrightTests = this.template.generatePlaywrightTests(config)
      await fs.writeFile(path.join(pluginDir, 'plugin.browser.test.ts'), playwrightTests)

      // Playwright config
      const playwrightConfig = this.template.generatePlaywrightConfig(config)
      await fs.writeFile(path.join(pluginDir, 'playwright.config.ts'), playwrightConfig)
    }

    // Vitest config
    const vitestConfig = this.template.generateVitestConfig(config)
    await fs.writeFile(path.join(pluginDir, 'vitest.config.ts'), vitestConfig)
  }

  private async generateConfigFiles(pluginDir: string, config: PluginConfig): Promise<void> {
    // TypeScript config
    const tsConfig = this.template.generateTsConfig(config)
    await fs.writeFile(
      path.join(pluginDir, 'tsconfig.json'),
      JSON.stringify(tsConfig, null, 2)
    )

    // ESLint config
    const eslintConfig = this.template.generateEslintConfig(config)
    await fs.writeFile(path.join(pluginDir, '.eslintrc.js'), eslintConfig)

    // Prettier config
    const prettierConfig = this.template.generatePrettierConfig()
    await fs.writeFile(
      path.join(pluginDir, '.prettierrc'),
      JSON.stringify(prettierConfig, null, 2)
    )

    // Git ignore
    const gitignore = this.template.generateGitignore()
    await fs.writeFile(path.join(pluginDir, '.gitignore'), gitignore)

    // Lint-staged config
    const lintStagedConfig = this.template.generateLintStagedConfig()
    await fs.writeFile(
      path.join(pluginDir, '.lintstagedrc.json'),
      JSON.stringify(lintStagedConfig, null, 2)
    )
  }

  private async generateDocumentation(pluginDir: string, config: PluginConfig): Promise<void> {
    // README
    const readme = this.template.generateReadme(config)
    await fs.writeFile(path.join(pluginDir, 'README.md'), readme)

    // CHANGELOG
    const changelog = this.template.generateChangelog(config)
    await fs.writeFile(path.join(pluginDir, 'CHANGELOG.md'), changelog)

    // Contributing guide
    const contributing = this.template.generateContributing(config)
    await fs.writeFile(path.join(pluginDir, 'CONTRIBUTING.md'), contributing)
  }

  private async initializeGit(pluginDir: string): Promise<void> {
    // Check if we're already in a git repo
    const isGitRepo = await fs.pathExists(path.join(pluginDir, '.git'))
    if (isGitRepo) return

    // Initialize git in plugin directory
    const { execSync } = require('child_process')
    try {
      execSync('git init', { cwd: pluginDir, stdio: 'pipe' })
    } catch (error) {
      // Git not available, skip
    }
  }

  private async tryAutoRegister(pluginName: string): Promise<void> {
    // Try to auto-register with plugin loader
    try {
      const registryPath = path.join(process.cwd(), 'packages', 'registry', 'src', 'plugin-loader.ts')
      if (await fs.pathExists(registryPath)) {
        // Emit event or update registry
        // This would be implemented based on the registry architecture
      }
    } catch (error) {
      // Auto-registration failed, skip silently
    }
  }
}