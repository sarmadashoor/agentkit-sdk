#!/usr/bin/env node

/**
 * Plugin validation script for git hooks and CI/CD
 * Validates that generated plugins follow AgentKit standards
 */

const fs = require('fs')
const path = require('path')

function validatePlugin(pluginDir) {
  console.log(`🔍 Validating plugin at: ${pluginDir}`)
  
  const requiredFiles = [
    'index.ts',
    'package.json',
    'tsconfig.json',
    'plugin.json',
    'README.md'
  ]
  
  const optionalFiles = [
    'plugin.test.ts',
    'plugin.integration.test.ts',
    '.eslintrc.js',
    'vitest.config.ts'
  ]
  
  // Check required files
  let missingRequired = []
  for (const file of requiredFiles) {
    const filePath = path.join(pluginDir, file)
    if (!fs.existsSync(filePath)) {
      missingRequired.push(file)
    }
  }
  
  if (missingRequired.length > 0) {
    console.error(`❌ Missing required files: ${missingRequired.join(', ')}`)
    return false
  }
  
  // Validate plugin.json structure
  try {
    const pluginJsonPath = path.join(pluginDir, 'plugin.json')
    const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'))
    
    const requiredPluginFields = ['name', 'version', 'description', 'author', 'license', 'hooks']
    let missingFields = []
    
    for (const field of requiredPluginFields) {
      if (!(field in pluginJson)) {
        missingFields.push(field)
      }
    }
    
    if (missingFields.length > 0) {
      console.error(`❌ Missing plugin.json fields: ${missingFields.join(', ')}`)
      return false
    }
    
    // Validate hooks are valid
    const validHooks = ['onInit', 'onSend', 'onError', 'onShutdown']
    const invalidHooks = pluginJson.hooks.filter(hook => !validHooks.includes(hook))
    
    if (invalidHooks.length > 0) {
      console.error(`❌ Invalid hooks in plugin.json: ${invalidHooks.join(', ')}`)
      console.error(`   Valid hooks: ${validHooks.join(', ')}`)
      return false
    }
    
  } catch (error) {
    console.error(`❌ Invalid plugin.json: ${error.message}`)
    return false
  }
  
  // Validate package.json structure
  try {
    const packageJsonPath = path.join(pluginDir, 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    
    const requiredPackageFields = ['name', 'version', 'description', 'main', 'author', 'license']
    let missingFields = []
    
    for (const field of requiredPackageFields) {
      if (!(field in packageJson)) {
        missingFields.push(field)
      }
    }
    
    if (missingFields.length > 0) {
      console.error(`❌ Missing package.json fields: ${missingFields.join(', ')}`)
      return false
    }
    
    // Check peer dependencies
    if (!packageJson.peerDependencies || !packageJson.peerDependencies['@agentkit/types']) {
      console.error(`❌ Missing @agentkit/types peer dependency`)
      return false
    }
    
    if (!packageJson.peerDependencies || !packageJson.peerDependencies['@agentkit/sdk']) {
      console.error(`❌ Missing @agentkit/sdk peer dependency`)
      return false
    }
    
  } catch (error) {
    console.error(`❌ Invalid package.json: ${error.message}`)
    return false
  }
  
  // Validate TypeScript plugin structure
  try {
    const indexPath = path.join(pluginDir, 'index.ts')
    const indexContent = fs.readFileSync(indexPath, 'utf-8')
    
    const requiredPatterns = [
      /implements AgentKitPlugin/,
      /readonly name/,
      /readonly version/,
      /export.*Config.*Schema/,
      /z\.object\(/,
      /getConfig\(\)/,
      /withConfig\(/
    ]
    
    for (const pattern of requiredPatterns) {
      if (!pattern.test(indexContent)) {
        console.error(`❌ Plugin implementation missing required pattern: ${pattern}`)
        return false
      }
    }
    
    // Check imports
    if (!indexContent.includes("import type { AgentKitPlugin")) {
      console.error(`❌ Missing AgentKitPlugin import`)
      return false
    }
    
    if (!indexContent.includes("import { z } from 'zod'")) {
      console.error(`❌ Missing Zod import for configuration validation`)
      return false
    }
    
  } catch (error) {
    console.error(`❌ Error validating plugin implementation: ${error.message}`)
    return false
  }
  
  // Check optional but recommended files
  let recommendations = []
  for (const file of optionalFiles) {
    const filePath = path.join(pluginDir, file)
    if (!fs.existsSync(filePath)) {
      recommendations.push(file)
    }
  }
  
  if (recommendations.length > 0) {
    console.warn(`⚠️  Consider adding these optional files: ${recommendations.join(', ')}`)
  }
  
  console.log(`✅ Plugin validation passed!`)
  return true
}

function validateAllPlugins(rootDir = process.cwd()) {
  const pluginsDir = path.join(rootDir, 'plugins')
  
  if (!fs.existsSync(pluginsDir)) {
    console.log(`🔍 No plugins directory found at ${pluginsDir}`)
    return true
  }
  
  const plugins = fs.readdirSync(pluginsDir).filter(item => {
    const itemPath = path.join(pluginsDir, item)
    return fs.statSync(itemPath).isDirectory()
  })
  
  if (plugins.length === 0) {
    console.log(`🔍 No plugins found in ${pluginsDir}`)
    return true
  }
  
  console.log(`🔍 Found ${plugins.length} plugin(s) to validate...`)
  
  let allValid = true
  for (const plugin of plugins) {
    const pluginPath = path.join(pluginsDir, plugin)
    console.log(`\n--- Validating ${plugin} ---`)
    if (!validatePlugin(pluginPath)) {
      allValid = false
    }
  }
  
  return allValid
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2)
  let targetPath = process.cwd()
  
  if (args.length > 0) {
    targetPath = path.resolve(args[0])
  }
  
  console.log(`🧪 AgentKit Plugin Validator`)
  console.log(`📂 Checking: ${targetPath}`)
  
  const isValid = fs.statSync(targetPath).isDirectory() && path.basename(targetPath) !== 'plugins' 
    ? validateAllPlugins(targetPath)
    : validatePlugin(targetPath)
  
  if (isValid) {
    console.log(`\n🎉 All validations passed!`)
    process.exit(0)
  } else {
    console.log(`\n❌ Validation failed!`)
    process.exit(1)
  }
}

module.exports = { validatePlugin, validateAllPlugins }