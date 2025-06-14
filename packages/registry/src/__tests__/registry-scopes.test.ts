import { describe, it, expect, beforeEach } from 'vitest'
import { AgentRegistry } from '../index'
import { DummyAgent } from '@agentkit/test-agent'

describe('AgentRegistry supportedScopes preservation', () => {
  let registry: AgentRegistry

  beforeEach(() => {
    registry = new AgentRegistry()
  })

  it('should preserve supportedScopes field during registration and lookup', () => {
    // Register an agent with supportedScopes
    const metadata = {
      id: 'scoped-agent',
      name: 'Scoped Test Agent',
      version: '1.0.0',
      supportedScopes: ['read', 'write', 'delete'],
      factory: () => new DummyAgent()
    }

    registry.register(metadata)

    // Retrieve and verify supportedScopes is preserved
    const retrieved = registry.lookup('scoped-agent')
    
    expect(retrieved).toBeDefined()
    expect(retrieved.id).toBe('scoped-agent')
    expect(retrieved.supportedScopes).toEqual(['read', 'write', 'delete'])
    expect(Array.isArray(retrieved.supportedScopes)).toBe(true)
    expect(retrieved.supportedScopes.length).toBe(3)
  })

  it('should handle agents without supportedScopes', () => {
    // Register an agent without supportedScopes
    const metadata = {
      id: 'no-scopes-agent',
      name: 'Agent Without Scopes',
      version: '1.0.0',
      factory: () => new DummyAgent()
    }

    registry.register(metadata)

    const retrieved = registry.lookup('no-scopes-agent')
    
    expect(retrieved).toBeDefined()
    expect(retrieved.id).toBe('no-scopes-agent')
    expect(retrieved.supportedScopes).toBeUndefined()
  })

  it('should handle empty supportedScopes array', () => {
    // Register an agent with empty supportedScopes
    const metadata = {
      id: 'empty-scopes-agent',
      name: 'Agent With Empty Scopes',
      version: '1.0.0',
      supportedScopes: [],
      factory: () => new DummyAgent()
    }

    registry.register(metadata)

    const retrieved = registry.lookup('empty-scopes-agent')
    
    expect(retrieved).toBeDefined()
    expect(retrieved.id).toBe('empty-scopes-agent')
    expect(retrieved.supportedScopes).toEqual([])
    expect(Array.isArray(retrieved.supportedScopes)).toBe(true)
    expect(retrieved.supportedScopes.length).toBe(0)
  })

  it('should handle multiple agents with different supportedScopes', () => {
    // Register multiple agents with different scopes
    registry.register({
      id: 'reader-agent',
      name: 'Read Only Agent',
      version: '1.0.0',
      supportedScopes: ['read'],
      factory: () => new DummyAgent()
    })

    registry.register({
      id: 'writer-agent',
      name: 'Write Only Agent',
      version: '1.0.0',
      supportedScopes: ['write'],
      factory: () => new DummyAgent()
    })

    registry.register({
      id: 'admin-agent',
      name: 'Admin Agent',
      version: '1.0.0',
      supportedScopes: ['read', 'write', 'admin'],
      factory: () => new DummyAgent()
    })

    // Verify each agent has correct scopes
    const reader = registry.lookup('reader-agent')
    const writer = registry.lookup('writer-agent')
    const admin = registry.lookup('admin-agent')

    expect(reader.supportedScopes).toEqual(['read'])
    expect(writer.supportedScopes).toEqual(['write'])
    expect(admin.supportedScopes).toEqual(['read', 'write', 'admin'])
  })
})