import { PluginConfig } from '../types'

// Import modular generators
import { PluginCodeGenerator } from './generators/PluginCodeGenerator'
import { PluginTestGenerator } from './generators/PluginTestGenerator'
import { PluginConfigGenerator } from './generators/PluginConfigGenerator'
import { PluginToolingGenerator } from './generators/PluginToolingGenerator'
import { PluginDocumentationGenerator } from './generators/PluginDocumentationGenerator'

/**
 * Plugin template generation result
 */
export interface PluginTemplateResult {
  code: {
    main: string
    tests: string
    integrationTests: string
    playwrightTests?: string
  }
  config: {
    packageJson: any
    pluginJson: any
    tsConfig: any
    tsupConfig: string
  }
  tooling: {
    eslintConfig: string
    prettierConfig: any
    gitignore: string
    lintStagedConfig: any
    vitestConfig: string
    playwrightConfig?: string
    editorConfig: string
    githubWorkflow: string
  }
  documentation: {
    readme: string
    changelog: string
    contributing: string
    license: string
  }
}

/**
 * Refactored PluginTemplate - Main orchestrator for plugin generation
 * 
 * Coordinates specialized generators to create comprehensive plugin scaffolding:
 * - PluginCodeGenerator: Main plugin code and types
 * - PluginTestGenerator: Test suites and fixtures
 * - PluginConfigGenerator: Configuration files (package.json, tsconfig, etc.)
 * - PluginToolingGenerator: Development tooling (ESLint, Prettier, etc.)
 * - PluginDocumentationGenerator: Documentation files (README, CHANGELOG, etc.)
 */
export class PluginTemplate {
  private codeGenerator = new PluginCodeGenerator()
  private testGenerator = new PluginTestGenerator()
  private configGenerator = new PluginConfigGenerator()
  private toolingGenerator = new PluginToolingGenerator()
  private docGenerator = new PluginDocumentationGenerator()

  /**
   * Generate complete plugin scaffolding
   */
  generate(config: PluginConfig): string {
    // For backward compatibility, return the main plugin code
    return this.codeGenerator.generatePluginCode(config)
  }

  /**
   * Generate comprehensive plugin scaffolding with all files
   */
  generateComplete(config: PluginConfig): PluginTemplateResult {
    return {
      code: {
        main: this.codeGenerator.generatePluginCode(config),
        tests: this.testGenerator.generateTests(config),
        integrationTests: this.testGenerator.generateIntegrationTests(config),
        ...(config.browserSafe && {
          playwrightTests: this.testGenerator.generatePlaywrightTests(config)
        })
      },
      config: {
        packageJson: this.configGenerator.generatePackageJson(config),
        pluginJson: this.configGenerator.generatePluginJson(config),
        tsConfig: this.configGenerator.generateTsConfig(config),
        tsupConfig: this.configGenerator.generateTsupConfig(config)
      },
      tooling: {
        eslintConfig: this.toolingGenerator.generateEslintConfig(config),
        prettierConfig: this.toolingGenerator.generatePrettierConfig(),
        gitignore: this.toolingGenerator.generateGitignore(),
        lintStagedConfig: this.toolingGenerator.generateLintStagedConfig(),
        vitestConfig: this.toolingGenerator.generateVitestConfig(config),
        ...(config.browserSafe && {
          playwrightConfig: this.toolingGenerator.generatePlaywrightConfig(config)
        }),
        editorConfig: this.toolingGenerator.generateEditorConfig(),
        githubWorkflow: this.toolingGenerator.generateGithubWorkflow(config)
      },
      documentation: {
        readme: this.docGenerator.generateReadme(config),
        changelog: this.docGenerator.generateChangelog(config),
        contributing: this.docGenerator.generateContributing(config),
        license: this.docGenerator.generateLicense(config)
      }
    }
  }

  /**
   * Generate specific test types
   */
  generateTests(config: PluginConfig): string {
    return this.testGenerator.generateTests(config)
  }

  generateIntegrationTests(config: PluginConfig): string {
    return this.testGenerator.generateIntegrationTests(config)
  }

  generatePlaywrightTests(config: PluginConfig): string {
    return this.testGenerator.generatePlaywrightTests(config)
  }

  /**
   * Generate specific configuration files
   */
  generatePluginJson(config: PluginConfig): any {
    return this.configGenerator.generatePluginJson(config)
  }

  generatePackageJson(config: PluginConfig): any {
    return this.configGenerator.generatePackageJson(config)
  }

  generateTsConfig(config: PluginConfig): any {
    return this.configGenerator.generateTsConfig(config)
  }

  /**
   * Generate specific tooling files
   */
  generateEslintConfig(config: PluginConfig): string {
    return this.toolingGenerator.generateEslintConfig(config)
  }

  generatePrettierConfig(): any {
    return this.toolingGenerator.generatePrettierConfig()
  }

  generateGitignore(): string {
    return this.toolingGenerator.generateGitignore()
  }

  generateLintStagedConfig(): any {
    return this.toolingGenerator.generateLintStagedConfig()
  }

  generateVitestConfig(config: PluginConfig): string {
    return this.toolingGenerator.generateVitestConfig(config)
  }

  generatePlaywrightConfig(config: PluginConfig): string {
    return this.toolingGenerator.generatePlaywrightConfig(config)
  }

  /**
   * Generate specific documentation files
   */
  generateReadme(config: PluginConfig): string {
    return this.docGenerator.generateReadme(config)
  }

  generateChangelog(config: PluginConfig): string {
    return this.docGenerator.generateChangelog(config)
  }

  generateContributing(config: PluginConfig): string {
    return this.docGenerator.generateContributing(config)
  }

  /**
   * Legacy method aliases for backward compatibility
   */
  generateConfigSchema(options: { name: string; configFields: any[] }): string {
    return this.docGenerator.generateConfigSchema(options)
  }
}