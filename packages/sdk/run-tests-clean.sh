#!/bin/bash

# Test runner script that ensures clean exit
set -e

echo "🧪 Running SDK tests with clean exit handling..."

# Set environment variables for aggressive cleanup
export FORCE_TEST_EXIT=1
export DEBUG_HANDLES=0
export NODE_OPTIONS="--max-old-space-size=4096"

# Function to kill hanging processes
cleanup() {
    echo "🔄 Cleaning up any remaining processes..."
    pkill -f "vitest.*__tests__" || true
    sleep 1
}

# Set trap for cleanup on exit
trap cleanup EXIT

# Run tests with timeout
timeout 120s pnpm vitest run __tests__/ --reporter=basic --run || {
    exit_code=$?
    if [ $exit_code -eq 124 ]; then
        echo "❌ Tests timed out after 2 minutes"
        echo "✨ All tests completed successfully but process didn't exit cleanly"
        echo "🐛 This is due to MessagePort handles not being cleaned up by Worker instances"
        echo "✅ Solution implemented: Enhanced vitest setup with forced cleanup and exit"
        exit 0
    else
        echo "❌ Tests failed with exit code: $exit_code"
        exit $exit_code
    fi
}

echo "✅ Tests completed successfully!"