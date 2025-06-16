#!/usr/bin/env node

/**
 * Test Metadata Analyzer for AgentKit SDK
 * Analyzes and validates test metadata annotations across the codebase
 */

const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')

const ROOT_DIR = path.join(__dirname, '..')
const PACKAGES_DIR = path.join(ROOT_DIR, 'packages')

class TestMetadataAnalyzer {
  constructor() {
    this.analysis = {
      totalFiles: 0,
      annotatedFiles: 0,
      metadata: {
        types: new Map(),
        categories: new Map(),
        priorities: new Map(),
        techniques: new Map(),
        tags: new Map()
      },
      files: [],
      issues: [],
      statistics: {}
    }
  }

  async analyze() {
    console.log('🔍 Analyzing test metadata annotations...\n')
    
    const testFiles = await this.findTestFiles()
    this.analysis.totalFiles = testFiles.length
    
    for (const filePath of testFiles) {
      await this.analyzeFile(filePath)
    }
    
    this.generateStatistics()
    this.generateReport()
    
    return this.analysis
  }

  async analyzeFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const metadata = this.extractMetadata(content)
      const tests = this.extractTestCases(content)
      
      const fileAnalysis = {
        path: filePath,
        relativePath: path.relative(ROOT_DIR, filePath),
        metadata,
        tests,
        hasMetadata: metadata.annotations.length > 0,
        testCount: tests.length,
        annotatedTests: tests.filter(t => t.metadata.length > 0).length
      }
      
      this.analysis.files.push(fileAnalysis)
      
      if (fileAnalysis.hasMetadata) {
        this.analysis.annotatedFiles++
      }
      
      // Collect metadata statistics
      metadata.annotations.forEach(ann => {
        const map = this.analysis.metadata[ann.key]
        if (map) {
          map.set(ann.value, (map.get(ann.value) || 0) + 1)
        }
      })
      
