#!/bin/bash

# AgentKit Pre-commit Hook
# Validates plugins before committing changes

set -e

echo "🔍 AgentKit Pre-commit Hook"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Not in a Node.js project directory"
    exit 1
fi

# Check for CLI tools
CLI_DIR="packages/cli"
if [ -d "$CLI_DIR" ]; then
    echo "📦 Found CLI package, running plugin validation..."
    
    # Run plugin validator
    if node "$CLI_DIR/scripts/validate-plugin.js"; then
        echo "✅ Plugin validation passed"
    else
        echo "❌ Plugin validation failed"
        echo "💡 Fix the validation errors before committing"
        exit 1
    fi
fi

# Check for any staged plugin files
STAGED_PLUGIN_FILES=$(git diff --cached --name-only | grep -E "plugins/.*\.(ts|js|json)$" || true)

if [ -n "$STAGED_PLUGIN_FILES" ]; then
    echo "🔍 Found staged plugin files, running additional checks..."
    
    # Check TypeScript syntax for staged plugin files
    for file in $STAGED_PLUGIN_FILES; do
        if [[ "$file" == *.ts ]]; then
            echo "🔧 Checking TypeScript syntax: $file"
            if command -v tsc >/dev/null 2>&1; then
                if ! tsc --noEmit "$file" 2>/dev/null; then
                    echo "❌ TypeScript errors found in $file"
                    echo "💡 Fix TypeScript errors before committing"
                    exit 1
                fi
            else
                echo "⚠️  TypeScript compiler not found, skipping syntax check"
            fi
        fi
    done
    
    echo "✅ All staged plugin files look good"
fi

echo "🎉 Pre-commit validation passed!"
exit 0