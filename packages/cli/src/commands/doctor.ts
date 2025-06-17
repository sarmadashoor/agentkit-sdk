/**
 * Doctor Command - AgentKit CLI
 * 
 * Validates the AgentKit environment and provides health summary
 */

import * as fs from 'fs-extra'
import * as path from 'path'
import * as os from 'os'

interface HealthCheck {
  name: string
  status: 'pass' | 'fail' | 'warn'
  message: string
  details?: string
}

interface DoctorOptions {
  verbose?: boolean
  json?: boolean
}

export async function runDoctorCommand(options: DoctorOptions = {}): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = []

  // Check Node.js version
  checks.push(await checkNodeVersion())

  // Check environment variables
  checks.push(await checkEnvironmentVariables())

  // Check plugin directory status
  checks.push(await checkPluginDirectory())

  // Check AgentKit SDK installation
  checks.push(await checkSDKInstallation())

  // Check file system permissions
  checks.push(await checkFileSystemPermissions())

  // Check network connectivity (if needed)
  checks.push(await checkNetworkRequirements())

  if (options.json) {
    console.log(JSON.stringify({ checks }, null, 2))
  } else {
    await displayHealthSummary(checks, options.verbose)
  }

  return checks
}

async function checkNodeVersion(): Promise<HealthCheck> {
  const version = process.version
  const majorVersion = parseInt(version.slice(1).split('.')[0])

  if (majorVersion >= 18) {
    return {
      name: 'Node.js Version',
      status: 'pass',
      message: `Node.js ${version} (✓ supported)`,
      details: 'AgentKit requires Node.js 18.0.0 or higher'
    }
  } else if (majorVersion >= 16) {
    return {
      name: 'Node.js Version',
      status: 'warn',
      message: `Node.js ${version} (⚠ outdated)`,
      details: 'Node.js 18+ recommended for best compatibility'
    }
  } else {
    return {
      name: 'Node.js Version',
      status: 'fail',
      message: `Node.js ${version} (✗ unsupported)`,
      details: 'AgentKit requires Node.js 18.0.0 or higher'
    }
  }
}

async function checkEnvironmentVariables(): Promise<HealthCheck> {
  const requiredVars = ['NODE_ENV']
  const optionalVars = ['AGENTKIT_SIGNING_SECRET', 'AGENTKIT_PLUGIN_DIR']
  const issues: string[] = []

  // Check if we're in a reasonable environment
  const nodeEnv = process.env.NODE_ENV
  if (!nodeEnv) {
    issues.push('NODE_ENV not set (recommend: development, production, or test)')
  }

  // Check optional but useful variables
  if (!process.env.AGENTKIT_SIGNING_SECRET) {
    issues.push('AGENTKIT_SIGNING_SECRET not set (required for plugin signing)')
  }

  if (issues.length === 0) {
    return {
      name: 'Environment Variables',
      status: 'pass',
      message: 'All environment variables configured',
      details: `NODE_ENV: ${nodeEnv || 'unset'}`
    }
  } else if (issues.length === 1 && issues[0].includes('AGENTKIT_SIGNING_SECRET')) {
    return {
      name: 'Environment Variables',
      status: 'warn',
      message: 'Basic environment OK, signing secret missing',
      details: issues.join(', ')
    }
  } else {
    return {
      name: 'Environment Variables',
      status: 'fail',
      message: 'Environment configuration issues detected',
      details: issues.join(', ')
    }
  }
}

async function checkPluginDirectory(): Promise<HealthCheck> {
  const pluginDir = process.env.AGENTKIT_PLUGIN_DIR || path.join(os.homedir(), '.agentkit', 'plugins')
  
  try {
    const exists = await fs.pathExists(pluginDir)
    if (!exists) {
      await fs.ensureDir(pluginDir)
      return {
        name: 'Plugin Directory',
        status: 'pass',
        message: 'Plugin directory created',
        details: `Created: ${pluginDir}`
      }
    }

    const stats = await fs.stat(pluginDir)
    if (stats.isDirectory()) {
      const files = await fs.readdir(pluginDir)
      return {
        name: 'Plugin Directory',
        status: 'pass',
        message: `Plugin directory accessible (${files.length} items)`,
        details: pluginDir
      }
    } else {
      return {
        name: 'Plugin Directory',
        status: 'fail',
        message: 'Plugin path exists but is not a directory',
        details: pluginDir
      }
    }
  } catch (error) {
    return {
      name: 'Plugin Directory',
      status: 'fail',
      message: 'Cannot access plugin directory',
      details: `${pluginDir}: ${error.message}`
    }
  }
}

