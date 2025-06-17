#!/bin/bash

echo "🔍 Checking AgentKit development environment..."
echo ""

# Check Node.js version
echo "📦 Node.js:"
if command -v node >/dev/null 2>&1; then
  NODE_VERSION=$(node -v)
  echo "  ✅ Node.js installed: $NODE_VERSION"
  
  # Check if version is >= 18
  NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1 | sed 's/v//')
  if [ "$NODE_MAJOR" -ge 18 ]; then
    echo "  ✅ Node.js version meets requirement (>= 18.0.0)"
  else
    echo "  ❌ Node.js version too old. Please upgrade to >= 18.0.0"
  fi
else
  echo "  ❌ Node.js not found. Please install Node.js >= 18.0.0"
fi

echo ""
echo "📦 pnpm:"
# Check pnpm
if command -v pnpm >/dev/null 2>&1; then
  PNPM_VERSION=$(pnpm -v)
  echo "  ✅ pnpm installed: v$PNPM_VERSION"
  
  # Check if version is >= 8
  PNPM_MAJOR=$(echo $PNPM_VERSION | cut -d. -f1)
  if [ "$PNPM_MAJOR" -ge 8 ]; then
    echo "  ✅ pnpm version meets requirement (>= 8.0.0)"
  else
    echo "  ❌ pnpm version too old. Please upgrade to >= 8.0.0"
    echo "     Run: npm install -g pnpm"
  fi
else
  echo "  ❌ pnpm not found. Please install pnpm:"
  echo "     Run: npm install -g pnpm"
fi

echo ""
echo "📦 Optional tools:"
# Check npm (for compatibility)
if command -v npm >/dev/null 2>&1; then
  NPM_VERSION=$(npm -v)
  echo "  ✅ npm installed: v$NPM_VERSION (for pnpm installation)"
else
  echo "  ⚠️  npm not found (needed to install pnpm)"
fi

# Check git
if command -v git >/dev/null 2>&1; then
  echo "  ✅ git installed"
else
  echo "  ⚠️  git not found (recommended for version control)"
fi

# Check nvm
if command -v nvm >/dev/null 2>&1 || [ -s "$HOME/.nvm/nvm.sh" ]; then
  echo "  ✅ nvm detected (for Node.js version management)"
else
  echo "  ℹ️  nvm not found (optional, for Node.js version management)"
fi

echo ""
echo "📁 Project setup:"
# Check if in correct directory
if [ -f "package.json" ] && [ -f "pnpm-workspace.yaml" ]; then
  echo "  ✅ In AgentKit SDK root directory"
else
  echo "  ⚠️  Not in AgentKit SDK root directory"
fi

# Check if dependencies are installed
if [ -d "node_modules" ]; then
  echo "  ✅ Dependencies appear to be installed"
else
  echo "  ℹ️  Dependencies not installed. Run: pnpm install"
fi

echo ""
echo "🎯 Next steps:"
if ! command -v pnpm >/dev/null 2>&1; then
  echo "  1. Install pnpm: npm install -g pnpm"
  echo "  2. Install dependencies: pnpm install"
  echo "  3. Build packages: pnpm build"
  echo "  4. Run tests: pnpm test"
elif [ ! -d "node_modules" ]; then
  echo "  1. Install dependencies: pnpm install"
  echo "  2. Build packages: pnpm build"
  echo "  3. Run tests: pnpm test"
else
  echo "  ✅ Environment ready! You can now:"
  echo "     - Build: pnpm build"
  echo "     - Test: pnpm test"
  echo "     - Lint: pnpm lint"
  echo "     - Type check: pnpm typecheck"
fi