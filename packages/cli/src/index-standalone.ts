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
  create-plugin [name]     Create a new AgentKit plugin
  sign-plugin <file>       Sign a plugin file with HMAC or Ed25519
  doctor                   Validate dependencies (coming soon)
  --help, -h              Show this help message
  --version, -v           Show version information

${styles.bold('Examples:')}
  agentkit create-plugin my-plugin
  agentkit create-plugin hello-world
  agentkit sign-plugin index.ts --hmac
  agentkit sign-plugin plugin.js --ed25519 --output

${styles.bold('Sign Plugin Options:')}
  --hmac                  Use HMAC-SHA256 signing (requires secret)
  --ed25519               Use Ed25519 signing (default)
  --output, -o            Write signature to plugin.signed.json file
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
    await signPlugin()
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

async function signPlugin() {
  console.log(styles.cyan('\\n🔐 Signing AgentKit plugin...\\n'))
  
  // Get plugin file path
  const pluginFile = args[1]
  if (!pluginFile) {
    console.log(styles.red('❌ Plugin file path is required'))
    console.log(styles.dim('Usage: agentkit sign-plugin <plugin-file> [--hmac|--ed25519]'))
    process.exit(1)
  }
  
  // Check if file exists
  if (!fs.existsSync(pluginFile)) {
    console.log(styles.red(`❌ Plugin file not found: ${pluginFile}`))
    process.exit(1)
  }
  
  // Determine signing method
  const useHmac = args.includes('--hmac')
  const useEd25519 = args.includes('--ed25519') || !useHmac // Default to Ed25519
  
  try {
    console.log(styles.dim(`📄 Loading plugin from: ${pluginFile}`))
    
    // Read plugin content
    const pluginContent = fs.readFileSync(pluginFile, 'utf8')
    
    // Extract plugin metadata safely (no eval!)
    const metadata = extractPluginMetadata(pluginContent)
    console.log(styles.dim(`📦 Plugin: ${metadata.name} v${metadata.version}`))
    
    if (useHmac) {
      // HMAC signing
      await signPluginHMAC(pluginFile, pluginContent, metadata)
    } else {
      // Ed25519 signing
      await signPluginEd25519(pluginFile, pluginContent, metadata)
    }
    
  } catch (error) {
    console.log(styles.red('❌ Error signing plugin:'), error.message)
    process.exit(1)
  }
}

// Extract plugin metadata without eval - safe parsing only
function extractPluginMetadata(content: string): { name: string; version: string; description?: string } {
  const metadata: any = {
    name: 'unknown-plugin',
    version: '1.0.0'
  }
  
  // Try to extract from export statements
  const nameMatch = content.match(/name\s*[:=]\s*['"]([^'"]+)['"]/);
  const versionMatch = content.match(/version\s*[:=]\s*['"]([^'"]+)['"]/);
  const descriptionMatch = content.match(/description\s*[:=]\s*['"]([^'"]+)['"]/);
  
  if (nameMatch) metadata.name = nameMatch[1]
  if (versionMatch) metadata.version = versionMatch[1]
  if (descriptionMatch) metadata.description = descriptionMatch[1]
  
  // Also try class name pattern
  const classMatch = content.match(/export\s+(?:default\s+)?class\s+(\w+)/);
  if (classMatch && metadata.name === 'unknown-plugin') {
    metadata.name = classMatch[1].toLowerCase().replace(/plugin$/i, '')
  }
  
  return metadata
}

