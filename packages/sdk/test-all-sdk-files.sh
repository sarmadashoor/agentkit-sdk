#!/bin/bash

# Script to test all SDK test files and check for failures

echo "🧪 Testing all SDK test files..."
echo "================================"

# Counter variables
total=0
passed=0
failed=0

# Create temporary files for results
passed_tests="/tmp/passed_tests.txt"
failed_tests="/tmp/failed_tests.txt"

# Clear temporary files
> "$passed_tests"
> "$failed_tests"

# Find and test all test files
find __tests__ -name "*.test.ts" -type f | sort | while read -r test_file; do
    total=$((total + 1))
    echo ""
    echo "📋 Testing: $test_file"
    echo "-----------------------------------"
    
    # Run test and capture exit code
    if timeout 60s npm test -- "$test_file" > /tmp/test_output.txt 2>&1; then
        # Extract test count from output
        test_count=$(grep -oE 'Tests.*[0-9]+ passed \([0-9]+\)' /tmp/test_output.txt | tail -1)
        duration=$(grep -oE 'Duration.*' /tmp/test_output.txt | tail -1)
        
        echo "✅ PASSED: $test_file"
        echo "   $test_count"
        echo "   $duration"
        echo "$test_file|$test_count|$duration" >> "$passed_tests"
        passed=$((passed + 1))
    else
        # Extract failure info
        failed_count=$(grep -oE '[0-9]+ failed' /tmp/test_output.txt | tail -1)
        error_msg=$(grep -A5 "FAIL" /tmp/test_output.txt | head -10)
        
        echo "❌ FAILED: $test_file"
        echo "   Failed tests: $failed_count"
        echo "$test_file|$failed_count" >> "$failed_tests"
        failed=$((failed + 1))
        
        # Show first few lines of error
        echo "   Error preview:"
        echo "$error_msg" | sed 's/^/     /'
    fi
done

# Summary
echo ""
echo "================================"
echo "📊 TEST SUMMARY"
echo "================================"
echo "Total test files: $total"
echo "✅ Passed: $passed"
echo "❌ Failed: $failed"
echo "Success rate: $(( passed * 100 / total ))%"
echo ""

# Show failed tests if any
if [ -s "$failed_tests" ]; then
    echo "❌ FAILED TESTS:"
    echo "----------------"
    cat "$failed_tests" | while IFS='|' read -r file count; do
        echo "  - $file ($count)"
    done
fi

# Show all passed tests
echo ""
echo "✅ PASSED TESTS:"
echo "----------------"
cat "$passed_tests" | while IFS='|' read -r file count duration; do
    echo "  - $file"
    echo "    $count | $duration"
done

# Cleanup
rm -f /tmp/test_output.txt