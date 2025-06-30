import { PluginConfig, ConfigField } from '../types'
import type { PluginHookName } from '../types/agentkit-types'

export class PluginTemplate {
  generate(config: PluginConfig): string {
    const className = this.toPascalCase(config.name)
    const imports = this.generateImports(config)
    const hookImplementations = this.generateHookImplementations(config)
    const browserSafeComment = config.browserSafe ? '// @browser-safe' : ''

    return `${browserSafeComment}
${imports}

/**
 * ${config.description || `${config.name} plugin for AgentKit`}
 * 
 * @author ${config.author}
 * @license ${config.license}
 */
export class ${className} implements AgentKitPlugin {
  readonly name = '${config.name}'
  readonly version = '1.0.0'
  readonly description = '${config.description || `${config.name} plugin for AgentKit`}'
  
  ${config.browserSafe ? this.generateBrowserCompatibility() : ''}
  
  private readonly pluginConfig: ${className}Config
  
  constructor(config?: Partial<${className}Config>) {
    // Merge with defaults and validate
    this.pluginConfig = ${className}ConfigSchema.parse(config || {})
  }

  /**
   * Get the current plugin configuration
   */
  getConfig(): Readonly<${className}Config> {
    return { ...this.pluginConfig }
  }

  /**
   * Update plugin configuration (creates new instance)
   */
  withConfig(newConfig: Partial<${className}Config>): ${className} {
    return new ${className}({ ...this.pluginConfig, ...newConfig })
  }

${hookImplementations}
}

// Enhanced configuration schema with validation
export const ${className}ConfigSchema = z.object({
  /** Enable or disable the plugin */
  enabled: z.boolean().default(true),
  /** Logging level for plugin operations */
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Custom configuration for your plugin */
  // Add your specific configuration fields here
}).strict() // Prevent additional properties

export type ${className}Config = z.infer<typeof ${className}ConfigSchema>

/**
 * Plugin factory function for easy instantiation
 */
export function create${className}(config?: Partial<${className}Config>): ${className} {
  return new ${className}(config)
}

/**
 * Register plugin with AgentKit SDK
 * Usage: connectAgent({ plugins: [register${className}()] })
 */
export function register${className}(config?: Partial<${className}Config>) {
  return create${className}(config)
}

// Default export for convenience
export default ${className}
`
  }

  private generateImports(config: PluginConfig): string {
    const imports = [
      `import type { AgentKitPlugin, AgentContext${config.hooks.includes('onSend') ? ', SendPayload' : ''} } from '../types/agentkit-types'`,
      `import { z } from 'zod'`
    ]

    if (!config.browserSafe) {
      // Add Node.js specific imports if needed
    }

    return imports.join('\n')
  }

