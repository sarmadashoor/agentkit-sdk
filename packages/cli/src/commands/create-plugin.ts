import { Command } from 'commander'
import { input, select, checkbox, confirm } from '@inquirer/prompts'
import chalk from 'chalk'
import ora from 'ora'
import fs from 'fs-extra'
import path from 'path'
import validateNpmPackageName from 'validate-npm-package-name'
import { CreatePluginCommand } from '../core/CreatePluginCommand'
import type { PluginHookName } from '@agentkit/types'

const VALID_HOOKS: PluginHookName[] = ['onInit', 'onSend', 'onError', 'onShutdown']

export const createPluginCommand = new Command('create-plugin')
  .description('Create a new AgentKit plugin with TypeScript, tests, and best practices')
  .option('-n, --name <name>', 'Plugin name')
  .option('-h, --hooks <hooks...>', 'Hook points to implement')
  .option('--with-tests', 'Generate comprehensive test suite', true)
  .option('--browser-safe', 'Mark plugin as browser-safe (Web Worker compatible)', false)
  .option('--scoped <scope>', 'Create scoped package (e.g., @myorg)')
  .option('-a, --author <author>', 'Plugin author')
  .option('-l, --license <license>', 'Plugin license', 'MIT')
  .option('--skip-prompts', 'Skip interactive prompts and use defaults', false)
  .option('--with-debug', 'Include debug and development tools', true)
  .option('--with-hot-reload', 'Enable hot reload for development', true)
  .option('--with-performance', 'Include performance monitoring', true)
  .option('--with-docs', 'Generate comprehensive documentation', true)
  .option('--template <template>', 'Use specific template (basic|advanced|performance|debug)', 'advanced')
  .action(async (options) => {
    console.log(chalk.cyan.bold('\n🚀 AgentKit Plugin Generator\n'))

    try {
      // Collect inputs
      const config = await collectInputs(options)
      
      // Validate inputs
      validateInputs(config)
      
      // Create plugin
      const spinner = ora('Creating plugin...').start()
      const command = new CreatePluginCommand()
      
      await command.execute(config)
      
      spinner.succeed(chalk.green('Plugin created successfully!'))
      
      // Show next steps
      showNextSteps(config.name)
      
    } catch (error) {
      console.error(chalk.red('\n❌ Error creating plugin:'), error.message)
      process.exit(1)
    }
  })

async function collectInputs(options: any) {
  const config: any = {}

  // Plugin name
  if (options.name) {
    config.name = options.name
  } else if (!options.skipPrompts) {
    config.name = await input({
      message: 'Plugin name:',
      default: 'my-plugin',
      validate: (value) => {
        const validation = validateNpmPackageName(value)
        if (!validation.validForNewPackages) {
          return validation.errors?.[0] || 'Invalid plugin name'
        }
        return true
      }
    })
  } else {
    config.name = 'my-plugin'
  }

  // Hooks
  if (options.hooks && options.hooks.length > 0) {
    config.hooks = options.hooks
  } else if (!options.skipPrompts) {
    config.hooks = await checkbox({
      message: 'Select hooks to implement:',
      choices: VALID_HOOKS.map(hook => ({
        name: hook,
        value: hook,
        checked: hook === 'onInit' // Default to onInit
      }))
    })
  } else {
    config.hooks = ['onInit']
  }

  // Author
  if (options.author) {
    config.author = options.author
  } else if (!options.skipPrompts) {
    config.author = await input({
      message: 'Author name:',
      default: 'Anonymous'
    })
  } else {
    config.author = 'Anonymous'
  }

  // License
  config.license = options.license

  // Additional options
  config.withTests = options.withTests
  config.browserSafe = options.browserSafe
  config.scoped = options.scoped
  
  // Enhanced DX features
  config.withDebug = options.withDebug
  config.withHotReload = options.withHotReload
  config.withPerformance = options.withPerformance
  config.withDocs = options.withDocs
  config.template = options.template

  // Description
  if (!options.skipPrompts) {
    config.description = await input({
      message: 'Plugin description:',
      default: `${config.name} plugin for AgentKit`
    })
  } else {
    config.description = `${config.name} plugin for AgentKit`
  }

  // Browser-safe specific options
  if (config.browserSafe && !options.skipPrompts) {
    config.browserTargets = await checkbox({
      message: 'Select browser targets:',
      choices: [
        { name: 'Chrome (latest)', value: 'chrome', checked: true },
        { name: 'Firefox (latest)', value: 'firefox', checked: true },
        { name: 'Safari (latest)', value: 'safari', checked: true },
        { name: 'Edge (latest)', value: 'edge', checked: true }
      ]
    })
  } else if (config.browserSafe) {
    config.browserTargets = ['chrome', 'firefox', 'safari', 'edge']
  }

  return config
}

function validateInputs(config: any) {
  // Validate plugin name
  const nameValidation = validateNpmPackageName(config.name)
  if (!nameValidation.validForNewPackages) {
    throw new Error(`Invalid plugin name: ${nameValidation.errors?.join(', ')}`)
  }

  // Validate hooks
  for (const hook of config.hooks) {
    if (!VALID_HOOKS.includes(hook)) {
      throw new Error(`Invalid hook name: ${hook}. Valid hooks are: ${VALID_HOOKS.join(', ')}`)
    }
  }

  // Check if plugin already exists
  const pluginDir = path.join(process.cwd(), 'plugins', config.name)
  if (fs.existsSync(pluginDir)) {
    throw new Error(`Plugin "${config.name}" already exists at ${pluginDir}`)
  }
}

function showNextSteps(pluginName: string) {
  console.log(chalk.cyan('\n📋 Next steps:\n'))
  console.log(`  ${chalk.gray('$')} cd plugins/${pluginName}`)
  console.log(`  ${chalk.gray('$')} npm install`)
  console.log(`  ${chalk.gray('$')} npm run dev    ${chalk.gray('# Start development with hot-reload')}`)
  console.log(`  ${chalk.gray('$')} npm test       ${chalk.gray('# Run tests')}`)
  console.log(`  ${chalk.gray('$')} npm run lint   ${chalk.gray('# Check code quality')}\n`)
  console.log(chalk.green('📖 Check README.md for detailed documentation\n'))
}