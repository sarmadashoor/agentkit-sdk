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

// Parse global flags
const hasHelp = args.includes('--help') || args.includes('-h')
const hasVerbose = args.includes('--verbose') || args.includes('-v')
const hasJson = args.includes('--json')
const hasSkipPrompts = args.includes('--skip-prompts')
const hasWithTests = args.includes('--with-tests')
const hasWithDocs = args.includes('--with-docs')

// Extract flag values
const outputFlag = args.find(arg => arg.startsWith('--output='))?.split('=')[1] || 
                   (args.includes('--output') || args.includes('-o') ? args[args.indexOf('--output') + 1] || args[args.indexOf('-o') + 1] : undefined)
const typeFlag = args.find(arg => arg.startsWith('--type='))?.split('=')[1] || 
                 (args.includes('--type') ? args[args.indexOf('--type') + 1] : undefined)

if (!command || command === '--help' || command === '-h') {
  console.log(`
${styles.bold('Usage:')} agentkit <command> [options]

${styles.bold('Commands:')}
  create-plugin [name]  Create a new AgentKit plugin
  sign-plugin <file>    Sign a plugin file with cryptographic signature
  doctor               Validate AgentKit environment and dependencies
  --help, -h           Show this help message
  --version, -v        Show version information

${styles.bold('Examples:')}
  agentkit create-plugin my-plugin
  agentkit create-plugin --help
  agentkit sign-plugin ./plugin.ts
  agentkit doctor --verbose
`)
  process.exit(0)
}

if (command === '--version' || command === '-v') {
  console.log('0.1.0-alpha')
  process.exit(0)
}

async function main() {
  try {
    // Handle command-specific help
    if (hasHelp) {
      if (command === 'sign-plugin') {
        console.log(styles.cyan('\n🔐 AgentKit Plugin Signing\n'))
        console.log(styles.bold('Usage:'))
        console.log('  agentkit sign-plugin <plugin-file> [options]\n')
        console.log(styles.bold('Arguments:'))
        console.log('  plugin-file    Path to the plugin file to sign\n')
        console.log(styles.bold('Options:'))
        console.log('  --output, -o   Output path for signature file')
        console.log('  --verbose, -v  Show detailed signing information')
        console.log('  --help, -h     Show this help message\n')
        console.log(styles.bold('Examples:'))
        console.log('  agentkit sign-plugin ./my-plugin.ts')
        console.log('  agentkit sign-plugin ./plugin.js --output ./plugin.signature\n')
        process.exit(0)
      }
      // For other commands, fall through to show general help
    }

    if (command === 'create-plugin') {
      if (hasHelp) {
        console.log(styles.cyan('\n🛠️ AgentKit Plugin Creation\n'))
        console.log(styles.bold('Usage:'))
        console.log('  agentkit create-plugin [name] [options]\n')
        console.log(styles.bold('Arguments:'))
        console.log('  name           Plugin name (interactive prompt if not provided)\n')
        console.log(styles.bold('Options:'))
        console.log('  --skip-prompts  Skip interactive prompts and use defaults')
        console.log('  --with-tests    Generate test files')
        console.log('  --with-docs     Generate documentation files')
        console.log('  --help, -h      Show this help message\n')
        console.log(styles.bold('Examples:'))
        console.log('  agentkit create-plugin my-plugin')
        console.log('  agentkit create-plugin --skip-prompts --with-tests\n')
        process.exit(0)
      }
      await createPlugin()
      process.exit(0)
    }

    if (command === 'sign-plugin') {
      await signPlugin()
      process.exit(0)
    }

    if (command === 'doctor') {
      if (hasHelp) {
        console.log(styles.cyan('\n🔧 AgentKit Environment Doctor\n'))
        console.log(styles.bold('Usage:'))
        console.log('  agentkit doctor [options]\n')
        console.log(styles.bold('Options:'))
        console.log('  --verbose, -v   Show detailed information')
        console.log('  --json          Output results in JSON format')
        console.log('  --help, -h      Show this help message\n')
        console.log(styles.bold('Description:'))
        console.log('  Validates your development environment for AgentKit plugin development.\n')
        console.log(styles.bold('Examples:'))
        console.log('  agentkit doctor')
        console.log('  agentkit doctor --verbose\n')
        process.exit(0)
      }
      const isValid = await runDoctor()
      process.exit(isValid ? 0 : 1)
    }

    console.log(styles.red(`Unknown command: ${command}`))
    console.log('Run "agentkit --help" for available commands.')
    process.exit(1)
  } catch (error) {
    console.log(styles.red('❌ Error:'), error instanceof Error ? error.message : String(error))
    if (hasVerbose) {
      console.log(styles.dim(error instanceof Error ? (error.stack || String(error)) : String(error)))
    }
    process.exit(1)
  }
}

