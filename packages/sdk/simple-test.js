// Simple test runner to isolate hanging issue
console.log('Simple test starting...');

setTimeout(() => {
  console.log('Simple test completed!');
  process.exit(0);
}, 1000);

console.log('Simple test setup complete');