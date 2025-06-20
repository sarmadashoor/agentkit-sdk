// Simple debug script to understand mock function serialization
console.log('=== MOCK FUNCTION DEBUG ===')

// Create a function that might be similar to what vitest generates
function mockImplementation(fn) {
  const mock = function(...args) {
    return fn.apply(this, args)
  }
  mock.getMockImplementation = () => fn
  return mock
}

// Test different scenarios
const asyncFn = async () => {
  await new Promise(resolve => setTimeout(resolve, 100))
}

const mockFn = mockImplementation(asyncFn)

console.log('Original async function:')
console.log(asyncFn.toString())

console.log('\nMock function toString():')
console.log(mockFn.toString())

console.log('\nMock implementation toString():')  
console.log(mockFn.getMockImplementation().toString())

// Create a function with references to undefined variables (similar to vitest internals)
const problematicFn = new Function('return function() { return A.someMethod(); }')()
console.log('\nProblematic function with undefined reference:')
console.log(problematicFn.toString())

// Test what happens when we try to extract the actual implementation
console.log('\n=== VITEST-LIKE MOCK SIMULATION ===')

// Simulate what vitest might do
const vitestLikeMock = function() {
  // This simulates vitest's internal structure that references undefined variables
  return A.getMockImplementation().apply(this, arguments)
}

console.log('Vitest-like mock toString():')
console.log(vitestLikeMock.toString())