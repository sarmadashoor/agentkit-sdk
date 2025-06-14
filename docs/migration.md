# AgentKit SDK Migration Guide

## Overview

This migration guide covers version compatibility, stability guarantees, and breaking change policies for the AgentKit SDK. It provides guidance for upgrading between versions and understanding the project's commitment to stability.

## Version Strategy

### Semantic Versioning

AgentKit SDK follows [Semantic Versioning](https://semver.org/) (SemVer) strictly:

- **MAJOR version** (`X.0.0`): Breaking changes to public APIs
- **MINOR version** (`0.X.0`): New features, backward compatible
- **PATCH version** (`0.0.X`): Bug fixes, backward compatible

### Pre-Release Versions

- **Alpha** (`1.0.0-alpha`): Early development, APIs may change
- **Beta** (`1.0.0-beta`): Feature-complete, API stabilization
- **RC** (`1.0.0-rc`): Release candidate, production-ready testing

## Stability Guarantees

### Current Version: 0.1.0-alpha

**Status**: Alpha Release
**Stability Level**: Experimental
**Support Duration**: Until 0.2.0-alpha or 1.0.0 stable

**What This Means**:
- Core functionality is complete and tested
- APIs may change based on feedback
- No backward compatibility guarantees
- Internal alpha use recommended
- Production use at your own risk

### Planned Stability Levels

#### Beta Phase (0.1.0-beta - 0.9.0-beta)
- **API Stability**: Minor changes possible
- **Backward Compatibility**: Best effort, migration guides provided
- **Support**: Bug fixes and critical updates
- **Usage**: External testing and evaluation

#### Stable Release (1.0.0+)
- **API Stability**: Full semantic versioning guarantees
- **Backward Compatibility**: All minor/patch versions compatible
- **Support**: LTS support for major versions
- **Usage**: Full production readiness

## Scope and Capability System

### Current Scope Behavior

In `0.1.0-alpha`, the scope system operates as follows:

#### Scope Validation
```typescript
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  scope: ['chat', 'analysis']  // Requested capabilities
})
```

**Current Behavior**:
- Requested scopes are validated against agent `supportedScopes`
- Scope mismatches are **logged but not enforced**
- Connection proceeds even with scope mismatches
- Both registered and requested scopes available in metadata

#### Runtime Metadata
```typescript
// Access scope information
console.log(handle.metadata.registeredScopes)  // Agent's declared capabilities
console.log(handle.metadata.requestedScopes)   // What was requested
```

### Future Scope Evolution

#### Beta Phase Changes (0.1.0-beta+)
- **Strict Mode Option**: Add optional strict scope validation
- **Scope Enforcement**: Option to fail connections on scope mismatches
- **Scope Inheritance**: Support for scope hierarchies and dependencies

#### Stable Phase Changes (1.0.0+)
- **Default Strict Mode**: Scope validation enforced by default
- **Granular Permissions**: Fine-grained capability control
- **Runtime Scope Changes**: Dynamic scope modification during agent lifecycle

### Migration Strategy for Scopes

#### Preparing for Strict Validation
```typescript
// Current: Works with mismatched scopes
const handle = await connectAgent({
  agent: 'limited-agent',      // Only supports ['read']
  transport: 'dummy',
  scope: ['read', 'write']     // Requests unsupported 'write'
})

// Future: Will require matching scopes
const handle = await connectAgent({
  agent: 'limited-agent',
  transport: 'dummy',
  scope: ['read'],             // Only request supported scopes
  strictScopes: true           // Opt-in to strict validation
})
```

#### Agent Registration Updates
```typescript
// Ensure comprehensive scope declarations
AgentRegistry.register({
  id: 'my-agent',
  name: 'My Agent',
  version: '1.0.0',
  supportedScopes: [
    'chat',           // Conversational capabilities
    'analysis',       // Data analysis features
    'file-read',      // File reading operations
    'file-write'      // File writing operations
  ],
  factory: () => new MyAgent()
})
```

## API Compatibility

### Stable APIs (0.1.0-alpha)

These APIs are considered stable and unlikely to change significantly:

#### Core Connection API
```typescript
// Primary SDK entry point - stable interface
connectAgent(options: ConnectAgentOptions): Promise<AgentRuntimeHandle>
```

#### Registry Operations
```typescript
// Registry management - stable interfaces
AgentRegistry.register(metadata: AgentMetadata): void
AgentRegistry.registerTransport(transport: Transport): void
AgentRegistry.getAgent(id: string): AgentMetadata | undefined
AgentRegistry.getTransport(id: string): Transport | undefined
```

#### Core Interfaces
```typescript
// Agent and Transport contracts - stable
interface Agent {
  id: string
  init(config: unknown): Promise<void>
  handle(input: unknown): Promise<unknown>
  shutdown(): Promise<void>
}

interface Transport {
  id: string
  init(): Promise<void>
  send(message: unknown): Promise<void>
  shutdown(): Promise<void>
  onMessage(callback: (message: unknown) => void): void
}
```

### Experimental APIs (0.1.0-alpha)

These APIs may change in future versions:

#### Lifecycle Hooks
```typescript
// May be enhanced with additional hooks
interface ConnectAgentOptions {
  onInit?: (agentId: string) => void       // May add more parameters
  onShutdown?: (agentId: string) => void   // May add more parameters
  onError?: (err: Error) => void           // May add context parameters
}
```

#### Debug and Logging
```typescript
// Internal logging APIs may change
debugLog.lifecycle(message, context, debug)  // Internal use only
```

### Deprecated APIs

Currently no deprecated APIs in `0.1.0-alpha`.

## Breaking Changes Policy

### Major Version Changes (X.0.0)

Major versions may include:
- Removal of deprecated APIs
- Changes to core interface contracts
- Significant behavior modifications
- New required dependencies

**Migration Support**:
- 6-month deprecation warnings before removal
- Comprehensive migration guides
- Automated migration tools where possible
- Side-by-side version support during transition

### Minor Version Changes (0.X.0)

Minor versions will include:
- New optional features
- New APIs and interfaces
- Enhanced functionality
- Additional configuration options

**Backward Compatibility**:
- All existing code continues to work
- New features are opt-in
- Default behaviors remain unchanged

### Patch Version Changes (0.0.X)

Patch versions include:
- Bug fixes
- Performance improvements
- Documentation updates
- Internal optimizations

**Stability**:
- No API changes
- No behavior changes
- Safe to upgrade immediately

## Migration Workflows

### From Alpha to Beta

When `0.1.0-beta` is released:

1. **Review Scope Usage**:
   ```typescript
   // Audit all connectAgent() calls
   const handle = await connectAgent({
     agent: 'my-agent',
     transport: 'dummy',
     scope: ['chat']  // Ensure scopes match agent capabilities
   })
   ```

2. **Update Dependencies**:
   ```bash
   npm update @agentkit/sdk @agentkit/types @agentkit/registry
   ```

3. **Test Scope Validation**:
   ```typescript
   // Test with strict mode enabled
   const handle = await connectAgent({
     agent: 'my-agent',
     transport: 'dummy',
     scope: ['chat'],
     strictScopes: true  // New beta feature
   })
   ```

### From Beta to Stable

When `1.0.0` is released:

1. **Enable Strict Mode** (if not already):
   ```typescript
   // Strict scope validation becomes default
   const handle = await connectAgent({
     agent: 'my-agent',
     transport: 'dummy',
     scope: ['chat']  // Must match exactly
   })
   ```

2. **Update Error Handling**:
   ```typescript
   try {
     const handle = await connectAgent(options)
   } catch (error) {
     if (error instanceof ScopeValidationError) {
       // Handle scope mismatch errors
     }
   }
   ```

## Upgrade Paths

### Safe Upgrade Strategy

1. **Pin to Specific Versions**:
   ```json
   {
     "dependencies": {
       "@agentkit/sdk": "0.1.0-alpha",
       "@agentkit/types": "0.1.0-alpha"
     }
   }
   ```

2. **Test in Isolation**:
   ```typescript
   // Create test environment
   beforeEach(() => {
     AgentRegistry.clear()
     // Set up known test state
   })
   ```

3. **Gradual Migration**:
   ```typescript
   // Use feature flags for new functionality
   const useNewScoping = process.env.ENABLE_STRICT_SCOPES === 'true'
   
   const handle = await connectAgent({
     agent: 'my-agent',
     transport: 'dummy',
     scope: ['chat'],
     ...(useNewScoping && { strictScopes: true })
   })
   ```

### Version Compatibility Matrix

| SDK Version | Node.js | TypeScript | Zod |
|-------------|---------|------------|-----|
| 0.1.0-alpha | >=18.0.0 | >=5.3.0 | >=3.22.0 |
| 0.1.0-beta* | >=18.0.0 | >=5.3.0 | >=3.22.0 |
| 1.0.0* | >=18.0.0 | >=5.4.0 | >=3.23.0 |

*Future versions - subject to change

## Support and Communication

### Release Communication

- **Major Releases**: 90-day advance notice with migration guides
- **Minor Releases**: 30-day advance notice with feature documentation
- **Patch Releases**: Released as needed, announced in changelog

### Getting Migration Help

1. **Documentation**: Check migration guides in `/docs/`
2. **Examples**: Review updated examples in `/examples/`
3. **Issues**: Report problems at GitHub Issues
4. **Discussions**: Community support at GitHub Discussions

### Deprecation Timeline

When APIs are marked for deprecation:

1. **Announcement**: Deprecation notice in release notes
2. **Warning Period**: 6 months of deprecation warnings
3. **Removal**: APIs removed in next major version
4. **Migration Guide**: Detailed upgrade instructions provided

## Long-Term Roadmap

### Planned Major Versions

#### v1.0.0 (Stable Release)
- **Timeline**: Q2 2024
- **Focus**: Production stability, strict scope validation
- **Breaking Changes**: Scope enforcement, API finalization

#### v2.0.0 (Extended Features)
- **Timeline**: Q1 2025
- **Focus**: Advanced observability, performance optimization
- **Breaking Changes**: Enhanced metadata structures, improved error handling

#### v3.0.0 (Ecosystem Integration)
- **Timeline**: TBD
- **Focus**: Framework integrations, advanced transport protocols
- **Breaking Changes**: Plugin architecture, transport abstraction updates

### Commitment to Stability

Starting with `1.0.0`:
- **LTS Support**: 24 months for major versions
- **Security Updates**: Backported to supported versions
- **Migration Tools**: Automated upgrade assistance
- **Backward Compatibility**: Within major version boundaries

This migration guide will be updated with each release to reflect the current state and future plans for the AgentKit SDK.