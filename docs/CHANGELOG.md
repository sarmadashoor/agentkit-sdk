# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-alpha] - 2024-06-14

### Added

**Phase 1: Bootstrap Monorepo Structure**
- Initial TypeScript monorepo with pnpm workspaces
- Core package structure with `@agentkit/sdk`, `@agentkit/types`, `@agentkit/registry`
- Test packages: `@agentkit/test-agent`, `@agentkit/transports-dummy`
- Build tooling with tsup, TypeScript, and Vitest

**Phase 2: Core API Implementation** 
- `connectAgent()` function as primary SDK entry point
- `AgentRuntimeHandle` interface for agent interaction
- Agent and Transport type definitions with Zod validation
- Comprehensive error handling with custom error types

**Phase 3: Dummy Implementations**
- `DummyAgent` for testing and development
- `DummyTransport` for local message passing
- Factory pattern for dynamic agent creation
- Consistent lifecycle management (init, handle, shutdown)

**Phase 4: Hardening & Error Handling**
- Structured error system with `AgentKitError` base class
- Validation errors, registry errors, and lifecycle errors
- Debug logging system with structured output
- Comprehensive test coverage for error scenarios

**Phase 5: Registry Improvements** 
- Agent and transport registration system
- Metadata preservation and introspection
- Registry lookup with detailed error messages
- Support for scoped agent configurations

**Phase 6: Runtime Observability**
- Optional lifecycle event hooks (`onInit`, `onShutdown`, `onError`)
- Runtime handle metadata with agent/transport IDs and scopes
- Scope mismatch detection and logging (non-blocking)
- Full backward compatibility with existing APIs

**Phase 7.5: SDK Audit & Hardening**
- Comprehensive type safety audit (eliminated unsafe `any` usage)
- End-to-end integration testing with full lifecycle coverage
- Registry edge case testing and validation
- Example files demonstrating SDK usage patterns
- npm fallback scripts for environments without pnpm
- Release preparation with proper versioning

### Technical Highlights

- **Type Safety**: Full TypeScript support with Zod runtime validation
- **Modular Design**: Clean separation between SDK, registry, types, and test packages
- **Error Handling**: Structured error system with context preservation
- **Testing**: 51+ tests covering unit, integration, and edge cases
- **Logging**: Structured debug logging with lifecycle tracking
- **Backward Compatibility**: All new features are optional and non-breaking

### Developer Experience

- Clean installation with `npm install @agentkit/sdk`
- Simple API: register, connect, send, shutdown
- Comprehensive examples and documentation
- Debug mode for development and troubleshooting
- Full TypeScript IntelliSense support

### Breaking Changes

None - this is the initial alpha release.

### Migration Guide

This is the first release, no migration needed.