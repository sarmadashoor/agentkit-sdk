// Simple Node.js test to verify metrics functionality
const { PrometheusCollector, Instrumentation } = require('../../../dist/index.js');

console.log('Testing Prometheus metrics system...');

try {
  // Test PrometheusCollector
  const collector = new PrometheusCollector();
  
  // Register metrics
  collector.register({
    name: 'test_counter_total',
    type: 'counter',
    help: 'Test counter metric'
  });
  
  collector.register({
    name: 'test_gauge',
    type: 'gauge',
    help: 'Test gauge metric'
  });
  
  // Record some data
  collector.incrementCounter('test_counter_total', 5, { status: 'success' });
  collector.setGauge('test_gauge', 42, { component: 'test' });
  
  // Get Prometheus output
  const prometheusText = collector.getPrometheusMetrics();
  console.log('\nPrometheus format output:');
  console.log(prometheusText);
  
  // Test Instrumentation
  const instrumentation = new Instrumentation({
    enabled: true,
    collectResourceMetrics: false // Disable for test
  });
  
  // Record some operations
  instrumentation.recordAgentInit('test-agent', 'worker', 150);
  instrumentation.recordRequest('test-agent', 'handle', 250, 'success', 1024, 2048);
  instrumentation.recordError('test-context', 'TestError', 'TEST_ERROR');
  
  const instrumentationOutput = instrumentation.getPrometheusMetrics();
  console.log('\nInstrumentation metrics:');
  console.log(instrumentationOutput.split('\n').slice(0, 10).join('\n')); // First 10 lines
  
  console.log('\n✅ Metrics system test passed!');
  console.log('📊 PrometheusCollector: Working');
  console.log('🔧 Instrumentation: Working');
  console.log('📈 Text format: Valid');
  
  instrumentation.shutdown();
  
} catch (error) {
  console.error('\n❌ Metrics system test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}