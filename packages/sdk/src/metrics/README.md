# AgentKit SDK Metrics System

A comprehensive Prometheus-compatible metrics system for the AgentKit SDK, providing observability and monitoring capabilities.

## ✨ Features

- **Prometheus Compatible**: Full support for Prometheus metric types (counter, gauge, histogram, summary)
- **Standard Conventions**: Follows Prometheus naming conventions and best practices
- **Auto-Instrumentation**: Automatic instrumentation of core SDK components
- **Configurable**: Flexible configuration options for different environments
- **Type-Safe**: Full TypeScript support with type definitions
- **Zero Dependencies**: Self-contained implementation with no external metric dependencies
- **Production Ready**: Tested and optimized for production workloads

## 📊 Metric Types

### Counter Metrics
```typescript
collector.incrementCounter('requests_total', 1, { status: 'success' })
```

### Gauge Metrics
```typescript
collector.setGauge('active_agents', 5, { type: 'worker' })
```

### Histogram Metrics
```typescript
collector.observeHistogram('request_duration_seconds', 0.25, { method: 'handle' })
```

### Summary Metrics
```typescript
collector.observeSummary('response_size_bytes', 1024, { endpoint: '/api' })
```

## 🚀 Quick Start

### Basic Usage

```typescript
import { Instrumentation, PrometheusCollector } from '@agentkit/sdk/metrics'

// Create instrumentation with default settings
const instrumentation = new Instrumentation()

// Record metrics
instrumentation.recordAgentInit('my-agent', 'worker', 150)
instrumentation.recordRequest('my-agent', 'handle', 250, 'success')

// Get Prometheus metrics
const prometheusText = instrumentation.getPrometheusMetrics()
console.log(prometheusText)
```

### Custom Configuration

```typescript
import { PrometheusCollector, Instrumentation } from '@agentkit/sdk/metrics'

const collector = new PrometheusCollector()
const instrumentation = new Instrumentation({
  collector,
  prefix: 'myapp',
  defaultLabels: { 
    service: 'my-service', 
    version: '1.0.0' 
  },
  collectResourceMetrics: true,
  resourceMetricsInterval: 5000
})
```

### Express Metrics Endpoint

```typescript
import express from 'express'
import { Instrumentation } from '@agentkit/sdk/metrics'

const app = express()
const instrumentation = new Instrumentation()

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; charset=utf-8')
  res.send(instrumentation.getPrometheusMetrics())
})

app.listen(3000)
```

## 📈 Standard Metrics

The instrumentation automatically tracks these key metrics:

### Agent Lifecycle
- `agentkit_agent_initializations_total` - Total agent initializations
- `agentkit_agent_shutdowns_total` - Total agent shutdowns  
- `agentkit_agent_active_count` - Current active agents
- `agentkit_agent_initialization_duration_seconds` - Agent init time

### Request Processing
- `agentkit_requests_total` - Total requests processed
- `agentkit_request_duration_seconds` - Request processing time
- `agentkit_request_size_bytes` - Request payload sizes
- `agentkit_response_size_bytes` - Response payload sizes

### Error Tracking
- `agentkit_errors_total` - Total errors by type and context

### Transport Operations
- `agentkit_transport_messages_sent_total` - Messages sent via transport
- `agentkit_transport_messages_received_total` - Messages received
- `agentkit_transport_send_duration_seconds` - Transport operation time
- `agentkit_transport_queue_size` - Current transport queue size

### Plugin System
- `agentkit_plugin_executions_total` - Plugin hook executions
- `agentkit_plugin_execution_duration_seconds` - Plugin execution time
- `agentkit_plugin_errors_total` - Plugin errors
- `agentkit_plugin_timeouts_total` - Plugin timeouts

### Registry Operations
- `agentkit_registry_agents_registered_total` - Agents registered
- `agentkit_registry_agents_count` - Current registered agents
- `agentkit_registry_lookups_total` - Registry lookups

### Resource Usage
- `agentkit_memory_usage_bytes` - Memory usage
- `agentkit_cpu_usage_ratio` - CPU usage ratio
- `agentkit_active_handles_count` - Active handles

## 🏷️ Standard Labels

Common labels used across metrics:

