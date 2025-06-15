#!/usr/bin/env node
/**
 * Release Safety Checklist
 * 
 * Validates all requirements before publishing packages
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const RELEASE_CHECKLIST = [
  'validate_readme',
  'validate_changelog', 
  'validate_git_clean',
  'validate_builds',
  'validate_tests',
  'validate_lint',
  'validate_types',
  'validate_bundle_sizes',
  'validate_exports',
  'validate_dry_run'
]

let checkResults = {}

function runCommand(command, options = {}) {
  try {
    return execSync(command, { 
      encoding: 'utf8', 
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options 
    })
  } catch (error) {
    if (!options.allowFailure) {
      throw error
    }
    return null
  }
}

function validateReadme() {
  console.log('📖 Checking README.md...')
  
  const readmePath = path.join(__dirname, '..', 'README.md')
  if (!fs.existsSync(readmePath)) {
    throw new Error('README.md not found')
  }
  
  const readme = fs.readFileSync(readmePath, 'utf8')
  
  // Check for required sections
  const requiredSections = [
    'installation',
    'usage', 
    'api',
    'examples'
  ]
  
  const missing = requiredSections.filter(section => 
    !readme.toLowerCase().includes(section)
  )
  
  if (missing.length > 0) {
    console.warn(`⚠️  README missing sections: ${missing.join(', ')}`)
  }
  
  // Validate exports match README
  const packagesDir = path.join(__dirname, '..', 'packages')
  const packages = fs.readdirSync(packagesDir)
  
  for (const pkg of packages) {
    const packagePath = path.join(packagesDir, pkg, 'package.json')
    if (!fs.existsSync(packagePath)) continue
    
    const packageJson = JSON.parse(fs.readFileSync(packagePath))
    if (!readme.includes(packageJson.name)) {
      console.warn(`⚠️  Package ${packageJson.name} not mentioned in README`)
    }
  }
  
  console.log('✅ README validation passed')
  return true
}

function validateChangelog() {
  console.log('📝 Checking CHANGELOG.md...')
  
  const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md')
  if (!fs.existsSync(changelogPath)) {
    throw new Error('CHANGELOG.md not found')
  }
  
  const changelog = fs.readFileSync(changelogPath, 'utf8')
  
  // Check for version entries
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json')))
  const currentVersion = packageJson.version
  
  if (!changelog.includes(currentVersion)) {
    throw new Error(`CHANGELOG.md missing entry for version ${currentVersion}`)
  }
  
  console.log('✅ CHANGELOG validation passed')
  return true
}

function validateGitClean() {
  console.log('🔍 Checking git status...')
  
  try {
    const status = runCommand('git status --porcelain', { silent: true })
    if (status && status.trim()) {
      throw new Error('Git working directory not clean. Commit or stash changes.')
    }
  } catch (error) {
    throw new Error('Git status check failed: ' + error.message)
  }
  
  console.log('✅ Git status is clean')
  return true
}

function validateBuilds() {
  console.log('🏗️  Running builds...')
  
  try {
    runCommand('npm run build')
  } catch (error) {
    throw new Error('Build failed: ' + error.message)
  }
  
  console.log('✅ All builds successful')
  return true
}

function validateTests() {
  console.log('🧪 Running tests...')
  
  try {
    runCommand('npm run test')
  } catch (error) {
    throw new Error('Tests failed: ' + error.message)
  }
  
  console.log('✅ All tests passed')
  return true
}

function validateLint() {
  console.log('🔍 Running linting...')
  
  try {
    runCommand('npm run lint:check')
  } catch (error) {
    throw new Error('Linting failed: ' + error.message)
  }
  
  console.log('✅ Linting passed')
  return true
}

function validateTypes() {
  console.log('📝 Running type checking...')
  
  try {
    runCommand('npm run typecheck')
  } catch (error) {
    throw new Error('Type checking failed: ' + error.message)
  }
  
  console.log('✅ Type checking passed')
  return true
}

function validateBundleSizes() {
  console.log('📦 Checking bundle sizes...')
  
  try {
    runCommand('npm run size:check')
  } catch (error) {
    throw new Error('Bundle size limits exceeded: ' + error.message)
  }
  
  console.log('✅ Bundle sizes within limits')
  return true
}

function validateExports() {
  console.log('📤 Validating package exports...')
  
  const packagesDir = path.join(__dirname, '..', 'packages')
  const packages = fs.readdirSync(packagesDir)
  
  for (const pkg of packages) {
    const packagePath = path.join(packagesDir, pkg)
    const packageJsonPath = path.join(packagePath, 'package.json')
    
    if (!fs.existsSync(packageJsonPath)) continue
    
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath))
    
    // Check that main export files exist
    if (packageJson.main) {
      const mainPath = path.join(packagePath, packageJson.main)
      if (!fs.existsSync(mainPath)) {
        throw new Error(`Package ${packageJson.name}: main file ${packageJson.main} not found`)
      }
    }
    
    if (packageJson.types) {
      const typesPath = path.join(packagePath, packageJson.types)
      if (!fs.existsSync(typesPath)) {
        throw new Error(`Package ${packageJson.name}: types file ${packageJson.types} not found`)
      }
    }
    
    // Check exports field
    if (packageJson.exports) {
      for (const [exportKey, exportValue] of Object.entries(packageJson.exports)) {
        if (typeof exportValue === 'object') {
          for (const [condition, filePath] of Object.entries(exportValue)) {
            if (condition === 'types') continue // Types may not exist yet
            const fullPath = path.join(packagePath, filePath)
            if (!fs.existsSync(fullPath)) {
              throw new Error(`Package ${packageJson.name}: export ${exportKey}.${condition} file ${filePath} not found`)
            }
          }
        }
      }
    }
  }
  
  console.log('✅ Package exports validation passed')
  return true
}

function validateDryRun() {
  console.log('🚀 Running npm publish dry-run...')
  
  const packagesDir = path.join(__dirname, '..', 'packages')
  const packages = fs.readdirSync(packagesDir)
  
  for (const pkg of packages) {
    const packagePath = path.join(packagesDir, pkg)
    const packageJsonPath = path.join(packagePath, 'package.json')
    
    if (!fs.existsSync(packageJsonPath)) continue
    
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath))
    
    if (packageJson.private) continue
    
    try {
      runCommand(`cd ${packagePath} && npm publish --dry-run`, { silent: true })
    } catch (error) {
      throw new Error(`Dry-run failed for ${packageJson.name}: ${error.message}`)
    }
  }
  
  console.log('✅ Dry-run validation passed')
  return true
}

function generateReport() {
  console.log('\n📋 Release Safety Report')
  console.log('='.repeat(50))
  
  const passed = Object.values(checkResults).filter(Boolean).length
  const total = RELEASE_CHECKLIST.length
  
  console.log(`\nChecks passed: ${passed}/${total}\n`)
  
  RELEASE_CHECKLIST.forEach(check => {
    const status = checkResults[check] ? '✅' : '❌'
    const name = check.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    console.log(`${status} ${name}`)
  })
  
  if (passed === total) {
    console.log('\n🎉 All release safety checks passed!')
    console.log('🚀 Ready for publishing')
    return true
  } else {
    console.log(`\n❌ ${total - passed} checks failed`)
    console.log('🛑 Not ready for publishing')
    return false
  }
}

async function main() {
  console.log('🔐 Release Safety Checklist Starting...\n')
  
  for (const check of RELEASE_CHECKLIST) {
    try {
      const checkFunction = eval(check.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()))
      checkResults[check] = await checkFunction()
    } catch (error) {
      console.error(`❌ ${check} failed: ${error.message}`)
      checkResults[check] = false
    }
    console.log() // Add spacing
  }
  
  const success = generateReport()
  
  // Save results for CI
  const resultsPath = path.join(__dirname, '..', 'release-check-results.json')
  fs.writeFileSync(resultsPath, JSON.stringify(checkResults, null, 2))
  
  process.exit(success ? 0 : 1)
}

if (require.main === module) {
  main().catch(console.error)
}

module.exports = { RELEASE_CHECKLIST, checkResults }