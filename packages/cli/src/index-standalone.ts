#!/usr/bin/env node

import * as fs from 'fs'
import * as path from 'path'
import { createInterface } from 'readline'

// Simple console styling without external dependencies
const styles = {
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
  dim: (text: string) => `\x1b[2m${text}\x1b[0m`
}

console.log(styles.cyan('🚀 AgentKit CLI v0.1.0-alpha'))

const args = process.argv.slice(2)
const command = args[0]

if (!command || command === '--help' || command === '-h') {
  console.log(`
${styles.bold('Usage:')} agentkit <command> [options]

${styles.bold('Commands:')}
  create-plugin [name]  Create a new AgentKit plugin
  sign-plugin <file>    Sign a plugin file (coming soon)
  doctor               Validate dependencies (coming soon)
  --help, -h           Show this help message
  --version, -v        Show version information

${styles.bold('Examples:')}
  agentkit create-plugin my-plugin
  agentkit create-plugin hello-world
`)
  process.exit(0)
}

if (command === '--version' || command === '-v') {
  console.log('0.1.0-alpha')
  process.exit(0)
}

async function main() {
  if (command === 'create-plugin') {
    await createPlugin()
    process.exit(0)
  }

  if (command === 'sign-plugin') {
    console.log(styles.yellow('🔐 sign-plugin command coming soon!'))
    console.log('This will cryptographically sign plugin files for secure distribution.')
    process.exit(0)
  }

  if (command === 'doctor') {
    console.log(styles.yellow('🔧 doctor command coming soon!'))
    console.log('This will validate all plugin contracts and dependencies.')
    process.exit(0)
  }

  console.log(styles.red(`Unknown command: ${command}`))
  console.log('Run "agentkit --help" for available commands.')
  process.exit(1)
}

main().catch(error => {
  console.log(styles.red('❌ Error:'), error.message)
  process.exit(1)
})

async function createPlugin() {
  console.log(styles.cyan('\\n🛠️  Creating a new AgentKit plugin...\\n'))
  
  // Get plugin name
  let pluginName = args[1]
  if (!pluginName) {
    pluginName = await askQuestion('Plugin name: ')
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
  if (fs.existsSync(pluginDir)) {
    console.log(styles.red(`❌ Directory "${pluginName}" already exists`))
    process.exit(1)
  }
  
  try {
    console.log(styles.dim(`📁 Creating directory: ${pluginDir}`))
    fs.mkdirSync(pluginDir, { recursive: true })
    
    console.log(styles.dim('📝 Creating plugin files...'))
    
    // Create index.ts
    await createIndexFile(pluginDir, pluginName)
    
    // Create plugin.json
    await createPluginJson(pluginDir, pluginName)
    
    // Create README.md
    await createReadme(pluginDir, pluginName)
    
    // Create test directory and test file
    await createTestFile(pluginDir, pluginName)
    
    // Create package.json
    await createPackageJson(pluginDir, pluginName)
    
    console.log(styles.green('\\n✅ Plugin created successfully!'))
    console.log(styles.cyan('\\n📋 Next steps:\\n'))
    console.log(`  ${styles.dim('$')} cd ${pluginName}`)
    console.log(`  ${styles.dim('$')} npm install`)
    console.log(`  ${styles.dim('$')} npm test`)
    console.log('')
    console.log(styles.green('📖 Check README.md for usage instructions\\n'))
    
  } catch (error) {
    console.log(styles.red('❌ Error creating plugin:'), error.message)
    process.exit(1)
  }
}

async function askQuestion(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  })
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function createIndexFile(pluginDir: string, pluginName: string) {
  const className = toPascalCase(pluginName)
  const content = `// ${pluginName} plugin for AgentKit
export class ${className} {
  readonly name = '${pluginName}'
  readonly version = '1.0.0'
  
  /**
   * Called when the agent starts
   */
  async onStart(context: { agentId: string; timestamp: number }) {
    console.log(\`[${pluginName}] Plugin started for agent \${context.agentId}\`)
  }
  
  /**
   * Called when a message is sent
   */
  async onSend(payload: { input: any }, context: { agentId: string }) {
    console.log(\`[${pluginName}] Processing send for agent \${context.agentId}\`)
    return payload
  }
  
  /**
   * Called when the agent shuts down
   */
  async onShutdown(context: { agentId: string }) {
    console.log(\`[${pluginName}] Plugin shutting down for agent \${context.agentId}\`)
  }
}

// Default export for convenience
export default ${className}
`
  
  fs.writeFileSync(path.join(pluginDir, 'index.ts'), content)
}

