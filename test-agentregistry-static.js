#!/usr/bin/env node

// Test the fixed AgentRegistry static methods
const { AgentRegistry } = require('./packages/sdk/dist/index.js');

console.log('🧪 Testing AgentRegistry static methods...\n');

// Test that AgentRegistry has the expected static methods
console.log('1. Checking static method availability:');
console.log(`   - clear: ${typeof AgentRegistry.clear}`);
console.log(`   - register: ${typeof AgentRegistry.register}`);
console.log(`   - registerTransport: ${typeof AgentRegistry.registerTransport}`);
console.log(`   - lookup: ${typeof AgentRegistry.lookup}`);
console.log(`   - lookupTransport: ${typeof AgentRegistry.lookupTransport}`);
console.log(`   - listAgents: ${typeof AgentRegistry.listAgents}`);
console.log(`   - listTransports: ${typeof AgentRegistry.listTransports}`);

// Test that AgentRegistry is still a constructor
console.log('\n2. Checking that AgentRegistry is still a constructor:');
try {
  const instance = new AgentRegistry();
  console.log(`   ✅ new AgentRegistry() works: ${instance.constructor.name}`);
} catch (error) {
  console.log(`   ❌ new AgentRegistry() failed: ${error.message}`);
}

// Test that the static methods work
console.log('\n3. Testing static method calls:');
try {
  AgentRegistry.clear();
  console.log('   ✅ AgentRegistry.clear() works');
} catch (error) {
  console.log(`   ❌ AgentRegistry.clear() failed: ${error.message}`);
}

try {
  const agents = AgentRegistry.listAgents();
  console.log(`   ✅ AgentRegistry.listAgents() works: ${agents.length} agents`);
} catch (error) {
  console.log(`   ❌ AgentRegistry.listAgents() failed: ${error.message}`);
}

try {
  const transports = AgentRegistry.listTransports();
  console.log(`   ✅ AgentRegistry.listTransports() works: ${transports.length} transports`);
} catch (error) {
  console.log(`   ❌ AgentRegistry.listTransports() failed: ${error.message}`);
}

console.log('\n🎉 AgentRegistry static methods test complete!');