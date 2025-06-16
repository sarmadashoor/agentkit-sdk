#!/usr/bin/env node

/**
 * CI Test Enforcement Script for AgentKit SDK
 * Enforces comprehensive test execution and quality gates in CI/CD pipeline
 */

const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { CoverageEnforcer, COVERAGE_THRESHOLD } = require('./coverage-enforcement')

const SCRIPT_DIR = __dirname
const ROOT_DIR = path.join(SCRIPT_DIR, '..')
const PACKAGES_DIR = path.join(ROOT_DIR, 'packages')

class CITestEnforcer {
  constructor() {
    this.results = {
      packages: {},
      testSuites: {
        unit: { status: 'pending', details: {} },
        integration: { status: 'pending', details: {} },
        chaos: { status: 'pending', details: {} },
        load: { status: 'pending', details: {} },
        security: { status: 'pending', details: {} }
      },
      coverage: { status: 'pending', details: {} },
      quality: { status: 'pending', details: {} },
      failures: [],
      startTime: Date.now()
    }
  }

  async enforceAll() {
    console.log('🚀 AgentKit SDK CI Test Enforcement Starting...\n')
    
    try {
      // Step 1: Validate test metadata and annotations
      await this.validateTestMetadata()
      
      // Step 2: Run comprehensive test suites
      await this.runTestSuites()
      
      // Step 3: Enforce coverage requirements
      await this.enforceCoverage()
      
      // Step 4: Quality gate validation
      await this.validateQualityGates()
      
      // Step 5: Generate comprehensive report
      await this.generateCIReport()
      
      // Step 6: Final validation
      this.validateResults()
      
    } catch (error) {
      console.error(`❌ CI Test Enforcement failed: ${error.message}`)
      process.exit(1)
    }
    
    const duration = Date.now() - this.results.startTime
    console.log(`✅ CI Test Enforcement completed successfully in ${duration}ms`)
  }

  async validateTestMetadata() {
    console.log('📋 Validating test metadata and annotations...')
    
    const testFiles = await this.findTestFiles()
    const metadataValidation = {
      total: testFiles.length,
      withMetadata: 0,
      missingMetadata: [],
      invalidMetadata: [],
      categories: new Set(),
      types: new Set()
    }

    for (const testFile of testFiles) {
      try {
        const content = await fs.readFile(testFile, 'utf-8')
        const metadata = this.extractTestMetadata(content)
        
        if (metadata.annotations.length > 0) {
          metadataValidation.withMetadata++
          metadata.annotations.forEach(ann => {
            if (ann.key === 'category') metadataValidation.categories.add(ann.value)
            if (ann.key === 'type') metadataValidation.types.add(ann.value)
          })
        } else {
          metadataValidation.missingMetadata.push(testFile)
        }
        
        // Validate required metadata for specific test types
        if (testFile.includes('/chaos/') && !metadata.annotations.some(a => a.key === 'technique')) {
          metadataValidation.invalidMetadata.push({
            file: testFile,
            reason: 'Chaos test missing @testmeta technique annotation'
          })
        }
        
      } catch (error) {
        metadataValidation.invalidMetadata.push({
          file: testFile,
          reason: `Failed to parse: ${error.message}`
        })
      }
    }

    this.results.testSuites.metadata = {
      status: metadataValidation.missingMetadata.length === 0 && metadataValidation.invalidMetadata.length === 0 ? 'passed' : 'failed',
      details: metadataValidation
    }

    console.log(`   Tests with metadata: ${metadataValidation.withMetadata}/${metadataValidation.total}`)
    console.log(`   Categories found: ${Array.from(metadataValidation.categories).join(', ')}`)
    console.log(`   Types found: ${Array.from(metadataValidation.types).join(', ')}`)
    
    if (metadataValidation.missingMetadata.length > 0) {
      console.warn(`   ⚠️  Missing metadata: ${metadataValidation.missingMetadata.length} files`)
    }
    
    if (metadataValidation.invalidMetadata.length > 0) {
      console.error(`   ❌ Invalid metadata: ${metadataValidation.invalidMetadata.length} files`)
      metadataValidation.invalidMetadata.forEach(invalid => {
        console.error(`      ${invalid.file}: ${invalid.reason}`)
      })
    }
  }