async function createPluginJson(pluginDir: string, pluginName: string) {
  const metadata = {
    name: pluginName,
    version: '1.0.0',
    description: `${pluginName} plugin for AgentKit`,
    main: './index.ts',
    hooks: ['onStart', 'onSend', 'onShutdown'],
    author: 'Your Name',
    license: 'MIT'
  }
  
  fs.writeFileSync(
    path.join(pluginDir, 'plugin.json'), 
    JSON.stringify(metadata, null, 2)
  )
}

async function createReadme(pluginDir: string, pluginName: string) {
  const className = toPascalCase(pluginName)
  const content = `# ${pluginName}

A simple AgentKit plugin that demonstrates basic functionality.

## Features

- ⚡ Zero-config setup
- 🎯 Implements onStart, onSend, and onShutdown hooks
- 📝 TypeScript support
- 🧪 Test suite included

## Installation

\`\`\`bash
npm install
\`\`\`

## Usage

\`\`\`typescript
import { connectAgent } from '@agentkit/sdk'
import { ${className} } from './'

const plugin = new ${className}()

const { send, shutdown } = await connectAgent({
  agent: 'my-agent',
  transport: 'websocket',
  plugins: [plugin]
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
\`\`\`

## API

### onStart(context)

Called when the agent is initialized.

### onSend(payload, context)

Called before sending data to the agent. You can modify the payload here.

### onShutdown(context)

Called when the agent is shutting down. Use for cleanup.

## License

MIT
`
  
  fs.writeFileSync(path.join(pluginDir, 'README.md'), content)
}

async function createTestFile(pluginDir: string, pluginName: string) {
  const testDir = path.join(pluginDir, 'test')
  fs.mkdirSync(testDir, { recursive: true })
  
  const className = toPascalCase(pluginName)
  const content = `import { ${className} } from '../index'

describe('${className}', () => {
  let plugin: ${className}
  
  beforeEach(() => {
    plugin = new ${className}()
  })
  
  test('should have correct metadata', () => {
    expect(plugin.name).toBe('${pluginName}')
    expect(plugin.version).toBe('1.0.0')
  })
  
  test('should handle onStart', async () => {
    const context = { agentId: 'test-agent', timestamp: Date.now() }
    
    // Mock console.log to capture output
    const originalLog = console.log
    const logCalls: string[] = []
    console.log = (message: string) => {
      logCalls.push(message)
    }
    
    await plugin.onStart(context)
    
    expect(logCalls.length).toBe(1)
    expect(logCalls[0]).toContain('Plugin started for agent test-agent')
    
    // Restore console.log
    console.log = originalLog
  })
  
  test('should handle onSend', async () => {
    const payload = { input: { message: 'test' } }
    const context = { agentId: 'test-agent' }
    
    // Mock console.log to capture output
    const originalLog = console.log
    const logCalls: string[] = []
    console.log = (message: string) => {
      logCalls.push(message)
    }
    
    const result = await plugin.onSend(payload, context)
    
    expect(result).toEqual(payload)
    expect(logCalls.length).toBe(1)
    expect(logCalls[0]).toContain('Processing send for agent test-agent')
    
    // Restore console.log
    console.log = originalLog
  })
  
  test('should handle onShutdown', async () => {
    const context = { agentId: 'test-agent' }
    
    // Mock console.log to capture output
    const originalLog = console.log
    const logCalls: string[] = []
    console.log = (message: string) => {
      logCalls.push(message)
    }
    
    await plugin.onShutdown(context)
    
    expect(logCalls.length).toBe(1)
    expect(logCalls[0]).toContain('Plugin shutting down for agent test-agent')
    
    // Restore console.log
    console.log = originalLog
  })
})
`
  
  fs.writeFileSync(path.join(testDir, 'index.test.ts'), content)
}

async function createPackageJson(pluginDir: string, pluginName: string) {
  const packageJson = {
    name: pluginName,
    version: '1.0.0',
    description: `${pluginName} plugin for AgentKit`,
    main: 'index.ts',
    scripts: {
      test: 'jest',
      'test:watch': 'jest --watch'
    },
    devDependencies: {
      '@types/jest': '^29.5.0',
      '@types/node': '^20.0.0',
      jest: '^29.5.0',
      'ts-jest': '^29.1.0',
      typescript: '^5.0.0'
    },
    jest: {
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['**/test/**/*.test.ts'],
      setupFilesAfterEnv: [],
      collectCoverageFrom: [
        '*.ts',
        '!*.test.ts'
      ]
    },
    engines: {
      node: '>=18.0.0'
    },
    keywords: ['agentkit', 'plugin'],
    author: 'Your Name',
    license: 'MIT'
  }
  
  fs.writeFileSync(
    path.join(pluginDir, 'package.json'), 
    JSON.stringify(packageJson, null, 2)
  )
}

function toPascalCase(str: string): string {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}