// Debug script to understand vitest mock serialization issues
import { vi } from 'vitest'

// Create a mock similar to the failing test
const mockFn = vi.fn().mockImplementation(async () => {
  await new Promise(resolve => setTimeout(resolve, 100))
})

console.log('=== VITEST MOCK FUNCTION DEBUG ===')
console.log('Mock function toString():')
console.log(mockFn.toString())
console.log('\n=== Analysis ===')

// Check if the function source contains vitest internals
const source = mockFn.toString()
console.log('Contains "A.":', source.includes('A.'))
console.log('Contains "i.":', source.includes('i.'))
console.log('Contains references to vitest internals:', /[A-Za-z]\.[A-Za-z]/.test(source))

console.log('\n=== Mock Properties ===')
console.log('Mock function properties:')
Object.getOwnPropertyNames(mockFn).forEach(prop => {
  console.log(`  ${prop}:`, typeof mockFn[prop])
})

console.log('\n=== Mock Implementation Source ===')
console.log('Implementation:', mockFn.getMockImplementation?.()?.toString?.() || 'Not available')