  async runTestSuites() {
    console.log('\n🧪 Running comprehensive test suites...')
    
    const suites = [
      { name: 'unit', pattern: '**/*.test.ts', exclude: ['**/load/**', '**/chaos/**'], timeout: 30000 },
      { name: 'integration', pattern: '**/*integration*.test.ts', exclude: [], timeout: 60000 },
      { name: 'chaos', pattern: '**/chaos/**/*.test.ts', exclude: [], timeout: 120000 },
      { name: 'load', pattern: '**/load/**/*.test.ts', exclude: [], timeout: 180000 },
      { name: 'security', pattern: '**/*sandbox*.test.ts', exclude: [], timeout: 90000 }
    ]

    for (const suite of suites) {
      try {
        console.log(`   Running ${suite.name} tests...`)
        
        const startTime = Date.now()
        const result = await this.runTestSuite(suite)
        const duration = Date.now() - startTime
        
        this.results.testSuites[suite.name] = {
          status: result.success ? 'passed' : 'failed',
          details: {
            ...result,
            duration,
            timeout: suite.timeout
          }
        }
        
        console.log(`   ${suite.name}: ${result.success ? '✅' : '❌'} (${duration}ms)`)
        if (!result.success) {
          console.log(`      Failures: ${result.failures}`)
          console.log(`      Error: ${result.error}`)
        }
        
      } catch (error) {
        this.results.testSuites[suite.name] = {
          status: 'failed',
          details: { error: error.message }
        }
        console.log(`   ${suite.name}: ❌ (${error.message})`)
      }
    }
  }

  async runTestSuite(suite) {
    try {
      // Build vitest command with pattern and exclusions
      let command = 'npx vitest run --reporter=json'
      
      if (suite.pattern) {
        command += ` "${suite.pattern}"`
      }
      
      const output = execSync(command, {
        cwd: ROOT_DIR,
        timeout: suite.timeout,
        encoding: 'utf-8'
      })
      
      // Parse vitest JSON output
      const result = JSON.parse(output)
      
      return {
        success: result.success,
        tests: result.numTotalTests,
        passed: result.numPassedTests,
        failed: result.numFailedTests,
        failures: result.numFailedTests,
        duration: result.duration
      }
      
    } catch (error) {
      // Handle timeout and other execution errors
      if (error.signal === 'SIGTERM') {
        return {
          success: false,
          error: `Test suite timed out after ${suite.timeout}ms`,
          tests: 0,
          passed: 0,
          failed: 0,
          failures: 0
        }
      }
      
      return {
        success: false,
        error: error.message,
        tests: 0,
        passed: 0,
        failed: 0,
        failures: 0
      }
    }
  }

  async enforceCoverage() {
    console.log('\n📊 Enforcing coverage requirements...')
    
    try {
      const coverageEnforcer = new CoverageEnforcer()
      await coverageEnforcer.enforceAll()
      await coverageEnforcer.generateAggregatedReport()
      
      this.results.coverage = {
        status: 'passed',
        details: coverageEnforcer.results
      }
      
      console.log('   Coverage enforcement: ✅')
      
    } catch (error) {
      this.results.coverage = {
        status: 'failed',
        details: { error: error.message }
      }
      console.log(`   Coverage enforcement: ❌ (${error.message})`)
    }
  }

