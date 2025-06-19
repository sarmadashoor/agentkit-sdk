# Claude Autonomous Test Daemon

A fully autonomous and observably reliable test runner for the AgentKit SDK. This refactored daemon system executes test tasks one at a time, with comprehensive timeout handling, structured output, and Claude-compatible result parsing.

## Architecture

```
claude/
├── daemon.ts              # Main daemon - monitors /tasks, runs taskRunner
├── taskRunner.ts          # Subprocess execution with timeout handling  
├── schema.ts              # TypeScript definitions for tasks and results
├── utils.ts               # File system and process utilities
├── tasks/                 # Input: JSON task files
│   └── *.json
└── results/               # Output: structured results
    ├── *.status.json      # Structured metadata per task
    └── *.log              # Full stdout/stderr per task
```

## Key Features

- **Sequential Execution**: One task at a time, no concurrency issues
- **Timeout Handling**: Graceful SIGTERM → Force SIGKILL sequence  
- **Structured Output**: Separate `.status.json` + `.log` files per task
- **Security Filtered**: Only allows safe test-related commands
- **Claude Compatible**: Results designed for easy parsing and analysis
- **Self-Diagnosing**: Comprehensive logging and error handling

## Usage

### Starting the Daemon

```bash
# Start the daemon
npx tsx claude/daemon.ts

# Or using Node.js directly
node claude/daemon.js
```

The daemon will:
1. Monitor `claude/tasks/` for new `.json` files
2. Process existing tasks first, then watch for new ones
3. Execute tasks sequentially (one at a time)
4. Write results to `claude/results/`
5. Clean up processed task files

### Creating Tasks

Create a JSON file in `claude/tasks/`:

```json
{
  "id": "test-07-bounded-executor",
  "type": "run-command", 
  "cmd": "pnpm --filter @agentkit/sdk exec vitest run __tests__/transport-backpressure.test.ts -t \"should work together with bounded executor limits\"",
  "description": "Runs one test case from the backpressure suite",
  "timeout": 60000
}
```

**Task Schema:**
- `id`: Unique identifier for the task
- `type`: Must be "run-command"  
- `cmd`: Shell command to execute
- `timeout`: Optional timeout in milliseconds (default: 60000)
- `description`: Optional human-readable description

### Reading Results

After task execution, two files are created:

**`{taskId}.status.json`** - Structured metadata:
```json
{
  "id": "test-07-bounded-executor",
  "cmd": "pnpm test ...",
  "startTime": "2025-06-18T06:10:12.345Z", 
  "durationMs": 5310,
  "exitCode": 1,
  "status": "fail",
  "error": "Test runner crashed with ENOMEM"
}
```

**`{taskId}.log`** - Full execution log:
```
=== Task Execution Log ===
Task ID: test-07-bounded-executor
Command: pnpm test ...
Start Time: 2025-06-18T06:10:12.345Z
Duration: 5310ms
Exit Code: 1  
Status: fail
Error: Process exited with code 1

=== STDOUT ===
 RUN  v1.6.1 /home/user/agentkit-sdk/packages/sdk
...

=== STDERR ===
Error: Test failed
...
```

### Status Values

- `pass`: Command succeeded (exit code 0)
- `fail`: Command failed (non-zero exit code)  
- `timeout`: Command exceeded timeout limit
- `error`: Command failed to execute or system error

## Security

The daemon includes comprehensive command filtering:

**Blocked Commands:**
- `rm -rf`, `sudo`, `chmod +x`
- Package installations (`npm install`, etc.)
- System operations (`mount`, `fdisk`, etc.)
- Shell injections (`curl | sh`, etc.)

**Allowed Commands:**
- Test runners (`pnpm test`, `vitest`, `dev test`)
- Development tools (`tsx`, `node`)
- Safe utilities (`echo`, `ls`, `grep`, etc.)

## Testing the System

Run the included test script:

```bash
npx tsx claude/test-daemon.ts
```

This creates a simple echo task and verifies the daemon processes it correctly.

## Integration with Claude

The structured output format is designed for easy parsing by Claude or other automation tools:

```typescript
import { readFileSync } from 'fs';

// Read task result
const result = JSON.parse(readFileSync('claude/results/my-task.status.json', 'utf-8'));

if (result.status === 'fail') {
  // Read full logs for debugging
  const logs = readFileSync('claude/results/my-task.log', 'utf-8');
  console.log('Task failed, analyzing logs...', logs);
}
```

## Advanced Usage

### Batch Task Creation

Create multiple tasks programmatically:

```typescript
import { writeFileSync } from 'fs';

const tests = [
  'should respect transport backpressure when queue is full',
  'should allow unlimited messages when backpressure is disabled',
  'should provide accurate queue size information'
];

tests.forEach((testName, i) => {
  const task = {
    id: `test-${i + 1}-${testName.replace(/\s+/g, '-')}`,
    type: 'run-command',
    cmd: `pnpm --filter @agentkit/sdk exec vitest run __tests__/transport-backpressure.test.ts -t "${testName}"`,
    timeout: 30000
  };
  
  writeFileSync(`claude/tasks/test-${i + 1}.json`, JSON.stringify(task, null, 2));
});
```

### Result Analysis

Parse all results for summary reporting:

```typescript
import { readdirSync, readFileSync } from 'fs';

const results = readdirSync('claude/results')
  .filter(f => f.endsWith('.status.json'))
  .map(f => JSON.parse(readFileSync(`claude/results/${f}`, 'utf-8')));

const summary = {
  total: results.length,
  passed: results.filter(r => r.status === 'pass').length,
  failed: results.filter(r => r.status === 'fail').length,
  timeout: results.filter(r => r.status === 'timeout').length,
  error: results.filter(r => r.status === 'error').length
};

console.log('Test Summary:', summary);
```

## Troubleshooting

**Daemon not processing tasks:**
- Check daemon is running: `ps aux | grep daemon`
- Verify task file format and permissions
- Check daemon logs for errors

**Tasks timing out:**
- Increase timeout value in task JSON
- Check if command is actually running
- Review security filtering (command may be blocked)

**No result files:**
- Ensure `claude/results/` directory exists and is writable
- Check daemon has permission to write files
- Verify task completed (wasn't killed externally)

## Migration from Old System

The new system is backward compatible with the old task format, but uses new result format:

**Old Result Format:**
```json
{
  "taskId": "...",
  "success": true,
  "stdout": "...",
  "stderr": "...",
  "exitCode": 0
}
```

**New Result Format:**
```json
{
  "id": "...",
  "status": "pass",
  "durationMs": 1234,
  "exitCode": 0
}
```

Update any scripts that parse results to use the new `.status.json` format.