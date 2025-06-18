#!/bin/bash

# Run Vitest with debug output
echo "Running Vitest tests..."
echo "Current directory: $(pwd)"
echo "Node version: $(node --version)"
echo "pnpm version: $(pnpm --version)"

# Set up environment
export NODE_ENV=test

# Try to run tests
if command -v pnpm &> /dev/null; then
    echo "Using pnpm..."
    pnpm exec vitest run --reporter verbose > vitest-debug.log 2>&1
    exit_code=$?
else
    echo "pnpm not found, trying npx..."
    npx vitest run --reporter verbose > vitest-debug.log 2>&1
    exit_code=$?
fi

echo "Test execution complete. Exit code: $exit_code"
echo "Output saved to vitest-debug.log"

# Show summary
if [ -f vitest-debug.log ]; then
    echo "--- Test Summary ---"
    tail -n 20 vitest-debug.log
fi

exit $exit_code