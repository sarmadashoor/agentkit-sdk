#\!/bin/bash

# Get all test files
find __tests__ -name "*.test.ts" -type f | sed 's|__tests__/||' | sort > all_files.txt

# Create list of documented files
cat > documented_files.txt << 'DOC'
connect-agent-refactor.test.ts
agent-concurrency.test.ts
agent-manager-concurrency-simple.test.ts
agent-manager-concurrency.test.ts
agent-manager-memory-leaks.test.ts
agent-manager-race-conditions.test.ts
bounded-queue.test.ts
circuit-breaker-observability.test.ts
observability/MetricsCollector.test.ts
circuit-breaker-metrics.test.ts
circuit-breaker-transport-integration.test.ts
connectAgent.integration.test.ts
connectAgent.test.ts
manual/fault-boundary.test.ts
metrics/Instrumentation.test.ts
DOC

echo "Files NOT yet tested and documented:"
echo "====================================="

# Find files in all_files.txt but not in documented_files.txt
comm -23 all_files.txt documented_files.txt

# Cleanup
rm all_files.txt documented_files.txt
