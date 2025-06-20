import { describe, it, vi } from 'vitest'

describe('Debug Vitest Mock Structure', () => {
  it('should analyze vitest mock function structure', () => {
    const mockFn = vi.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
    })

    console.log('=== VITEST MOCK ANALYSIS ===')
    console.log('Mock function toString():')
    console.log(mockFn.toString())

    console.log('\nMock function properties:')
    console.log('has getMockImplementation:', 'getMockImplementation' in mockFn)
    console.log('has mockImplementation:', 'mockImplementation' in mockFn) 
    console.log('has _mockImplementation:', '_mockImplementation' in mockFn)

    if ('getMockImplementation' in mockFn) {
      const impl = mockFn.getMockImplementation()
      console.log('\ngetMockImplementation() result:')
      console.log('type:', typeof impl)
      if (impl) {
        console.log('toString():', impl.toString())
      }
    }

    console.log('\nMock internals:')
    console.log('Object.keys(mockFn):', Object.keys(mockFn))
    console.log('Object.getOwnPropertyNames(mockFn):', Object.getOwnPropertyNames(mockFn))
  })
})