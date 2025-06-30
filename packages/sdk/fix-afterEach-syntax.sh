#!/bin/bash

# Fix the malformed "afterEach, afterAll" syntax in all test files
# This syntax is invalid and prevents cleanup from running

echo "Fixing afterEach, afterAll syntax errors in test files..."

# Find all files with the problematic pattern and fix them
find __tests__ -name "*.test.ts" -type f | while read -r file; do
    if grep -q "afterEach, afterAll" "$file"; then
        echo "Fixing: $file"
        # Replace the malformed syntax with just afterEach
        # The afterAll functionality will need to be added separately where needed
        sed -i 's/afterEach, afterAll(/afterEach(/g' "$file"
    fi
done

echo "Done! Fixed all instances of 'afterEach, afterAll' syntax errors."
echo "Note: You may need to add separate afterAll hooks where needed."