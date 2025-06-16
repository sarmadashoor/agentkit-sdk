import { PluginTemplate } from './src/templates/PluginTemplate'
import type { PluginConfig } from './src/types'

// Simple integration test for enhanced plugin template
async function testEnhancedTemplate() {
  console.log('🧪 Testing enhanced plugin template generation...')
  
  const template = new PluginTemplate()
  
  const testConfig: PluginConfig = {
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
      'readonly name = \'test-logger\'',
      'readonly version = \'1.0.0\'', 
      'readonly description',
      'getConfig(): Readonly<TestLoggerConfig>',
      'withConfig(newConfig: Partial<TestLoggerConfig>)',
      'TestLoggerConfig',
      'TestLoggerConfigSchema',
      'z.object({',
      'createTestLogger',
      'registerTestLogger'
    ]
    
    let passed = 0
    console.log('\n🔍 Checking plugin code features:')
    expectedFeatures.forEach(feature => {
      if (pluginCode.includes(feature)) {
        console.log(`  ✓ ${feature}`)
        passed++
      } else {
        console.log(`  ✗ Missing: ${feature}`)
      }
    })
    
    // Test README generation
    console.log('\n✅ Testing enhanced README generation...')
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
    console.log('\n🔍 Checking README features:')
    expectedReadmeFeatures.forEach(feature => {
      if (readme.includes(feature)) {
        console.log(`  ✓ ${feature}`)
        readmePassed++
      } else {
        console.log(`  ✗ Missing: ${feature}`)
      }
    })
    
    // Test hook usage examples
    console.log('\n✅ Testing hook usage examples...')
    const onInitExample = template.getHookUsageExample('onInit')
    const onSendExample = template.getHookUsageExample('onSend')
    
    console.log('🔍 Checking hook examples:')
    if (onInitExample.includes('```typescript') && onInitExample.includes('async onInit')) {
      console.log('  ✓ onInit example generated correctly')
    } else {
      console.log('  ✗ onInit example missing or invalid')
    }
    
    if (onSendExample.includes('```typescript') && onSendExample.includes('async onSend')) {
      console.log('  ✓ onSend example generated correctly')
    } else {
      console.log('  ✗ onSend example missing or invalid')
    }
    
    // Test browser safety features
    console.log('\n✅ Testing browser compatibility features...')
    if (pluginCode.includes('// @browser-safe')) {
      console.log('  ✓ Browser-safe marker included')
    } else {
      console.log('  ✗ Browser-safe marker missing')
    }
    
    if (pluginCode.includes('browserCompatibility: {')) {
      console.log('  ✓ Browser compatibility config included')
    } else {
      console.log('  ✗ Browser compatibility config missing')
    }
    
    console.log(`\n📊 Test Summary:`)
    console.log(`  Plugin Code Features: ${passed}/${expectedFeatures.length} (${Math.round(passed/expectedFeatures.length*100)}%)`)
    console.log(`  README Features: ${readmePassed}/${expectedReadmeFeatures.length} (${Math.round(readmePassed/expectedReadmeFeatures.length*100)}%)`)
    
    const totalScore = (passed + readmePassed) / (expectedFeatures.length + expectedReadmeFeatures.length)
    console.log(`  Overall Score: ${Math.round(totalScore * 100)}%`)
    
    if (totalScore >= 0.8) {
      console.log('\n🎉 Enhanced plugin template test PASSED!')
      console.log('✨ Template enhancements successfully implemented!')
      return true
    } else {
      console.log('\n❌ Enhanced plugin template test FAILED!')
      console.log('❗ Some template features are missing or incomplete')
      return false
    }
    
  } catch (error) {
    console.error('❌ Template test failed:', error.message)
    console.error(error.stack)
    return false
  }
}

export { testEnhancedTemplate }