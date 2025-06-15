#!/bin/bash
##
# Pre-commit hook for AgentKit SDK
# Runs formatting, linting, and basic validation
##

set -e

echo "🔍 Running pre-commit checks..."

# Check if TypeScript compiles
echo "📝 Type checking..."
npm run typecheck || {
  echo "❌ Type checking failed"
  exit 1
}

# Check if tests pass
echo "🧪 Running tests..."
npm run test || {
  echo "❌ Tests failed"
  exit 1
}

# Build all packages
echo "🏗️  Building packages..."
npm run build || {
  echo "❌ Build failed"
  exit 1
}

echo "✅ Pre-commit checks passed"