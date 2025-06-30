#\!/bin/bash

# Test validation script for AgentKit SDK test hang fix

echo '🧪 Running AgentKit SDK Test Validation'
echo '======================================'

# Test 1: Run with handle debugging and force exit
echo '1️⃣ Testing with handle debugging + force exit (should show MessagePort leaks but exit cleanly):'
DEBUG_HANDLES=1 FORCE_TEST_EXIT=1 timeout 60s npx vitest run __tests__/manual/signing-simulation.test.ts --reporter=basic

# Test 2: Check if process exits without timeout (CI mode)
echo '2️⃣ Testing normal exit without force (may hang if not fully fixed):'
timeout 30s npx vitest run __tests__/manual/signing-simulation.test.ts --reporter=basic

# Test 3: Run full test suite with force exit
echo '3️⃣ Running full test suite with force exit (should complete all tests):'
FORCE_TEST_EXIT=1 timeout 120s npx vitest run --reporter=basic

echo '✅ Validation complete\!'
echo ''
echo 'Expected results:'
echo '- Test 1: Should show MessagePort leaks but exit with code 0'
echo '- Test 2: May hang (indicates remaining handles)'  
echo '- Test 3: Should complete all tests and exit cleanly'
echo ''
echo 'Acceptance criteria:'
echo '✅ pnpm vitest run exits cleanly with FORCE_TEST_EXIT=1'
echo '❌ May still hang without FORCE_TEST_EXIT due to MessagePort leaks'
echo '🔧 Further work needed: Track down MessagePort sources in worker tests'