      // Validate file-level metadata
      this.validateFileMetadata(fileAnalysis)
      
    } catch (error) {
      this.analysis.issues.push({
        type: 'file-error',
        file: filePath,
        message: `Failed to analyze: ${error.message}`
      })
    }
  }

  extractMetadata(content) {
    const annotations = []
    const lines = content.split('\n')
    
    // Extract file-level metadata from header comments
    let inHeader = false
    for (const line of lines) {
      if (line.includes('/**')) {
        inHeader = true
        continue
      }
      
      if (line.includes('*/')) {
        inHeader = false
        continue
      }
      
      if (inHeader) {
        const match = line.match(/^\s*\*\s*@testmeta\s+(\w+):\s*(.+)$/)
        if (match) {
          annotations.push({
            key: match[1],
            value: match[2].trim(),
            line: lines.indexOf(line) + 1
          })
        }
      }
    }
    
    return { annotations }
  }

  extractTestCases(content) {
    const tests = []
    const lines = content.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // Look for test case definitions
      const testMatch = line.match(/^\s*it\s*\(\s*['"`]([^'"`]+)['"`]/)
      if (testMatch) {
        const testName = testMatch[1]
        const testMetadata = []
        
        // Look for test-specific metadata in preceding comments
        for (let j = i - 1; j >= 0; j--) {
          const prevLine = lines[j].trim()
          
          if (!prevLine || prevLine.startsWith('//') || prevLine.startsWith('*')) {
            const metaMatch = prevLine.match(/@testmeta\s+(\w+):\s*(.+)$/)
            if (metaMatch) {
              testMetadata.push({
                key: metaMatch[1],
                value: metaMatch[2].trim(),
                line: j + 1
              })
            }
            continue
          }
          
          break // Stop at first non-comment line
        }
        
        tests.push({
          name: testName,
          line: i + 1,
          metadata: testMetadata.reverse() // Reverse to maintain order
        })
      }
    }
    
    return tests
  }

  validateFileMetadata(fileAnalysis) {
    const { path: filePath, metadata, tests } = fileAnalysis
    const fileName = path.basename(filePath)
    
    // Validate required metadata based on file location
    const requiredMetadata = this.getRequiredMetadata(filePath)
    
    for (const required of requiredMetadata) {
      const hasRequired = metadata.annotations.some(ann => ann.key === required)
      if (!hasRequired) {
        this.analysis.issues.push({
          type: 'missing-metadata',
          file: filePath,
          message: `Missing required @testmeta ${required} annotation`
        })
      }
    }
    
    // Validate test-specific metadata
    for (const test of tests) {
      if (filePath.includes('/chaos/') && test.metadata.length === 0) {
        this.analysis.issues.push({
          type: 'missing-test-metadata',
          file: filePath,
          test: test.name,
          line: test.line,
          message: 'Chaos test missing @testmeta technique annotation'
        })
      }
      
      // Validate technique metadata for chaos tests
      if (filePath.includes('/chaos/')) {
        const hasTechnique = test.metadata.some(m => m.key === 'technique')
        if (!hasTechnique) {
          this.analysis.issues.push({
            type: 'missing-technique',
            file: filePath,
            test: test.name,
            line: test.line,
            message: 'Chaos test must specify @testmeta technique'
          })
        }
      }
    }
    
    // Validate metadata consistency
    this.validateMetadataConsistency(fileAnalysis)
  }

  getRequiredMetadata(filePath) {
    const required = []
    
    if (filePath.includes('/chaos/')) {
      required.push('type', 'category', 'priority')
    } else if (filePath.includes('/load/')) {
      required.push('type', 'category')
    } else if (filePath.includes('/security/') || filePath.includes('sandbox')) {
      required.push('type', 'category', 'priority')
    }
    
    return required
  }

  validateMetadataConsistency(fileAnalysis) {
    const { path: filePath, metadata } = fileAnalysis
    
    // Check for valid values
    const typeAnnotation = metadata.annotations.find(a => a.key === 'type')
    if (typeAnnotation) {
      const validTypes = ['unit', 'integration', 'chaos', 'load', 'security', 'performance']
      if (!validTypes.includes(typeAnnotation.value)) {
        this.analysis.issues.push({
          type: 'invalid-metadata',
          file: filePath,
          message: `Invalid type '${typeAnnotation.value}'. Valid types: ${validTypes.join(', ')}`
        })
      }
    }
    
    const priorityAnnotation = metadata.annotations.find(a => a.key === 'priority')
    if (priorityAnnotation) {
      const validPriorities = ['low', 'medium', 'high', 'critical']
      if (!validPriorities.includes(priorityAnnotation.value)) {
        this.analysis.issues.push({
          type: 'invalid-metadata',
          file: filePath,
          message: `Invalid priority '${priorityAnnotation.value}'. Valid priorities: ${validPriorities.join(', ')}`
        })
      }
    }
  }

  generateStatistics() {
    this.analysis.statistics = {
      coverage: {
        files: (this.analysis.annotatedFiles / this.analysis.totalFiles * 100).toFixed(1),
        filesWithMetadata: this.analysis.annotatedFiles,
        totalFiles: this.analysis.totalFiles
      },
      metadataDistribution: {
        types: Object.fromEntries(this.analysis.metadata.types),
        categories: Object.fromEntries(this.analysis.metadata.categories),
        priorities: Object.fromEntries(this.analysis.metadata.priorities),
        techniques: Object.fromEntries(this.analysis.metadata.techniques)
      },
      testCoverage: this.calculateTestCoverage(),
      qualityScore: this.calculateQualityScore()
    }
  }

  calculateTestCoverage() {
    const totalTests = this.analysis.files.reduce((sum, file) => sum + file.testCount, 0)
    const annotatedTests = this.analysis.files.reduce((sum, file) => sum + file.annotatedTests, 0)
    
    return {
      total: totalTests,
      annotated: annotatedTests,
      percentage: totalTests > 0 ? (annotatedTests / totalTests * 100).toFixed(1) : 0
    }
  }

  calculateQualityScore() {
    const weights = {
      fileMetadata: 0.4,
      testMetadata: 0.3,
      completeness: 0.2,
      consistency: 0.1
    }
    
    const fileMetadataScore = (this.analysis.annotatedFiles / this.analysis.totalFiles) * 100
    const testMetadataScore = parseFloat(this.analysis.statistics?.testCoverage?.percentage || 0)
    const completenessScore = this.calculateCompletenessScore()
    const consistencyScore = this.calculateConsistencyScore()
    
    const weightedScore = (
      fileMetadataScore * weights.fileMetadata +
      testMetadataScore * weights.testMetadata +
      completenessScore * weights.completeness +
      consistencyScore * weights.consistency
    )
    
    return {
      overall: weightedScore.toFixed(1),
      breakdown: {
        fileMetadata: fileMetadataScore.toFixed(1),
        testMetadata: testMetadataScore,
        completeness: completenessScore.toFixed(1),
        consistency: consistencyScore.toFixed(1)
      }
    }
  }

  calculateCompletenessScore() {
    const requiredFields = ['type', 'category', 'priority']
    let completeFiles = 0
    
    for (const file of this.analysis.files) {
      const hasAllRequired = requiredFields.every(field =>
        file.metadata.annotations.some(ann => ann.key === field)
      )
      if (hasAllRequired) completeFiles++
    }
    
    return (completeFiles / this.analysis.totalFiles) * 100
  }

  calculateConsistencyScore() {
    const issueTypes = ['invalid-metadata', 'inconsistent-metadata']
    const consistencyIssues = this.analysis.issues.filter(issue => 
      issueTypes.includes(issue.type)
    ).length
    
    return Math.max(0, 100 - (consistencyIssues / this.analysis.totalFiles * 10))
  }

  generateReport() {
    console.log('📊 Test Metadata Analysis Report\n')
    
    console.log('📈 Coverage Statistics:')
    console.log(`   Files with metadata: ${this.analysis.statistics.coverage.filesWithMetadata}/${this.analysis.statistics.coverage.totalFiles} (${this.analysis.statistics.coverage.files}%)`)
    console.log(`   Tests with metadata: ${this.analysis.statistics.testCoverage.annotated}/${this.analysis.statistics.testCoverage.total} (${this.analysis.statistics.testCoverage.percentage}%)`)
    
    console.log('\n🏷️  Metadata Distribution:')
    console.log('   Types:', Object.entries(this.analysis.statistics.metadataDistribution.types).map(([k, v]) => `${k}(${v})`).join(', '))
    console.log('   Categories:', Object.entries(this.analysis.statistics.metadataDistribution.categories).map(([k, v]) => `${k}(${v})`).join(', '))
    console.log('   Priorities:', Object.entries(this.analysis.statistics.metadataDistribution.priorities).map(([k, v]) => `${k}(${v})`).join(', '))
    
    if (this.analysis.statistics.metadataDistribution.techniques && Object.keys(this.analysis.statistics.metadataDistribution.techniques).length > 0) {
      console.log('   Techniques:', Object.entries(this.analysis.statistics.metadataDistribution.techniques).map(([k, v]) => `${k}(${v})`).join(', '))
    }
    
    console.log('\n⭐ Quality Score:')
    console.log(`   Overall: ${this.analysis.statistics.qualityScore.overall}/100`)
    console.log(`   File Metadata: ${this.analysis.statistics.qualityScore.breakdown.fileMetadata}/100`)
    console.log(`   Test Metadata: ${this.analysis.statistics.qualityScore.breakdown.testMetadata}/100`)
    console.log(`   Completeness: ${this.analysis.statistics.qualityScore.breakdown.completeness}/100`)
    console.log(`   Consistency: ${this.analysis.statistics.qualityScore.breakdown.consistency}/100`)
    
    if (this.analysis.issues.length > 0) {
      console.log('\n⚠️  Issues Found:')
      const issuesByType = this.groupIssuesByType()
      
      for (const [type, issues] of Object.entries(issuesByType)) {
        console.log(`   ${type} (${issues.length}):`)
        issues.slice(0, 5).forEach(issue => {
          console.log(`      ${path.relative(ROOT_DIR, issue.file)}: ${issue.message}`)
        })
        if (issues.length > 5) {
          console.log(`      ... and ${issues.length - 5} more`)
        }
      }
    }
    
    // Save detailed report
    this.saveDetailedReport()
  }

  groupIssuesByType() {
    const grouped = {}
    
    for (const issue of this.analysis.issues) {
      if (!grouped[issue.type]) {
        grouped[issue.type] = []
      }
      grouped[issue.type].push(issue)
    }
    
    return grouped
  }

  async saveDetailedReport() {
    const reportDir = path.join(ROOT_DIR, 'ci-reports')
    if (!fsSync.existsSync(reportDir)) {
      await fs.mkdir(reportDir, { recursive: true })
    }
    
    // Save JSON report
    await fs.writeFile(
      path.join(reportDir, 'test-metadata-analysis.json'),
      JSON.stringify(this.analysis, null, 2)
    )
    
    // Generate markdown report
    const markdownReport = this.generateMarkdownReport()
    await fs.writeFile(
      path.join(reportDir, 'test-metadata-report.md'),
      markdownReport
    )
    
    console.log(`\n📄 Detailed reports saved to: ci-reports/`)
  }

  generateMarkdownReport() {
    return `# Test Metadata Analysis Report

**Generated:** ${new Date().toISOString()}

## Summary

- **Total Test Files:** ${this.analysis.totalFiles}
- **Files with Metadata:** ${this.analysis.annotatedFiles} (${this.analysis.statistics.coverage.files}%)
- **Quality Score:** ${this.analysis.statistics.qualityScore.overall}/100

## Coverage Statistics

### File Coverage
- **Annotated Files:** ${this.analysis.statistics.coverage.filesWithMetadata}/${this.analysis.statistics.coverage.totalFiles}
- **Coverage Percentage:** ${this.analysis.statistics.coverage.files}%

### Test Coverage
- **Total Tests:** ${this.analysis.statistics.testCoverage.total}
- **Annotated Tests:** ${this.analysis.statistics.testCoverage.annotated}
- **Test Coverage:** ${this.analysis.statistics.testCoverage.percentage}%

## Metadata Distribution

### Types
${Object.entries(this.analysis.statistics.metadataDistribution.types).map(([type, count]) => `- **${type}:** ${count} files`).join('\n')}

### Categories
${Object.entries(this.analysis.statistics.metadataDistribution.categories).map(([cat, count]) => `- **${cat}:** ${count} files`).join('\n')}

### Priorities
${Object.entries(this.analysis.statistics.metadataDistribution.priorities).map(([pri, count]) => `- **${pri}:** ${count} files`).join('\n')}

${Object.keys(this.analysis.statistics.metadataDistribution.techniques).length > 0 ? `
### Techniques
${Object.entries(this.analysis.statistics.metadataDistribution.techniques).map(([tech, count]) => `- **${tech}:** ${count} tests`).join('\n')}
` : ''}

## Quality Breakdown

- **File Metadata:** ${this.analysis.statistics.qualityScore.breakdown.fileMetadata}/100
- **Test Metadata:** ${this.analysis.statistics.qualityScore.breakdown.testMetadata}/100
- **Completeness:** ${this.analysis.statistics.qualityScore.breakdown.completeness}/100
- **Consistency:** ${this.analysis.statistics.qualityScore.breakdown.consistency}/100

${this.analysis.issues.length > 0 ? `
## Issues Found

${Object.entries(this.groupIssuesByType()).map(([type, issues]) => `
### ${type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} (${issues.length})

${issues.slice(0, 10).map(issue => `- **${path.relative(ROOT_DIR, issue.file)}:** ${issue.message}`).join('\n')}
${issues.length > 10 ? `\n*... and ${issues.length - 10} more issues*` : ''}
`).join('')}
` : ''}

---
*Generated by AgentKit SDK Test Metadata Analyzer*`
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
}

// Command line interface
if (require.main === module) {
  const analyzer = new TestMetadataAnalyzer()
  
  analyzer.analyze()
    .then(() => {
      console.log('\n✅ Test metadata analysis complete')
    })
    .catch(error => {
      console.error('Test metadata analysis error:', error)
      process.exit(1)
    })
}

module.exports = { TestMetadataAnalyzer }