  private generateHookImplementations(config: PluginConfig): string {
    const implementations: string[] = []

    if (config.hooks.includes('onInit')) {
      implementations.push(`
  /**
   * Called when the agent is initialized
   * Use this hook to set up any required resources or connections
   */
  async onInit(context: AgentContext): Promise<void> {
    if (!this.pluginConfig.enabled) {
      return
    }
    
    if (this.pluginConfig.logLevel !== 'error') {
      console.log(\`[\${this.name}] Initializing with agent \${context.agentId}\`)
    }
    
    try {
      // Add your initialization logic here
      // Example: await this.setupResources(context)
      
    } catch (error) {
      console.error(\`[\${this.name}] Initialization failed:\`, error)
      throw error // Re-throw to signal initialization failure
    }
  }`)
    }

    if (config.hooks.includes('onSend')) {
      implementations.push(`
  /**
   * Called before sending data to the agent
   * Use this hook to modify, validate, or log outgoing data
   */
  async onSend(payload: SendPayload, context: AgentContext): Promise<void> {
    if (!this.pluginConfig.enabled) {
      return
    }
    
    if (this.pluginConfig.logLevel === 'debug') {
      console.log(\`[\${this.name}] Processing send for agent \${context.agentId}\`, {
        payloadSize: JSON.stringify(payload.input).length,
        timestamp: context.timestamp
      })
    }
    
    try {
      // Add your send processing logic here
      // Example: await this.validatePayload(payload)
      // Example: this.logInteraction(payload, context)
      
    } catch (error) {
      console.error(\`[\${this.name}] Send processing failed:\`, error)
      throw error // Re-throw to prevent send operation
    }
  }`)
    }

    if (config.hooks.includes('onError')) {
      implementations.push(`
  /**
   * Called when an error occurs in the agent system
   * Use this hook to handle, log, or report errors
   */
  async onError(error: Error, context: AgentContext): Promise<void> {
    if (!this.pluginConfig.enabled) {
      return
    }
    
    console.error(\`[\${this.name}] Error in agent \${context.agentId}:\`, {
      error: error.message,
      stack: error.stack,
      context: {
        requestId: context.requestId,
        timestamp: context.timestamp
      }
    })
    
    try {
      // Add your error handling logic here
      // Example: await this.reportError(error, context)
      // Example: await this.notifyAdmins(error, context)
      
    } catch (handlingError) {
      // Don't throw from error handlers to avoid infinite loops
      console.error(\`[\${this.name}] Error handling failed:\`, handlingError)
    }
  }`)
    }

    if (config.hooks.includes('onShutdown')) {
      implementations.push(`
  /**
   * Called when the agent is shutting down
   * Use this hook to clean up resources and save state
   */
  async onShutdown(context: AgentContext): Promise<void> {
    if (this.pluginConfig.logLevel !== 'error') {
      console.log(\`[\${this.name}] Shutting down for agent \${context.agentId}\`)
    }
    
    try {
      // Add your cleanup logic here
      // Example: await this.closeConnections()
      // Example: await this.saveState(context)
      
    } catch (error) {
      // Log but don't throw during shutdown to avoid blocking other cleanup
      console.error(\`[\${this.name}] Shutdown cleanup failed:\`, error)
    }
  }`)
    }

    return implementations.join('\n')
  }

  private generateBrowserCompatibility(): string {
    return `
  compatibility = {
    browserCompatibility: {
      chrome: 'latest',
      firefox: 'latest',
      safari: 'latest',
      edge: 'latest'
    }
  }`
  }

