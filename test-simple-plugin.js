// Simple test to verify the fix works
import { PluginExecutor } from './packages/sdk/src/plugins/execution/PluginExecutor.js'
import { PlatformEnvironment } from './packages/sdk/src/plugins/environment/PlatformEnvironment.js'
import { PluginSecurity } from './packages/sdk/src/plugins/security/PluginSecurity.js'

// Create a simple plugin function
const simplePlugin = function(payload, context) {
  return { result: 'success', payload }
}

const asyncPlugin = async function(payload, context) {
  return { result: 'async success', payload }
}

// Test the plugin executor
const platformEnv = new PlatformEnvironment()
const security = new PluginSecurity()

const executor = new PluginExecutor({
  platformEnv,
  security,
  debug: true
})

console.log('Testing simple plugin execution...')

try {
  const result1 = await executor.executePluginHook(
    { name: 'TestPlugin', version: '1.0.0' },
    'onSend',
    simplePlugin,
    [{ content: 'test' }, { agentId: 'test' }]
  )
  console.log('Simple plugin result:', result1)

  const result2 = await executor.executePluginHook(
    { name: 'TestPlugin', version: '1.0.0' },
    'onSend', 
    asyncPlugin,
    [{ content: 'test' }, { agentId: 'test' }]
  )
  console.log('Async plugin result:', result2)

  console.log('✅ Plugin execution tests passed!')
} catch (error) {
  console.error('❌ Plugin execution failed:', error.message)
  console.error(error.stack)
}