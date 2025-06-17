#!/usr/bin/env node

const { execSync } = require('child_process')
const { copyFileSync, existsSync } = require('fs')
const { join } = require('path')

console.log('🔧 Building standalone AgentKit CLI...')

const cliDir = join(__dirname, 'packages/cli')
const originalPackageJson = join(cliDir, 'package.json')
const standalonePackageJson = join(cliDir, 'package-standalone.json')
const backupPackageJson = join(cliDir, 'package.json.bak')

try {
  // Backup original package.json
  console.log('📦 Backing up original package.json...')
  copyFileSync(originalPackageJson, backupPackageJson)
  
  // Replace with standalone package.json
  console.log('📦 Using standalone package.json...')
  copyFileSync(standalonePackageJson, originalPackageJson)
  
  // Install dependencies
  console.log('📥 Installing dependencies...')
  execSync('npm install --legacy-peer-deps', {
    cwd: cliDir,
    stdio: 'inherit'
  })
  
  // Build CLI
  console.log('🔨 Building CLI...')
  execSync('npm run build', {
    cwd: cliDir,
    stdio: 'inherit'
  })
  
  console.log('✅ CLI built successfully!')
  
  // Test CLI
  console.log('🧪 Testing CLI...')
  const cliBin = join(cliDir, 'bin/agentkit.js')
  
  try {
    const result = execSync(`node "${cliBin}" --help`, {
      encoding: 'utf8',
      timeout: 5000
    })
    console.log('✅ CLI test passed!')
    console.log(result)
  } catch (testError) {
    console.warn('⚠️ CLI test failed, but build succeeded:', testError.message)
  }
  
} catch (error) {
  console.error('❌ Build failed:', error.message)
  process.exit(1)
} finally {
  // Restore original package.json
  if (existsSync(backupPackageJson)) {
    console.log('📦 Restoring original package.json...')
    copyFileSync(backupPackageJson, originalPackageJson)
  }
}

console.log('🎉 Build process complete!')