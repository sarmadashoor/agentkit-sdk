#!/bin/bash

# Script to fix the afterEach, afterAll syntax error in test files

echo "Fixing afterEach, afterAll syntax errors in test files..."

# Find all test files with the problematic pattern
files=$(grep -l "afterEach.*afterAll" __tests__/**/*.test.ts 2>/dev/null)

if [ -z "$files" ]; then
    echo "No files found with the syntax error pattern"
    exit 0
fi

echo "Found files with syntax errors:"
echo "$files" | wc -l
echo ""

# Counter for fixed files
fixed=0

# Process each file
for file in $files; do
    echo "Processing: $file"
    
    # Create a backup
    cp "$file" "$file.bak"
    
    # Fix the syntax error
    # This replaces "afterEach, afterAll" with just "afterEach"
    sed -i 's/afterEach[[:space:]]*,[[:space:]]*afterAll/afterEach/g' "$file"
    
    # Check if the file was modified
    if ! cmp -s "$file" "$file.bak"; then
        echo "  ✓ Fixed syntax error"
        ((fixed++))
        rm "$file.bak"
    else
        echo "  - No changes needed"
        rm "$file.bak"
    fi
done

echo ""
echo "Summary:"
echo "  Files processed: $(echo "$files" | wc -l)"
echo "  Files fixed: $fixed"
echo ""
echo "Note: The afterAll hooks were removed. You may need to add them back separately if needed."
echo "Recommended pattern:"
echo ""
echo "afterEach(async () => {"
echo "  await cleanupAllResources()"
echo "  await flushPromises()"
echo "})"
echo ""
echo "afterAll(async () => {"
echo "  // Additional cleanup if needed"
echo "})"