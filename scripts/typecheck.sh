#!/bin/bash
set -e

echo "Type checking all packages..."

# Check if pnpm is available
if command -v pnpm >/dev/null 2>&1; then
  echo "Using pnpm"
  pnpm -r exec tsc --noEmit
else
  echo "pnpm not found, using npm workspaces"
  # Type check each package
  packages=("types" "registry" "test-agent" "transports-dummy" "sdk")
  
  for package in "${packages[@]}"; do
    echo "Type checking @agentkit/$package..."
    cd packages/$package && npm run typecheck
    cd ../..
  done
fi

echo "✅ All packages pass type checking!"