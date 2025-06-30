#!/usr/bin/env node
/**
 * Script to validate all packages have required npm scripts
 * This enforces enterprise-grade standards across the monorepo
 */

const fs = require('fs');
const path = require('path');

const REQUIRED_SCRIPTS = ['build', 'test', 'clean', 'lint', 'typecheck'];
const packagesDir = path.join(__dirname, '..', 'packages');

console.log('🔍 Validating package scripts across monorepo...\n');

// Get all package directories
const packageDirs = fs.readdirSync(packagesDir).filter(dir => {
  const packageJsonPath = path.join(packagesDir, dir, 'package.json');
  return fs.existsSync(packageJsonPath);
});

console.log(`Found ${packageDirs.length} packages: ${packageDirs.join(', ')}\n`);

let hasErrors = false;
const errors = [];

packageDirs.forEach(packageDir => {
  const packageJsonPath = path.join(packagesDir, packageDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  console.log(`📦 Checking package: ${packageJson.name}`);
  
  const missingScripts = [];
  const invalidScripts = [];
  
  REQUIRED_SCRIPTS.forEach(script => {
    if (!packageJson.scripts || !packageJson.scripts[script]) {
      missingScripts.push(script);
    } else {
      // Validate script patterns
      const scriptCommand = packageJson.scripts[script];
      
      switch (script) {
        case 'lint':
        case 'typecheck':
          if (!scriptCommand.includes('tsc --noEmit')) {
            invalidScripts.push(`${script}: expected 'tsc --noEmit', got '${scriptCommand}'`);
          }
          break;
        case 'test':
          if (!scriptCommand.includes('vitest')) {
            invalidScripts.push(`${script}: expected 'vitest', got '${scriptCommand}'`);
          }
          break;
        case 'build':
          if (!scriptCommand.match(/(tsup|tsc)/)) {
            invalidScripts.push(`${script}: expected 'tsup' or 'tsc', got '${scriptCommand}'`);
          }
          break;
      }
    }
  });
  
  if (missingScripts.length === 0 && invalidScripts.length === 0) {
    console.log(`  ✅ All scripts present and valid`);
  } else {
    hasErrors = true;
    
    if (missingScripts.length > 0) {
      console.log(`  ❌ Missing scripts: ${missingScripts.join(', ')}`);
      errors.push(`${packageJson.name}: Missing scripts: ${missingScripts.join(', ')}`);
    }
    
    if (invalidScripts.length > 0) {
      console.log(`  ❌ Invalid scripts:`);
      invalidScripts.forEach(invalid => console.log(`     - ${invalid}`));
      errors.push(`${packageJson.name}: Invalid scripts: ${invalidScripts.join('; ')}`);
    }
  }
  
  console.log('');
});

if (hasErrors) {
  console.log('❌ VALIDATION FAILED\n');
  console.log('Errors found:');
  errors.forEach(error => console.log(`  - ${error}`));
  console.log('\nPlease fix the above issues to ensure enterprise-grade standards.');
  process.exit(1);
} else {
  console.log('✅ All packages have required scripts and follow proper patterns!');
  process.exit(0);
}