#!/usr/bin/env node
/**
 * Script to validate observability and structured logging across the AgentKit SDK
 * Ensures enterprise-grade monitoring and debugging capabilities
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating observability and structured logging...\n');

const packagesDir = path.join(__dirname, '..', 'packages');

// Components that should have observability
const REQUIRED_OBSERVABILITY = {
  'BoundedExecutor': {
    events: ['requestQueued', 'requestExecuted', 'requestTimeout', 'queueFull', 'shutdown'],
    metrics: ['queueSize', 'activeRequests', 'totalRequests', 'successCount', 'failureCount']
  },
  'CircuitBreaker': {
    events: ['circuitOpened', 'circuitClosed', 'circuitHalfOpen', 'requestRejected'],
    metrics: ['failureCount', 'successCount', 'stateTransitions', 'responseTime']
  },
  'PluginManager': {
    events: ['pluginRegistered', 'pluginTimeout', 'pluginError', 'pluginSuccess'],
    metrics: ['pluginCount', 'executionTime', 'successRate']
  },
  'AgentManager': {
    events: ['agentInit', 'agentShutdown', 'sendStart', 'sendComplete', 'sendError'],
    metrics: ['totalRequests', 'activeRequests', 'responseTime']
  }
};

// Check for structured logging patterns
const LOGGING_PATTERNS = [
  /debugLog\.(operation|lifecycle|error|warn|validation)/,
  /logWithContext\(/,
  /console\.(log|debug|info|warn|error)/
];

let hasErrors = false;
const observabilityReport = [];

// Scan SDK source files
const sdkSrcDir = path.join(packagesDir, 'sdk', 'src');

function scanFileForObservability(filePath, componentName) {
  const content = fs.readFileSync(filePath, 'utf8');
  const report = {
    component: componentName,
    file: filePath,
    hasStructuredLogging: false,
    hasObservabilityHooks: false,
    loggedEvents: [],
    metrics: [],
    issues: []
  };

  // Check for structured logging
  LOGGING_PATTERNS.forEach(pattern => {
    if (pattern.test(content)) {
      report.hasStructuredLogging = true;
    }
  });

  // Check for observability hooks
  if (content.includes('observabilityHooks') || content.includes('ObservabilityHooks')) {
    report.hasObservabilityHooks = true;
  }

  // Find logged events
  const logMatches = content.matchAll(/debugLog\.\w+\(['"](.*?)['"],?\s*{(.*?)}/gs);
  for (const match of logMatches) {
    report.loggedEvents.push(match[1]);
  }

  // Check for metrics tracking
  if (content.includes('responseTime') || content.includes('requestCount') || content.includes('duration')) {
    report.metrics.push('performance');
  }
  if (content.includes('successCount') || content.includes('failureCount')) {
    report.metrics.push('success/failure rates');
  }
  if (content.includes('queueSize') || content.includes('activeRequests')) {
    report.metrics.push('concurrency');
  }

  // Check for required observability
  if (REQUIRED_OBSERVABILITY[componentName]) {
    const required = REQUIRED_OBSERVABILITY[componentName];
    
    if (!report.hasStructuredLogging) {
      report.issues.push(`Missing structured logging for ${componentName}`);
    }
    
    if (!report.hasObservabilityHooks && required.events.length > 0) {
      report.issues.push(`Missing observability hooks for ${componentName}`);
    }
  }

  return report;
}

// Scan key components
const components = [
  { name: 'AgentManager', file: 'AgentManager.ts' },
  { name: 'BoundedExecutor', file: 'boundedExecutor.ts' },
  { name: 'CircuitBreaker', file: 'circuitBreaker.ts' },
  { name: 'PluginManager', file: 'plugins/PluginManager.ts' }
];

console.log('📊 Scanning components for observability...\n');

components.forEach(({ name, file }) => {
  const filePath = path.join(sdkSrcDir, file);
  if (fs.existsSync(filePath)) {
    const report = scanFileForObservability(filePath, name);
    observabilityReport.push(report);
    
    console.log(`📦 Component: ${name}`);
    console.log(`   Structured Logging: ${report.hasStructuredLogging ? '✅' : '❌'}`);
    console.log(`   Observability Hooks: ${report.hasObservabilityHooks ? '✅' : '❌'}`);
    console.log(`   Logged Events: ${report.loggedEvents.length} events`);
    console.log(`   Metrics: ${report.metrics.length} categories`);
    
    if (report.issues.length > 0) {
      console.log(`   Issues:`);
      report.issues.forEach(issue => console.log(`     ❌ ${issue}`));
      hasErrors = true;
    }
    console.log('');
  }
});

// Check for enterprise-grade logging requirements
console.log('🏢 Enterprise-Grade Requirements Check:\n');

const enterpriseRequirements = [
  'Request tracing with unique IDs',
  'Performance metrics collection',
  'Error context preservation',
  'State transition logging',
  'Resource usage monitoring'
];

// Read multiple files for comprehensive check
const filesToCheck = ['index.ts', 'AgentManager.ts', 'observability.ts', 'boundedExecutor.ts', 'circuitBreaker.ts'];
const codebaseContent = filesToCheck
  .map(file => {
    const filePath = path.join(sdkSrcDir, file);
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  })
  .join('\n');

enterpriseRequirements.forEach(requirement => {
  let satisfied = false;
  
  switch (requirement) {
    case 'Request tracing with unique IDs':
      satisfied = codebaseContent.includes('requestId') && 
                 (codebaseContent.includes('crypto.randomUUID') || codebaseContent.includes('generateRequestId'));
      break;
    case 'Performance metrics collection':
      satisfied = (codebaseContent.includes('responseTime') || codebaseContent.includes('duration')) &&
                 (codebaseContent.includes('startTime') || codebaseContent.includes('Date.now()'));
      break;
    case 'Error context preservation':
      satisfied = codebaseContent.includes('ErrorContext') && codebaseContent.includes('context');
      break;
    case 'State transition logging':
      satisfied = codebaseContent.includes('lifecycle') && codebaseContent.includes('debugLog');
      break;
    case 'Resource usage monitoring':
      satisfied = codebaseContent.includes('activeRequests') && codebaseContent.includes('queueSize');
      break;
  }
  
  console.log(`   ${satisfied ? '✅' : '❌'} ${requirement}`);
  if (!satisfied) hasErrors = true;
});

console.log('');

// Summary
if (hasErrors) {
  console.log('❌ OBSERVABILITY VALIDATION FAILED\n');
  console.log('Some components are missing enterprise-grade observability features.');
  console.log('Please review the issues above and implement necessary improvements.');
  process.exit(1);
} else {
  console.log('✅ All components have adequate observability and structured logging!');
  console.log('\n📈 Summary:');
  console.log(`   - ${observabilityReport.length} components audited`);
  console.log(`   - ${observabilityReport.filter(r => r.hasStructuredLogging).length} have structured logging`);
  console.log(`   - ${observabilityReport.filter(r => r.hasObservabilityHooks).length} have observability hooks`);
  console.log(`   - ${observabilityReport.reduce((sum, r) => sum + r.loggedEvents.length, 0)} logged events found`);
  process.exit(0);
}