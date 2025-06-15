# AgentKit Observability Usage Guide

This guide demonstrates how to use the new Stripe-grade observability features in AgentKit SDK.

## Overview

The observability system provides:
- **MetricsCollector**: Prometheus-compatible metrics collection
- **PluginExecutionTimeline**: Detailed plugin execution debugging
- **Performance warnings**: Automatic detection of slow plugins
- **Browser debugging**: Global timeline exposure for debugging

## Basic Usage

### Enable Observability

```typescript
import { connectAgent } from '@agentkit/sdk'

const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'websocket',
  plugins: [myPlugin1, myPlugin2],
  
  // Enable observability features
  observabilityConfig: {
    enableMetricsCollection: true,
    enableTimelineDebug: true,
    performanceThreshold: 50, // Warn if plugins take >50ms
    enableConsoleWarnings: true
  },
  
  // Enable debug mode for browser debugging
  enableDebugMode: true
})
```

### Access Metrics

```typescript
// Get comprehensive metrics
const metrics = handle.getMetrics()

console.log('Total requests:', metrics.sdk.totalRequests.value)
console.log('Plugin executions:', metrics.plugins.length)

// Export to Prometheus format
const prometheusMetrics = handle.exportPrometheusMetrics()
console.log(prometheusMetrics)
```

### Access Plugin Timeline

```typescript
// Get timeline for debugging
const timeline = handle.getDebugTimeline()

console.log('Total plugin executions:', timeline.summary.totalEntries)
console.log('Average duration:', timeline.summary.averageDuration)

// Print to console table
handle.printTimeline()

// Get performance statistics
const perfStats = handle.getPerformanceStats()
console.log('Slowest plugins:', perfStats.slowestPlugins)
console.log('Threshold violations:', perfStats.thresholdViolations)
```

### Browser Debugging

When `enableDebugMode: true` is set in a browser environment:

```javascript
// Timeline is automatically exposed globally
window.__AGENTKIT_TIMELINE__.printTimeline()

// Access timeline data
const timeline = window.__AGENTKIT_TIMELINE__
console.log(timeline.performanceStats)
console.table(timeline.tableData)
```

## Advanced Usage Examples

### Custom Plugin with Observability

```typescript
import type { AgentKitPlugin } from '@agentkit/sdk'

const myObservablePlugin: AgentKitPlugin = {
  name: 'MyObservablePlugin',
  version: '1.0.0',
  
  async onInit(context) {
    // Plugin execution automatically tracked
    console.log('Initializing plugin...')
    await someAsyncWork()
  },
  
  async onSend(payload, context) {
    // Performance warnings will show if this takes >threshold
    const result = await processPayload(payload)
    return result
  }
}
```

### Monitoring Dashboard Integration

```typescript
// Export metrics for monitoring dashboards
async function exportMetrics() {
  const metrics = handle.getMetrics()
  
  // Send to monitoring system
  await sendToDatadog({
    'agentkit.requests.total': metrics.sdk.totalRequests.value,
    'agentkit.errors.total': metrics.sdk.totalErrors.value,
    'agentkit.uptime': metrics.sdk.uptime.value
  })
  
  // Send plugin metrics
  for (const plugin of metrics.plugins) {
    await sendToDatadog({
      [`agentkit.plugin.${plugin.pluginName}.executions`]: plugin.executionCount,
      [`agentkit.plugin.${plugin.pluginName}.errors`]: plugin.errorCount,
      [`agentkit.plugin.${plugin.pluginName}.avg_duration`]: plugin.totalDuration / plugin.executionCount
    })
  }
}
```

### Performance Analysis

