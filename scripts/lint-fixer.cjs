#!/usr/bin/env node
/**
 * Automated ESLint Fix Tool for AgentKit SDK
 * 
 * This script automatically fixes linting issues across all packages using
 * ESLint's --fix flag and provides detailed reporting.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class LintFixer {
  constructor() {
    this.packages = [
      'packages/types',
      'packages/errors', 
      'packages/registry',
      'packages/transports-dummy',
      'packages/test-agent',
      'packages/cli',
      'packages/runtime-web',
      'packages/sdk',
      'packages/qa-scenarios'
    ];
    this.results = {
      fixed: 0,
      remaining: 0,
      packages: {}
    };
  }

  /**
   * Check if a package has an eslint command
   */
  hasLintCommand(packagePath) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(path.join(packagePath, 'package.json'), 'utf8'));
      return packageJson.scripts && packageJson.scripts.lint;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current linting issues for a package
   */
  getLintIssues(packagePath) {
    try {
      console.log(`🔍 Checking linting issues in ${packagePath}...`);
      const result = execSync(`cd ${packagePath} && npx eslint . --format=json`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      const lintResults = JSON.parse(result);
      const totalMessages = lintResults.reduce((sum, file) => sum + file.messages.length, 0);
      
      return {
        total: totalMessages,
        files: lintResults.filter(file => file.messages.length > 0).length,
        details: lintResults
      };
    } catch (error) {
      // ESLint returns non-zero exit code when there are issues
      if (error.stdout) {
        try {
          const lintResults = JSON.parse(error.stdout);
          const totalMessages = lintResults.reduce((sum, file) => sum + file.messages.length, 0);
          
          return {
            total: totalMessages,
            files: lintResults.filter(file => file.messages.length > 0).length,
            details: lintResults
          };
        } catch (parseError) {
          console.warn(`⚠️ Could not parse lint results for ${packagePath}`);
          return { total: 0, files: 0, details: [] };
        }
      }
      return { total: 0, files: 0, details: [] };
    }
  }

  /**
   * Apply ESLint --fix to a package
   */
  fixLintIssues(packagePath) {
    try {
      console.log(`🔧 Fixing linting issues in ${packagePath}...`);
      
      // First try with --fix
      execSync(`cd ${packagePath} && npx eslint . --fix`, {
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      console.log(`✅ Fixed linting issues in ${packagePath}`);
      return true;
    } catch (error) {
      // ESLint returns non-zero even after fixing if there are remaining issues
      console.log(`⚡ Applied fixes to ${packagePath} (some issues may remain)`);
      return true;
    }
  }

  /**
   * Generate a summary report of the most common issues
   */
  analyzeIssuePatterns(allDetails) {
    const ruleCounts = {};
    const severityCounts = { error: 0, warning: 0 };
    
    allDetails.forEach(fileResult => {
      fileResult.messages.forEach(message => {
        const rule = message.ruleId || 'unknown';
        ruleCounts[rule] = (ruleCounts[rule] || 0) + 1;
        
        if (message.severity === 2) severityCounts.error++;
        else if (message.severity === 1) severityCounts.warning++;
      });
    });

    return {
      topRules: Object.entries(ruleCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10),
      severityCounts
    };
  }

  /**
   * Create or update .eslintrc configuration to be more permissive during transition
   */
  createTransitionalEslintConfig() {
    const configPath = path.join(process.cwd(), '.eslintrc.transition.js');
    
    const config = {
      extends: [
        '@typescript-eslint/recommended'
      ],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module'
      },
      rules: {
        // Temporarily disable the most problematic rules
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-non-null-assertion': 'warn',
        '@typescript-eslint/ban-types': 'warn',
        'curly': 'error',
        'no-console': 'off',
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': 'warn'
      },
      ignorePatterns: [
        'dist/',
        'node_modules/',
        '*.js.map',
        '*.d.ts'
      ]
    };

    fs.writeFileSync(configPath, `module.exports = ${JSON.stringify(config, null, 2)};`);
    console.log(`📝 Created transitional ESLint config at ${configPath}`);
    return configPath;
  }

  /**
   * Run the automated linting fix process
   */
  async run() {
    console.log('🚀 Starting Automated ESLint Fix Process');
    console.log('==========================================\n');

    // Create transitional config
    const transitionalConfig = this.createTransitionalEslintConfig();

    let totalBefore = 0;
    let totalAfter = 0;
    const allDetailsBefore = [];

    // First pass: Get baseline issues
    console.log('📊 Phase 1: Analyzing current linting issues...\n');
    
    for (const pkg of this.packages) {
      if (!this.hasLintCommand(pkg)) {
        console.log(`⏭️ Skipping ${pkg} (no lint command)`);
        continue;
      }

      const beforeIssues = this.getLintIssues(pkg);
      totalBefore += beforeIssues.total;
      allDetailsBefore.push(...beforeIssues.details);
      
      this.results.packages[pkg] = {
        before: beforeIssues.total,
        files: beforeIssues.files
      };

      console.log(`  ${pkg}: ${beforeIssues.total} issues in ${beforeIssues.files} files`);
    }

    // Analyze patterns
    console.log('\n🔍 Analyzing issue patterns...');
    const patterns = this.analyzeIssuePatterns(allDetailsBefore);
    
    console.log('\n📈 Top 10 most common linting rules:');
    patterns.topRules.forEach(([rule, count], index) => {
      console.log(`  ${index + 1}. ${rule}: ${count} occurrences`);
    });
    
    console.log(`\n⚠️ Severity breakdown: ${patterns.severityCounts.error} errors, ${patterns.severityCounts.warning} warnings`);

    // Second pass: Apply fixes
    console.log('\n🔧 Phase 2: Applying automated fixes...\n');

    for (const pkg of this.packages) {
      if (!this.hasLintCommand(pkg)) continue;

      // Apply fixes using the transitional config
      try {
        execSync(`cd ${pkg} && npx eslint . --config ${transitionalConfig} --fix`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });
        console.log(`✅ Applied fixes to ${pkg}`);
      } catch (error) {
        console.log(`⚡ Applied fixes to ${pkg} (some issues may remain)`);
      }

      // Check remaining issues
      const afterIssues = this.getLintIssues(pkg);
      totalAfter += afterIssues.total;
      
      this.results.packages[pkg].after = afterIssues.total;
      this.results.packages[pkg].fixed = this.results.packages[pkg].before - afterIssues.total;

      console.log(`  ${pkg}: ${this.results.packages[pkg].before} → ${afterIssues.total} (fixed ${this.results.packages[pkg].fixed})`);
    }

    // Final summary
    console.log('\n📊 FINAL SUMMARY');
    console.log('================');
    console.log(`🎯 Total issues before: ${totalBefore}`);
    console.log(`🎯 Total issues after: ${totalAfter}`);
    console.log(`✅ Total issues fixed: ${totalBefore - totalAfter}`);
    console.log(`📈 Improvement: ${((totalBefore - totalAfter) / totalBefore * 100).toFixed(1)}%`);

    // Package-by-package breakdown
    console.log('\n📦 Package breakdown:');
    Object.entries(this.results.packages).forEach(([pkg, results]) => {
      const improvement = results.before > 0 ? ((results.fixed / results.before) * 100).toFixed(1) : '0.0';
      console.log(`  ${pkg}: ${results.before} → ${results.after} (${improvement}% improved)`);
    });

    // Cleanup transitional config
    fs.unlinkSync(transitionalConfig);

    this.results.fixed = totalBefore - totalAfter;
    this.results.remaining = totalAfter;

    return this.results;
  }
}

// CLI execution
if (require.main === module) {
  const fixer = new LintFixer();
  fixer.run()
    .then(results => {
      console.log('\n🎉 Automated linting fix completed!');
      
      if (results.remaining > 0) {
        console.log(`\n⚠️ ${results.remaining} issues remain that require manual attention.`);
        console.log('💡 Consider reviewing and updating ESLint configuration for remaining issues.');
      } else {
        console.log('\n✨ All linting issues have been resolved!');
      }
      
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Error during automated fixing:', error);
      process.exit(1);
    });
}

module.exports = LintFixer;