# claude.md

goal: >
  Investigate and fix the cause of Node.js process not exiting after test completion using Vitest.

context:
  - Read vitest.setup.ts and vitest.config.ts
  - The test suite runs fully and all tests pass
  - However, the process does not exit cleanly (no return to terminal)
  - Force exits are not acceptable as the final solution — root cause must be fixed

tasks:

  - name: Add diagnostics to detect lingering handles
    description: >
      Enhance vitest.setup.ts with debugging logic:
      - Log active handles in `afterAll`, `beforeExit`, and `exit`
      - Print handle types using `constructor.name`
      - Add a `setInterval(...).unref()` to watch over time
      - DO NOT add forced exit yet
    success_criteria: >
      vitest.setup.ts includes:
      - Handle dump with counts
      - Logging for beforeExit/exit events
      - Interval logging of handle types
      - Conditional logging if `process.env.DEBUG_HANDLES` is set

  - name: Run test suite and capture logs
    shell: DEBUG_HANDLES=1 pnpm vitest run | tee debug-handles.log
    description: >
      Run full test suite with enhanced logging and save output to debug-handles.log

  - name: Analyze lingering handles
    description: >
      Read the last 200 lines of debug-handles.log and:
      - Summarize total number of active handles
      - List each handle type (e.g. Timeout, Promise, Server)
      - Identify which are NOT system handles (e.g. TTY, WriteStream, Signal)

  - name: Patch the leak source
    description: >
      Based on the leaked handle types:
      - Locate the likely sources in the SDK or tests
      - Add `clearTimeout`, `server.close()`, or `agent.destroy()` in afterAll/afterEach hooks
      - If needed, update vitest.setup.ts to clean shared resources
    success_criteria: >
      - All active handles are cleaned by end of test suite
      - No infinite hang
      - No need for forced exit

  - name: Validate clean exit
    shell: pnpm vitest run | tee final-run.log
    description: >
      Rerun tests without DEBUG_HANDLES and confirm the process exits cleanly.
    success_criteria: >
      - All tests pass
      - Process returns to shell (no hang)
      - No leaks printed
      - "[EXIT]" or "[CLEAN EXIT]" log appears
