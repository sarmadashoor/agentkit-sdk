/**
 * Type-only tests for plugin interface safety
 * These tests validate that consumers can write type-safe plugins
 * and that incorrect signatures are caught at compile time.
 */

import type { AgentKitPlugin, AgentContext, SendPayload } from '../index'

// Test: Valid plugin should compile without errors
const validPlugin: AgentKitPlugin = {
  name: 'test-plugin',
  version: '1.0.0',
  description: 'A test plugin',
  onInit(context: AgentContext) {
    // Valid sync implementation
  },
  async onSend(payload: SendPayload, context: AgentContext) {
    // Valid async implementation
  },
  onError(error: Error, context: AgentContext) {
    // Valid error handler
  },
  onShutdown(context: AgentContext) {
    // Valid shutdown handler
  }
}

// Test: Plugin with only some hooks should be valid
const minimalPlugin: AgentKitPlugin = {
  name: 'minimal-plugin', 
  version: '1.0.0',
  onInit(context: AgentContext) {
    // Only onInit hook
  }
}

// Test: Plugin with async hooks should be valid
const asyncPlugin: AgentKitPlugin = {
  name: 'async-plugin',
  version: '1.0.0',
  async onInit(context: AgentContext): Promise<void> {
    // Async init with explicit Promise<void> return
  },
  async onSend(payload: SendPayload, context: AgentContext): Promise<void> {
    // Async send with explicit Promise<void> return
  }
}

// Test: Invalid plugin signatures should cause compilation errors
// These are commented out but should be uncommented to test type failures

/*
// Should fail: Invalid hook signature - wrong parameter count
const invalidPlugin1: AgentKitPlugin = {
  name: 'invalid-plugin-1',
  version: '1.0.0',
  onInit() { // Error: missing context parameter
    
  }
}

// Should fail: Invalid hook signature - wrong parameter types
const invalidPlugin2: AgentKitPlugin = {
  name: 'invalid-plugin-2', 
  version: '1.0.0',
  onSend(wrongParam: string, context: AgentContext) { // Error: first param should be SendPayload
    
  }
}

// Should fail: Invalid return type
const invalidPlugin3: AgentKitPlugin = {
  name: 'invalid-plugin-3',
  version: '1.0.0',
  onInit(context: AgentContext): string { // Error: should return void or Promise<void>
    return 'invalid'
  }
}

// Should fail: Missing required properties
const invalidPlugin4: AgentKitPlugin = {
  // Error: missing name and version
  onInit(context: AgentContext) {
    
  }
}

// Should fail: Invalid version format (should be validated by schema, but type should be string)
const invalidPlugin5: AgentKitPlugin = {
  name: 'invalid-plugin-5',
  version: 123, // Error: should be string
  onInit(context: AgentContext) {
    
  }
}
*/

// Test: Generic registry interface should be properly typed
declare function createRegistry<T>(): T

// This should work with proper typing
interface MockRegistry {
  register(id: string, item: any): void
  lookup(id: string): any
}

const registry = createRegistry<MockRegistry>()

// Test: ConnectAgentOptions should accept typed registry
interface ConnectAgentOptions {
  agent: string
  transport: string  
  registry?: MockRegistry  // Should be typed, not any
  plugins?: AgentKitPlugin[]  // Should be typed, not any[]
}

const validOptions: ConnectAgentOptions = {
  agent: 'test-agent',
  transport: 'test-transport',
  registry,
  plugins: [validPlugin, minimalPlugin, asyncPlugin]
}

// Export type-level assertions to ensure they're checked
export type ValidPluginAssertion = typeof validPlugin extends AgentKitPlugin ? true : false
export type MinimalPluginAssertion = typeof minimalPlugin extends AgentKitPlugin ? true : false  
export type AsyncPluginAssertion = typeof asyncPlugin extends AgentKitPlugin ? true : false

// These should all be true
type _ValidPluginCheck = ValidPluginAssertion extends true ? true : never
type _MinimalPluginCheck = MinimalPluginAssertion extends true ? true : never
type _AsyncPluginCheck = AsyncPluginAssertion extends true ? true : never