main().catch(error => {
  console.log(styles.red('❌ Unexpected error:'), error.message)
  process.exit(1)
})

async function createPlugin() {
  console.log(styles.cyan('\n🛠️  Creating a new AgentKit plugin...\n'))
  
  // Get plugin name
  let pluginName = args[1]
  if (!pluginName && !hasSkipPrompts) {
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
    
    // Create basic files
    createIndexFile(pluginDir, pluginName)
    createPluginJson(pluginDir, pluginName)
    createReadme(pluginDir, pluginName)
    createPackageJson(pluginDir, pluginName)
    
    if (hasWithTests) {
      createTestFile(pluginDir, pluginName)
    }
    
    console.log(styles.green('\n✅ Plugin created successfully!'))
    console.log(styles.cyan('\n📋 Next steps:\n'))
    console.log(`  ${styles.dim('$')} cd ${pluginName}`)
    console.log(`  ${styles.dim('$')} npm install`)
    console.log(`  ${styles.dim('$')} npm test`)
    console.log('')
    console.log(styles.green('📖 Check README.md for usage instructions\n'))
    
  } catch (error) {
    console.log(styles.red('❌ Error creating plugin:'), error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

async function signPlugin() {
  console.log(styles.cyan('\n🔐 Signing AgentKit plugin...\n'))
  
  const pluginFile = args[1]
  if (!pluginFile) {
    console.log(styles.red('❌ Plugin file path is required'))
    console.log(styles.dim('Usage: agentkit sign-plugin <plugin-file>'))
    process.exit(1)
  }
  
  if (!fs.existsSync(pluginFile)) {
    console.log(styles.red(`❌ Plugin file not found: ${pluginFile}`))
    process.exit(1)
  }
  
  console.log(styles.dim(`📄 Plugin file: ${path.resolve(pluginFile)}`))
  console.log(styles.cyan('\n🔐 Signing plugin...'))
  
  // Create mock signature for development
  const crypto = require('crypto')
  const content = fs.readFileSync(pluginFile, 'utf8')
  const hash = crypto.createHash('sha256').update(content).digest('hex')
  
  const signatureData = {
    algorithm: 'HMAC-SHA256',
    hash: hash,
    signature: 'mock-signature-' + hash.substring(0, 16),
    timestamp: Date.now(),
    file: path.basename(pluginFile)
  }
  
  const outputPath = outputFlag || `${pluginFile}.sig`
  fs.writeFileSync(outputPath, JSON.stringify(signatureData, null, 2))
  
  console.log(styles.green('✅ Plugin signed successfully!'))
  console.log(styles.dim(`📁 Signature file: ${outputPath}`))
  console.log(styles.yellow('\n💡 This is a development stub - real signing would use cryptographic keys\n'))
}

async function runDoctor() {
  console.log(styles.cyan('\n🔧 AgentKit Doctor - Environment Validation\n'))
  
  let allChecksPass = true
  const results: { name: string; status: boolean; message: string }[] = []
  
  // Check Node.js version
  const nodeVersion = process.version
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0])
  const nodeCheck = {
    name: 'Node.js Version',
    status: majorVersion >= 18,
    message: majorVersion >= 18 ? `${nodeVersion} (>= 18.0.0 required)` : `${nodeVersion} - Please upgrade to Node.js 18.0.0 or higher`
  }
  results.push(nodeCheck)
  if (!nodeCheck.status) {allChecksPass = false}
  
  // Check TypeScript
  try {
    const { execSync } = require('child_process')
    const tsVersion = execSync('tsc --version', { encoding: 'utf8', timeout: 5000 }).trim()
    results.push({
      name: 'TypeScript Compiler',
      status: true,
      message: `${tsVersion} - Available for plugin development`
    })
  } catch {
    results.push({
      name: 'TypeScript Compiler',
      status: false,
      message: 'Not installed - Required for plugin development'
    })
    allChecksPass = false
  }
  
  // Output results
  console.log(styles.bold('📋 Environment Checks:\n'))
  for (const result of results) {
    const icon = result.status ? styles.green('✅') : styles.red('❌')
    console.log(`${icon} ${result.name}: ${result.message}`)
  }
  
  console.log()
  if (allChecksPass) {
    console.log(styles.green('🎉 All checks passed! Your environment is ready for AgentKit plugin development.'))
  } else {
    console.log(styles.red('⚠️  Some checks failed. Please fix the issues above before developing plugins.'))
  }
  
  return allChecksPass
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

function createIndexFile(pluginDir: string, pluginName: string) {
  const className = toPascalCase(pluginName)
  const content = `import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'

/**
 * ${pluginName} plugin for AgentKit
 */
export class ${className}Plugin implements AgentKitPlugin {
  readonly name = '${pluginName}'
  readonly version = '1.0.0'
  readonly description = '${pluginName} plugin for AgentKit'
  
  async onInit(context: AgentContext): Promise<void> {
    console.log(\`[\${this.name}] Plugin initialized for agent \${context.agentId}\`)
  }
  
  async onSend(payload: SendPayload, context: AgentContext): Promise<SendPayload> {
    console.log(\`[\${this.name}] Processing send for agent \${context.agentId}\`)
    return {
      ...payload,
      metadata: {
        ...payload.metadata,
        processedBy: this.name,
        timestamp: Date.now()
      }
    }
  }
  
  async onError(error: Error, context: AgentContext): Promise<void> {
    console.log(\`[\${this.name}] Error in agent \${context.agentId}:\`, error.message)
  }
  
  async onShutdown(context: AgentContext): Promise<void> {
    console.log(\`[\${this.name}] Plugin shutting down for agent \${context.agentId}\`)
  }
}

const plugin = new ${className}Plugin()
export default plugin
`
  
  fs.writeFileSync(path.join(pluginDir, 'index.ts'), content)
}

function createPluginJson(pluginDir: string, pluginName: string) {
  const metadata = {
    name: pluginName,
    version: '1.0.0',
    description: `${pluginName} plugin for AgentKit`,
    main: './index.ts',
    hooks: ['onInit', 'onSend', 'onError', 'onShutdown'],
    author: 'Your Name',
    license: 'MIT'
  }
  
  fs.writeFileSync(
    path.join(pluginDir, 'plugin.json'), 
    JSON.stringify(metadata, null, 2)
  )
}

function createReadme(pluginDir: string, pluginName: string) {
  const content = `# ${pluginName}

A simple AgentKit plugin.

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

await send({ message: 'Hello World!' })
await shutdown()
\`\`\`

## License

MIT
`
  
  fs.writeFileSync(path.join(pluginDir, 'README.md'), content)
}

function createPackageJson(pluginDir: string, pluginName: string) {
  const packageJson = {
    name: pluginName,
    version: '1.0.0',
    description: `${pluginName} plugin for AgentKit`,
    main: 'index.ts',
    scripts: {
      test: 'vitest',
      build: 'tsc'
    },
    dependencies: {
      '@agentkit/types': '^0.1.0-alpha'
    },
    devDependencies: {
      '@types/node': '^20.0.0',
      'typescript': '^5.0.0',
      'vitest': '^1.0.0'
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

function createTestFile(pluginDir: string, pluginName: string) {
  const testDir = path.join(pluginDir, '__tests__')
  fs.mkdirSync(testDir, { recursive: true })
  
  const className = toPascalCase(pluginName)
  const content = `import { describe, it, expect, vi } from 'vitest'
import { ${className}Plugin } from '../index'

describe('${className}Plugin', () => {
  let plugin: ${className}Plugin
  
  beforeEach(() => {
    plugin = new ${className}Plugin()
  })
  
  it('should have correct metadata', () => {
    expect(plugin.name).toBe('${pluginName}')
    expect(plugin.version).toBe('1.0.0')
  })
})
`
  
  fs.writeFileSync(path.join(testDir, 'plugin.test.ts'), content)
}

function toPascalCase(str: string): string {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}
