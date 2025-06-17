#!/bin/bash
set -e

echo "Running tests for all packages..."

# Check if pnpm is available
if ! command -v pnpm >/dev/null 2>&1; then
  echo "❌ Error: pnpm is required but not installed."
  echo "Please install pnpm with: npm install -g pnpm"
  exit 1
fi

echo "Using pnpm to test all packages..."
pnpm -r --parallel run test

echo "✅ All tests passed!"