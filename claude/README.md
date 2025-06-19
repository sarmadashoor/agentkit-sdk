# Claude Automation Runner

A self-contained automation system for executing shell commands and monitoring results within the AgentKit SDK monorepo.

## Overview

The Claude Automation Runner enables autonomous task execution through a file-based task queue system. Tasks are defined as JSON files, executed by a daemon process, and results are captured comprehensively for analysis.

## Architecture

```
claude/
├── daemon.ts              # Main daemon process - monitors and executes tasks
├── taskRunner.ts          # Command execution engine with security controls
├── utils.ts               # Utility functions for logging, timestamps, file ops
├── tasks/                 # Task queue directory (monitored by daemon)
│   ├── sample-test-task.json
│   └── lint-task.json
├── results/               # Execution results directory
│   ├── .gitkeep
│   └── task-{id}-{timestamp}.json  # Generated results
└── README.md             # This documentation
```

## Quick Start

### 1. Start the Daemon

```bash
# From the project root
cd claude/
npx tsx daemon.ts
```

The daemon will:
- Monitor the `tasks/` directory for new `.json` files
- Execute commands when tasks appear
- Write results to `results/` directory  
- Remove completed tasks automatically

### 2. Create a Task

Create a JSON file in `claude/tasks/`:

```json
{
  "id": "my-task-001",
  "type": "run-command", 
  "cmd": "pnpm test",
  "timeout": 120000,
  "description": "Run tests to validate changes"
}
```

### 3. Monitor Results

Results appear in `claude/results/` as JSON files:

```json
{
  "taskId": "my-task-001",
  "cmd": "pnpm test",
  "startTime": "2024-01-15T10:30:00.000Z",
  "endTime": "2024-01-15T10:31:45.123Z", 
  "duration": 105123,
  "stdout": "✓ All tests passed...",
  "stderr": "",
  "exitCode": 0,
  "success": true,
  "timestamp": "20240115-103145-123"
}
```

## Task Format

### Required Fields

- `id`: Unique identifier for the task
- `type`: Must be `"run-command"` 
- `cmd`: Shell command to execute

### Optional Fields

- `timeout`: Maximum execution time in milliseconds (default: 60000)
- `description`: Human-readable description of the task

### Example Tasks

**Run Tests:**
```json
{
  "id": "test-all",
  "type": "run-command",
  "cmd": "pnpm test",
  "timeout": 180000,
  "description": "Execute full test suite"
}
```

**Type Check:**
```json
{
  "id": "typecheck",
  "type": "run-command", 
  "cmd": "pnpm typecheck",
  "timeout": 60000,
  "description": "Validate TypeScript types across packages"
}
```

**Build All Packages:**
```json
{
  "id": "build-all",
  "type": "run-command",
  "cmd": "pnpm build", 
  "timeout": 120000,
  "description": "Build all packages in dependency order"
}
```

## Security Features

### Command Filtering

Only safe commands are allowed. The daemon blocks:

- File deletion (`rm -rf`)
- Privilege escalation (`sudo`)
- Package installation (`npm install`, `pnpm install`)
- Pipe to shell (`curl | sh`)
- Disk operations (`dd`, `fdisk`)
- Network downloads (`wget`, `curl`)

### Allowed Commands

Safe commands include:
- `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`
- `npm test`, `npm run <script>`
- File inspection: `ls`, `cat`, `head`, `tail`, `grep`
- Basic utilities: `echo`, `pwd`, `wc`

### Execution Environment

- No shell injection (commands parsed safely)
- Timeout protection prevents hanging processes
- Process isolation with controlled environment variables
- Automatic cleanup of resources

## Result Analysis

### Success Indicators

```javascript
// Check if task succeeded
const result = JSON.parse(fs.readFileSync('results/task-001-20240115-103145-123.json'))
if (result.success && result.exitCode === 0) {
  console.log('Task completed successfully')
}
```

### Error Analysis

```javascript
// Analyze failures
if (!result.success) {
  console.log(`Command failed with exit code: ${result.exitCode}`)
  console.log(`Error output: ${result.stderr}`)
  
  if (result.timedOut) {
    console.log(`Task timed out after ${result.duration}ms`)
  }
}
```

### Output Parsing

```javascript
// Parse command output
const lines = result.stdout.split('\n')
const errors = lines.filter(line => line.includes('ERROR'))
const warnings = lines.filter(line => line.includes('WARN'))

console.log(`Found ${errors.length} errors and ${warnings.length} warnings`)
```

## Daemon Management

### Starting the Daemon

```bash
# Foreground (with logs)
npx tsx daemon.ts

# Background (production)
nohup npx tsx daemon.ts > claude-daemon.log 2>&1 &
```

### Stopping the Daemon