  async validateQualityGates() {
    console.log('\n🚨 Validating quality gates...')
    
    const qualityGates = {
      linting: await this.runLinting(),
      typeCheck: await this.runTypeCheck(),
      security: await this.runSecurityAudit(),
      bundleSize: await this.checkBundleSize()
    }

    const allPassed = Object.values(qualityGates).every(gate => gate.success)
    
    this.results.quality = {
      status: allPassed ? 'passed' : 'failed',
      details: qualityGates
    }

    console.log(`   Quality gates: ${allPassed ? '✅' : '❌'}`)
    Object.entries(qualityGates).forEach(([gate, result]) => {
      console.log(`      ${gate}: ${result.success ? '✅' : '❌'}`)
      if (!result.success) {
        console.log(`         ${result.error}`)
      }
    })
  }

  async runLinting() {
    try {
      execSync('npm run lint', { cwd: ROOT_DIR, stdio: 'pipe' })
      return { success: true }
    } catch (error) {
      return { success: false, error: 'Linting failed' }
    }
  }

  async runTypeCheck() {
    try {
      execSync('npm run typecheck', { cwd: ROOT_DIR, stdio: 'pipe' })
      return { success: true }
    } catch (error) {
      return { success: false, error: 'Type checking failed' }
    }
  }

  async runSecurityAudit() {
    try {
      execSync('npm audit --audit-level moderate', { cwd: ROOT_DIR, stdio: 'pipe' })
      return { success: true }
    } catch (error) {
      return { success: false, error: 'Security audit found issues' }
    }
  }

  async checkBundleSize() {
    try {
      // Check if bundles are within size limits
      const packageDirs = await fs.readdir(PACKAGES_DIR)
      
      for (const pkg of packageDirs) {
        const distDir = path.join(PACKAGES_DIR, pkg, 'dist')
        if (fsSync.existsSync(distDir)) {
          const stats = await this.getBundleStats(distDir)
          
          // Basic bundle size check (adjust limits as needed)
          if (stats.totalSize > 5 * 1024 * 1024) { // 5MB limit
            return { 
              success: false, 
              error: `Package ${pkg} bundle size ${stats.totalSize} exceeds 5MB limit` 
            }
          }
        }
      }
      
      return { success: true }
    } catch (error) {
      return { success: false, error: `Bundle size check failed: ${error.message}` }
    }
  }

  async getBundleStats(distDir) {
    const files = await fs.readdir(distDir, { recursive: true })
    let totalSize = 0
    
    for (const file of files) {
      if (typeof file === 'string') {
        const filePath = path.join(distDir, file)
        const stats = await fs.stat(filePath)
        if (stats.isFile()) {
          totalSize += stats.size
        }
      }
    }
    
    return { totalSize, fileCount: files.length }
  }

  async generateCIReport() {
    console.log('\n📈 Generating CI Report...')
    
    const reportDir = path.join(ROOT_DIR, 'ci-reports')
    if (!fsSync.existsSync(reportDir)) {
      await fs.mkdir(reportDir, { recursive: true })
    }
    
    const report = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - this.results.startTime,
      status: this.determineOverallStatus(),
      summary: this.generateSummary(),
      details: this.results
    }
    
    // Write JSON report
    await fs.writeFile(
      path.join(reportDir, 'ci-test-report.json'),
      JSON.stringify(report, null, 2)
    )
    
    // Write markdown report
    const markdownReport = this.generateMarkdownReport(report)
    await fs.writeFile(
      path.join(reportDir, 'ci-test-report.md'),
      markdownReport
    )
    
