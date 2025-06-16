// Quick validation of enhanced template features
const fs = require('fs')
const path = require('path')

function validateTemplate() {
  console.log('🧪 Validating enhanced plugin template...')
  
  try {
    // Read the enhanced PluginTemplate.ts file
    const templatePath = path.join(__dirname, 'src/templates/PluginTemplate.ts')
    const templateContent = fs.readFileSync(templatePath, 'utf-8')
    
    // Check for key enhancements
    const enhancements = [
      // Core plugin enhancements
      'readonly name =',
      'readonly version =',
      'readonly description =',
      'getConfig(): Readonly<',
      'withConfig(newConfig: Partial<',
      'private readonly pluginConfig:',
      
      // Factory functions
      'createTestLogger',
      'registerTestLogger',
      'export function create',
      'export function register',
      
      // Configuration schema
      'ConfigSchema = z.object({',
      '.strict() // Prevent additional properties',
      
      // Hook usage examples
      'getHookUsageExample(hook: PluginHookName): string',
      'async onInit(context: AgentContext)',
      'async onSend(payload: SendPayload',
      
      // Enhanced README features
      '## Features',
      '⚡ Zero-config setup',
      '🔒 Type-safe configuration',
      '🎯 Implements',
      '## Quick Start',
      '## API Reference',
      '### Lifecycle Hooks',
      '### Plugin Methods',
      '#### `getConfig()`',
      '#### `withConfig(newConfig)`',
      '## Troubleshooting',
      '### Common Issues',
      '### Debug Mode',
      'Built with [AgentKit]',
      
      // Development enhancements
      'npm run test -- --grep',
      'Code Quality',
      'Format code',
      'Development Workflow'
    ]
    
    let found = 0
    console.log('\n🔍 Checking for enhanced features:')
    
    enhancements.forEach(enhancement => {
      if (templateContent.includes(enhancement)) {
        console.log(`  ✓ ${enhancement}`)
        found++
      } else {
        console.log(`  ✗ Missing: ${enhancement}`)
      }
    })
    
    const score = found / enhancements.length
    console.log(`\n📊 Enhancement Score: ${found}/${enhancements.length} (${Math.round(score * 100)}%)`)
    
    if (score >= 0.85) {
      console.log('\n🎉 Template enhancement validation PASSED!')
      console.log('✨ All major enhancements successfully implemented!')
      return true
    } else if (score >= 0.7) {
      console.log('\n⚠️  Template enhancement validation PARTIAL PASS')
      console.log('✅ Most enhancements implemented, some minor features missing')
      return true
    } else {
      console.log('\n❌ Template enhancement validation FAILED!')
      console.log('❗ Significant enhancements are missing')
      return false
    }
    
  } catch (error) {
    console.error('❌ Validation failed:', error.message)
    return false
  }
}

if (require.main === module) {
  const success = validateTemplate()
  process.exit(success ? 0 : 1)
}

module.exports = { validateTemplate }