```bash
# Graceful shutdown
kill -SIGTERM <daemon-pid>

# Force stop
kill -SIGKILL <daemon-pid>
```

### Daemon Logs

The daemon provides structured logging:

```
[2024-01-15T10:30:00.000Z] 🤖 Claude Daemon started - monitoring tasks directory...
[2024-01-15T10:30:00.001Z] 📁 Tasks: /path/to/claude/tasks
[2024-01-15T10:30:00.002Z] 📊 Results: /path/to/claude/results
[2024-01-15T10:31:00.000Z] 🔄 Processing task: /path/to/claude/tasks/test-task.json
[2024-01-15T10:31:00.001Z] ▶️  Executing: pnpm test
[2024-01-15T10:32:45.123Z] ✅ Task test-task completed successfully (105122ms)
```

## Advanced Usage

### Batch Task Execution

Create multiple tasks for sequential execution:

```bash
# Create multiple tasks
echo '{"id":"task-1","type":"run-command","cmd":"pnpm lint"}' > tasks/01-lint.json
echo '{"id":"task-2","type":"run-command","cmd":"pnpm typecheck"}' > tasks/02-typecheck.json  
echo '{"id":"task-3","type":"run-command","cmd":"pnpm test"}' > tasks/03-test.json
```

### Result Monitoring

Watch for results in real-time:

```bash
# Monitor results directory
watch -n 1 'ls -la claude/results/'

# Tail daemon logs
tail -f claude-daemon.log
```

### Task Templates

Create reusable task templates:

```bash
# Template for quick testing
cat > templates/quick-test.json << EOF
{
  "id": "quick-test-$(date +%s)",
  "type": "run-command",
  "cmd": "pnpm test packages/types",
  "timeout": 30000,
  "description": "Quick test of types package"
}
EOF

# Use template
cp templates/quick-test.json tasks/
```

## Integration with Claude CLI

### Inspecting Results

As Claude CLI, you can:

1. **Read task results directly:**
   ```typescript
   const result = await readJsonFile('claude/results/task-001-20240115-103145-123.json')
   console.log(`Task ${result.taskId} took ${result.duration}ms`)
   ```

2. **Create tasks programmatically:**
   ```typescript
   const task = {
     id: generateTaskId('lint'),
     type: 'run-command',
     cmd: 'pnpm lint --fix',
     description: 'Auto-fix linting issues'
   }
   await writeJsonFile('claude/tasks/auto-lint.json', task)
   ```

3. **Monitor for specific outcomes:**
   ```typescript
   // Wait for test results
   const watcher = watch('claude/results/')
   for await (const event of watcher) {
     if (event.filename?.includes('test-')) {
       const result = await readJsonFile(`claude/results/${event.filename}`)
       if (!result.success) {
         console.log('Tests failed - investigating...')
         // Analyze result.stderr and result.stdout
       }
     }
   }
   ```

## Best Practices

### Task Naming

Use descriptive, sequential task IDs:
- `lint-001`, `lint-002` for linting tasks
- `test-full-001` for comprehensive tests  
- `build-release-001` for release builds

### Error Handling

Always check results before proceeding:
- Verify `success: true` and `exitCode: 0`
- Parse `stderr` for warnings/errors
- Check `timedOut` for timeout issues

### Resource Management

- Use appropriate timeouts for different command types
- Monitor disk space in `results/` directory
- Clean up old results periodically

### Security

- Never execute untrusted commands
- Review allowed commands list regularly
- Monitor daemon logs for security violations
- Use timeouts to prevent resource exhaustion

## Troubleshooting

### Daemon Not Starting

```bash
# Check if port/directory is available
ls -la claude/tasks claude/results

# Check Node.js version
node --version  # Should be >= 18

# Check TypeScript execution
npx tsx --version
```

### Tasks Not Executing

1. **Check task format:**
   ```bash
   cat tasks/my-task.json | jq .  # Validate JSON
   ```

2. **Check daemon logs:**
   ```bash
   tail -f claude-daemon.log
   ```

3. **Verify command safety:**
   - Ensure command is in allowed list
   - Check for dangerous patterns

### Results Not Appearing

1. **Check daemon is running:**
   ```bash
   ps aux | grep daemon.ts
   ```

2. **Check file permissions:**
   ```bash
   ls -la claude/results/
   ```

3. **Monitor daemon output:**
   ```bash
   npx tsx daemon.ts  # Run in foreground to see logs
   ```

## Examples

See the `tasks/` directory for example task files:
- `sample-test-task.json` - Run full test suite
- `lint-task.json` - Execute linting across packages

## Support

For issues or questions:
1. Check daemon logs for error messages
2. Verify task JSON format against examples
3. Ensure commands are in the allowed list
4. Review security restrictions