```typescript
async function analyzePerformance() {
  const perfStats = handle.getPerformanceStats()
  
  // Identify performance bottlenecks
  console.log('🚀 Performance Analysis:')
  
  console.log('\n📊 Slowest Plugins:')
  perfStats.slowestPlugins.slice(0, 5).forEach((plugin, i) => {
    console.log(`${i + 1}. ${plugin.plugin}: ${plugin.avgDuration.toFixed(2)}ms`)
  })
  
  console.log('\n⚠️  Performance Violations:')
  perfStats.thresholdViolations.forEach(violation => {
    console.log(`${violation.plugin}.${violation.hook}: ${violation.duration}ms`)
  })
  
  // Get timeline for specific plugin
  const timeline = handle.getDebugTimeline()
  const myPluginTimeline = timeline.entries.filter(e => e.pluginName === 'MyPlugin')
  console.log('\n🔍 MyPlugin Timeline:', myPluginTimeline)
}
```

### Error Tracking

```typescript
// Monitor errors by type and plugin
const metrics = handle.getMetrics()

console.log('🚨 Error Summary:')
console.log('Total errors:', metrics.errors.total.value)

console.log('\n📈 Errors by Type:')
Object.entries(metrics.errors.byType).forEach(([type, counter]) => {
  console.log(`${type}: ${counter.value}`)
})

console.log('\n🔌 Errors by Plugin:')
Object.entries(metrics.errors.byPlugin).forEach(([plugin, counter]) => {
  console.log(`${plugin}: ${counter.value}`)
})
```

## Configuration Options

### ObservabilityConfig

```typescript
interface ObservabilityConfig {
  // Enable metrics collection (default: true)
  enableMetricsCollection?: boolean
  
  // Enable timeline debugging (default: true)
  enableTimelineDebug?: boolean
  
  // Performance warning threshold in ms
  // Browser default: 50ms, Node default: 100ms
  performanceThreshold?: number
  
  // Enable console warnings for slow plugins (default: true)
  enableConsoleWarnings?: boolean
}
```

### Platform-Specific Defaults

```typescript
// Browser environment
{
  performanceThreshold: 50, // 50ms - tighter for UI responsiveness
  platform: 'browser'
}

// Node.js environment  
{
  performanceThreshold: 100, // 100ms - more lenient for server operations
  platform: 'node'
}
```

## Prometheus Integration

The metrics collector provides full Prometheus compatibility:

```typescript
// Get Prometheus-formatted metrics
const prometheusMetrics = handle.exportPrometheusMetrics()

// Example output:
// # HELP agentkit_requests_total Total number of requests
// # TYPE agentkit_requests_total counter
// agentkit_requests_total 42
//
// # HELP agentkit_plugin_executions_total Total plugin executions by plugin and hook
// # TYPE agentkit_plugin_executions_total counter
// agentkit_plugin_executions_total{plugin="MyPlugin",hook="onSend"} 15

// Send to Prometheus pushgateway
await fetch('http://pushgateway:9091/metrics/job/agentkit', {
  method: 'POST',
  body: prometheusMetrics,
  headers: { 'Content-Type': 'text/plain' }
})
```

## Best Practices

1. **Enable observability in production** for better debugging
2. **Set appropriate performance thresholds** based on your use case
3. **Monitor plugin performance** regularly to identify bottlenecks  
4. **Use the timeline debugger** during development for optimization
5. **Export metrics** to your monitoring system for alerting
6. **Disable console warnings** in production to reduce noise

## Troubleshooting

### Performance Issues

```typescript
// Identify slow plugins
const timeline = handle.getDebugTimeline()
const slowPlugins = timeline.entries
  .filter(e => e.duration > 100) // >100ms
  .sort((a, b) => b.duration - a.duration)
  
console.log('Slow executions:', slowPlugins)
```

### Memory Issues

```typescript
// Monitor metrics memory usage
const metrics = handle.getMetrics()
console.log('Timeline entries:', metrics.plugins.reduce((sum, p) => sum + p.executionCount, 0))

// Reset metrics if needed
handle.getMetrics()?.reset?.()
```

### Error Debugging

```typescript
// Check timeline for errors
const timeline = handle.getDebugTimeline()
const errors = timeline.entries.filter(e => e.status === 'error')
errors.forEach(error => {
  console.log(`Error in ${error.pluginName}.${error.hookName}: ${error.error}`)
})
```