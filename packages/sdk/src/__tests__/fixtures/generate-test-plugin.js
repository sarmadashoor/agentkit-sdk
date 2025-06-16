#!/usr/bin/env node

/**
 * Generate test plugin for lifecycle simulation
 * Simulates: npx @agentkit/cli create-plugin greet-plugin
 */

const fs = require('fs')
const path = require('path')

// Import the enhanced PluginTemplate
const { PluginTemplate } = require('../../../cli/src/templates/PluginTemplate')

function generateTestPlugin() {
  console.log('🏗️ Generating test plugin via CLI scaffolding simulation...')
  
  const template = new PluginTemplate()
  
  // Configuration for greet-plugin
  const pluginConfig = {
    name: 'greet-plugin',
    description: 'A test plugin for lifecycle simulation and chaos testing',
    hooks: ['onInit', 'onSend', 'onError', 'onShutdown'],
    author: 'AgentKit Test Suite',
    license: 'MIT',
    browserSafe: true
  }
  
  // Generate plugin code
  const pluginCode = template.generate(pluginConfig)
  
  // Create fixtures directory
  const fixturesDir = path.join(__dirname)
  const pluginDir = path.join(fixturesDir, 'greet-plugin')
  
  if (!fs.existsSync(pluginDir)) {
    fs.mkdirSync(pluginDir, { recursive: true })
  }
  
  // Write main plugin file
  fs.writeFileSync(path.join(pluginDir, 'index.ts'), pluginCode)
  
  // Generate package.json
  const packageJson = template.generatePackageJson(pluginConfig)
  fs.writeFileSync(path.join(pluginDir, 'package.json'), JSON.stringify(packageJson, null, 2))
  
  // Generate plugin.json
  const pluginJson = template.generatePluginJson(pluginConfig)
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(pluginJson, null, 2))
  
  // Generate test files
  const testCode = template.generateTests(pluginConfig)
  fs.writeFileSync(path.join(pluginDir, 'plugin.test.ts'), testCode)
  
  // Generate README
  const readme = template.generateReadme(pluginConfig)
  fs.writeFileSync(path.join(pluginDir, 'README.md'), readme)
  
  console.log(`✅ Test plugin generated at: ${pluginDir}`)
  console.log(`📦 Plugin name: ${pluginConfig.name}`)
  console.log(`🎯 Hooks: ${pluginConfig.hooks.join(', ')}`)
  
  return {
    pluginDir,
    pluginConfig,
    pluginCode
  }
}

// Add chaos injection capabilities to the generated plugin
function enhancePluginForChaos(pluginDir) {
  const indexPath = path.join(pluginDir, 'index.ts')
  let pluginCode = fs.readFileSync(indexPath, 'utf-8')
  
  // Add chaos injection configuration
  const chaosEnhancement = `
  // Chaos testing configuration
  private chaosConfig = {
    failOnInit: false,
    failOnSend: false,
    failOnError: false,
    failOnShutdown: false,
    delayMs: 0,
    throwAfterCalls: 0,
    callCount: 0
  }
  
  /**
   * Configure chaos testing behavior
   */
  setChaosConfig(config: Partial<typeof this.chaosConfig>): void {
    this.chaosConfig = { ...this.chaosConfig, ...config }
  }
  
  /**
   * Inject controlled delay and failures
   */
  private async injectChaos(hookName: string): Promise<void> {
    this.chaosConfig.callCount++
    
    // Inject delay if configured
    if (this.chaosConfig.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.chaosConfig.delayMs))
    }
    
    // Throw error if configured for this hook
    const shouldFail = this.chaosConfig[\`failOn\${hookName.charAt(2).toUpperCase() + hookName.slice(3)}\` as keyof typeof this.chaosConfig]
    if (shouldFail) {
      throw new Error(\`Chaos injection: \${hookName} failure simulation\`)
    }
    
    // Throw error after certain number of calls
    if (this.chaosConfig.throwAfterCalls > 0 && this.chaosConfig.callCount >= this.chaosConfig.throwAfterCalls) {
      throw new Error(\`Chaos injection: failure after \${this.chaosConfig.callCount} calls\`)
    }
  }`
  
  // Insert chaos methods before the first hook implementation
  const insertPoint = pluginCode.indexOf('async onInit')
  if (insertPoint !== -1) {
    pluginCode = pluginCode.slice(0, insertPoint) + chaosEnhancement + '\n\n  ' + pluginCode.slice(insertPoint)
  }
  
  // Add chaos injection calls to each hook
  const hooks = ['onInit', 'onSend', 'onError', 'onShutdown']
  
  hooks.forEach(hook => {
    const hookPattern = new RegExp(`(async ${hook}\\([^)]+\\): Promise<void> \\{\\s*)`, 'g')
    pluginCode = pluginCode.replace(hookPattern, `$1await this.injectChaos('${hook}')
    `)
  })
  
  fs.writeFileSync(indexPath, pluginCode)
  console.log('🧨 Enhanced plugin with chaos injection capabilities')
}

if (require.main === module) {
  const result = generateTestPlugin()
  enhancePluginForChaos(result.pluginDir)
}

module.exports = { generateTestPlugin, enhancePluginForChaos }