// HMAC signing implementation
async function signPluginHMAC(
  filePath: string, 
  content: string, 
  metadata: { name: string; version: string; description?: string }
) {
  const crypto = require('crypto')
  
  // Get signing secret
  const secret = process.env.AGENTKIT_SIGNING_SECRET
  if (!secret) {
    console.log(styles.yellow('\\n⚠️  No AGENTKIT_SIGNING_SECRET environment variable found'))
    const userSecret = await askQuestion('Enter signing secret: ')
    if (!userSecret || userSecret.length < 16) {
      console.log(styles.red('❌ Signing secret must be at least 16 characters'))
      process.exit(1)
    }
    process.env.AGENTKIT_SIGNING_SECRET = userSecret
  }
  
  console.log(styles.dim('🔑 Using HMAC-SHA256 signing...'))
  
  // Create deterministic content for signing
  const signableContent = JSON.stringify({
    name: metadata.name,
    version: metadata.version,
    description: metadata.description,
    contentHash: crypto.createHash('sha256').update(content).digest('hex'),
    timestamp: Math.floor(Date.now() / 1000)
  }, null, 2)
  
  // Generate HMAC signature
  const hmac = crypto.createHmac('sha256', process.env.AGENTKIT_SIGNING_SECRET)
  hmac.update(signableContent)
  const signature = hmac.digest('hex')
  
  // Create signature object
  const signatureData = {
    algorithm: 'HMAC-SHA256',
    signature,
    hash: crypto.createHash('sha256').update(content).digest('hex'),
    metadata,
    timestamp: Math.floor(Date.now() / 1000),
    signed: signableContent
  }
  
  // Write signature file
  const outputPath = path.join(path.dirname(filePath), 'plugin.signed.json')
  fs.writeFileSync(outputPath, JSON.stringify(signatureData, null, 2))
  
  console.log(styles.green('\\n✅ Plugin signed successfully with HMAC!'))
  console.log(styles.dim(`📝 Signature written to: ${outputPath}`))
  console.log(styles.dim(`🔐 Signature: ${signature.substring(0, 32)}...`))
}

// Ed25519 signing implementation
async function signPluginEd25519(
  filePath: string,
  content: string,
  metadata: { name: string; version: string; description?: string }
) {
  const crypto = require('crypto')
  
  console.log(styles.dim('🔑 Using Ed25519 signing...'))
  
  // Check for existing key or generate new one
  const keyPath = path.join(require('os').homedir(), '.agentkit', 'keys', 'dev.key')
  let keyPair: any
  
  if (fs.existsSync(keyPath)) {
    console.log(styles.dim('📂 Loading existing key...'))
    keyPair = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
  } else {
    console.log(styles.dim('🔨 Generating new Ed25519 key pair...'))
    
    // Generate Ed25519 key pair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    })
    
    keyPair = {
      publicKey,
      privateKey,
      keyId: crypto.createHash('sha256').update(publicKey).digest('hex').substring(0, 16)
    }
    
    // Save key pair
    const keyDir = path.dirname(keyPath)
    fs.mkdirSync(keyDir, { recursive: true })
    fs.writeFileSync(keyPath, JSON.stringify(keyPair, null, 2), { mode: 0o600 })
    console.log(styles.dim(`💾 Key saved to: ${keyPath}`))
  }
  
  // Create message to sign
  const message = JSON.stringify({
    name: metadata.name,
    version: metadata.version,
    description: metadata.description,
    contentHash: crypto.createHash('sha256').update(content).digest('hex'),
    timestamp: Math.floor(Date.now() / 1000),
    expires: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year
  })
  
  // Sign the message
  const signature = crypto.sign(null, Buffer.from(message), keyPair.privateKey).toString('base64')
  
  // Create signature object
  const signatureData = {
    algorithm: 'Ed25519',
    signature,
    keyId: keyPair.keyId,
    hash: crypto.createHash('sha256').update(content).digest('hex'),
    metadata,
    timestamp: Math.floor(Date.now() / 1000),
    expires: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60),
    message
  }
  
  // Output options
  const outputToFile = args.includes('--output') || args.includes('-o')
  
  if (outputToFile) {
    const outputPath = path.join(path.dirname(filePath), 'plugin.signed.json')
    fs.writeFileSync(outputPath, JSON.stringify(signatureData, null, 2))
    console.log(styles.green('\\n✅ Plugin signed successfully with Ed25519!'))
    console.log(styles.dim(`📝 Signature written to: ${outputPath}`))
  } else {
    // Output to stdout
    console.log(styles.green('\\n✅ Plugin signed successfully with Ed25519!'))
    console.log(styles.cyan('\\n📋 Signature Data:\\n'))
    console.log(JSON.stringify(signatureData, null, 2))
  }
  
  console.log(styles.dim(`\\n🔐 Key ID: ${keyPair.keyId}`))
  console.log(styles.dim(`🔐 Signature: ${signature.substring(0, 32)}...`))
}