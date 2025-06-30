# AgentKit SDK Linting Guide

**Comprehensive ESLint Setup, Commands, and Workflows**

## 📋 Table of Contents

1. [Overview](#overview)
2. [Linting Configuration](#linting-configuration)
3. [Commands & Usage](#commands--usage)
4. [Pre-commit Integration](#pre-commit-integration)
5. [CI/CD Integration](#cicd-integration)
6. [Rules & Standards](#rules--standards)
7. [Troubleshooting](#troubleshooting)
8. [Advanced Usage](#advanced-usage)

## 📖 Overview

AgentKit SDK uses a comprehensive ESLint setup with TypeScript support across all packages in the monorepo. The linting system ensures code quality, consistency, and catches potential issues before they reach production.

### **Key Features**
- ✅ **Shared Configuration**: Single `eslint.config.js` at repository root
- ✅ **TypeScript Support**: Full TypeScript linting with `@typescript-eslint`
- ✅ **Monorepo Aware**: Works across all 8 packages simultaneously
- ✅ **Pre-commit Hooks**: Automatic linting before commits
- ✅ **CI/CD Integration**: Runs in GitHub Actions workflows
- ✅ **Smart Ignoring**: Excludes build artifacts, node_modules, etc.

## 🔧 Linting Configuration

### **Primary Configuration: `eslint.config.js`**

Located at repository root, this file configures ESLint for the entire monorepo:

```javascript
// eslint.config.js - Root configuration
export default [
  js.configs.recommended,
  
  // Global ignores
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.d.ts',
      '**/test-results/**',
      '**/playwright-report/**'
    ]
  },
  
  // TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      // ... TypeScript configuration
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_' 
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // ... other TypeScript rules
    }
  }
]
```

### **Package-Level Scripts**

Each package has a `lint` script in its `package.json`:

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "typecheck": "tsc --noEmit"
  }
}
```

### **Dependencies**

ESLint dependencies are defined at the root level:

```json
{
  "devDependencies": {
    "@eslint/js": "^8.56.0",
    "@typescript-eslint/eslint-plugin": "^6.18.1", 
    "@typescript-eslint/parser": "^6.18.1",
    "eslint": "^8.56.0"
  }
}
```

## 🚀 Commands & Usage

### **Root Level Commands**

#### **Lint All Packages**
```bash
pnpm lint                    # Lint all packages in parallel
npm run lint                 # Alternative using npm
```

#### **Lint with Auto-fix**
```bash
pnpm lint --fix             # Fix auto-fixable issues across all packages
```

#### **Lint Specific Package**
```bash
cd packages/sdk && npm run lint        # Lint SDK package only
cd packages/cli && npm run lint        # Lint CLI package only
```

#### **Type Checking (Separate from Linting)**
```bash
pnpm typecheck              # TypeScript compilation check
npm run typecheck           # Alternative using npm
```

### **ESLint Command Options**

#### **Common Flags**
```bash
# Auto-fix issues
eslint . --fix

# Check only errors (ignore warnings)
eslint . --quiet

# Output to file
eslint . --output-file lint-results.txt

# Debug ESLint configuration
eslint . --debug

# Print effective configuration for a file
eslint --print-config packages/sdk/src/index.ts
```

#### **Cache for Performance**
```bash
# Use cache for faster subsequent runs
eslint . --cache

# Specify cache location
eslint . --cache --cache-location .eslintcache
```

### **Development Workflow Commands**

#### **Quick Development Check**
```bash
# Fast check during development
pnpm lint && pnpm typecheck
```

#### **Pre-commit Validation**
```bash
# What runs before each commit
npm run typecheck && npm run test:fast && npm run build
```

## 🔒 Pre-commit Integration

### **Automatic Installation**

Pre-commit hooks are installed automatically:

```bash
# Runs automatically after pnpm install
npm run postinstall
# OR manually
./scripts/install-hooks.sh
```

### **Pre-commit Hook Behavior**

When you run `git commit`, the hook automatically executes:

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "🔍 Running pre-commit checks..."

# 1. Type checking
echo "📝 Type checking..."
npm run typecheck || exit 1

# 2. Tests  
echo "🧪 Running tests..."
npm run test || exit 1

# 3. Build validation
echo "🏗️ Building packages..."
npm run build || exit 1

echo "✅ Pre-commit checks passed"
```

**Note**: The pre-commit hook runs `typecheck`, `test`, and `build`, but **NOT linting**. This is because linting is expected to be done during development.

### **Bypassing Pre-commit Hooks**

```bash
# Skip pre-commit hooks (use sparingly)
git commit --no-verify -m "Emergency fix"
```

## 🔄 CI/CD Integration

### **GitHub Actions Workflows**

Linting is **NOT** currently included in CI workflows, but type checking is:

#### **Type Safety Workflow** (`.github/workflows/type-safety.yml`)
```yaml
name: Type Safety Validation

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]

jobs:
  type-check:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
    - name: Install dependencies
      run: npm ci
    - name: Build all packages
      run: npm run build
    - name: Run TypeScript type checks
      run: |
        cd packages/types && npx tsc --noEmit
        cd ../registry && npx tsc --noEmit
        cd ../sdk && npx tsc --noEmit
```

### **Adding Linting to CI (Recommended)**

To add linting to CI workflows:

```yaml
# Add to .github/workflows/test.yml
- name: Lint Code
  run: pnpm lint

# Or add as separate workflow
name: Code Quality
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
    - name: Install pnpm
      run: npm install -g pnpm@8
    - name: Install dependencies
      run: pnpm install
    - name: Lint
      run: pnpm lint
    - name: Type Check
      run: pnpm typecheck
```

## 📏 Rules & Standards

### **TypeScript Rules**

#### **Error Level Rules**
- `@typescript-eslint/no-unused-vars`: Unused variables (with `_` prefix exception)
- `prefer-const`: Use const for non-reassigned variables
- `no-var`: Prohibit var declarations
- `eqeqeq`: Require strict equality (`===`)
- `curly`: Require curly braces for control statements

#### **Warning Level Rules**
- `@typescript-eslint/no-explicit-any`: Discourage `any` type
- `@typescript-eslint/no-non-null-assertion`: Discourage `!` operator
- `@typescript-eslint/ban-ts-comment`: Warn on `@ts-ignore` comments

#### **File-Specific Rules**

**Test Files** (`**/*.test.ts`, `**/*.spec.ts`):
```javascript
{
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',     // Allow any in tests
    '@typescript-eslint/no-unused-vars': 'off',      // Allow unused in tests  
    '@typescript-eslint/no-empty-function': 'off',   // Allow empty functions
    'no-console': 'off'                               // Allow console in tests
  }
}
```

**Index Files** (`**/index.ts`):
```javascript
{
  rules: {
    '@typescript-eslint/no-unused-vars': 'off',      // Allow re-exports
    'no-duplicate-imports': 'off'                     // Allow multiple imports
  }
}
```

**Config Files** (`**/*.config.js`, `**/*.config.ts`):
```javascript
{
  rules: {
    'no-console': 'off',                              // Allow console in config
    '@typescript-eslint/no-var-requires': 'off',     // Allow require() 
    '@typescript-eslint/no-explicit-any': 'off'      // Allow any in config
  }
}
```

### **Ignored Files & Patterns**

ESLint automatically ignores:
- `**/dist/**` - Build output
- `**/coverage/**` - Test coverage reports
- `**/node_modules/**` - Dependencies
- `**/*.d.ts` - TypeScript declarations
- `**/test-results/**` - Test artifacts
- `**/playwright-report/**` - Browser test reports
- `**/.madge/**` - Dependency analysis output

## 🐛 Troubleshooting

### **Common Issues**

#### **"ESLint configuration not found"**
```bash
# Solution: Ensure you're in repository root or package directory
cd /path/to/agentkit-sdk
pnpm lint

# Or for specific package
cd packages/sdk
npm run lint
```

#### **"Parser error: Cannot find module '@typescript-eslint/parser'"**
```bash
# Solution: Install dependencies
pnpm install

# Or clean install
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

#### **"File ignored because of a matching ignore pattern"**
```bash
# Solution: Check ignore patterns in eslint.config.js
# Files in dist/, node_modules/, etc. are intentionally ignored

# To lint specific ignored file
eslint --no-ignore path/to/file.ts
```

#### **TypeScript type checking errors vs ESLint errors**
```bash
# TypeScript compilation errors
npm run typecheck

# ESLint style/quality errors  
npm run lint

# Both together
npm run typecheck && npm run lint
```

### **Performance Issues**

#### **Slow linting on large codebase**
```bash
# Use cache
eslint . --cache

# Lint only changed files (requires git)
eslint $(git diff --name-only --diff-filter=ACM | grep '\\.ts$')

# Parallel execution (already enabled in pnpm lint)
pnpm lint  # Runs all packages in parallel
```

#### **Memory issues with large files**
```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" pnpm lint
```

### **Debugging Configuration**

#### **Check effective configuration**
```bash
# See what config applies to a specific file
eslint --print-config packages/sdk/src/index.ts

# Debug configuration loading
eslint --debug packages/sdk/src/index.ts
```

#### **Verify parser and plugins**
```bash
# Check ESLint environment info
npx eslint --env-info
```

## ⚡ Advanced Usage

### **IDE Integration**

#### **VS Code Setup**
```json
// .vscode/settings.json
{
  "eslint.workingDirectories": [
    "packages/sdk",
    "packages/cli",
    "packages/types"
  ],
  "eslint.format.enable": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

#### **IntelliJ/WebStorm Setup**
1. Enable ESLint in Preferences → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint
2. Set "Configuration file" to `eslint.config.js`
3. Enable "Run eslint --fix on save"

### **Custom Rules for Repository**

If you need to add repository-specific rules:

```javascript
// eslint.config.js - Add custom rules
{
  files: ['packages/sdk/src/**/*.ts'],
  rules: {
    // Custom rule for SDK package
    'no-console': 'error',  // Stricter for SDK
    '@typescript-eslint/explicit-function-return-type': 'warn'
  }
}
```

### **Selective Linting**

#### **Lint specific packages**
```bash
# SDK only
cd packages/sdk && npm run lint

# Multiple packages
pnpm --filter @agentkit/sdk --filter @agentkit/types run lint
```

#### **Lint specific file patterns**
```bash
# Only source files (no tests)
eslint "packages/*/src/**/*.ts"

# Only test files  
eslint "packages/**/*.test.ts"

# Specific directories
eslint packages/sdk/src packages/cli/src
```

### **Integration with Other Tools**

#### **Prettier Integration**
While not currently configured, you can add Prettier:

```bash
npm install --save-dev prettier eslint-config-prettier

# Add to eslint.config.js
import prettier from 'eslint-config-prettier'
export default [
  // ... existing config
  prettier  // Disables ESLint rules that conflict with Prettier
]
```

#### **Husky Integration** (Alternative to current hooks)
```bash
npm install --save-dev husky
npx husky install
npx husky add .husky/pre-commit "pnpm lint && pnpm typecheck"
```

## 📊 Summary

### **Current Linting Workflow**

1. **Development**: Run `pnpm lint` manually or via IDE
2. **Pre-commit**: Type checking, tests, and build (NOT linting)
3. **CI/CD**: Type checking only (linting NOT in CI)

### **Recommended Improvements**

1. **Add linting to pre-commit hooks**:
   ```bash
   # In scripts/pre-commit.sh, add:
   echo "🔍 Linting code..."
   npm run lint || exit 1
   ```

2. **Add linting to CI workflows**:
   ```yaml
   - name: Lint Code
     run: pnpm lint
   ```

3. **Consider adding Prettier** for consistent formatting

### **Key Commands Reference**

```bash
# Development
pnpm lint                    # Lint all packages
pnpm lint --fix             # Auto-fix issues
pnpm typecheck              # Type checking

# Package-specific
cd packages/sdk && npm run lint

# Git integration
git commit                   # Triggers pre-commit hooks
git commit --no-verify      # Skip hooks

# Debugging
eslint --print-config file.ts
eslint --debug file.ts
```

This linting setup provides a solid foundation for code quality while being flexible enough to accommodate the diverse needs of a TypeScript monorepo with multiple packages.