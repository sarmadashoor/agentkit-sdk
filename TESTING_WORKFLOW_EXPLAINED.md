# Testing Workflow Explained

## 🔄 **What Happens When You Code**

### **On `git commit` (Local)** 🖥️
Your pre-commit hook (`scripts/pre-commit.sh`) runs:
1. ✅ Type checking - 5 seconds
2. ✅ **npm test** (Tier 1) - 9 seconds  
3. ✅ Build packages - 10 seconds
**Total: ~24 seconds per commit**

### **On `git push` (Cloud)** ☁️
GitHub Actions run in parallel:
1. ✅ **Tier 1 Core Tests** - Always runs
2. ✅ **Tier 2 Extended Tests** - Always runs  
3. ⚡ **Tier 3 Integration** - Only on main branch
4. 📅 **Full Comprehensive** - Nightly/releases only

## 🤔 **Why CI Doesn't Timeout**

### **Local Machine** 💻
```
- Your CPU: Also running VS Code, Chrome, Slack, etc.
- Memory: 16GB shared with everything
- Timeout: 5 minutes (vitest default)
- Resources: Competing with other apps
```

### **GitHub Actions (Cloud)** ☁️
```
- Dedicated CPU: 2-16 cores JUST for tests
- Memory: 8-32GB JUST for tests  
- Timeout: 6 HOURS available
- Resources: Nothing else running
- Parallel: Can run multiple jobs simultaneously
```

## 📊 **Real Example**

Your SDK package has 60 test files. When you run locally:
- **All 60 files** try to run at once
- Each creates VMs, workers, agents
- Your laptop struggles → timeout

In GitHub Actions:
- **Matrix strategy** splits into 3 jobs
- Each job gets dedicated 4-core runner
- 20 files per runner, not 60
- Completes successfully

## 🎯 **Current Workflow Summary**

### **Every Commit (Local)** ⚡
```bash
# Automatic via git hook
Type check → Tier 1 tests → Build
~24 seconds total
```

### **Every Push (Cloud)** ☁️
```yaml
# GitHub Actions run automatically
Tier 1 (required) → Pass? → Tier 2 (extended)
                     ↓
                   Fail? → Block merge
```

### **On Main Branch (Cloud)** 🚀
```yaml
# Additional heavy tests
Tier 3 integration tests (plugins, concurrency, observability)
30 minutes with dedicated resources
```

## 🔧 **Practical Commands**

### **For Developers**
```bash
# Before commit (automatic)
git commit -m "fix: something"  # Runs tier 1 automatically

# Manual testing
npm test                        # Quick tier 1 (9s)
npm run test:tier2              # Before important PRs (12s)
```

### **What You DON'T Need to Run**
```bash
npm run test:tier3              # ❌ Let CI handle this
npm run test:ci                 # ❌ Let CI handle this  
```

## 📈 **Why This Works**

1. **Fast Local Feedback** - 9 second tests on commit
2. **Cloud Handles Heavy Lifting** - 30+ minute tests in CI
3. **Parallel Execution** - CI runs multiple jobs at once
4. **Dedicated Resources** - No competition with your browser
5. **Proper Timeouts** - 30 minutes in CI vs 5 minutes locally

## 🎉 **Bottom Line**

- **You**: Run fast tests locally (Tier 1 on commit)
- **Cloud**: Runs everything else with better resources
- **Result**: Fast development + comprehensive testing

The heavy SDK plugin tests that timeout locally work fine in CI because:
- More CPU cores
- More memory  
- Longer timeouts
- No other apps running
- Optimized environment