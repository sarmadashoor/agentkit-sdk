/**
 * Create Plugin Command - AgentKit CLI
 * 
 * Simple implementation that creates a basic plugin structure
 */

import * as fs from 'fs-extra'
import * as path from 'path'
import * as readline from 'readline-sync'

interface CreatePluginOptions {
  name?: string
  skipPrompts?: boolean
  withTests?: boolean
  withDocs?: boolean
}

export async function runCreatePluginCommand(args: string[], options: CreatePluginOptions = {}): Promise<void> {
  const styles = {
    cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
    green: (text: string) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
    red: (text: string) => `\x1b[31m${text}\x1b[0m`,
    bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
    dim: (text: string) => `\x1b[2m${text}\x1b[0m`
  }

  console.log(styles.cyan('\n🛠️  Creating a new AgentKit plugin...\n'))
  
  // Get plugin name
  let pluginName = options.name || args[0]
  if (!pluginName && !options.skipPrompts) {
    pluginName = readline.question('Plugin name: ')
  }
  
  if (!pluginName || pluginName.trim() === '') {
    console.log(styles.red('❌ Plugin name is required'))
    process.exit(1)
  }
  
  // Validate plugin name
  if (!/^[a-z][a-z0-9-]*$/.test(pluginName)) {
    console.log(styles.red('❌ Plugin name must be lowercase, start with a letter, and contain only letters, numbers, and hyphens'))
    process.exit(1)
  }
  
  const pluginDir = path.join(process.cwd(), pluginName)
  
  // Check if directory already exists
  if (await fs.pathExists(pluginDir)) {
    console.log(styles.red(`❌ Directory "${pluginName}" already exists`))
    process.exit(1)
  }
  
  try {
    console.log(styles.dim(`📁 Creating directory: ${pluginDir}`))
    await fs.ensureDir(pluginDir)
    
    console.log(styles.dim('📝 Creating plugin files...'))
    
    // Create index.ts
    await createIndexFile(pluginDir, pluginName)
    
    // Create plugin.json
    await createPluginJson(pluginDir, pluginName)
    
    // Create README.md
    await createReadme(pluginDir, pluginName)
    
    // Create package.json
    await createPackageJson(pluginDir, pluginName)
    
    // Create test files if requested
    if (options.withTests) {
      await createTestFiles(pluginDir, pluginName)
    }
    
    // Create documentation if requested
    if (options.withDocs) {
      await createDocumentationFiles(pluginDir, pluginName)
    }
    
    console.log(styles.green('\n✅ Plugin created successfully!'))
    console.log(styles.cyan('\n📋 Next steps:\n'))
    console.log(`  ${styles.dim('$')} cd ${pluginName}`)
    console.log(`  ${styles.dim('$')} npm install`)
    console.log(`  ${styles.dim('$')} npm test`)
    console.log('')
    console.log(styles.green('📖 Check README.md for usage instructions\n'))
    
  } catch (error) {
    console.log(styles.red('❌ Error creating plugin:'), error.message)
    process.exit(1)
  }
}

async function createIndexFile(pluginDir: string, pluginName: string): Promise<void> {
  const className = toPascalCase(pluginName)
  const content = `import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'

/**
 * ${pluginName} plugin for AgentKit
 * 
 * This plugin demonstrates the basic AgentKit plugin interface.
 */
export class ${className}Plugin implements AgentKitPlugin {
  readonly name = '${pluginName}'
  readonly version = '1.0.0'
  readonly description = '${pluginName} plugin for AgentKit'
  
  /**
   * Called when the agent is initialized
   */
  async onInit(context: AgentContext): Promise<void> {
    console.log(\`[\${this.name}] Plugin initialized for agent \${context.agentId}\`)
  }
  
  /**
   * Called before sending data to the agent
   */
  async onSend(payload: SendPayload, context: AgentContext): Promise<SendPayload> {
    console.log(\`[\${this.name}] Processing send for agent \${context.agentId}\`)
    
    // Add plugin metadata to the payload
    return {
      ...payload,
      metadata: {
        ...payload.metadata,
        processedBy: this.name,
        timestamp: Date.now()
      }
    }
  }
  
  /**
   * Called when an error occurs
   */
  async onError(error: Error, context: AgentContext): Promise<void> {
    console.log(\`[\${this.name}] Error in agent \${context.agentId}:\`, error.message)
  }
  
  /**
   * Called when the agent is shutting down
   */
  async onShutdown(context: AgentContext): Promise<void> {
    console.log(\`[\${this.name}] Plugin shutting down for agent \${context.agentId}\`)
  }
}

// Default export for convenience
const plugin = new ${className}Plugin()
export default plugin
`
  
  await fs.writeFile(path.join(pluginDir, 'index.ts'), content)
}

