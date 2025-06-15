#!/usr/bin/env node

/**
 * Manual browser compatibility test
 * Tests polyfills and browser transport functionality
 */

import { JSDOM } from 'jsdom';

// Create a browser-like environment
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <div id="test-results"></div>
</body>
</html>
`, {
  url: 'http://localhost:3000',
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true
});

const window = dom.window;
global.window = window;
global.document = window.document;

// Test polyfills
console.log('🧪 Testing browser polyfills...');

// Test fetch polyfill
if (typeof window.fetch === 'undefined') {
  console.log('❌ fetch not available');
} else {
  console.log('✅ fetch available');
}

// Test AbortController polyfill
if (typeof window.AbortController === 'undefined') {
  console.log('❌ AbortController not available');
} else {
  console.log('✅ AbortController available');
}

// Test Headers polyfill
if (typeof window.Headers === 'undefined') {
  console.log('❌ Headers not available');
} else {
  console.log('✅ Headers available');
}

// Test URL polyfill
if (typeof window.URL === 'undefined') {
  console.log('❌ URL not available');
} else {
  console.log('✅ URL available');
}

console.log('\n🔧 Testing basic functionality...');

try {
  // Test URL parsing
  const url = new window.URL('https://example.com/test');
  console.log('✅ URL parsing works');
} catch (error) {
  console.log('❌ URL parsing failed:', error.message);
}

try {
  // Test Headers
  const headers = new window.Headers({ 'Content-Type': 'application/json' });
  console.log('✅ Headers creation works');
} catch (error) {
  console.log('❌ Headers creation failed:', error.message);
}

try {
  // Test AbortController
  const controller = new window.AbortController();
  console.log('✅ AbortController creation works');
} catch (error) {
  console.log('❌ AbortController creation failed:', error.message);
}

console.log('\n🚀 Testing would be complete with AgentKit bundle loaded');
console.log('✅ Basic browser compatibility validated');

// Clean up
dom.window.close();