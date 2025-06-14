#!/bin/bash
set -e

echo "Building all packages..."

# Check if pnpm is available
if command -v pnpm >/dev/null 2>&1; then
  echo "Using pnpm"
  pnpm -r --parallel run build
else
  echo "pnpm not found, using npm workspaces"
  # Build packages in dependency order
  echo "Building @agentkit/types..."
  cd packages/types && npm run build
  cd ../..
  
  echo "Building @agentkit/registry..."
  cd packages/registry && npm run build
  cd ../..
  
  echo "Building @agentkit/test-agent..."
  cd packages/test-agent && npm run build
  cd ../..
  
  echo "Building @agentkit/transports-dummy..."
  cd packages/transports-dummy && npm run build
  cd ../..
  
  echo "Building @agentkit/sdk..."
  cd packages/sdk && npm run build
  cd ../..
fi

echo "✅ All packages built successfully!"