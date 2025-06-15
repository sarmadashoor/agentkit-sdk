#!/usr/bin/env node
/**
 * Bundle Size Enforcement and Monitoring
 * 
 * Validates bundle sizes across packages and fails CI on regressions
 */

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

// Bundle size limits (bytes) - Set based on current bundle sizes with 10% headroom
const SIZE_LIMITS = {
  '@agentkit/runtime-web': {
    main: 20 * 1024, // 20KB gzipped (current: ~0.1KB)
    lite: 15 * 1024  // 15KB gzipped (current: ~0.3KB)
  },
  '@agentkit/sdk': {
    main: 60 * 1024  // 60KB gzipped (current: ~54KB)
  },
  '@agentkit/types': {
    main: 5 * 1024   // 5KB gzipped (current: ~2KB)
  },
  '@agentkit/registry': {
    main: 50 * 1024  // 50KB gzipped (current: ~44KB)
  }
}

// Track bundle sizes for CI reporting
const bundleStats = {
  packages: {},
  totalCompressed: 0,
  totalUncompressed: 0,
  violations: []
}

async function checkBundleSize(packagePath, packageName) {
  console.log(`\n📦 Checking bundle sizes for ${packageName}`)
  
  const distPath = path.join(packagePath, 'dist')
  if (!fs.existsSync(distPath)) {
    console.warn(`⚠️  No dist folder found for ${packageName}`)
    return
  }
  
  const packageLimits = SIZE_LIMITS[packageName] || {}
  const stats = {
    files: {},
    violations: []
  }
  
  // Check main bundle
  const mainFiles = [
    'index.js',
    'index.mjs'
  ]
  
  for (const file of mainFiles) {
    const filePath = path.join(distPath, file)
    if (fs.existsSync(filePath)) {
      await checkFile(filePath, file, packageLimits.main, stats, packageName)
    }
  }
  
  // Check lite bundle for runtime-web
  if (packageName === '@agentkit/runtime-web') {
    const liteFiles = ['lite.js']
    for (const file of liteFiles) {
      const filePath = path.join(distPath, file)
      if (fs.existsSync(filePath)) {
        await checkFile(filePath, file, packageLimits.lite, stats, packageName)
      }
    }
  }
  
  bundleStats.packages[packageName] = stats
  return stats
}

async function checkFile(filePath, fileName, sizeLimit, stats, packageName) {
  const content = fs.readFileSync(filePath)
  const uncompressed = content.length
  const compressed = zlib.gzipSync(content).length
  
  bundleStats.totalUncompressed += uncompressed
  bundleStats.totalCompressed += compressed
  
  const fileStats = {
    uncompressed,
    compressed,
    limit: sizeLimit,
    violation: sizeLimit && compressed > sizeLimit
  }
  
  stats.files[fileName] = fileStats
  
  console.log(`  ${fileName}:`)
  console.log(`    Uncompressed: ${formatBytes(uncompressed)}`)
  console.log(`    Gzipped: ${formatBytes(compressed)}`)
  
  if (sizeLimit) {
    const percentage = ((compressed / sizeLimit) * 100).toFixed(1)
    console.log(`    Limit: ${formatBytes(sizeLimit)} (${percentage}% used)`)
    
    if (fileStats.violation) {
      const overage = compressed - sizeLimit
      const violation = {
        package: packageName,
        file: fileName,
        size: compressed,
        limit: sizeLimit,
        overage
      }
      
      stats.violations.push(violation)
      bundleStats.violations.push(violation)
      
      console.log(`    🚨 SIZE VIOLATION: +${formatBytes(overage)} over limit!`)
    } else {
      console.log(`    ✅ Within size limit`)
    }
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

async function generateSizeReport() {
  console.log(`\n📊 Bundle Size Report`)
  console.log('='.repeat(50))
  
  console.log(`\nTotal Bundle Size:`)
  console.log(`  Uncompressed: ${formatBytes(bundleStats.totalUncompressed)}`)
  console.log(`  Gzipped: ${formatBytes(bundleStats.totalCompressed)}`)
  
  if (bundleStats.violations.length > 0) {
    console.log(`\n🚨 Size Violations (${bundleStats.violations.length}):`)
    bundleStats.violations.forEach(violation => {
      console.log(`  ${violation.package}/${violation.file}: ${formatBytes(violation.size)} (limit: ${formatBytes(violation.limit)})`)
    })
    
    return false // Fail CI
  } else {
    console.log(`\n✅ All bundles within size limits`)
    return true
  }
}

async function main() {
  console.log('🔍 Bundle Size Check Starting...')
  
  const packagesDir = path.join(__dirname, '..', 'packages')
  const packages = fs.readdirSync(packagesDir).filter(name => {
    return fs.statSync(path.join(packagesDir, name)).isDirectory()
  })
  
  for (const pkg of packages) {
    const packagePath = path.join(packagesDir, pkg)
    const packageJsonPath = path.join(packagePath, 'package.json')
    
    if (!fs.existsSync(packageJsonPath)) continue
    
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath))
    const packageName = packageJson.name
    
    if (!SIZE_LIMITS[packageName]) {
      console.log(`\n📦 ${packageName} - No size limits configured, skipping`)
      continue
    }
    
    await checkBundleSize(packagePath, packageName)
  }
  
  const success = await generateSizeReport()
  
  // Save stats for CI
  const statsPath = path.join(__dirname, '..', 'bundle-size-stats.json')
  fs.writeFileSync(statsPath, JSON.stringify(bundleStats, null, 2))
  console.log(`\n💾 Stats saved to ${statsPath}`)
  
  process.exit(success ? 0 : 1)
}

if (require.main === module) {
  main().catch(console.error)
}

module.exports = { checkBundleSize, generateSizeReport }