#!/bin/bash
set -e

echo "Running tests for all packages..."

# Check if pnpm is available
if command -v pnpm >/dev/null 2>&1; then
  echo "Using pnpm"
  pnpm -r --parallel run test
else
  echo "pnpm not found, using npm workspaces"
  # Test packages in parallel using npm
  echo "Testing @agentkit/types..."
  cd packages/types && npm test -- --run
  cd ../..
  
  echo "Testing @agentkit/registry..."
  cd packages/registry && npm test -- --run
  cd ../..
  
  echo "Testing @agentkit/test-agent..."
  cd packages/test-agent && npm test -- --run
  cd ../..
  
  echo "Testing @agentkit/transports-dummy..."
  cd packages/transports-dummy && npm test -- --run
  cd ../..
  
  echo "Testing @agentkit/sdk..."
  cd packages/sdk && npm test -- --run
  cd ../..
fi

echo "✅ All tests passed!"