async function createPluginJson(pluginDir: string, pluginName: string): Promise<void> {
  const metadata = {
    name: pluginName,
    version: '1.0.0',
    description: `${pluginName} plugin for AgentKit`,
    main: './index.ts',
    hooks: ['onInit', 'onSend', 'onError', 'onShutdown'],
    author: 'Your Name',
    license: 'MIT',
    keywords: ['agentkit', 'plugin'],
    signature: {
      algorithm: 'HMAC-SHA256',
      timestamp: Date.now()
    }
  }
  
  await fs.writeFile(
    path.join(pluginDir, 'plugin.json'), 
    JSON.stringify(metadata, null, 2)
  )
}

async function createReadme(pluginDir: string, pluginName: string): Promise<void> {
  const className = toPascalCase(pluginName)
  const content = `# ${pluginName}

A simple AgentKit plugin that demonstrates basic functionality.

## Features

- ⚡ Zero-config setup
- 🎯 Implements onInit, onSend, onError, and onShutdown hooks
- 📝 TypeScript support
- 🧪 Test suite included

## Installation

\`\`\`bash
npm install
\`\`\`

## Usage

\`\`\`typescript
import { connectAgent } from '@agentkit/sdk'
import ${pluginName}Plugin from './'

const { send, shutdown } = await connectAgent({
  agent: 'my-agent',
  transport: 'websocket',
  plugins: [${pluginName}Plugin]
})

// Send a message
await send({ message: 'Hello World!' })

// Clean shutdown
await shutdown()
\`\`\`

## Development

\`\`\`bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Build
npm run build

# Lint
npm run lint
\`\`\`

## Plugin Hooks

### onInit(context)

Called when the agent is initialized. Use this for setup tasks.

### onSend(payload, context)

Called before sending data to the agent. You can modify the payload here.

**Parameters:**
- \`payload\`: The data being sent
- \`context\`: Agent context information

**Returns:** Modified payload

### onError(error, context)

Called when an error occurs in the agent.

### onShutdown(context)

Called when the agent is shutting down. Use for cleanup tasks.

## License

MIT
`
  
  await fs.writeFile(path.join(pluginDir, 'README.md'), content)
}

async function createPackageJson(pluginDir: string, pluginName: string): Promise<void> {
  const packageJson = {
    name: pluginName,
    version: '1.0.0',
    description: `${pluginName} plugin for AgentKit`,
    main: 'index.ts',
    types: 'index.ts',
    scripts: {
      test: 'vitest',
      'test:run': 'vitest run',
      'test:watch': 'vitest --watch',
      build: 'tsc',
      lint: 'eslint .',
      'lint:fix': 'eslint . --fix'
    },
    dependencies: {
      '@agentkit/types': '^0.1.0-alpha'
    },
    devDependencies: {
      '@types/node': '^20.0.0',
      'typescript': '^5.0.0',
      'vitest': '^1.0.0',
      'eslint': '^8.55.0',
      '@typescript-eslint/eslint-plugin': '^6.0.0',
      '@typescript-eslint/parser': '^6.0.0'
    },
    engines: {
      node: '>=18.0.0'
    },
    keywords: ['agentkit', 'plugin'],
    author: 'Your Name',
    license: 'MIT'
  }
  
  await fs.writeFile(
    path.join(pluginDir, 'package.json'), 
    JSON.stringify(packageJson, null, 2)
  )
}

