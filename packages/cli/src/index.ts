#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import { createPluginCommand } from './commands/create-plugin'
import { signPluginCommand } from './commands/sign-plugin'
import { signPluginHmacCommand } from './commands/sign-plugin-hmac'

// Read version from package.json
const packageJson = require('../package.json')
const version = packageJson.version

const program = new Command()

program
  .name('agentkit')
  .description('AgentKit CLI - Build plugins with excellent developer experience')
  .version(version)

// Add create-plugin command
program.addCommand(createPluginCommand)

// Add sign-plugin command (Ed25519 - existing)
program.addCommand(signPluginCommand)

// Add sign-plugin HMAC command (new HMAC-based)
program.addCommand(signPluginHmacCommand)

// Add future commands placeholder
program
  .command('doctor')
  .description('Validate all plugin contracts and dependencies')
  .action(() => {
    console.log(chalk.yellow('🔧 Doctor command coming soon!'))
  })

program
  .command('publish-plugin')
  .description('Publish plugin to registry')
  .argument('<plugin-name>', 'Name of the plugin to publish')
  .action((pluginName) => {
    console.log(chalk.yellow(`📦 Publishing ${pluginName} coming soon!`))
  })

// Error handling
program.on('command:*', () => {
  console.error(chalk.red('Invalid command: %s'), program.args.join(' '))
  console.log('See --help for a list of available commands.')
  process.exit(1)
})

// Parse arguments
program.parse(process.argv)

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp()
}