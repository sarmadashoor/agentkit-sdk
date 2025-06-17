#!/bin/bash
set -e

echo "Type checking all packages..."

# Check if pnpm is available
if ! command -v pnpm >/dev/null 2>&1; then
  echo "❌ Error: pnpm is required but not installed."
  echo "Please install pnpm with: npm install -g pnpm"
  exit 1
fi

echo "Using pnpm to type check all packages..."
pnpm -r exec tsc --noEmit

echo "✅ All packages pass type checking!"