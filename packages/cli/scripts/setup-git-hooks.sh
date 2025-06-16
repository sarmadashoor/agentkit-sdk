#!/bin/bash

# Setup AgentKit Git Hooks
# Installs validation hooks for plugin development

set -e

echo "🔧 Setting up AgentKit git hooks..."

# Find git root
GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")

if [ -z "$GIT_ROOT" ]; then
    echo "❌ Not in a git repository"
    exit 1
fi

HOOKS_DIR="$GIT_ROOT/.git/hooks"
CLI_SCRIPTS_DIR="$GIT_ROOT/packages/cli/scripts"

if [ ! -d "$CLI_SCRIPTS_DIR" ]; then
    echo "❌ CLI scripts directory not found: $CLI_SCRIPTS_DIR"
    exit 1
fi

echo "📂 Git hooks directory: $HOOKS_DIR"
echo "📂 CLI scripts directory: $CLI_SCRIPTS_DIR"

# Install pre-commit hook
PRE_COMMIT_HOOK="$HOOKS_DIR/pre-commit"

if [ -f "$PRE_COMMIT_HOOK" ]; then
    echo "⚠️  Pre-commit hook already exists, backing up..."
    mv "$PRE_COMMIT_HOOK" "$PRE_COMMIT_HOOK.backup.$(date +%s)"
fi

cat > "$PRE_COMMIT_HOOK" << 'EOF'
#!/bin/bash
# AgentKit Pre-commit Hook (auto-generated)
# This file was created by packages/cli/scripts/setup-git-hooks.sh

GIT_ROOT=$(git rev-parse --show-toplevel)
SCRIPT_PATH="$GIT_ROOT/packages/cli/scripts/pre-commit-hook.sh"

if [ -f "$SCRIPT_PATH" ]; then
    exec "$SCRIPT_PATH"
else
    echo "❌ AgentKit pre-commit script not found: $SCRIPT_PATH"
    echo "💡 Run setup-git-hooks.sh to reinstall"
    exit 1
fi
EOF

chmod +x "$PRE_COMMIT_HOOK"

echo "✅ Pre-commit hook installed"

# Optional: Install commit-msg hook for conventional commits
COMMIT_MSG_HOOK="$HOOKS_DIR/commit-msg"

if [ ! -f "$COMMIT_MSG_HOOK" ]; then
    cat > "$COMMIT_MSG_HOOK" << 'EOF'
#!/bin/bash
# AgentKit Commit Message Hook (auto-generated)
# Validates conventional commit format

commit_regex='^(feat|fix|docs|test|refactor|chore|style|ci|perf|build)(\(.+\))?: .{1,50}'

if ! grep -qE "$commit_regex" "$1"; then
    echo "❌ Invalid commit message format!"
    echo ""
    echo "Commit messages should follow conventional commits format:"
    echo "  type(scope): description"
    echo ""
    echo "Types: feat, fix, docs, test, refactor, chore, style, ci, perf, build"
    echo ""
    echo "Examples:"
    echo "  feat(cli): add plugin scaffolding command"
    echo "  fix(sdk): resolve plugin loading issue"
    echo "  docs: update README with examples"
    echo ""
    exit 1
fi
EOF
    
    chmod +x "$COMMIT_MSG_HOOK"
    echo "✅ Commit message hook installed"
else
    echo "⚠️  Commit message hook already exists, skipping"
fi

echo ""
echo "🎉 Git hooks setup complete!"
echo ""
echo "Installed hooks:"
echo "  • pre-commit: Validates plugins before commit"
echo "  • commit-msg: Enforces conventional commit format"
echo ""
echo "To test the hooks:"
echo "  git add . && git commit -m 'test: validate git hooks'"
echo ""