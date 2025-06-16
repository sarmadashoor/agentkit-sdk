# AgentKit SDK Debugging Guide

World-class developer experience with runtime visibility, powerful debugging primitives, and comprehensive observability for plugin development and troubleshooting.

## Table of Contents

- [Quick Start](#quick-start)
- [Debug Mode](#debug-mode)
- [Runtime Tracing](#runtime-tracing)
- [Performance Profiling](#performance-profiling)
- [Hot Reload Development](#hot-reload-development)
- [Plugin Development Tools](#plugin-development-tools)
- [Visualization & Graphs](#visualization--graphs)
- [CLI Tools](#cli-tools)
- [Advanced Patterns](#advanced-patterns)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Enable Debug Mode

```typescript
import { AgentManager } from '@agentkit/sdk'

// Method 1: Environment variable
process.env.DEBUG = 'true'

// Method 2: Programmatic
const manager = new AgentManager(agent, transport, {
  enableDebugMode: true
})

// Method 3: Runtime
manager.enableDebugMode({
  verbose: true,
  graph: true,
  level: 'debug',
  hotReload: true
})
```

### Basic Debugging

```typescript
// Get debug timeline
const timeline = manager.getEnhancedDebugTimeline()
console.table(timeline?.entries)

// Display execution timeline
manager.displayDebugTimeline('table') // or 'tree', 'json'

// Get performance report
const reports = manager.getPluginPerformanceReport()
console.log(reports)

// Export debug data
const debugData = manager.exportDebugData()
console.log(debugData)
```

## Debug Mode

### Configuration Options

```typescript
manager.enableDebugMode({
  verbose: true,           // Detailed logging
  graph: true,            // Enable Graphviz output
  level: 'trace',         // Log level: silent, error, warn, info, debug, trace
  hotReload: true         // Enable hot reload in development
})
```

### Environment Variables

```bash
# Enable debug mode
DEBUG=true

# Set debug level
DEBUG_LEVEL=trace

# Enable verbose logging
DEBUG_VERBOSE=true

# Enable graph output
DEBUG_GRAPH=true

# Enable console output
DEBUG_CONSOLE=true

# Enable hot reload
AGENTKIT_HOT_RELOAD=true
```

### Debug Context

```typescript
import { createDebugContext } from '@agentkit/sdk/debug-tools'

const debug = createDebugContext('MyPlugin')

debug.trace('Detailed execution info', { data })
debug.debug('Debug information', { state })
debug.info('General information', { result })
debug.warn('Warning message', { issue })
debug.error('Error occurred', { error })
```

## Runtime Tracing

### Visual Trace Output

AgentKit provides real-time visual trace logs that show plugin lifecycle execution with clear symbols and timing:

```bash
▶ onSend(LoggingPlugin) start (t=0ms)
✔ onSend(LoggingPlugin) success (t=6ms) [6.2ms]
▶ onSend(AuthPlugin) start (t=7ms)
✖ onSend(AuthPlugin) error: TimeoutError (t=120ms) [113.4ms]
⚠ onSend(SlowPlugin) timeout (t=5000ms) [5000.0ms]
```

**Trace Symbols:**
- `▶` Plugin execution start
- `✔` Plugin execution success (green)
- `✖` Plugin execution error (red)
- `⚠` Plugin execution timeout (yellow)

**Environment Configuration:**
```bash
# Enable trace output
DEBUG=true
# or
DEBUG_TRACE=true

# Traces are automatically disabled in production
NODE_ENV=production  # No traces will appear
```

### Plugin Execution Tracing

```typescript
import { tracePluginExecution } from '@agentkit/sdk/debug-tools'

// Trace a plugin execution
const { result, trace } = await tracePluginExecution(
  'MyPlugin',
  'onSend',
  async () => {
    // Your plugin logic here
    return await processMessage(payload)
  },
  {
    captureMemory: true,
    captureCpu: true,
    captureCallStack: true,
    capturePayload: true
  }
)

console.log('Execution trace:', trace)
```

### Lifecycle Timeline Logging

```typescript
import { createTimelineLogger } from '@agentkit/sdk/debug-tools'

const logger = createTimelineLogger({
  enableConsoleOutput: true,
  enableTableOutput: true,
  performanceThreshold: 100,
  outputFormat: 'table'
})

// Log plugin execution start
const id = logger.logStart('MyPlugin', 'onSend', context, payload)

// Log completion
logger.logComplete(id, 'completed', undefined, result)

// Display timeline
logger.displayTable()
logger.displayTree()
```

### Decorators for Automatic Tracing

```typescript
import { debugTrace, debugPerformance } from '@agentkit/sdk/debug-tools'

export class MyPlugin implements AgentKitPlugin {
  @debugTrace('MyPlugin')
  @debugPerformance(50) // Warn if execution takes > 50ms
  async onSend(payload: SendPayload, context: AgentContext) {
    // Plugin logic - automatically traced
  }
}
```

## Performance Profiling

### Performance Snapshots

```typescript
import { snapshotPluginPerf } from '@agentkit/sdk/debug-tools'

// Create performance snapshot
const snapshot = snapshotPluginPerf('MyPlugin', executionTraces, {
  includeRecentExecutions: true,
  maxRecentExecutions: 10,
  calculatePercentiles: true,
  captureMemoryDetails: true
})

console.table({
  'Avg Execution Time': `${snapshot.averageExecutionTime.toFixed(2)}ms`,
  'Success Rate': `${snapshot.successRate.toFixed(1)}%`,
  'Memory Usage': `${(snapshot.memoryUsage.current / 1024 / 1024).toFixed(2)}MB`,
  'Performance Grade': snapshot.performance.percentiles.p95
})
```

### Performance Comparison

```typescript
import { comparePluginPerformance } from '@agentkit/sdk/debug-tools'

// Compare multiple plugins
comparePluginPerformance({
  'Plugin A': pluginATraces,
  'Plugin B': pluginBTraces,
  'Plugin C': pluginCTraces
})
```

### Memory Leak Detection

```typescript
// Get performance metrics with memory analysis
const report = manager.getPluginPerformanceReport('MyPlugin')[0]

if (report.memoryMetrics.memoryLeakDetected) {
  console.warn('🚨 Potential memory leak detected!')
  console.log('Peak memory:', report.memoryMetrics.peakMemoryUsage)
  console.log('Recommendations:', report.recommendations)
}
```

## Hot Reload Development

### Setup Hot Reload

```typescript
import { createHotReloadManager } from '@agentkit/sdk/debug-tools'

const hotReload = createHotReloadManager({
  enabled: process.env.NODE_ENV === 'development',
  watchPaths: ['./src/plugins'],
  watchExtensions: ['.ts', '.js'],
  debounceMs: 500
})

// Register plugin for hot reload
hotReload.registerPlugin('MyPlugin', './src/plugins/MyPlugin.ts')

// Listen for reload events
hotReload.onReload('MyPlugin', (newPlugin) => {
  console.log('🔥 Plugin reloaded:', newPlugin.name)
  // Update plugin instance
})
```

### Decorator for Auto Hot Reload

```typescript
import { hotReload } from '@agentkit/sdk/debug-tools'

@hotReload('MyPlugin')
export class MyPlugin implements AgentKitPlugin {
  // Plugin automatically registers for hot reload in development
}
```

### Hot Reload with AgentManager

```typescript
// Register plugin for hot reload
manager.registerPluginForHotReload('MyPlugin', './src/plugins/MyPlugin.ts')

// Get hot reload statistics
const stats = hotReload.getPluginStats('MyPlugin')
console.log('Reload count:', stats?.reloadCount)
```

## Plugin Development Tools

### Development Wrapper

```typescript
import { createPluginDevelopmentWrapper } from '@agentkit/sdk/debug-tools'

// Wrap plugin with development features
const wrapper = createPluginDevelopmentWrapper('MyPlugin', myPlugin, {
  enablePerformanceMonitoring: true,
  enableMemoryTracking: true,
  enableErrorTracking: true,
  enableDebugLogs: true,
  performanceThreshold: 100,
  autoGenerateReport: true,
  reportInterval: 30000
})

const wrappedPlugin = wrapper.getWrappedPlugin()

// Use wrapped plugin in development
manager.register(wrappedPlugin)
```

### Plugin Contract Validation

```typescript
import { validatePluginContract } from '@agentkit/sdk/debug-tools'

// Validate plugin implementation
const validation = validatePluginContract(myPlugin)

if (!validation.isValid) {
  console.error('❌ Plugin validation failed:')
  validation.errors.forEach(error => {
    console.error(`  ${error.severity}: ${error.message}`)
    if (error.suggestion) {
      console.log(`  💡 ${error.suggestion}`)
    }
  })
}

console.log('Contract compliance score:', validation.contractCompliance.score)
console.log('Security rating:', validation.securityAnalysis.securityRating)
```

### Performance Measurement

```typescript
import { measurePluginPerformance } from '@agentkit/sdk/debug-tools'

// Measure plugin performance
const report = await measurePluginPerformance(
  'MyPlugin',
  'onSend',
  async () => {
    await myPlugin.onSend(testPayload, testContext)
  },
  100 // iterations
)

console.log('Performance Report:')
console.log(`Grade: ${report.performanceGrade}`)
console.log(`Avg Time: ${report.executionMetrics.averageExecutionTime.toFixed(2)}ms`)
console.log(`Success Rate: ${report.executionMetrics.successRate.toFixed(1)}%`)
```

## Visualization & Graphs

### Execution Graphs

```typescript
// Generate Graphviz execution graph
const graphDot = manager.generateExecutionGraph('dot')
console.log(graphDot)

// Export as SVG (requires Graphviz installation)
const svgPath = await manager.generateExecutionGraph('svg')
console.log('Graph exported to:', svgPath)
```

### Performance Heatmaps

```typescript
import { generatePerformanceHeatmap } from '@agentkit/sdk/debug-tools'

const timeline = manager.getEnhancedDebugTimeline()
const heatmap = generatePerformanceHeatmap(timeline.entries, {
  colorScheme: 'performance',
  highlightSlowOperations: true,
  performanceThreshold: 100
})

console.log(heatmap)
```

### Custom Visualizations

```typescript
import { GraphvizGenerator } from '@agentkit/sdk/debug-tools'

const generator = new GraphvizGenerator()

// Generate custom graph
const graph = generator.generateFromTimeline(timeline.entries, {
  includeTimings: true,
  includeMemoryUsage: true,
  colorScheme: 'status',
  layout: 'dot',
  groupByPlugin: true
})
```

## CLI Tools

### Create Plugin with Debug Features

```bash
# Create plugin with all DX features
npx agentkit create-plugin \
  --name MyAwesomePlugin \
  --with-debug \
  --with-hot-reload \
  --with-performance \
  --with-docs \
  --template advanced

# Basic plugin
npx agentkit create-plugin --name SimplePlugin --template basic

# Performance-focused plugin
npx agentkit create-plugin --name FastPlugin --template performance

# Debug-focused plugin
npx agentkit create-plugin --name DebugPlugin --template debug
```

### Generated Plugin Features

The CLI generates plugins with:

- 🐛 **Debug Integration**: Automatic tracing and logging
- 📊 **Performance Monitoring**: Built-in metrics collection
- 🔥 **Hot Reload**: Development-time live reloading
- 🧪 **Test Suite**: Comprehensive test templates
- 📚 **Documentation**: Auto-generated docs and examples
- 🔒 **Validation**: Zod schemas and contract validation
- 🚀 **Development Utilities**: Helper functions and factories

## Advanced Patterns

### Global Debug State

```typescript
import { 
  enableGlobalDebugMode, 
  disableGlobalDebugMode,
  setDebugLevel,
  getGlobalDebugManager 
} from '@agentkit/sdk/debug-tools'

// Global debug control
enableGlobalDebugMode({ level: 'trace', verbose: true })
setDebugLevel('debug')

// Get global debug manager
const debugManager = getGlobalDebugManager()
const snapshot = debugManager?.createSnapshot()
```

### Custom Debug Context

```typescript
import { createDebugContext } from '@agentkit/sdk/debug-tools'

// Create custom debug context
const debug = createDebugContext('MyComponent')

// Use throughout your application
debug.info('Operation started', { operationId })
debug.warn('Potential issue detected', { details })
debug.error('Operation failed', { error, context })
```

### Performance Decorators

```typescript
import { debugPerformance } from '@agentkit/sdk/debug-tools'

class MyService {
  @debugPerformance(200) // Warn if > 200ms
  async heavyOperation() {
    // Automatically monitored for performance
  }
  
  @debugPerformance(50) // Warn if > 50ms  
  async fastOperation() {
    // Quick operations get lower thresholds
  }
}
```

### Memory Monitoring

```typescript
// Monitor memory usage over time
const memorySnapshots = []

setInterval(() => {
  const snapshot = manager.getDebugSnapshot()
  if (snapshot) {
    memorySnapshots.push({
      timestamp: Date.now(),
      heapUsed: snapshot.systemInfo.memoryUsage.heapUsed,
      heapTotal: snapshot.systemInfo.memoryUsage.heapTotal
    })
  }
}, 5000)

// Analyze memory trends
const memoryGrowth = memorySnapshots.slice(-10)
const avgGrowth = memoryGrowth.reduce((sum, s, i, arr) => {
  if (i === 0) return 0
  return sum + (s.heapUsed - arr[i-1].heapUsed)
}, 0) / (memoryGrowth.length - 1)

if (avgGrowth > 1024 * 1024) { // 1MB growth per interval
  console.warn('🚨 Potential memory leak detected')
}
```

## Troubleshooting

### Common Issues

#### Debug Mode Not Working

```typescript
// Check if debug mode is enabled
import { isDebugModeEnabled } from '@agentkit/sdk/debug-tools'

if (!isDebugModeEnabled()) {
  console.log('Debug mode not enabled. Enable with:')
  console.log('  process.env.DEBUG = "true"')
  console.log('  or manager.enableEnhancedDebugMode()')
}
```

#### Performance Issues

```typescript
// Identify slow plugins
const reports = manager.getPluginPerformanceReport()
const slowPlugins = reports.filter(r => r.performanceGrade === 'F')

slowPlugins.forEach(plugin => {
  console.warn(`🐌 Slow plugin: ${plugin.pluginName}`)
  console.log('  Recommendations:', plugin.recommendations)
  console.log('  Avg time:', plugin.executionMetrics.averageExecutionTime)
})
```

#### Memory Leaks

```typescript
// Check for memory leaks
const reports = manager.getPluginPerformanceReport()
const leakyPlugins = reports.filter(r => r.memoryMetrics.memoryLeakDetected)

leakyPlugins.forEach(plugin => {
  console.error(`💧 Memory leak detected: ${plugin.pluginName}`)
  console.log('  Peak memory:', plugin.memoryMetrics.peakMemoryUsage)
  console.log('  Current memory:', plugin.memoryMetrics.averageMemoryUsage)
})
```

#### Hot Reload Issues

```typescript
// Check hot reload status
if (process.env.NODE_ENV === 'development') {
  const hotReload = manager['hotReloadManager']
  if (!hotReload) {
    console.warn('Hot reload not available - enable with:')
    console.log('  manager.enableDebugMode({ hotReload: true })')
  } else {
    const stats = hotReload.getAllPluginStats()
    console.log('Hot reload stats:', stats)
  }
}
```

### Debug Output Examples

#### Timeline Table Output

```
┌─────────┬──────────────────┬────────────┬──────────┬──────────────┬──────┬─────────┬────────────┐
│ (index) │     Plugin       │    Hook    │  Status  │   Duration   │ Slow │ Concurrent │ Order │
├─────────┼──────────────────┼────────────┼──────────┼──────────────┼──────┼─────────────┼────────┤
│    0    │ 'LoggingPlugin'  │  'onInit'  │'completed'│   '2.45ms'   │  ''  │      1      │   1   │
│    1    │ 'AuthPlugin'     │  'onInit'  │'completed'│   '15.23ms'  │  ''  │      2      │   2   │
│    2    │ 'LoggingPlugin'  │  'onSend'  │'completed'│   '1.12ms'   │  ''  │      1      │   3   │
│    3    │ 'AuthPlugin'     │  'onSend'  │ 'failed'  │  '156.78ms'  │ '⚠️' │      2      │   4   │
└─────────┴──────────────────┴────────────┴──────────┴──────────────┴──────┴─────────────┴────────┘
```

#### Performance Report

```
📊 Plugin Performance Summary:

┌─────────────────┬────────────┬──────────────┬─────────────┬────────┬──────────┬────────────┬─────────────┐
│     Plugin      │ Executions │   Avg Time   │ Success Rate│ Errors │ Timeouts │   Memory   │ Throughput  │
├─────────────────┼────────────┼──────────────┼─────────────┼────────┼──────────┼────────────┼─────────────┤
│ 'LoggingPlugin' │     150    │   '2.34ms'   │   '100.0%'  │   0    │    0     │  '2.1MB'   │  '42.3/s'   │
│ 'AuthPlugin'    │      89    │  '45.67ms'   │   '96.6%'   │   3    │    1     │  '8.7MB'   │  '18.9/s'   │
│ 'CachePlugin'   │     203    │   '0.89ms'   │   '99.5%'   │   1    │    0     │  '15.2MB'  │  '89.1/s'   │
└─────────────────┴────────────┴──────────────┴─────────────┴────────┴──────────┴────────────┴─────────────┘
```

#### Tree View

```
🌳 Plugin Execution Tree:

📋 Request: req-123-456
├── 🚀 LoggingPlugin.onInit (2.45ms)
├── 🚀 AuthPlugin.onInit (15.23ms)
├── 🚀 LoggingPlugin.onSend (1.12ms)
└── ❌ AuthPlugin.onSend (156.78ms) ⚠️
    ❌ Authentication failed: Invalid token

📋 Request: req-123-457  
├── 🚀 LoggingPlugin.onSend (0.98ms)
├── 🚀 AuthPlugin.onSend (12.34ms)
└── ✅ CachePlugin.onSend (0.45ms)
```

## Environment Variables Reference

```bash
# Debug Mode
DEBUG=true                    # Enable debug mode
DEBUG_LEVEL=trace            # Set log level (silent, error, warn, info, debug, trace)
DEBUG_VERBOSE=true           # Enable verbose logging
DEBUG_CONSOLE=true           # Enable console output
DEBUG_GRAPH=true             # Enable Graphviz output

# Hot Reload
AGENTKIT_HOT_RELOAD=true     # Enable hot reload
NODE_ENV=development         # Enable development features

# Performance
PERF_THRESHOLD=100           # Performance warning threshold (ms)
MEMORY_THRESHOLD=50          # Memory warning threshold (MB)

# Output
DEBUG_OUTPUT_FORMAT=table   # Output format (table, tree, json)
DEBUG_MAX_ENTRIES=1000       # Maximum timeline entries
```

This debugging guide provides comprehensive coverage of all the debugging and developer experience features available in the AgentKit SDK. Use these tools to build, debug, and optimize your plugins with confidence!