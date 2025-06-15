# Release Engineering Guide

This document outlines the release engineering practices and tooling for the AgentKit SDK.

## 🎯 Overview

The AgentKit SDK follows **Stripe-grade** release engineering practices with automated validation, bundle size monitoring, and CI-friendly outputs.

## 🏗️ Build Pipeline

### Artifact Hygiene
- **Clean outputs**: Only `dist/` folders are published to npm
- **Source maps**: Generated for all packages with proper mappings
- **Type definitions**: `.d.ts` and `.d.mts` files for TypeScript consumers
- **No test code**: Test files, mocks, and development files excluded from npm packages

### Verification
```bash
# Preview package contents
cd packages/sdk && npm pack --dry-run

# Build all packages
npm run build

# Check artifacts are clean
npm run size:check
```

## 📦 Bundle Size Monitoring

### Size Limits
| Package | Limit (gzipped) | Current |
|---------|----------------|---------|
| `@agentkit/sdk` | 60KB | ~54KB |
| `@agentkit/runtime-web` | 20KB | ~0.1KB |
| `@agentkit/runtime-web/lite` | 15KB | ~0.3KB |
| `@agentkit/types` | 5KB | ~2KB |
| `@agentkit/registry` | 50KB | ~44KB |

### Usage
```bash
# Check all bundle sizes
npm run size:check

# View detailed size report
cat bundle-size-stats.json
```

### CI Integration
Bundle size checks run automatically and fail CI if limits are exceeded. Results are saved to `bundle-size-stats.json` for analysis.

## ✅ Quality Gates

### Pre-commit Hooks
Automatic validation runs on every commit:
- Type checking across all packages
- Test execution
- Build verification

```bash
# Install git hooks
npm run install:hooks

# Skip hooks temporarily (not recommended)
git commit --no-verify
```

### Linting & Type Safety
```bash
# Type check all packages
npm run typecheck

# Lint check (TypeScript compilation)
npm run lint:check
```

## 🚀 Release Process

### Release Safety Checklist
```bash
# Run comprehensive safety checks
npm run release:check
```

This validates:
- ✅ README.md exists and includes all packages
- ✅ CHANGELOG.md has entry for current version
- ✅ Git working directory is clean
- ✅ All packages build successfully
- ✅ All tests pass
- ✅ Type checking passes
- ✅ Bundle sizes within limits
- ✅ Package exports are valid
- ✅ npm publish dry-run succeeds

### Automated Release
```bash
# Release with version bump
npm run release patch|minor|major|prerelease

# Dry run (safe, no changes)
npm run release patch --dry-run

# Skip safety checks (not recommended)
npm run release patch --skip-checks
```

The release tool:
1. 🔍 Runs safety checks
2. 📝 Updates all package.json versions
3. 📝 Updates CHANGELOG.md
4. 🏗️ Builds all packages
5. 🧪 Runs full test suite
6. 📦 Validates bundle sizes
7. 🏷️ Creates git tag
8. 🚀 Publishes to npm

### Manual Release Steps
```bash
# 1. Version bump
npm version patch

# 2. Build & validate
npm run build
npm run test
npm run size:check

# 3. Tag and publish
git tag v$(node -p "require('./package.json').version")
npm publish --workspaces
```

## 📊 Metrics & Reporting

### Bundle Size Reports
- **Location**: `bundle-size-stats.json`
- **Contents**: Compressed/uncompressed sizes, limits, violations
- **CI Integration**: Fails on size regressions

### Release Reports
- **Location**: `release-check-results.json`
- **Contents**: Safety check results for debugging

## 🔐 Security & Validation

### Package Security
- **No secrets**: Pre-commit hooks prevent credential commits
- **Clean artifacts**: Source maps point to legitimate source files
- **Dependency validation**: Workspace dependency consistency

### Export Validation
All package exports are validated to ensure:
- Main entry points exist
- Type definitions are available
- Module formats (CJS/ESM) work correctly

## 🎛️ Configuration Files

### Core Files
- `tsconfig.base.json` - TypeScript base configuration with source maps
- `eslint.config.js` - Linting rules (built-in ESLint only)
- `.prettierrc.json` - Code formatting rules
- Package-specific `tsconfig.json` files extend the base

### Scripts
- `scripts/size-check.js` - Bundle size enforcement
- `scripts/release-check.js` - Release safety validation  
- `scripts/release.js` - Automated release tool
- `scripts/pre-commit.sh` - Git hook validation
- `scripts/install-hooks.sh` - Git hooks installer

### Package.json Scripts
```json
{
  "build": "Build all packages",
  "test": "Run all tests", 
  "typecheck": "Type check all packages",
  "lint:check": "Run linting validation",
  "size:check": "Validate bundle sizes",
  "release:check": "Run release safety checks",
  "release": "Automated release tool",
  "install:hooks": "Install git hooks"
}
```

## 🔄 CI Integration

### Required CI Steps
```yaml
# Example GitHub Actions
- run: npm ci
- run: npm run build
- run: npm run test  
- run: npm run typecheck
- run: npm run size:check
- run: npm run release:check
```

### Artifact Storage
- Bundle size stats can be stored as CI artifacts
- Release reports provide debugging information
- Source maps enable production debugging

## 📈 Performance Monitoring

### Build Times
- Full workspace build: ~5-10 seconds
- Individual package build: ~1-3 seconds  
- Test execution: Variable based on scope

### Bundle Analysis
- Use `rollup-plugin-visualizer` for detailed bundle analysis
- Tree-shaking verification for dead code elimination
- Dependency impact analysis

## 🚨 Troubleshooting

### Common Issues

**Build Failures**
```bash
# Clean and rebuild
npm run clean
npm run build
```

**Size Violations** 
```bash
# Analyze bundle contents
npm run size:check
# Review bundle-size-stats.json for details
```

**Release Check Failures**
```bash
# Run individual checks
npm run typecheck
npm run test
npm run build
```

**Git Hook Issues**
```bash
# Reinstall hooks
npm run install:hooks

# Skip temporarily
git commit --no-verify
```

### Emergency Release Process
1. Skip safety checks: `npm run release patch --skip-checks`  
2. Manual version bump and publish
3. Fix issues in follow-up patch release

## 📝 Best Practices

1. **Always run `npm run release:check` before releasing**
2. **Monitor bundle sizes regularly**
3. **Update CHANGELOG.md for all user-facing changes**
4. **Use semantic versioning correctly**
5. **Test package installations locally before releasing**
6. **Keep source maps in production builds for debugging**

---

This release engineering setup ensures **production-ready, maintainable packages** with automated quality gates and comprehensive validation.