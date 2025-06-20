/**
 * Configuration for Claude autonomous task execution system
 */
export const config = {
    // Echo logs to console during execution
    verbose: true,
    // Default timeout for tasks (60 seconds)
    taskTimeoutMs: 60000,
    // Directory paths
    resultsDir: "claude/results",
    tasksDir: "claude/tasks",
    // Polling interval for task discovery (250ms)
    pollIntervalMs: 250,
    // Grace period before force kill (5 seconds)
    killGracePeriodMs: 5000,
    // Files to ignore during task discovery
    ignoredFiles: [
        '.DS_Store',
        '.gitkeep',
        '.keep',
        'README.md',
        'readme.md'
    ],
    // File extensions to ignore
    ignoredExtensions: [
        '.tmp',
        '.temp',
        '.bak',
        '.swp',
        '.swo'
    ]
};
