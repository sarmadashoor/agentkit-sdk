#!/usr/bin/env node

/**
 * Coverage Enforcement Tool for AgentKit SDK
 * Ensures 95%+ coverage across all packages with strict quality thresholds
 */

const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const COVERAGE_THRESHOLD = 95
const PACKAGES_DIR = path.join(__dirname, '..', 'packages')

class CoverageEnforcer {
  constructor() {
    this.results = {
      packages: {},
      overall: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0
      },
      failures: [],
      warnings: []
    }
  }

  async enforceAll() {
    console.log('🔍 AgentKit SDK Coverage Enforcement Starting...\n')
    
    const packages = await this.getPackages()
    
    for (const pkg of packages) {
      try {
        await this.enforcePackageCoverage(pkg)
      } catch (error) {
        this.results.failures.push({
          package: pkg,
          error: error.message
        })
      }
    }
    
    this.generateReport()
    this.validateOverallCoverage()
    
    if (this.results.failures.length > 0) {
      console.error('❌ Coverage enforcement failed!')
      process.exit(1)
    }
    
    console.log('✅ Coverage enforcement passed!')
  }

  async getPackages() {
    const entries = await fs.readdir(PACKAGES_DIR, { withFileTypes: true })
    
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(name => {
        // Check if package has a package.json with test script
        const packageJsonPath = path.join(PACKAGES_DIR, name, 'package.json')
        if (!fsSync.existsSync(packageJsonPath)) return false
        
        const packageJson = require(packageJsonPath)
        return packageJson.scripts && (packageJson.scripts.test || packageJson.scripts['test:coverage'])
      })
  }

  async enforcePackageCoverage(packageName) {
    console.log(`📊 Checking coverage for @agentkit/${packageName}...`)
    
    const packageDir = path.join(PACKAGES_DIR, packageName)
    const coverageDir = path.join(packageDir, 'coverage')
    
    // Run coverage
    await this.runCoverage(packageDir, packageName)
    
    // Parse coverage results
    const coverage = await this.parseCoverage(coverageDir, packageName)
    
    // Validate coverage thresholds
    this.validatePackageCoverage(packageName, coverage)
    
    // Store results
    this.results.packages[packageName] = coverage
    
    console.log(`   Lines: ${coverage.lines.pct}% | Functions: ${coverage.functions.pct}% | Branches: ${coverage.branches.pct}%`)
  }

  async runCoverage(packageDir, packageName) {
    try {
      // First run tests with coverage
      execSync('npm run test:coverage 2>/dev/null || npm test -- --coverage', {
        cwd: packageDir,
        stdio: 'pipe'
      })
    } catch (error) {
      // Try alternative coverage command
      try {
        execSync('npx vitest run --coverage', {
          cwd: packageDir,
          stdio: 'pipe'
        })
      } catch (fallbackError) {
        throw new Error(`Failed to run coverage for ${packageName}: ${error.message}`)
      }
    }
  }

  async parseCoverage(coverageDir, packageName) {
    const lcovSummaryPath = path.join(coverageDir, 'coverage-summary.json')
    
    if (!fsSync.existsSync(lcovSummaryPath)) {
      throw new Error(`Coverage summary not found for ${packageName}`)
    }
    
    const summaryContent = await fs.readFile(lcovSummaryPath, 'utf-8')
    const summary = JSON.parse(summaryContent)
    
    // Extract total coverage
    const total = summary.total || {}
    
    return {
      lines: total.lines || { total: 0, covered: 0, skipped: 0, pct: 0 },
      functions: total.functions || { total: 0, covered: 0, skipped: 0, pct: 0 },
      statements: total.statements || { total: 0, covered: 0, skipped: 0, pct: 0 },
      branches: total.branches || { total: 0, covered: 0, skipped: 0, pct: 0 }
    }
  }

  validatePackageCoverage(packageName, coverage) {
    const failures = []
    
    if (coverage.lines.pct < COVERAGE_THRESHOLD) {
      failures.push(`Lines coverage ${coverage.lines.pct}% < ${COVERAGE_THRESHOLD}%`)
    }
    
    if (coverage.functions.pct < COVERAGE_THRESHOLD) {
      failures.push(`Functions coverage ${coverage.functions.pct}% < ${COVERAGE_THRESHOLD}%`)
    }
    
    if (coverage.statements.pct < COVERAGE_THRESHOLD) {
      failures.push(`Statements coverage ${coverage.statements.pct}% < ${COVERAGE_THRESHOLD}%`)
    }
    
    if (coverage.branches.pct < COVERAGE_THRESHOLD) {
      failures.push(`Branches coverage ${coverage.branches.pct}% < ${COVERAGE_THRESHOLD}%`)
    }
    
    // Check for suspicious patterns
    if (coverage.lines.total > 0 && coverage.lines.covered === 0) {
      this.results.warnings.push(`${packageName}: No lines covered - possible test configuration issue`)
    }
    
    if (coverage.functions.total > coverage.functions.covered + coverage.functions.skipped) {
      this.results.warnings.push(`${packageName}: Function coverage math doesn't add up`)
    }
    
    if (failures.length > 0) {
      this.results.failures.push({
        package: packageName,
        error: `Coverage threshold violations: ${failures.join(', ')}`
      })
    }
  }

  generateReport() {
    console.log('\n📈 Coverage Report Summary:\n')
    
    const packages = Object.keys(this.results.packages)
    let totalLines = 0, coveredLines = 0
    let totalFunctions = 0, coveredFunctions = 0
    let totalBranches = 0, coveredBranches = 0
    let totalStatements = 0, coveredStatements = 0
    
    // Generate per-package report
    packages.forEach(pkg => {
      const coverage = this.results.packages[pkg]
      
      console.log(`@agentkit/${pkg}:`)
      console.log(`   Lines:      ${coverage.lines.pct.toFixed(1)}% (${coverage.lines.covered}/${coverage.lines.total})`)
      console.log(`   Functions:  ${coverage.functions.pct.toFixed(1)}% (${coverage.functions.covered}/${coverage.functions.total})`)
      console.log(`   Branches:   ${coverage.branches.pct.toFixed(1)}% (${coverage.branches.covered}/${coverage.branches.total})`)
      console.log(`   Statements: ${coverage.statements.pct.toFixed(1)}% (${coverage.statements.covered}/${coverage.statements.total})`)
      console.log()
      
      // Accumulate totals
      totalLines += coverage.lines.total
      coveredLines += coverage.lines.covered
      totalFunctions += coverage.functions.total
      coveredFunctions += coverage.functions.covered
      totalBranches += coverage.branches.total
      coveredBranches += coverage.branches.covered
      totalStatements += coverage.statements.total
      coveredStatements += coverage.statements.covered
    })
    
    // Calculate overall percentages
    this.results.overall = {
      lines: totalLines > 0 ? (coveredLines / totalLines * 100) : 0,
      functions: totalFunctions > 0 ? (coveredFunctions / totalFunctions * 100) : 0,
      branches: totalBranches > 0 ? (coveredBranches / totalBranches * 100) : 0,
      statements: totalStatements > 0 ? (coveredStatements / totalStatements * 100) : 0
    }
    
    console.log('🎯 Overall Coverage:')
    console.log(`   Lines:      ${this.results.overall.lines.toFixed(1)}%`)
    console.log(`   Functions:  ${this.results.overall.functions.toFixed(1)}%`)
    console.log(`   Branches:   ${this.results.overall.branches.toFixed(1)}%`)
    console.log(`   Statements: ${this.results.overall.statements.toFixed(1)}%`)
    
    // Show warnings
    if (this.results.warnings.length > 0) {
      console.log('\n⚠️  Warnings:')
      this.results.warnings.forEach(warning => console.log(`   ${warning}`))
    }
    
    // Show failures
    if (this.results.failures.length > 0) {
      console.log('\n❌ Failures:')
      this.results.failures.forEach(failure => {
        console.log(`   ${failure.package}: ${failure.error}`)
      })
    }
  }

  validateOverallCoverage() {
    const overall = this.results.overall
    
    if (overall.lines < COVERAGE_THRESHOLD) {
      this.results.failures.push({
        package: 'OVERALL',
        error: `Overall lines coverage ${overall.lines.toFixed(1)}% < ${COVERAGE_THRESHOLD}%`
      })
    }
    
    if (overall.functions < COVERAGE_THRESHOLD) {
      this.results.failures.push({
        package: 'OVERALL',
        error: `Overall functions coverage ${overall.functions.toFixed(1)}% < ${COVERAGE_THRESHOLD}%`
      })
    }
    
    if (overall.statements < COVERAGE_THRESHOLD) {
      this.results.failures.push({
        package: 'OVERALL',
        error: `Overall statements coverage ${overall.statements.toFixed(1)}% < ${COVERAGE_THRESHOLD}%`
      })
    }
    
    if (overall.branches < COVERAGE_THRESHOLD) {
      this.results.failures.push({
        package: 'OVERALL',
        error: `Overall branches coverage ${overall.branches.toFixed(1)}% < ${COVERAGE_THRESHOLD}%`
      })
    }
  }

  async generateAggregatedReport() {
    // Generate aggregated LCOV and HTML reports
    const aggregatedCoverageDir = path.join(__dirname, '..', 'coverage')
    if (!fsSync.existsSync(aggregatedCoverageDir)) {
      await fs.mkdir(aggregatedCoverageDir, { recursive: true })
    }
    
    try {
      // Merge all package coverage reports
      const packages = Object.keys(this.results.packages)
      const lcovFiles = []
      
      for (const pkg of packages) {
        const lcovPath = path.join(PACKAGES_DIR, pkg, 'coverage', 'lcov.info')
        if (fsSync.existsSync(lcovPath)) {
          lcovFiles.push(lcovPath)
        }
      }
      
      if (lcovFiles.length > 0) {
        // Merge LCOV files
        const mergedLcov = []
        for (const file of lcovFiles) {
          const content = await fs.readFile(file, 'utf-8')
          mergedLcov.push(content)
        }
        
        await fs.writeFile(
          path.join(aggregatedCoverageDir, 'lcov.info'),
          mergedLcov.join('\n')
        )
        
        // Generate HTML report from merged LCOV
        try {
          execSync(`npx genhtml ${path.join(aggregatedCoverageDir, 'lcov.info')} -o ${path.join(aggregatedCoverageDir, 'html')}`, {
            stdio: 'pipe'
          })
        } catch (error) {
          console.warn('Failed to generate HTML report:', error.message)
        }
      }
      
      // Write JSON summary
      await fs.writeFile(
        path.join(aggregatedCoverageDir, 'summary.json'),
        JSON.stringify(this.results, null, 2)
      )
      
    } catch (error) {
      console.warn('Failed to generate aggregated report:', error.message)
    }
  }
}

// Command line interface
if (require.main === module) {
  const enforcer = new CoverageEnforcer()
  
  enforcer.enforceAll()
    .then(() => enforcer.generateAggregatedReport())
    .catch(error => {
      console.error('Coverage enforcement error:', error)
      process.exit(1)
    })
}

module.exports = { CoverageEnforcer, COVERAGE_THRESHOLD }