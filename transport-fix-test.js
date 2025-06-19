#!/usr/bin/env node

// Simple test to verify transport method preservation
const { AgentRegistry } = require('./packages/registry/dist/index.js');
const { DummyTransport } = require('./packages/transports-dummy/dist/index.js');

console.log('🔧 Testing transport method preservation after registry...\n');

// Create registry and transport
console.log('1. Creating registry and transport...');
const registry = new AgentRegistry();
const transport = new DummyTransport({ debug: false });

console.log('2. Transport before registration:');
console.log(`   - Has init method: ${typeof transport.init === 'function'}`);
console.log(`   - Has send method: ${typeof transport.send === 'function'}`);
console.log(`   - Has canAcceptMore method: ${typeof transport.canAcceptMore === 'function'}`);
console.log(`   - Prototype: ${Object.getPrototypeOf(transport)?.constructor?.name}`);

// Register transport
console.log('\n3. Registering transport...');
try {
  registry.registerTransport(transport);
  console.log('   ✅ Registration successful');
} catch (error) {
  console.log(`   ❌ Registration failed: ${error.message}`);
  process.exit(1);
}

// Retrieve transport
console.log('\n4. Retrieving registered transport...');
let retrieved;
try {
  retrieved = registry.lookupTransport('dummy');
  console.log('   ✅ Lookup successful');
} catch (error) {
  console.log(`   ❌ Lookup failed: ${error.message}`);
  process.exit(1);
}

console.log('\n5. Retrieved transport methods:');
console.log(`   - Has init method: ${typeof retrieved.init === 'function'}`);
console.log(`   - Has send method: ${typeof retrieved.send === 'function'}`);
console.log(`   - Has canAcceptMore method: ${typeof retrieved.canAcceptMore === 'function'}`);
console.log(`   - Prototype: ${Object.getPrototypeOf(retrieved)?.constructor?.name}`);
console.log(`   - Is frozen: ${Object.isFrozen(retrieved)}`);
console.log(`   - Config frozen: ${Object.isFrozen(retrieved.config)}`);

// Test init method call
console.log('\n6. Testing init method...');
try {
  await retrieved.init();
  console.log('   ✅ Init method call successful');
} catch (error) {
  console.log(`   ❌ Init method call failed: ${error.message}`);
  process.exit(1);
}

// Test send method call
console.log('\n7. Testing send method...');
try {
  await retrieved.send({ test: 'message' });
  console.log('   ✅ Send method call successful');
} catch (error) {
  console.log(`   ❌ Send method call failed: ${error.message}`);
  process.exit(1);
}

// Test canAcceptMore method call
console.log('\n8. Testing canAcceptMore method...');
try {
  const canAccept = retrieved.canAcceptMore();
  console.log(`   ✅ canAcceptMore returned: ${canAccept}`);
} catch (error) {
  console.log(`   ❌ canAcceptMore failed: ${error.message}`);
  process.exit(1);
}

console.log('\n🎉 All tests passed! Transport methods are preserved after registry operations.');