#!/bin/bash
##
# Install git hooks for AgentKit SDK development
##

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GIT_HOOKS_DIR="$REPO_ROOT/.git/hooks"

echo "🔧 Installing git hooks..."

# Check if we're in a git repository
if [ ! -d "$REPO_ROOT/.git" ]; then
  echo "❌ Not in a git repository"
  exit 1
fi

# Create hooks directory if it doesn't exist
mkdir -p "$GIT_HOOKS_DIR"

# Install pre-commit hook
PRE_COMMIT_HOOK="$GIT_HOOKS_DIR/pre-commit"
cat > "$PRE_COMMIT_HOOK" << 'EOF'
#!/bin/bash
# AgentKit SDK pre-commit hook
# Installed by scripts/install-hooks.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

exec "$REPO_ROOT/scripts/pre-commit.sh"
EOF

chmod +x "$PRE_COMMIT_HOOK"

echo "✅ Pre-commit hook installed"
echo "🎉 Git hooks setup complete!"
echo ""
echo "The pre-commit hook will now run:"
echo "  - Type checking"
echo "  - Tests"
echo "  - Builds"
echo ""
echo "To skip the hook temporarily, use: git commit --no-verify"