#!/bin/bash

# Run each test file individually to find which one hangs

echo "Running tests sequentially to find hanging test..."

# Get all test files
test_files=$(find __tests__ -name "*.test.ts" -type f | sort)

for file in $test_files; do
    echo ""
    echo "========================================="
    echo "Running: $file"
    echo "========================================="
    
    # Run test with timeout
    timeout 30s npx vitest run "$file" --reporter=verbose
    exit_code=$?
    
    if [ $exit_code -eq 124 ]; then
        echo "❌ TIMEOUT: $file"
        echo "Found hanging test file!"
        exit 1
    elif [ $exit_code -ne 0 ]; then
        echo "❌ FAILED: $file (exit code: $exit_code)"
    else
        echo "✅ PASSED: $file"
    fi
done

echo ""
echo "All tests completed!"