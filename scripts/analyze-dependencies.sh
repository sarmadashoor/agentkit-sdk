#!/bin/bash

# Dependency analysis script using madge
# This script analyzes the import topology of each package

set -e

echo "🔍 Analyzing package dependencies with madge..."

# Create output directory if it doesn't exist
OUTPUT_DIR=".madge"
mkdir -p "$OUTPUT_DIR"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to analyze a package
analyze_package() {
    local package=$1
    local package_path="packages/$package"
    
    if [ ! -d "$package_path" ]; then
        echo -e "${RED}✗ Package $package not found${NC}"
        return 1
    fi
    
    echo -e "\n${YELLOW}📦 Analyzing $package package...${NC}"
    
    # Generate DOT file
    echo "  Generating DOT graph..."
    npx madge --circular --extensions ts --warning "$package_path/src" > "$OUTPUT_DIR/$package-deps.dot" 2>/dev/null || {
        echo -e "${RED}  ✗ Failed to generate DOT file${NC}"
    }
    
    # Generate JSON summary
    echo "  Generating JSON summary..."
    npx madge --circular --extensions ts --json "$package_path/src" > "$OUTPUT_DIR/$package-deps.json" 2>/dev/null || {
        echo -e "${RED}  ✗ Failed to generate JSON file${NC}"
    }
    
    # Check for circular dependencies
    echo "  Checking for circular dependencies..."
    if npx madge --circular --extensions ts "$package_path/src" 2>&1 | grep -q "No circular dependencies found"; then
        echo -e "${GREEN}  ✓ No circular dependencies found${NC}"
    else
        echo -e "${RED}  ✗ Circular dependencies detected!${NC}"
        npx madge --circular --extensions ts "$package_path/src" 2>/dev/null || true
    fi
    
    # Generate image if graphviz is installed
    if command -v dot &> /dev/null; then
        echo "  Generating SVG visualization..."
        npx madge --image "$OUTPUT_DIR/$package-deps.svg" --extensions ts "$package_path/src" 2>/dev/null || {
            echo -e "${YELLOW}  ⚠ Could not generate SVG${NC}"
        }
    fi
    
    echo -e "${GREEN}  ✓ Analysis complete${NC}"
}

# Analyze each package
packages=("sdk" "cli" "registry" "errors")

for package in "${packages[@]}"; do
    analyze_package "$package"
done

# Generate combined report
echo -e "\n${YELLOW}📊 Generating combined analysis...${NC}"

# Create summary report
cat > "$OUTPUT_DIR/analysis-summary.md" << EOF
# Dependency Analysis Report
Generated on: $(date)

## Package Analysis

EOF

for package in "${packages[@]}"; do
    if [ -f "$OUTPUT_DIR/$package-deps.json" ]; then
        echo "### $package" >> "$OUTPUT_DIR/analysis-summary.md"
        echo '```json' >> "$OUTPUT_DIR/analysis-summary.md"
        cat "$OUTPUT_DIR/$package-deps.json" | jq '.' 2>/dev/null || cat "$OUTPUT_DIR/$package-deps.json" >> "$OUTPUT_DIR/analysis-summary.md"
        echo '```' >> "$OUTPUT_DIR/analysis-summary.md"
        echo "" >> "$OUTPUT_DIR/analysis-summary.md"
    fi
done

echo -e "\n${GREEN}✅ Dependency analysis complete!${NC}"
echo -e "📁 Reports saved to: $OUTPUT_DIR/"
echo -e "\nAvailable reports:"
ls -la "$OUTPUT_DIR"/*.{dot,json,md,svg} 2>/dev/null || ls -la "$OUTPUT_DIR"/*.{dot,json,md} 2>/dev/null || true