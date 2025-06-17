#!/usr/bin/env node

/**
 * Test Structure Validation Guardrail
 * 
 * Ensures architectural purity by preventing test files from being created 
 * inside the src/ directory. All tests should be placed in appropriate 
 * test directories outside of src/.
 * 
 * This script is run as a precheck before running tests to maintain 
 * clean separation between source code and test code.
 */

import { existsSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageRoot = join(__dirname, '..')
const srcTestsDir = join(packageRoot, 'src', '__tests__')

/**
 * Recursively find all .test.ts and .spec.ts files in a directory
 */
function findTestFiles(dir) {
  const testFiles = []
  
  if (!existsSync(dir)) {
    return testFiles
  }
  
  const items = readdirSync(dir)
  
  for (const item of items) {
    const fullPath = join(dir, item)
    const stat = statSync(fullPath)
    
    if (stat.isDirectory()) {
      testFiles.push(...findTestFiles(fullPath))
    } else if (stat.isFile() && (item.endsWith('.test.ts') || item.endsWith('.spec.ts'))) {
      testFiles.push(fullPath)
    }
  }
  
  return testFiles
}

/**
 * List of specific files that were moved and should trigger errors if found
 */
const PROHIBITED_FILES = [
  'hook-basic.test.ts',
  'observability-timeline.test.ts', 
  'signing-simulation.test.ts',
  'fault-boundary.test.ts',
  'malformed-plugin.test.ts'
]

/**
 * Check if prohibited manual test files exist in src/__tests__
 */
function validateTestStructure() {
  console.log('🔍 Validating test file structure...')
  
  if (!existsSync(srcTestsDir)) {
    console.log('✅ No src/__tests__ directory found - structure is clean')
    return true
  }
  
  const testFiles = findTestFiles(srcTestsDir)
  const prohibitedFiles = testFiles.filter(file => {
    const fileName = file.split('/').pop()
    return PROHIBITED_FILES.includes(fileName)
  })
  
  if (prohibitedFiles.length === 0) {
    console.log('✅ No prohibited manual test files found in src/__tests__ - specific guardrail passed')
    return true
  }
  
  console.error('❌ ARCHITECTURAL VIOLATION: Manual test files found in src/__tests__/')
  console.error('')
  console.error('The following manual test files must be moved to test/manual/:')
  prohibitedFiles.forEach(file => {
    const relativePath = file.replace(packageRoot + '/', '')
    console.error(`  - ${relativePath}`)
  })
  console.error('')
  console.error('📁 These files belong in: test/manual/')
  console.error('')
  console.error('🔧 To fix this issue:')
  console.error('  1. Move these specific files to test/manual/')
  console.error('  2. Update import paths (../foo -> ../../src/foo)')
  console.error('  3. Re-run tests to ensure everything works')
  console.error('')
  console.error('🎯 This guardrail prevents manual test files from polluting src/.')
  
  return false
}

/**
 * Main validation function
 */
function main() {
  const isValid = validateTestStructure()
  
  if (!isValid) {
    process.exit(1)
  }
  
  console.log('✅ Test structure validation passed')
}

// Run the validation
main()