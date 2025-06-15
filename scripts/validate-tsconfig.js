#!/usr/bin/env node
/**
 * Script to validate TypeScript configuration consistency across packages
 * Enforces enterprise-grade standardization
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating TypeScript configurations...\n');

const packagesDir = path.join(__dirname, '..', 'packages');
const packageDirs = fs.readdirSync(packagesDir).filter(dir => {
  const packageJsonPath = path.join(packagesDir, dir, 'package.json');
  return fs.existsSync(packageJsonPath);
});

let hasErrors = false;
const errors = [];

packageDirs.forEach(packageDir => {
  const tsconfigPath = path.join(packagesDir, packageDir, 'tsconfig.json');
  
  if (!fs.existsSync(tsconfigPath)) {
    errors.push(`${packageDir}: Missing tsconfig.json`);
    hasErrors = true;
    return;
  }
  
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
  const packageJsonPath = path.join(packagesDir, packageDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  console.log(`📦 Checking TypeScript config: ${packageJson.name}`);
  
  // Check if extends base config
  if (!tsconfig.extends || !tsconfig.extends.includes('tsconfig.base.json')) {
    errors.push(`${packageJson.name}: Should extend ../../tsconfig.base.json`);
    hasErrors = true;
    console.log(`  ❌ Does not extend base config`);
  } else {
    console.log(`  ✅ Extends base config`);
  }
  
  // Check required compiler options
  const compilerOptions = tsconfig.compilerOptions || {};
  
  if (!compilerOptions.rootDir || compilerOptions.rootDir !== './src') {
    errors.push(`${packageJson.name}: rootDir should be './src'`);
    hasErrors = true;
    console.log(`  ❌ rootDir not set to './src'`);
  } else {
    console.log(`  ✅ rootDir correctly set`);
  }
  
  if (!compilerOptions.outDir || compilerOptions.outDir !== './dist') {
    errors.push(`${packageJson.name}: outDir should be './dist'`);
    hasErrors = true;
    console.log(`  ❌ outDir not set to './dist'`);
  } else {
    console.log(`  ✅ outDir correctly set`);
  }
  
  // Check include patterns
  if (!tsconfig.include || !tsconfig.include.includes('src/**/*')) {
    errors.push(`${packageJson.name}: should include 'src/**/*'`);
    hasErrors = true;
    console.log(`  ❌ Missing proper include pattern`);
  } else {
    console.log(`  ✅ Include pattern correct`);
  }
  
  // Check exclude patterns
  const expectedExcludes = ['node_modules', 'dist'];
  const hasRequiredExcludes = expectedExcludes.every(exclude => 
    tsconfig.exclude && tsconfig.exclude.includes(exclude)
  );
  
  if (!hasRequiredExcludes) {
    errors.push(`${packageJson.name}: should exclude node_modules and dist`);
    hasErrors = true;
    console.log(`  ❌ Missing required excludes`);
  } else {
    console.log(`  ✅ Exclude patterns correct`);
  }
  
  console.log('');
});

if (hasErrors) {
  console.log('❌ TYPESCRIPT CONFIG VALIDATION FAILED\n');
  console.log('Issues found:');
  errors.forEach(error => console.log(`  - ${error}`));
  console.log('\nPlease standardize TypeScript configurations.');
  process.exit(1);
} else {
  console.log('✅ All TypeScript configurations are consistent and follow standards!');
  process.exit(0);
}