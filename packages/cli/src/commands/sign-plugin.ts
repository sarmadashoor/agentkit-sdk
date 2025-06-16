/**
 * CLI command for signing AgentKit plugins
 * 
 * Usage: npx agentkit sign-plugin ./plugin.ts
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { writeFile, access, stat } from 'fs/promises'
import { resolve, dirname, basename, extname } from 'path'
import { 
  ensureDevKey, 
  signPlugin, 
  hashFile,
  getKeyId,
  type PluginSignature 
} from '../security/crypto'

export interface SignPluginOptions {
  /** Output path for signature file */
  output?: string
  /** Signature expiration in days */
  expires?: number
  /** Force overwrite existing signature */
  force?: boolean
  /** Verbose output */
  verbose?: boolean
}

export const signPluginCommand = new Command('sign-plugin')
  .description('Sign a plugin file with cryptographic signature')
  .argument('<plugin-file>', 'Path to the plugin file to sign')
  .option('-o, --output <path>', 'Output path for signature file (defaults to <plugin>.sig)')
  .option('-e, --expires <days>', 'Signature expiration in days', '365')
  .option('-f, --force', 'Force overwrite existing signature file')
  .option('-v, --verbose', 'Show detailed signing information')
  .action(async (pluginFile: string, options: SignPluginOptions) => {
    const spinner = ora('Initializing plugin signing...').start()

    try {
      // Validate plugin file exists
      const pluginPath = resolve(pluginFile)
      await validatePluginFile(pluginPath, spinner)

      // Ensure we have a development key
      spinner.text = 'Loading or generating signing key...'
      const keyPair = await ensureDevKey()
      
      if (options.verbose) {
        spinner.info(`Using key ID: ${chalk.cyan(keyPair.keyId)}`)
        spinner.start('Generating signature...')
      }

      // Generate signature
      const expirationDays = parseInt(options.expires || '365', 10)
      const signature = await signPlugin(
        pluginPath,
        keyPair.privateKey,
        keyPair.keyId,
        expirationDays
      )

      // Determine output path
      const outputPath = options.output || getDefaultSignaturePath(pluginPath)
      
      // Check if signature file already exists
      await checkExistingSignature(outputPath, options.force, spinner)

      // Write signature file
      spinner.text = 'Writing signature file...'
      await writeSignatureFile(outputPath, signature)

      // Success!
      spinner.succeed(chalk.green('Plugin signed successfully!'))
      
      console.log()
      console.log(chalk.bold('📋 Signature Details:'))
      console.log(`   Plugin: ${chalk.cyan(basename(pluginPath))}`)
      console.log(`   Hash: ${chalk.yellow(signature.hash.substring(0, 16))}...`)
      console.log(`   Key ID: ${chalk.blue(signature.keyId)}`)
      console.log(`   Expires: ${chalk.magenta(new Date(signature.expires * 1000).toLocaleDateString())}`)
      console.log(`   Signature: ${chalk.gray(outputPath)}`)
      
      if (options.verbose) {
        console.log()
        console.log(chalk.bold('🔍 Full Signature:'))
        console.log(JSON.stringify(signature, null, 2))
      }

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
    const stats = await stat(pluginPath)
    
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${pluginPath}`)
    }

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
 * Get default signature file path
 */
function getDefaultSignaturePath(pluginPath: string): string {
  const dir = dirname(pluginPath)
  const name = basename(pluginPath, extname(pluginPath))
  return resolve(dir, `${name}.sig`)
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
 * Write signature to file with proper formatting
 */
async function writeSignatureFile(outputPath: string, signature: PluginSignature): Promise<void> {
  const signatureContent = JSON.stringify(signature, null, 2)
  await writeFile(outputPath, signatureContent, 'utf8')
}