- `agent_id` - Agent identifier
- `agent_type` - Type of agent (worker, coordinator, etc.)
- `transport_id` - Transport identifier
- `transport_type` - Type of transport (http, websocket, etc.)
- `plugin_name` - Plugin name
- `hook_name` - Plugin hook name
- `error_type` - Error class name
- `error_code` - Error code
- `status` - Operation status (success, error, timeout)
- `method` - Operation method

## 🔧 API Reference

### PrometheusCollector

The core metrics collector implementing Prometheus protocols.

```typescript
class PrometheusCollector implements MetricsCollector {
  register(metric: MetricDefinition): void
  incrementCounter(name: string, value?: number, labels?: MetricLabels): void
  setGauge(name: string, value: number, labels?: MetricLabels): void
  observeHistogram(name: string, value: number, labels?: MetricLabels): void
  observeSummary(name: string, value: number, labels?: MetricLabels): void
  getPrometheusMetrics(): string
  getMetrics(): SerializedMetric[]
  clear(): void
}
```

### Instrumentation

High-level instrumentation for AgentKit components.

```typescript
class Instrumentation {
  constructor(config?: InstrumentationConfig)
  recordAgentInit(agentId: string, agentType: string, duration: number): void
  recordAgentShutdown(agentId: string, agentType: string): void
  recordRequest(agentId: string, method: string, duration: number, status: string, requestSize?: number, responseSize?: number): void
  recordError(context: string, errorType: string, errorCode?: string): void
  recordTransportOperation(transportId: string, transportType: string, operation: 'send' | 'receive', duration: number, status: string): void
  recordPluginExecution(pluginName: string, hookName: string, duration: number, status: 'success' | 'error' | 'timeout'): void
  getPrometheusMetrics(): string
  shutdown(): void
}
```

## 📊 Prometheus Integration

### Scrape Configuration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'agentkit'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### Grafana Dashboards

Example queries for Grafana:

```promql
# Request rate
rate(agentkit_requests_total[5m])

# Error rate
rate(agentkit_errors_total[5m]) / rate(agentkit_requests_total[5m])

# Average response time
rate(agentkit_request_duration_seconds_sum[5m]) / rate(agentkit_request_duration_seconds_count[5m])

# Active agents
agentkit_agent_active_count

# Transport queue depth
agentkit_transport_queue_size
```

## 🎯 Best Practices

### Naming Conventions
- Use `_total` suffix for counters
- Use `_seconds` suffix for time durations
- Use `_bytes` suffix for size measurements
- Use snake_case for metric names
- Use meaningful label names

### Performance
- Avoid high-cardinality labels (e.g., user IDs, timestamps)
- Use histogram buckets appropriate for your data
- Consider sampling for high-frequency metrics
- Monitor memory usage of metric collection

### Deployment
- Expose metrics on a separate port/endpoint
- Use authentication for metrics endpoints in production
- Configure appropriate scrape intervals
- Set up alerting rules for key metrics

## 🧪 Testing

```typescript
import { createTestInstrumentation } from '@agentkit/sdk/metrics'

// Create instrumentation with metrics disabled for testing
const instrumentation = createTestInstrumentation()
```

## 📖 Examples

See the `examples/` directory for complete integration examples:
- Basic Express server with metrics
- Grafana dashboard configuration
- Alerting rules configuration
- Custom metric collection patterns

## 🔗 Integration

The metrics system integrates seamlessly with:
- AgentManager for agent lifecycle metrics
- PluginManager for plugin execution metrics  
- Transport implementations for network metrics
- Registry for registration metrics
- Circuit breakers for reliability metrics

## 🚀 Production Deployment

### Environment Variables
```bash
METRICS_ENABLED=true
METRICS_PREFIX=myapp
SERVICE_NAME=my-agentkit-service
RESOURCE_METRICS_INTERVAL=10000
```

### Docker
```dockerfile
EXPOSE 3000
ENV METRICS_ENABLED=true
```

### Kubernetes
```yaml
metadata:
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "3000"
    prometheus.io/path: "/metrics"
```

The metrics system provides comprehensive observability for AgentKit applications, enabling effective monitoring, alerting, and performance analysis in production environments.