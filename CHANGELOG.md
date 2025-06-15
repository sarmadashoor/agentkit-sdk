# Changelog

All notable changes to the AgentKit SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Comprehensive Test Coverage**: Added unit, integration, and edge-case tests across all packages
  - Affected packages: `@agentkit/sdk`, `@agentkit/runtime-web`, `@agentkit/test-agent`
  - Race condition tests with deterministic timing using `process.nextTick`
  - Memory leak detection and cleanup verification tests
  
- **Enterprise-Grade Observability**: Full observability system with structured logging and hooks
  - Affected packages: `@agentkit/sdk`, `@agentkit/types`
  - Request tracing with cryptographically secure UUID generation (`crypto.randomUUID`)
  - Performance metrics collection with duration tracking
  - Structured logging with `debugLog` utilities and context preservation
  - Observability hooks for `BoundedExecutor`, `CircuitBreaker`, `PluginManager`, `AgentManager`

- **Memory Management & Resource Cleanup**: Critical timer leak prevention across all components
  - Affected packages: `@agentkit/sdk`
  - Active timeout tracking in `CircuitBreaker`, `BoundedExecutor`, `PluginManager`
  - Proper shutdown lifecycle with resource cleanup
  - Memory leak prevention through tracked timeout management

- **Type Safety Enhancements**: Removed all `any` types and enforced strict TypeScript
  - Affected packages: `@agentkit/types`, `@agentkit/sdk`
  - Registry interface with proper generic constraints: `Registry<T extends Record<string, unknown>>`
  - Proper typed interfaces for observability hooks and error contexts
  - Enhanced type safety in plugin system and transport layers

- **Concurrency & Fault Tolerance**: Advanced resource management and circuit breaker patterns
  - Affected packages: `@agentkit/sdk`
  - `BoundedExecutor` with queue management, backpressure, and resource limits
  - `CircuitBreaker` with state transitions, failure tracking, and recovery mechanisms
  - Plugin system with isolation and safe execution patterns

### Fixed
- **Missing Package Scripts**: Added standardized npm scripts across all packages
  - Affected packages: `@agentkit/errors`, `@agentkit/runtime-web`
  - Added `lint` and `typecheck` scripts using `tsc --noEmit`
  
- **TypeScript Configuration**: Standardized tsconfig.json files across monorepo
  - Affected packages: `@agentkit/errors`, `@agentkit/runtime-web`
  - All packages now extend `../../tsconfig.base.json`
  - Consistent build outputs and compiler options

- **Test Instabilities**: Fixed non-deterministic timing issues in runtime-web tests
  - Affected packages: `@agentkit/runtime-web`, `@agentkit/sdk`  
  - AbortController mock type compatibility fixes
  - Race condition tests now use deterministic timing patterns

### Enhanced
- **Root Package Scripts**: Added comprehensive test and validation commands
  - `test:node` - Run Node.js-only tests (excludes browser-specific packages)
  - `test:browser` - Run browser-specific tests (@agentkit/runtime-web)
  - `test:all` - Run complete test suite across all environments
  - `validate:observability` - Validate enterprise observability requirements
  - `validate:scripts` - Validate package.json scripts consistency
  - `validate:tsconfig` - Validate TypeScript configuration standards
  - `validate:all` - Run all validation checks

- **Development Tooling**: Enhanced validation scripts for project consistency
  - `scripts/validate-observability.js` - Enterprise observability compliance
  - `scripts/validate-package-scripts.js` - Package script standardization  
  - `scripts/validate-tsconfig.js` - TypeScript configuration validation

### Security
- **Cryptographically Secure UUIDs**: Upgraded request ID generation
  - Uses Node.js 18+ `crypto.randomUUID()` instead of `Math.random()`
  - Maintains backward compatibility with fallback implementation
  - Ensures secure request tracing across all operations

## Previous Releases

### [0.1.0-alpha] - Initial Release
- Basic agent management and transport abstraction
- Plugin system foundation
- Registry-based agent and transport discovery
- Browser compatibility with runtime-web package

---

**Legend:**
- 🛠️ **Added**: New features and capabilities
- 🐛 **Fixed**: Bug fixes and corrections  
- 🔧 **Enhanced**: Improvements to existing features
- 🔒 **Security**: Security-related changes
- 📦 **Affected packages**: Lists which packages were modified