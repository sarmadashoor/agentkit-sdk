import { describe, it, expect, beforeEach, afterEach, afterAll, vi, Mock } from 'vitest'
import {
  isDebugBuildEnabled,
  devOnly,
  debugOnly,
  noop,
  BUILD_CONSTANTS,
  assertDebugMode,
  debugConsole
} from '../src/debug-tools/buildGuards'

describe('Build Guards', () => {
  let originalEnv: NodeJS.ProcessEnv
  let consoleLogSpy: Mock
  let consoleWarnSpy: Mock
  let consoleErrorSpy: Mock
  let consoleTableSpy: Mock

  beforeEach(() => {
    originalEnv = { ...process.env }
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleTableSpy = vi.spyOn(console, 'table').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = originalEnv
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore() 
    consoleErrorSpy.mockRestore()
    consoleTableSpy.mockRestore()
  })

  describe('isDebugBuildEnabled', () => {
    it('should return false in production environment', () => {
      process.env.NODE_ENV = 'production'
      expect(isDebugBuildEnabled()).toBe(false)
    })

    it('should return true in development environment', () => {
      process.env.NODE_ENV = 'development'
      expect(isDebugBuildEnabled()).toBe(true)
    })

    it('should return true in test environment', () => {
      process.env.NODE_ENV = 'test'
      expect(isDebugBuildEnabled()).toBe(true)
    })

    it('should return false when process is undefined', () => {
      const originalProcess = global.process
      // @ts-ignore
      delete global.process
      
      expect(isDebugBuildEnabled()).toBe(false)
      
      global.process = originalProcess
    })
  })

  describe('devOnly wrapper', () => {
    it('should execute function in development mode', () => {
      process.env.NODE_ENV = 'development'
      const mockFn = vi.fn().mockReturnValue('dev-result')
      
      const result = devOnly(mockFn)
      
      expect(mockFn).toHaveBeenCalled()
      expect(result).toBe('dev-result')
    })

    it('should not execute function in production mode', () => {
      process.env.NODE_ENV = 'production'
      const mockFn = vi.fn().mockReturnValue('should-not-run')
      
      const result = devOnly(mockFn)
      
      expect(mockFn).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('should execute function in test mode', () => {
      process.env.NODE_ENV = 'test'
      const mockFn = vi.fn().mockReturnValue('test-result')
      
      const result = devOnly(mockFn)
      
      expect(mockFn).toHaveBeenCalled()
      expect(result).toBe('test-result')
    })
  })

  describe('debugOnly wrapper', () => {
    it('should not execute function in production regardless of DEBUG flag', () => {
      process.env.NODE_ENV = 'production'
      process.env.DEBUG = 'true'
      const mockFn = vi.fn()
      
      const result = debugOnly(mockFn)
      
      expect(mockFn).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('should not execute function in development without DEBUG flag', () => {
      process.env.NODE_ENV = 'development'
      delete process.env.DEBUG
      delete process.env.DEBUG_TRACE
      const mockFn = vi.fn()
      
      const result = debugOnly(mockFn)
      
      expect(mockFn).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('should execute function in development with DEBUG flag', () => {
      process.env.NODE_ENV = 'development'
      process.env.DEBUG = 'true'
      const mockFn = vi.fn().mockReturnValue('debug-result')
      
      const result = debugOnly(mockFn)
      
      expect(mockFn).toHaveBeenCalled()
      expect(result).toBe('debug-result')
    })

    it('should execute function in development with DEBUG_TRACE flag', () => {
      process.env.NODE_ENV = 'development'
      process.env.DEBUG_TRACE = 'true'
      const mockFn = vi.fn().mockReturnValue('trace-result')
      
      const result = debugOnly(mockFn)
      
      expect(mockFn).toHaveBeenCalled()
      expect(result).toBe('trace-result')
    })
  })

  describe('noop function', () => {
    it('should do nothing and return undefined', () => {
      const result = noop()
      expect(result).toBeUndefined()
    })

    it('should be callable multiple times without side effects', () => {
      expect(() => {
        noop()
        noop()
        noop()
      }).not.toThrow()
    })
  })

  describe('BUILD_CONSTANTS', () => {
    it('should reflect current environment state', () => {
      process.env.NODE_ENV = 'production'
      process.env.DEBUG = 'true'
      
      // Note: BUILD_CONSTANTS are evaluated at module load time
      // so we can't easily test dynamic changes without re-importing
      expect(typeof BUILD_CONSTANTS.IS_PRODUCTION).toBe('boolean')
      expect(typeof BUILD_CONSTANTS.IS_DEVELOPMENT).toBe('boolean')
      expect(typeof BUILD_CONSTANTS.IS_TEST).toBe('boolean')
      expect(typeof BUILD_CONSTANTS.HAS_DEBUG).toBe('boolean')
    })
  })

  describe('assertDebugMode', () => {
    it('should throw error in production environment', () => {
      process.env.NODE_ENV = 'production'
      
      expect(() => assertDebugMode()).toThrow(
        'Debug utilities are not available in production builds'
      )
    })

    it('should throw error when debug is not enabled', () => {
      process.env.NODE_ENV = 'development'
      delete process.env.DEBUG
      delete process.env.DEBUG_TRACE
      
      expect(() => assertDebugMode()).toThrow(
        'Debug mode is not enabled. Set DEBUG=true or DEBUG_TRACE=true'
      )
    })

    it('should not throw when debug is properly enabled', () => {
      process.env.NODE_ENV = 'development'
      process.env.DEBUG = 'true'
      
      expect(() => assertDebugMode()).not.toThrow()
    })

    it('should not throw when debug trace is enabled', () => {
      process.env.NODE_ENV = 'development'
      process.env.DEBUG_TRACE = 'true'
      
      expect(() => assertDebugMode()).not.toThrow()
    })
  })

  describe('debugConsole', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development'
      process.env.DEBUG = 'true'
    })

    it('should log to console when debug is enabled', () => {
      debugConsole.log('test message')
      expect(consoleLogSpy).toHaveBeenCalledWith('test message')
    })

    it('should warn to console when debug is enabled', () => {
      debugConsole.warn('test warning')
      expect(consoleWarnSpy).toHaveBeenCalledWith('test warning')
    })

    it('should error to console when debug is enabled', () => {
      debugConsole.error('test error')
      expect(consoleErrorSpy).toHaveBeenCalledWith('test error')
    })

    it('should table to console when debug is enabled', () => {
      const data = { key: 'value' }
      debugConsole.table(data)
      expect(consoleTableSpy).toHaveBeenCalledWith(data)
    })

    it('should not log in production environment', () => {
      process.env.NODE_ENV = 'production'
      process.env.DEBUG = 'true'
      
      debugConsole.log('should not appear')
      debugConsole.warn('should not appear')
      debugConsole.error('should not appear')
      debugConsole.table({ test: 'data' })
      
      expect(consoleLogSpy).not.toHaveBeenCalled()
      expect(consoleWarnSpy).not.toHaveBeenCalled()
      expect(consoleErrorSpy).not.toHaveBeenCalled()
      expect(consoleTableSpy).not.toHaveBeenCalled()
    })

    it('should not log when debug is disabled', () => {
      process.env.NODE_ENV = 'development'
      delete process.env.DEBUG
      delete process.env.DEBUG_TRACE
      
      debugConsole.log('should not appear')
      debugConsole.warn('should not appear')
      debugConsole.error('should not appear')
      debugConsole.table({ test: 'data' })
      
      expect(consoleLogSpy).not.toHaveBeenCalled()
      expect(consoleWarnSpy).not.toHaveBeenCalled()
      expect(consoleErrorSpy).not.toHaveBeenCalled()
      expect(consoleTableSpy).not.toHaveBeenCalled()
    })

    it('should support multiple arguments', () => {
      debugConsole.log('message', { data: 'test' }, 123)
      expect(consoleLogSpy).toHaveBeenCalledWith('message', { data: 'test' }, 123)
    })
  })

  describe('Production bundle optimization', () => {
    it('should be tree-shakable in production builds', () => {
      // This test documents expected behavior for bundlers
      // In a real production build, dead code elimination should remove unused debug code
      
      process.env.NODE_ENV = 'production'
      
      // These should all be no-ops or return undefined
      expect(devOnly(() => 'should be removed')).toBeUndefined()
      expect(debugOnly(() => 'should be removed')).toBeUndefined()
      
      // Console methods should not execute
      debugConsole.log('should not log')
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it('should maintain functionality in development builds', () => {
      process.env.NODE_ENV = 'development'
      process.env.DEBUG = 'true'
      
      // These should all work normally
      expect(devOnly(() => 'dev code')).toBe('dev code')
      expect(debugOnly(() => 'debug code')).toBe('debug code')
      
      debugConsole.log('development log')
      expect(consoleLogSpy).toHaveBeenCalled()
    })
  })

  afterAll(() => {
    const handles = process._getActiveHandles();
    console.log('🟡 [DEBUG] Active handles after file teardown:', handles.map(h => h.constructor.name));
    console.log('🟡 [DEBUG] Total active handles:', handles.length);
  });
})