#!/usr/bin/env node

// Simple integration test for enhanced plugin template
const { PluginTemplate } = require('./dist/templates/PluginTemplate.js')

async function testTemplate() {
  console.log('🧪 Testing enhanced plugin template generation...')
  
  const template = new PluginTemplate()
  
  const testConfig = {
    name: 'test-logger',
    description: 'A test plugin for logging agent interactions',
    hooks: ['onInit', 'onSend', 'onError'],
    author: 'Test Author',
    license: 'MIT',
    browserSafe: true
  }
  
  try {
    // Test plugin code generation
    console.log('✅ Testing plugin code generation...')
    const pluginCode = template.generate(testConfig)
    
    // Verify enhanced features
    const expectedFeatures = [
      'readonly name',
      'readonly version', 
      'readonly description',
      'getConfig(): Readonly',
      'withConfig(newConfig',
      'TestLoggerConfig',
      'TestLoggerConfigSchema',
      'z.object({',
      'create${className}',
      'register${className}'
    ]
    
    let passed = 0
    expectedFeatures.forEach(feature => {
      if (pluginCode.includes(feature)) {
        console.log(`  ✓ ${feature}`)
        passed++
      } else {
        console.log(`  ✗ Missing: ${feature}`)
      }
    })
    
    // Test README generation
    console.log('✅ Testing enhanced README generation...')
    const readme = template.generateReadme(testConfig)
    
    const expectedReadmeFeatures = [
      '## Features',
      '⚡ Zero-config setup',
      '🔒 Type-safe configuration',
      '🎯 Implements 3 lifecycle hooks',
      '## Quick Start',
      '## API Reference',
      '### Lifecycle Hooks',
      '#### `onInit`',
      '#### `onSend`',
      '#### `onError`',
      '### Plugin Methods',
      '#### `getConfig()`',
      '#### `withConfig(newConfig)`',
      '## Troubleshooting',
      '### Common Issues',
      '### Debug Mode',
      'Built with [AgentKit]'
    ]
    
    let readmePassed = 0
    expectedReadmeFeatures.forEach(feature => {
      if (readme.includes(feature)) {
        console.log(`  ✓ ${feature}`)
        readmePassed++
      } else {
        console.log(`  ✗ Missing: ${feature}`)
      }
    })
    
    // Test hook usage examples
    console.log('✅ Testing hook usage examples...')
    const onInitExample = template.getHookUsageExample('onInit')
    const onSendExample = template.getHookUsageExample('onSend')
    
    if (onInitExample.includes('```typescript') && onInitExample.includes('async onInit')) {
      console.log('  ✓ onInit example generated')
    } else {
      console.log('  ✗ onInit example missing or invalid')
    }
    
    if (onSendExample.includes('```typescript') && onSendExample.includes('async onSend')) {
      console.log('  ✓ onSend example generated')
    } else {
      console.log('  ✗ onSend example missing or invalid')
    }
    
    console.log(`\n📊 Summary:`)
    console.log(`  Plugin Code: ${passed}/${expectedFeatures.length} features`)
    console.log(`  README: ${readmePassed}/${expectedReadmeFeatures.length} features`)
    console.log(`  Overall: ${Math.round((passed + readmePassed) / (expectedFeatures.length + expectedReadmeFeatures.length) * 100)}% complete`)
    
    if (passed >= expectedFeatures.length * 0.8 && readmePassed >= expectedReadmeFeatures.length * 0.8) {
      console.log('\n🎉 Enhanced plugin template test PASSED!')
      process.exit(0)
    } else {
      console.log('\n❌ Enhanced plugin template test FAILED!')
      process.exit(1)
    }
    
  } catch (error) {
    console.error('❌ Template test failed:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  testTemplate()
}

module.exports = { testTemplate }