    console.log(`   Report generated: ${reportDir}/ci-test-report.json`)
    console.log(`   Markdown report: ${reportDir}/ci-test-report.md`)
  }

  determineOverallStatus() {
    const testsPassed = Object.values(this.results.testSuites).every(suite => suite.status === 'passed')
    const coveragePassed = this.results.coverage.status === 'passed'
    const qualityPassed = this.results.quality.status === 'passed'
    
    return testsPassed && coveragePassed && qualityPassed ? 'passed' : 'failed'
  }

  generateSummary() {
    return {
      testSuites: {
        total: Object.keys(this.results.testSuites).length,
        passed: Object.values(this.results.testSuites).filter(s => s.status === 'passed').length,
        failed: Object.values(this.results.testSuites).filter(s => s.status === 'failed').length
      },
      coverage: this.results.coverage.status,
      quality: this.results.quality.status
    }
  }

  generateMarkdownReport(report) {
    return `# AgentKit SDK CI Test Report

**Status:** ${report.status === 'passed' ? '✅ PASSED' : '❌ FAILED'}  
**Generated:** ${report.timestamp}  
**Duration:** ${report.duration}ms

## Summary

- **Test Suites:** ${report.summary.testSuites.passed}/${report.summary.testSuites.total} passed
- **Coverage:** ${report.summary.coverage}
- **Quality Gates:** ${report.summary.quality}

## Test Suites

${Object.entries(report.details.testSuites).map(([name, suite]) => `
### ${name.charAt(0).toUpperCase() + name.slice(1)} Tests
- **Status:** ${suite.status === 'passed' ? '✅' : '❌'} ${suite.status}
- **Duration:** ${suite.details.duration || 'N/A'}ms
${suite.details.tests ? `- **Tests:** ${suite.details.passed}/${suite.details.tests} passed` : ''}
${suite.details.error ? `- **Error:** ${suite.details.error}` : ''}
`).join('')}

## Coverage Report

**Status:** ${report.details.coverage.status === 'passed' ? '✅' : '❌'} ${report.details.coverage.status}

${report.details.coverage.details.overall ? `
- **Lines:** ${report.details.coverage.details.overall.lines.toFixed(1)}%
- **Functions:** ${report.details.coverage.details.overall.functions.toFixed(1)}%
- **Branches:** ${report.details.coverage.details.overall.branches.toFixed(1)}%
- **Statements:** ${report.details.coverage.details.overall.statements.toFixed(1)}%
` : ''}

## Quality Gates

**Status:** ${report.details.quality.status === 'passed' ? '✅' : '❌'} ${report.details.quality.status}

${report.details.quality.details ? Object.entries(report.details.quality.details).map(([gate, result]) => `
- **${gate}:** ${result.success ? '✅' : '❌'} ${result.success ? 'passed' : 'failed'}
${result.error ? `  - Error: ${result.error}` : ''}
`).join('') : ''}

---
*Generated by AgentKit SDK CI Test Enforcement*`
  }

  validateResults() {
    if (this.determineOverallStatus() === 'failed') {
      console.error('\n❌ CI Test Enforcement FAILED')
      console.error('One or more quality gates did not pass.')
      process.exit(1)
    }
  }

  async findTestFiles() {
    const testFiles = []
    
    for (const pkg of await fs.readdir(PACKAGES_DIR)) {
      const pkgDir = path.join(PACKAGES_DIR, pkg)
      const testsDir = path.join(pkgDir, 'src', '__tests__')
      
      if (fsSync.existsSync(testsDir)) {
        const files = await this.findFilesRecursive(testsDir, '.test.ts')
        testFiles.push(...files)
      }
    }
    
    return testFiles
  }

  async findFilesRecursive(dir, extension) {
    const files = []
    const entries = await fs.readdir(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      
      if (entry.isDirectory()) {
        files.push(...await this.findFilesRecursive(fullPath, extension))
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        files.push(fullPath)
      }
    }
    
    return files
  }

  extractTestMetadata(content) {
    const annotations = []
    const lines = content.split('\n')
    
    for (const line of lines) {
      const match = line.match(/^\s*\*\s*@testmeta\s+(\w+):\s*(.+)$/)
      if (match) {
        annotations.push({
          key: match[1],
          value: match[2]
        })
      }
    }
    
    return { annotations }
  }
}

// Command line interface
if (require.main === module) {
  const enforcer = new CITestEnforcer()
  
  enforcer.enforceAll()
    .catch(error => {
      console.error('CI Test Enforcement error:', error)
      process.exit(1)
    })
}

module.exports = { CITestEnforcer }