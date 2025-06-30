#!/bin/bash

# Simple test runner to identify hanging test groups
# Run each test category separately with timeouts

LOG_FILE="test-isolation-results.log"
TIMEOUT=60

echo "Starting test isolation at $(date)" | tee $LOG_FILE

# Function to run a test pattern
run_test() {
    local pattern=$1
    local name=$2
    echo -e "\n===========================================" | tee -a $LOG_FILE
    echo "Testing: $name" | tee -a $LOG_FILE
    echo "Pattern: $pattern" | tee -a $LOG_FILE
    echo "===========================================" | tee -a $LOG_FILE
    
    # Run with timeout
    timeout $TIMEOUT env FORCE_TEST_EXIT=1 DEBUG_HANDLES=1 pnpm vitest run "$pattern" 2>&1 | tee -a $LOG_FILE
    
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        echo "✅ $name - PASSED" | tee -a $LOG_FILE
    elif [ $exit_code -eq 124 ]; then
        echo "⏱️  $name - TIMED OUT after ${TIMEOUT}s" | tee -a $LOG_FILE
    else
        echo "❌ $name - FAILED with exit code $exit_code" | tee -a $LOG_FILE
    fi
    
    # Brief pause between tests
    sleep 3
    
    return $exit_code
}

# Test individual categories
cd /home/s/dev/agentkit-sdk

echo "Phase 1: Testing individual categories" | tee -a $LOG_FILE

# Plugin tests
run_test "packages/sdk/__tests__/plugin-*.test.ts" "Plugin Core Tests"

# Agent Manager tests  
run_test "packages/sdk/__tests__/agent-manager-*.test.ts" "Agent Manager Tests"

# Transport tests
run_test "packages/sdk/__tests__/transport-*.test.ts" "Transport Tests"

# Circuit breaker tests
run_test "packages/sdk/__tests__/circuit-breaker-*.test.ts" "Circuit Breaker Tests"

# Observability tests
run_test "packages/sdk/__tests__/observability*.test.ts" "Observability Tests"

# Worker/Plugin specific tests
run_test "packages/sdk/__tests__/plugins/*.test.ts" "Plugin Worker Tests"

# Manual tests
run_test "packages/sdk/__tests__/manual/*.test.ts" "Manual Tests"

# Legacy tests
run_test "packages/sdk/__tests__/legacy/*.test.ts" "Legacy Tests"

echo -e "\n===========================================" | tee -a $LOG_FILE
echo "Phase 2: Testing combinations" | tee -a $LOG_FILE
echo "===========================================" | tee -a $LOG_FILE

# Test plugin + agent manager together
run_test "packages/sdk/__tests__/{plugin,agent-manager}*.test.ts" "Plugin + Agent Manager"

# Test all worker-related tests
run_test "packages/sdk/__tests__/**/*worker*.test.ts" "All Worker Tests"

# Test all sandboxed/plugin tests together
run_test "packages/sdk/__tests__/**/*{plugin,sandbox}*.test.ts" "All Plugin/Sandbox Tests"

echo -e "\n===========================================" | tee -a $LOG_FILE
echo "Test isolation complete at $(date)" | tee -a $LOG_FILE
echo "Results saved to: $LOG_FILE" | tee -a $LOG_FILE