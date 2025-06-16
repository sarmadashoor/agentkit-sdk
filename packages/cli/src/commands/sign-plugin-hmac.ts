/**
 * CLI command for HMAC-based plugin signing
 * 
 * Usage: npx agentkit sign-plugin ./plugin.ts
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { writeFile, readFile, access } from 'fs/promises'
import { resolve, dirname, basename, extname } from 'path'
import { signPlugin, serializePluginForSigning, type PluginSignatureMetadata } from '../security/plugin-hmac-signer'
import { parsePluginSafely, normalizePluginForSigning, detectMaliciousPatterns } from '../security/safe-plugin-parser'
import type { AgentKitPlugin } from '@agentkit/types'

export interface SignPluginOptions {
  /** Output path for signature file */
  output?: string
  /** Force overwrite existing signature */
  force?: boolean
  /** Verbose output */
  verbose?: boolean
  /** Secret key for signing (fallback to environment variable) */
  secret?: string
}

export const signPluginHmacCommand = new Command('sign-plugin')
  .description('Sign a plugin file with HMAC cryptographic signature')
  .argument('<plugin-file>', 'Path to the plugin file to sign')
  .option('-o, --output <path>', 'Output path for signature file (defaults to .plugin-signature.json)')
  .option('-f, --force', 'Force overwrite existing signature file')
  .option('-v, --verbose', 'Show detailed signing information')
  .option('-s, --secret <secret>', 'Signing secret (defaults to AGENTKIT_SIGNING_SECRET env var)')
  .action(async (pluginFile: string, options: SignPluginOptions) => {
    const spinner = ora('Initializing HMAC plugin signing...').start()

    try {
      // Validate plugin file exists
      const pluginPath = resolve(pluginFile)
      await validatePluginFile(pluginPath, spinner)

      // Validate signing secret
      const signingSecret = options.secret || process.env.AGENTKIT_SIGNING_SECRET
      if (!signingSecret) {
        spinner.fail(chalk.red('AGENTKIT_SIGNING_SECRET environment variable is required'))
        console.error(chalk.red('\nSet your signing secret:'))
        console.error(chalk.yellow('export AGENTKIT_SIGNING_SECRET="your-secure-secret-key"'))
        process.exit(1)
      }

      if (signingSecret.length < 16) {
        spinner.fail(chalk.red('AGENTKIT_SIGNING_SECRET must be at least 16 characters'))
        process.exit(1)
      }

      // Load and parse plugin
      spinner.text = 'Loading plugin file...'
      const plugin = await loadPluginFromFile(pluginPath)
      
      if (options.verbose) {
        spinner.info(`Plugin loaded: ${chalk.cyan(plugin.name)} v${plugin.version}`)
        spinner.start('Generating HMAC signature...')
      }

      // Generate signature
      const signatureMetadata = signPlugin(plugin, signingSecret)

      // Determine output path
      const outputPath = options.output || getDefaultSignaturePath(pluginPath)
      
      // Check if signature file already exists
      await checkExistingSignature(outputPath, options.force, spinner)

      // Write signature file
      spinner.text = 'Writing signature file...'
      await writeSignatureFile(outputPath, signatureMetadata)

      // Success!
      spinner.succeed(chalk.green('Plugin signed successfully with HMAC!'))
      
      console.log()
      console.log(chalk.bold('📋 Signature Details:'))
      console.log(`   Plugin: ${chalk.cyan(basename(pluginPath))}`)
      console.log(`   Algorithm: ${chalk.blue(signatureMetadata.algorithm)}`)
      console.log(`   Hash: ${chalk.yellow(signatureMetadata.hash.substring(0, 16))}...`)
      console.log(`   Signature: ${chalk.gray(signatureMetadata.signature.substring(0, 32))}...`)
      console.log(`   Output: ${chalk.gray(outputPath)}`)
      
      if (options.verbose) {
        console.log()
        console.log(chalk.bold('🔍 Full Signature Metadata:'))
        console.log(JSON.stringify(signatureMetadata, null, 2))
        
        console.log()
        console.log(chalk.bold('📦 Serialized Plugin for Signing:'))
        console.log(serializePluginForSigning(plugin).substring(0, 200) + '...')
      }

      console.log()
      console.log(chalk.green('✅ Your plugin is now cryptographically signed and ready for distribution!'))
      console.log(chalk.dim('💡 Include the .plugin-signature.json file alongside your plugin when distributing.'))

    } catch (error) {
      spinner.fail(chalk.red('Plugin signing failed'))
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

/**
 * Validate that plugin file exists and is readable
 */
async function validatePluginFile(pluginPath: string, spinner: ora.Ora): Promise<void> {
  try {
    await access(pluginPath)
    
    // Basic validation of file extension
    const ext = extname(pluginPath).toLowerCase()
    if (!['.ts', '.js', '.mjs', '.cjs'].includes(ext)) {
      spinner.warn(chalk.yellow(`Warning: File extension "${ext}" is not typical for plugins`))
    }

    spinner.succeed(`Plugin file validated: ${chalk.cyan(basename(pluginPath))}`)
  } catch (error) {
    throw new Error(`Plugin file not found or not readable: ${pluginPath}`)
  }
}

/**
 * Load plugin from file and validate structure
 * SECURITY PATCH: Uses safe parsing instead of eval() to prevent code injection
 */
async function loadPluginFromFile(pluginPath: string): Promise<AgentKitPlugin> {
  try {
    const content = await readFile(pluginPath, 'utf8')
    
    // SECURITY: Check for malicious patterns before processing
    const maliciousPatterns = detectMaliciousPatterns(content)
    if (maliciousPatterns.length > 0) {
      throw new Error(`Plugin contains potentially malicious patterns: ${maliciousPatterns.join(', ')}`)
    }
    
    // SECURITY: Use safe parser instead of eval()
    const plugin = parsePluginSafely(content)
    
    // Normalize plugin for consistent signing
    const normalizedPlugin = normalizePluginForSigning(plugin)
    
    return normalizedPlugin
    
  } catch (error) {
    throw new Error(`Failed to safely load plugin: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Get default signature file path
 */
function getDefaultSignaturePath(pluginPath: string): string {
  const dir = dirname(pluginPath)
  return resolve(dir, '.plugin-signature.json')
}

/**
 * Check if signature file exists and handle overwrite logic
 */
async function checkExistingSignature(
  outputPath: string, 
  force: boolean, 
  spinner: ora.Ora
): Promise<void> {
  try {
    await access(outputPath)
    
    if (!force) {
      throw new Error(
        `Signature file already exists: ${outputPath}\n` +
        'Use --force to overwrite, or specify a different output path with --output'
      )
    }
    
    spinner.warn(chalk.yellow(`Overwriting existing signature: ${basename(outputPath)}`))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    // File doesn't exist, which is fine
  }
}

/**
 * Write signature metadata to file
 */
async function writeSignatureFile(outputPath: string, metadata: PluginSignatureMetadata): Promise<void> {
  const signatureContent = JSON.stringify(metadata, null, 2)
  await writeFile(outputPath, signatureContent, 'utf8')
}