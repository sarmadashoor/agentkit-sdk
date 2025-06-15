#!/usr/bin/env node
/**
 * Release CLI Tool
 * 
 * Automates version bumping, validation, and publishing
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const readline = require('readline')

const BUMP_TYPES = ['patch', 'minor', 'major', 'prerelease']

function runCommand(command, options = {}) {
  try {
    const result = execSync(command, { 
      encoding: 'utf8', 
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options 
    })
    return result
  } catch (error) {
    console.error(`Command failed: ${command}`)
    throw error
  }
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(answer)
    })
  })
}

function getCurrentVersion() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json')))
  return packageJson.version
}

function bumpVersion(currentVersion, bumpType) {
  const parts = currentVersion.split('.')
  let [major, minor, patch] = parts.map(Number)
  
  // Handle prerelease versions
  let prerelease = null
  if (parts.length > 3 || patch.toString().includes('-')) {
    const patchStr = parts[2] || '0'
    if (patchStr.includes('-')) {
      const [patchNum, prereleaseStr] = patchStr.split('-')
      patch = Number(patchNum)
      prerelease = prereleaseStr
    }
  }
  
  switch (bumpType) {
    case 'major':
      major += 1
      minor = 0
      patch = 0
      prerelease = null
      break
    case 'minor':
      minor += 1
      patch = 0
      prerelease = null
      break
    case 'patch':
      patch += 1
      prerelease = null
      break
    case 'prerelease':
      if (prerelease) {
        const prereleaseNum = prerelease.match(/\\d+$/)
        if (prereleaseNum) {
          prerelease = prerelease.replace(/\\d+$/, String(Number(prereleaseNum[0]) + 1))
        } else {
          prerelease += '.1'
        }
      } else {
        patch += 1
        prerelease = 'alpha.0'
      }
      break
  }
  
  let newVersion = `${major}.${minor}.${patch}`
  if (prerelease) {
    newVersion += `-${prerelease}`
  }
  
  return newVersion
}

function updatePackageVersions(newVersion) {
  console.log(`📝 Updating package.json files to ${newVersion}...`)
  
  // Update root package.json
  const rootPackagePath = path.join(__dirname, '..', 'package.json')
  const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath))
  rootPackage.version = newVersion
  fs.writeFileSync(rootPackagePath, JSON.stringify(rootPackage, null, 2) + '\\n')
  
  // Update workspace packages
  const packagesDir = path.join(__dirname, '..', 'packages')
  const packages = fs.readdirSync(packagesDir)
  
  for (const pkg of packages) {
    const packagePath = path.join(packagesDir, pkg, 'package.json')
    if (!fs.existsSync(packagePath)) continue
    
    const packageJson = JSON.parse(fs.readFileSync(packagePath))
    packageJson.version = newVersion
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\\n')
  }
}

function updateChangelog(newVersion) {
  console.log(`📝 Updating CHANGELOG.md for ${newVersion}...`)
  
  const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md')
  let changelog = ''
  
  if (fs.existsSync(changelogPath)) {
    changelog = fs.readFileSync(changelogPath, 'utf8')
  } else {
    changelog = '# Changelog\\n\\nAll notable changes to this project will be documented in this file.\\n\\n'
  }
  
  const today = new Date().toISOString().split('T')[0]
  const newEntry = `## [${newVersion}] - ${today}\\n\\n### Added\\n- Release ${newVersion}\\n\\n`
  
  // Insert after the header
  const lines = changelog.split('\\n')
  const insertIndex = lines.findIndex(line => line.startsWith('## [')) 
  
  if (insertIndex === -1) {
    // No previous entries, add after header
    changelog += newEntry
  } else {
    lines.splice(insertIndex, 0, ...newEntry.split('\\n'))
    changelog = lines.join('\\n')
  }
  
  fs.writeFileSync(changelogPath, changelog)
}

async function runReleaseChecks() {
  console.log('🔍 Running release safety checks...')
  
  try {
    runCommand('npm run release:check')
  } catch (error) {
    console.error('❌ Release checks failed')
    const proceed = await prompt('Continue anyway? (y/N): ')
    if (proceed.toLowerCase() !== 'y') {
      process.exit(1)
    }
  }
}

function createGitTag(version) {
  console.log(`🏷️  Creating git tag v${version}...`)
  
  runCommand('git add .')
  runCommand(`git commit -m "chore: release v${version}"`)
  runCommand(`git tag v${version}`)
}

async function publishPackages() {
  console.log('🚀 Publishing packages...')
  
  const packagesDir = path.join(__dirname, '..', 'packages')
  const packages = fs.readdirSync(packagesDir)
  
  for (const pkg of packages) {
    const packagePath = path.join(packagesDir, pkg)
    const packageJsonPath = path.join(packagePath, 'package.json')
    
    if (!fs.existsSync(packageJsonPath)) continue
    
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath))
    
    if (packageJson.private) {
      console.log(`⏭️  Skipping private package: ${packageJson.name}`)
      continue
    }
    
    console.log(`📦 Publishing ${packageJson.name}...`)
    
    try {
      runCommand(`cd ${packagePath} && npm publish`)
      console.log(`✅ Published ${packageJson.name}`)
    } catch (error) {
      console.error(`❌ Failed to publish ${packageJson.name}:`, error.message)
      throw error
    }
  }
}

async function main() {
  console.log('🚀 AgentKit SDK Release Tool\\n')
  
  // Parse command line arguments
  const args = process.argv.slice(2)
  let bumpType = args[0]
  let dryRun = args.includes('--dry-run')
  let skipChecks = args.includes('--skip-checks')
  
  if (!bumpType || !BUMP_TYPES.includes(bumpType)) {
    console.log('Usage: npm run release <bump-type> [--dry-run] [--skip-checks]')
    console.log(`Bump types: ${BUMP_TYPES.join(', ')}`)
    console.log('\\nExample: npm run release patch')
    process.exit(1)
  }
  
  const currentVersion = getCurrentVersion()
  const newVersion = bumpVersion(currentVersion, bumpType)
  
  console.log(`Current version: ${currentVersion}`)
  console.log(`New version: ${newVersion}`)
  console.log(`Bump type: ${bumpType}`)
  console.log(`Dry run: ${dryRun}`)
  console.log()
  
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made')
  }
  
  // Confirm with user
  const proceed = await prompt(`Proceed with release ${newVersion}? (y/N): `)
  if (proceed.toLowerCase() !== 'y') {
    console.log('Release cancelled')
    process.exit(0)
  }
  
  try {
    // Run safety checks first
    if (!skipChecks) {
      await runReleaseChecks()
    }
    
    if (!dryRun) {
      // Update versions
      updatePackageVersions(newVersion)
      updateChangelog(newVersion)
      
      // Build and test with new version
      console.log('🏗️  Building packages...')
      runCommand('npm run build')
      
      console.log('🧪 Running tests...')
      runCommand('npm run test')
      
      console.log('📦 Checking bundle sizes...')
      runCommand('npm run size:check')
      
      // Create git tag
      createGitTag(newVersion)
      
      // Publish packages
      await publishPackages()
      
      console.log('\\n🎉 Release completed successfully!')
      console.log(`Version ${newVersion} has been published`)
      console.log('\\nNext steps:')
      console.log('1. Push changes: git push && git push --tags')
      console.log('2. Create GitHub release with changelog')
      console.log('3. Update documentation if needed')
      
    } else {
      console.log('\\n✅ Dry run completed - all checks passed')
      console.log('Run without --dry-run to execute the release')
    }
    
  } catch (error) {
    console.error('\\n❌ Release failed:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch(console.error)
}

module.exports = { bumpVersion, updatePackageVersions }