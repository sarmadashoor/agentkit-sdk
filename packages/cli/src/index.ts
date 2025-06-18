#!/usr/bin/env node

import * as fs from 'fs-extra'
import * as path from 'path'
import * as readline from 'readline-sync'

// Import command implementations
import { runDoctorCommand } from './commands/doctor'
import { runCreatePluginCommand } from './commands/create-plugin-simple'
import { runSignPluginCommand, showSignPluginHelp } from './commands/sign-plugin-simple'

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
        await showSignPluginHelp()
        process.exit(0)
      }
      // For other commands, fall through to show general help
    }

    if (command === 'create-plugin') {
      const pluginArgs = args.slice(1).filter(arg => !arg.startsWith('--') && arg !== '-h')
      await runCreatePluginCommand(pluginArgs, {
        name: pluginArgs[0],
        skipPrompts: hasSkipPrompts,
        withTests: hasWithTests,
        withDocs: hasWithDocs
      })
      process.exit(0)
    }

    if (command === 'sign-plugin') {
      const pluginArgs = args.slice(1).filter(arg => !arg.startsWith('--') && !arg.startsWith('-'))
      await runSignPluginCommand(pluginArgs, {
        output: outputFlag,
        verbose: hasVerbose,
        type: typeFlag as 'hmac' | 'ed25519'
      })
      process.exit(0)
    }

    if (command === 'doctor') {
      await runDoctorCommand({
        verbose: hasVerbose,
        json: hasJson
      })
      process.exit(0)
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