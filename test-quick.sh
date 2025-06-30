#!/bin/bash
# Quick test to verify tests can complete and exit properly

echo "🧪 Running quick subset of tests to verify completion..."

# Run just a few test files to verify they complete and exit
npx vitest run __tests__/circuit-breaker.test.ts __tests__/bounded-queue.test.ts __tests__/init.test.ts --reporter=verbose

EXIT_CODE=$?
echo ""
echo "✅ Test execution completed with exit code: $EXIT_CODE"
echo "✅ Process exited cleanly - no hanging!"

exit $EXIT_CODE