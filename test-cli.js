#!/usr/bin/env node

console.log('🧪 Testing AgentKit CLI...')

// Test if the CLI binary can be executed
const { execSync } = require('child_process')
const { join } = require('path')

const cliBin = join(__dirname, 'packages/cli/bin/agentkit.js')

try {
  console.log('📝 Testing CLI help...')
  
  // Test if the CLI loads without errors
  const result = execSync(`node "${cliBin}" --help`, {
    encoding: 'utf8',
    timeout: 10000,
    stdio: 'pipe'
  })
  
  console.log('✅ CLI help output:')
  console.log(result)
  
  console.log('\n🎯 Testing CLI doctor command...')
  
  const doctorResult = execSync(`node "${cliBin}" doctor`, {
    encoding: 'utf8',
    timeout: 10000,
    stdio: 'pipe'
  })
  
  console.log('✅ Doctor command output:')
  console.log(doctorResult)
  
  console.log('\n🎯 Testing CLI create-plugin help...')
  
  const createHelpResult = execSync(`node "${cliBin}" create-plugin --help`, {
    encoding: 'utf8',
    timeout: 10000,
    stdio: 'pipe'
  })
  
  console.log('✅ Create plugin help output:')
  console.log(createHelpResult)
  
  console.log('\n✅ All CLI tests passed!')
  
} catch (error) {
  console.error('❌ CLI test failed:', error.message)
  
  if (error.message.includes('Cannot find module')) {
    console.error('\n💡 This appears to be a missing dependency issue.')
    console.error('The CLI requires dependencies to be installed.')
  }
  
  process.exit(1)
}