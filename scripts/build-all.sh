#!/bin/bash
set -e

echo "Building all packages..."

# Check if pnpm is available
if ! command -v pnpm >/dev/null 2>&1; then
  echo "❌ Error: pnpm is required but not installed."
  echo "Please install pnpm with: npm install -g pnpm"
  exit 1
fi

echo "Using pnpm to build all packages..."
pnpm -r --parallel run build

echo "✅ All packages built successfully!"