async function createTestFiles(pluginDir: string, pluginName: string): Promise<void> {
  const testDir = path.join(pluginDir, '__tests__')
  await fs.ensureDir(testDir)
  
  const className = toPascalCase(pluginName)
  const content = `import { describe, it, expect, vi } from 'vitest'
import { ${className}Plugin } from '../index'
import type { AgentContext, SendPayload } from '@agentkit/types'

describe('${className}Plugin', () => {
  let plugin: ${className}Plugin
  let mockContext: AgentContext
  
  beforeEach(() => {
    plugin = new ${className}Plugin()
    mockContext = {
      agentId: 'test-agent',
      transportId: 'test-transport',
      requestId: 'req-123',
      timestamp: Date.now()
    }
  })
  
  it('should have correct metadata', () => {
    expect(plugin.name).toBe('${pluginName}')
    expect(plugin.version).toBe('1.0.0')
    expect(plugin.description).toBe('${pluginName} plugin for AgentKit')
  })
  
  it('should handle onInit', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    await plugin.onInit(mockContext)
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Plugin initialized for agent test-agent')
    )
    
    consoleSpy.mockRestore()
  })
  
  it('should handle onSend and modify payload', async () => {
    const payload: SendPayload = {
      input: { message: 'test' },
      metadata: { source: 'test' }
    }
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    const result = await plugin.onSend(payload, mockContext)
    
    expect(result.metadata.processedBy).toBe('${pluginName}')
    expect(result.metadata.timestamp).toBeDefined()
    expect(result.input).toEqual(payload.input)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Processing send for agent test-agent')
    )
    
    consoleSpy.mockRestore()
  })
  
  it('should handle onError', async () => {
    const error = new Error('Test error')
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    await plugin.onError(error, mockContext)
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error in agent test-agent:'),
      'Test error'
    )
    
    consoleSpy.mockRestore()
  })
  
  it('should handle onShutdown', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    await plugin.onShutdown(mockContext)
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Plugin shutting down for agent test-agent')
    )
    
    consoleSpy.mockRestore()
  })
})
`
  
  await fs.writeFile(path.join(testDir, 'plugin.test.ts'), content)

  // Create vitest config
  const vitestConfig = `import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true
  }
})
`
  
  await fs.writeFile(path.join(pluginDir, 'vitest.config.ts'), vitestConfig)
}

async function createDocumentationFiles(pluginDir: string, pluginName: string): Promise<void> {
  // Create CHANGELOG.md
  const changelog = `# Changelog

## [1.0.0] - ${new Date().toISOString().split('T')[0]}

### Added
- Initial ${pluginName} plugin implementation
- Basic hook implementations (onInit, onSend, onError, onShutdown)
- TypeScript support
- Test suite
- Documentation
`

  await fs.writeFile(path.join(pluginDir, 'CHANGELOG.md'), changelog)

  // Create CONTRIBUTING.md
  const contributing = `# Contributing to ${pluginName}

## Development Setup

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Run tests:
   \`\`\`bash
   npm test
   \`\`\`

3. Run tests in watch mode:
   \`\`\`bash
   npm run test:watch
   \`\`\`

4. Build the plugin:
   \`\`\`bash
   npm run build
   \`\`\`

5. Lint your code:
   \`\`\`bash
   npm run lint
   \`\`\`

## Making Changes

1. Make your changes
2. Add tests for new functionality
3. Ensure all tests pass
4. Update documentation if needed
5. Update CHANGELOG.md

## Plugin Development Guidelines

- Follow the AgentKit plugin interface
- Add comprehensive tests
- Use TypeScript for type safety
- Keep the plugin focused and lightweight
- Document your changes
`

  await fs.writeFile(path.join(pluginDir, 'CONTRIBUTING.md'), contributing)

  // Create .gitignore
  const gitignore = `node_modules/
dist/
*.log
.env
.DS_Store
coverage/
.nyc_output/
`

  await fs.writeFile(path.join(pluginDir, '.gitignore'), gitignore)

  // Create tsconfig.json
  const tsconfig = {
    extends: '../../../tsconfig.base.json',
    compilerOptions: {
      outDir: './dist',
      rootDir: './src'
    },
    include: ['**/*'],
    exclude: ['node_modules', 'dist', '__tests__']
  }

  await fs.writeFile(path.join(pluginDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2))
}

function toPascalCase(str: string): string {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

// Export for CLI integration
export const createPluginCommand = {
  name: 'create-plugin',
  description: 'Create a new AgentKit plugin',
  options: [
    { flags: '--skip-prompts', description: 'Skip interactive prompts and use defaults' },
    { flags: '--with-tests', description: 'Generate test files' },
    { flags: '--with-docs', description: 'Generate documentation files' }
  ],
  action: runCreatePluginCommand
}