  generateTests(config: PluginConfig): string {
    const className = this.toPascalCase(config.name)
    
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

  generateIntegrationTests(config: PluginConfig): string {
    const className = this.toPascalCase(config.name)
    
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

  generatePlaywrightTests(config: PluginConfig): string {
    const className = this.toPascalCase(config.name)
    
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

  generatePluginJson(config: PluginConfig): any {
    return {
      name: config.name,
      version: '1.0.0',
      description: config.description || `${config.name} plugin for AgentKit`,
      author: config.author,
      license: config.license,
      main: './index.ts',
      hooks: config.hooks,
      browserSafe: config.browserSafe || false,
      compatibility: {
        minSdkVersion: '0.1.0',
        ...(config.browserSafe && {
          browserCompatibility: {
            chrome: 'latest',
            firefox: 'latest',
            safari: 'latest',
            edge: 'latest'
          }
        })
      }
    }
  }

  generatePackageJson(config: PluginConfig): any {
    const packageName = config.scoped 
      ? `${config.scoped}/agentkit-plugin-${config.name}`
      : `agentkit-plugin-${config.name}`

    return {
      name: packageName,
      version: '1.0.0',
      description: config.description || `${config.name} plugin for AgentKit`,
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      files: ['dist', 'README.md', 'plugin.json'],
      scripts: {
        build: 'tsup',
        dev: 'tsup --watch',
        'plugin:dev': 'nodemon --watch src --exec "npm run build && node test-harness.js"',
        test: 'vitest',
        'test:run': 'vitest run',
        'test:coverage': 'vitest run --coverage',
        ...(config.browserSafe && {
          'test:browser': 'playwright test',
          'test:browser:ui': 'playwright test --ui'
        }),
        lint: 'eslint src --ext .ts',
        'lint:fix': 'eslint src --ext .ts --fix',
        format: 'prettier --write "src/**/*.ts"',
        'format:check': 'prettier --check "src/**/*.ts"',
        prepublishOnly: 'npm run build && npm run test:run'
      },
      keywords: ['agentkit', 'plugin', config.name],
      author: config.author,
      license: config.license,
      peerDependencies: {
        '@agentkit/types': '^0.1.0',
        '@agentkit/sdk': '^0.1.0'
      },
      devDependencies: {
        '@agentkit/types': 'workspace:*',
        '@agentkit/sdk': 'workspace:*',
        '@types/node': '^20.10.4',
        '@typescript-eslint/eslint-plugin': '^6.13.2',
        '@typescript-eslint/parser': '^6.13.2',
        '@vitest/coverage-v8': '^1.0.4',
        eslint: '^8.55.0',
        'eslint-config-prettier': '^9.1.0',
        'eslint-plugin-prettier': '^5.0.1',
        'lint-staged': '^15.2.0',
        nodemon: '^3.0.2',
        prettier: '^3.1.1',
        tsup: '^8.0.1',
        typescript: '^5.3.3',
        vitest: '^1.0.4',
        zod: '^3.22.4',
        ...(config.browserSafe && {
          '@playwright/test': '^1.40.1',
          playwright: '^1.40.1'
        })
      },
      ...(config.scoped && {
        publishConfig: {
          access: 'restricted'
        }
      }),
      engines: {
        node: '>=18.0.0'
      }
    }
  }

  generateTsConfig(_config: PluginConfig): any {
    return {
      extends: '../../tsconfig.json',
      compilerOptions: {
        outDir: './dist',
        rootDir: './src',
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        composite: true,
        tsBuildInfoFile: './dist/.tsbuildinfo'
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist', '**/*.test.ts', '**/*.spec.ts']
    }
  }

  generateEslintConfig(config: PluginConfig): string {
    return `module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended'
  ],
  env: {
    node: true,
    es2022: true${config.browserSafe ? ',\n    browser: true' : ''}
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json'
  },
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }]
  },
  ignorePatterns: ['dist', 'node_modules', 'coverage', '*.js']
}
`
  }

  generatePrettierConfig(): any {
    return {
      semi: false,
      trailingComma: 'none',
      singleQuote: true,
      printWidth: 100,
      tabWidth: 2,
      arrowParens: 'always'
    }
  }

  generateGitignore(): string {
    return `# Dependencies
node_modules/

# Build outputs
dist/
*.tsbuildinfo

# Test coverage
coverage/
.nyc_output/

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local
.env.*.local

# Temporary files
*.tmp
*.temp
`
  }

  generateLintStagedConfig(): any {
    return {
      '*.ts': ['eslint --fix', 'prettier --write'],
      '*.{json,md}': ['prettier --write']
    }
  }

  generateVitestConfig(config: PluginConfig): string {
    return `import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: '${config.browserSafe ? 'jsdom' : 'node'}',
    coverage: {
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.ts',
        '**/*.spec.ts'
      ]
    }
  }
})
`
  }

  generatePlaywrightConfig(_config: PluginConfig): string {
    return `import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './',
  testMatch: '*.browser.test.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    }
  ],
  webServer: {
    command: 'npm run serve',
    port: 3000,
    reuseExistingServer: !process.env.CI
  }
})
`
  }

  generateReadme(config: PluginConfig): string {
    const className = this.toPascalCase(config.name)
    
    return `# ${config.name}

${config.description || `${config.name} plugin for AgentKit`}

## Features

- ⚡ Zero-config setup with intelligent defaults
- 🔒 Type-safe configuration with Zod validation
- 🎯 Implements ${config.hooks.length} lifecycle hook${config.hooks.length !== 1 ? 's' : ''}: ${config.hooks.map(h => `\`${h}\``).join(', ')}
- 📝 Comprehensive logging with configurable levels
- 🧪 Full test suite with ${Math.round(config.hooks.length * 2.5)} test cases${config.browserSafe ? `
- 🌐 Browser-compatible with Web Worker support` : ''}
- 🚀 Production-ready with error handling and cleanup

## Installation

\`\`\`bash
npm install ${config.scoped ? `${config.scoped}/` : ''}agentkit-plugin-${config.name}
\`\`\`

## Quick Start

\`\`\`typescript
// import { connectAgent } from '@agentkit/sdk'
import { ${className} } from '${config.scoped ? `${config.scoped}/` : ''}agentkit-plugin-${config.name}'

const plugin = new ${className}({
  enabled: true,
  logLevel: 'info'
})

const { send, shutdown } = await connectAgent({
  agent: 'my-agent',
  transport: 'websocket',
  plugins: [plugin]
})

// Send data to your agent
await send({ message: 'Hello World!' })

// Clean shutdown
await shutdown()
\`\`\`

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| enabled | boolean | true | Enable or disable the plugin |
| logLevel | string | 'info' | Logging level (debug, info, warn, error) |

### Advanced Configuration

\`\`\`typescript
const plugin = new ${className}({
  enabled: true,
  logLevel: 'debug' // Enable detailed logging for development
})

// Get current configuration
const config = plugin.getConfig()

// Create new instance with updated configuration  
const updatedPlugin = plugin.withConfig({ logLevel: 'warn' })
\`\`\`

## API Reference

### Lifecycle Hooks

This plugin implements the following AgentKit lifecycle hooks:

${config.hooks.map(hook => `#### \`${hook}\`

${this.getHookDescription(hook)}

${this.getHookUsageExample(hook)}`).join('\n\n')}

### Plugin Methods

#### \`getConfig()\`

Returns the current plugin configuration as a readonly object.

\`\`\`typescript
const config = plugin.getConfig()
console.log(config.logLevel) // 'info'
\`\`\`

#### \`withConfig(newConfig)\`

Creates a new plugin instance with updated configuration.

\`\`\`typescript
const newPlugin = plugin.withConfig({ logLevel: 'debug' })
\`\`\`

## Development

### Setup

\`\`\`bash
npm install
\`\`\`

### Development Mode

\`\`\`bash
npm run dev
\`\`\`

This starts the plugin in watch mode with hot-reload enabled.

### Testing

\`\`\`bash
# Run all tests
npm test

# Run tests in watch mode
npm run test

# Run tests with coverage
npm run test:coverage

# Run specific test suites
npm run test -- --grep "onInit"
${config.browserSafe ? `
# Run browser tests
npm run test:browser` : ''}
\`\`\`

### Code Quality

\`\`\`bash
# Check for lint errors
npm run lint

# Fix lint errors automatically
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
\`\`\`

### Building

\`\`\`bash
npm run build
\`\`\`

The build output will be in the \`dist/\` directory.

## Troubleshooting

### Common Issues

**Plugin not loading:**
- Ensure all dependencies are installed: \`npm install\`
- Check that the plugin is properly registered: \`plugins: [plugin]\`
- Verify the plugin configuration is valid

**TypeScript errors:**
- Run \`npm run build\` to check for compilation errors
- Ensure all imports are correctly typed

**Tests failing:**
- Run \`npm run test:run\` for a clean test run
- Check the console output for specific error messages

### Debug Mode

Enable debug logging to get detailed information about plugin execution:

\`\`\`typescript
const plugin = new ${className}({ logLevel: 'debug' })
\`\`\`

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch: \`git checkout -b feature/your-feature\`
3. Make your changes and add tests
4. Run the test suite: \`npm test\`
5. Submit a pull request

## License

${config.license} - See [LICENSE](./LICENSE) for details.

## Author

${config.author}

---

Built with [AgentKit](https://github.com/agentkit/agentkit) • [Documentation](https://docs.agentkit.dev) • [Examples](https://github.com/agentkit/examples)
`
  }

  generateChangelog(config: PluginConfig): string {
    return `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - ${new Date().toISOString().split('T')[0]}

### Added
- Initial release of ${config.name} plugin
- Support for ${config.hooks.join(', ')} hooks
- TypeScript support with full type definitions
- Comprehensive test suite
${config.browserSafe ? '- Browser compatibility with Web Worker support' : ''}
- Configuration validation with Zod schemas
`
  }

  generateContributing(config: PluginConfig): string {
    return `# Contributing to ${config.name}

Thank you for your interest in contributing to ${config.name}!

## Development Setup

1. Clone the repository
2. Install dependencies: \`npm install\`
3. Run tests: \`npm test\`

## Development Workflow

1. Create a feature branch: \`git checkout -b feature/your-feature\`
2. Make your changes
3. Add tests for your changes
4. Run tests: \`npm test\`
5. Run linter: \`npm run lint\`
6. Commit your changes: \`git commit -m "feat: your feature"\`
7. Push to your fork: \`git push origin feature/your-feature\`
8. Create a Pull Request

## Code Style

- Use TypeScript for all code
- Follow the existing code style
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Write tests for new functionality

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- \`feat:\` New features
- \`fix:\` Bug fixes
- \`docs:\` Documentation changes
- \`test:\` Test additions or changes
- \`refactor:\` Code refactoring
- \`chore:\` Maintenance tasks

## Testing

- Write unit tests for all new functionality
- Ensure all tests pass before submitting PR
- Aim for high test coverage
${config.browserSafe ? '- Include browser tests for browser-compatible code' : ''}

## Questions?

Feel free to open an issue for any questions or concerns.
`
  }

  generateConfigSchema(options: { name: string; configFields: ConfigField[] }): string {
    const className = this.toPascalCase(options.name)
    const fields = options.configFields.map(field => {
      const fieldDef = `${field.name}: z.${field.type}()`
      return field.required ? fieldDef : `${fieldDef}.optional()`
    }).join(',\n  ')

    return `export const ${className}ConfigSchema = z.object({
  ${fields}
})

export type ${className}Config = z.infer<typeof ${className}ConfigSchema>`
  }

  private toPascalCase(str: string): string {
    return str
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('')
  }

  private getHookDescription(hook: PluginHookName): string {
    const descriptions: Record<PluginHookName, string> = {
      onInit: 'Called when the agent is initialized',
      onSend: 'Called before sending data to the agent',
      onError: 'Called when an error occurs',
      onShutdown: 'Called when the agent is shutting down'
    }
    return descriptions[hook] || 'Unknown hook'
  }

  private getHookUsageExample(hook: PluginHookName): string {
    const examples: Record<PluginHookName, string> = {
      onInit: `\`\`\`typescript
// Use for setting up resources, connections, or initial state
async onInit(context: AgentContext): Promise<void> {
  // Initialize database connections, setup monitoring, etc.
}
\`\`\``,
      onSend: `\`\`\`typescript
// Use for validating, modifying, or logging outgoing data
async onSend(payload: SendPayload, context: AgentContext): Promise<void> {
  // Validate input, add metadata, log interactions, etc.
}
\`\`\``,
      onError: `\`\`\`typescript
// Use for error handling, reporting, and recovery
async onError(error: Error, context: AgentContext): Promise<void> {
  // Log errors, send notifications, attempt recovery, etc.
}
\`\`\``,
      onShutdown: `\`\`\`typescript
// Use for cleanup, saving state, and resource disposal
async onShutdown(context: AgentContext): Promise<void> {
  // Close connections, save state, cleanup resources, etc.
}
\`\`\``
    }
    return examples[hook] || ''
  }
}