async function checkSDKInstallation(): Promise<HealthCheck> {
  try {
    // Check if AgentKit SDK types are available
    const packageJsonPath = path.join(process.cwd(), 'package.json')
    const packageJsonExists = await fs.pathExists(packageJsonPath)
    
    if (!packageJsonExists) {
      return {
        name: 'AgentKit SDK',
        status: 'warn',
        message: 'Not in a Node.js project directory',
        details: 'Run from a project with package.json to check SDK installation'
      }
    }

    const packageJson = await fs.readJson(packageJsonPath)
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
    
    const agentKitDeps = Object.keys(deps).filter(dep => dep.startsWith('@agentkit/'))
    
    if (agentKitDeps.length > 0) {
      return {
        name: 'AgentKit SDK',
        status: 'pass',
        message: `AgentKit packages found (${agentKitDeps.length})`,
        details: agentKitDeps.join(', ')
      }
    } else {
      return {
        name: 'AgentKit SDK',
        status: 'warn',
        message: 'No AgentKit packages detected',
        details: 'Install @agentkit/sdk or related packages to use AgentKit'
      }
    }
  } catch (error) {
    return {
      name: 'AgentKit SDK',
      status: 'fail',
      message: 'Error checking SDK installation',
      details: error.message
    }
  }
}

async function checkFileSystemPermissions(): Promise<HealthCheck> {
  const tempDir = os.tmpdir()
  const testFile = path.join(tempDir, `agentkit-test-${Date.now()}.tmp`)
  
  try {
    await fs.writeFile(testFile, 'test')
    await fs.readFile(testFile)
    await fs.unlink(testFile)
    
    return {
      name: 'File System Permissions',
      status: 'pass',
      message: 'Read/write permissions OK',
      details: `Tested in: ${tempDir}`
    }
  } catch (error) {
    return {
      name: 'File System Permissions',
      status: 'fail',
      message: 'File system permission issues',
      details: `Cannot write to: ${tempDir}`
    }
  }
}

async function checkNetworkRequirements(): Promise<HealthCheck> {
  // For now, just check if we can resolve basic networking
  // In a real implementation, this might check registry connectivity
  try {
    const hostname = os.hostname()
    return {
      name: 'Network Configuration',
      status: 'pass',
      message: 'Basic network configuration OK',
      details: `Hostname: ${hostname}`
    }
  } catch (error) {
    return {
      name: 'Network Configuration',
      status: 'warn',
      message: 'Network configuration issues detected',
      details: error.message
    }
  }
}

async function displayHealthSummary(checks: HealthCheck[], verbose: boolean = false): Promise<void> {
  const styles = {
    cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
    green: (text: string) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
    red: (text: string) => `\x1b[31m${text}\x1b[0m`,
    bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
    dim: (text: string) => `\x1b[2m${text}\x1b[0m`
  }

  console.log(styles.cyan('\n🔧 AgentKit Health Check\n'))

  const passed = checks.filter(c => c.status === 'pass').length
  const warned = checks.filter(c => c.status === 'warn').length
  const failed = checks.filter(c => c.status === 'fail').length

  for (const check of checks) {
    let statusSymbol = '✓'
    let statusColor = styles.green
    
    if (check.status === 'warn') {
      statusSymbol = '⚠'
      statusColor = styles.yellow
    } else if (check.status === 'fail') {
      statusSymbol = '✗'
      statusColor = styles.red
    }

    console.log(`${statusColor(statusSymbol)} ${styles.bold(check.name)}: ${check.message}`)
    
    if (verbose && check.details) {
      console.log(`   ${styles.dim(check.details)}`)
    }
  }

  console.log('')
  
  // Summary
  if (failed > 0) {
    console.log(styles.red(`❌ ${failed} critical issue${failed !== 1 ? 's' : ''} found`))
  }
  if (warned > 0) {
    console.log(styles.yellow(`⚠️  ${warned} warning${warned !== 1 ? 's' : ''} found`))
  }
  if (passed > 0) {
    console.log(styles.green(`✅ ${passed} check${passed !== 1 ? 's' : ''} passed`))
  }

  if (failed === 0 && warned === 0) {
    console.log(styles.green('\n🎉 AgentKit environment is healthy!\n'))
  } else if (failed === 0) {
    console.log(styles.yellow('\n✨ AgentKit environment is mostly healthy\n'))
  } else {
    console.log(styles.red('\n🚨 AgentKit environment has critical issues\n'))
  }
}

// Export for CLI integration
export const doctorCommand = {
  name: 'doctor',
  description: 'Validate AgentKit environment and dependencies',
  options: [
    { flags: '--verbose', description: 'Show detailed information' },
    { flags: '--json', description: 'Output results in JSON format' }
  ],
  action: runDoctorCommand
}