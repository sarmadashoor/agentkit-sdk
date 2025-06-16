# AgentKit CLI Reference

The AgentKit CLI provides comprehensive tools for plugin development, security management, and system validation. Built with TypeScript and designed for excellent developer experience.

## Installation

```bash
npm install -g @agentkit/cli
```

## Quick Start

```bash
# Create a new plugin
agentkit create-plugin

# Sign a plugin with HMAC
agentkit sign-plugin my-plugin.ts

# Validate system health
agentkit doctor
```

## Commands

### `create-plugin` - Plugin Scaffolding

Create a new AgentKit plugin with comprehensive developer tooling.

```bash
agentkit create-plugin [options]
```

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-n, --name <name>` | Plugin name | Interactive prompt |
| `-h, --hooks <hooks...>` | Hook points to implement | `onInit onSend onError onShutdown` |
| `--with-tests` | Generate comprehensive test suite | `true` |
| `--browser-safe` | Mark plugin as browser-safe | `false` |
| `--scoped <scope>` | Create scoped package | None |
| `-a, --author <author>` | Plugin author | Git config |
| `-l, --license <license>` | Plugin license | `MIT` |
| `--skip-prompts` | Skip interactive prompts | `false` |
| `--with-debug` | Include debug tools | `true` |
| `--with-hot-reload` | Enable hot reload | `true` |
| `--with-performance` | Include performance monitoring | `true` |
| `--with-docs` | Generate documentation | `true` |
| `--template <template>` | Template type | `advanced` |

#### Templates

- **basic** - Minimal plugin structure
- **advanced** - Full developer experience (default)
- **performance** - Optimized for performance monitoring
- **debug** - Enhanced debugging capabilities

#### Examples

```bash
# Interactive creation
agentkit create-plugin

# Quick creation with defaults
agentkit create-plugin --name my-plugin --skip-prompts

# Browser-safe plugin with specific hooks
agentkit create-plugin --name web-plugin --browser-safe --hooks onInit onSend

# Scoped enterprise plugin
agentkit create-plugin --name analytics --scoped @myorg --template performance
```

#### Generated Structure

```
plugins/my-plugin/
├── index.ts                    # Main plugin implementation
├── plugin.json                # Plugin metadata
├── package.json               # NPM configuration
├── plugin.test.ts             # Unit tests
├── plugin.integration.test.ts # Integration tests
├── plugin.browser.test.ts     # Browser tests (if browser-safe)
├── playwright.config.ts       # Playwright config (if browser-safe)
├── vitest.config.ts           # Test configuration
├── tsconfig.json              # TypeScript configuration
├── .eslintrc.js               # ESLint configuration
├── .prettierrc                # Prettier configuration
├── .gitignore                 # Git ignore rules
├── .lintstagedrc.json         # Lint-staged configuration
├── README.md                  # Documentation
├── CHANGELOG.md               # Change log
└── CONTRIBUTING.md            # Contributing guide
```

### `sign-plugin` - Plugin Signing

Sign a plugin file with cryptographic signatures for security verification.

```bash
agentkit sign-plugin <plugin-file> [options]
```

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <path>` | Output path for signature | `<plugin>.plugin-signature.json` |
| `-f, --force` | Force overwrite existing signature | `false` |
| `-v, --verbose` | Show detailed signing information | `false` |
| `-s, --secret <secret>` | Signing secret | `AGENTKIT_SIGNING_SECRET` env var |

#### Examples

```bash
# Sign with environment secret
agentkit sign-plugin my-plugin.ts

# Sign with custom secret and output
agentkit sign-plugin my-plugin.ts --secret mykey --output custom.sig

# Force overwrite existing signature
agentkit sign-plugin my-plugin.ts --force --verbose
```

#### Security Features

- **HMAC-based signatures** for secure plugin verification
- **Safe parsing** prevents code injection during signing
- **Malicious pattern detection** scans for harmful code
- **Trusted key registry** for signature verification
- **Expiration handling** for time-limited signatures

### `doctor` - System Validation

Validate plugin contracts, dependencies, and system health.

```bash
agentkit doctor [options]
```

#### Features

- Plugin contract validation
- Dependency health checks
- Security configuration verification
- Performance baseline validation
- Environment compatibility checks

> **Note**: Full implementation coming soon.

### `publish-plugin` - Plugin Publishing

Publish plugin to the AgentKit registry.

```bash
agentkit publish-plugin <plugin-name> [options]
```

> **Note**: Registry publishing coming soon.

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTKIT_SIGNING_SECRET` | Secret key for HMAC signing | Required for signing |
| `AGENTKIT_PLUGINS_DIR` | Custom plugins directory | `./plugins` |
| `AGENTKIT_CLI_DEBUG` | Enable debug logging | `false` |

### Plugin Hooks

AgentKit plugins support these lifecycle hooks:

- **onInit** - Plugin initialization and setup
- **onSend** - Intercept and modify outgoing messages
- **onError** - Handle errors and recovery
- **onShutdown** - Cleanup and resource management

## Plugin Development Workflow

### 1. Create Plugin

```bash
agentkit create-plugin --name my-analyzer --hooks onInit onSend
cd plugins/my-analyzer
```

### 2. Implement Logic

```typescript
// index.ts
export default {
  name: 'my-analyzer',
  version: '1.0.0',
  
  async onInit(context) {
    console.log('Analyzer plugin initialized')
  },
  
  async onSend(payload, context) {
    // Analyze outgoing messages
    const analysis = analyzeMessage(payload.message)
    payload.metadata = { ...payload.metadata, analysis }
    return payload
  }
}
```

### 3. Test Plugin

```bash
npm test                    # Unit tests
npm run test:integration   # Integration tests
npm run test:browser       # Browser tests (if browser-safe)
```

### 4. Sign Plugin

```bash
agentkit sign-plugin index.ts
```

### 5. Validate

```bash
agentkit doctor
```

## Security Best Practices

### Plugin Signing

Always sign plugins before deployment:

```bash
# Set signing secret
export AGENTKIT_SIGNING_SECRET="your-secure-secret"

# Sign plugin
agentkit sign-plugin my-plugin.ts --verbose
```

### Trusted Keys

Maintain a trusted keys registry for production environments. The CLI supports both development and production key management.

### Safe Development

- Use `--browser-safe` flag for Web Worker compatibility
- Enable security linting with generated ESLint configuration
- Validate plugins with `agentkit doctor` before deployment
- Use hot reload for rapid development iteration

## Testing

### Generated Test Structure

```typescript
// plugin.test.ts - Unit tests
describe('MyPlugin', () => {
  it('should initialize correctly', async () => {
    const plugin = await import('./index')
    expect(plugin.default.name).toBe('my-plugin')
  })
})

// plugin.integration.test.ts - Integration tests
describe('MyPlugin Integration', () => {
  it('should work with AgentKit SDK', async () => {
    const { connectAgent } = await import('@agentkit/sdk')
    // Full integration testing
  })
})

// plugin.browser.test.ts - Browser tests (if browser-safe)
describe('MyPlugin Browser', () => {
  it('should work in Web Workers', async () => {
    // Playwright-based browser testing
  })
})
```

### Running Tests

```bash
npm test                    # All tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:browser       # Browser tests only
npm run test:coverage      # With coverage report
```

## Performance

The CLI is optimized for developer productivity:

- **Plugin creation** < 90 seconds for full setup
- **Hot reload** enabled by default for rapid iteration
- **Performance monitoring** included in generated plugins
- **Incremental compilation** with TypeScript project references

## Troubleshooting

### Common Issues

**Plugin creation fails:**
```bash
# Check Node.js version
node --version  # Should be >= 18.0.0

# Clear npm cache
npm cache clean --force
```

**Signing errors:**
```bash
# Verify secret is set
echo $AGENTKIT_SIGNING_SECRET

# Check plugin syntax
npm run typecheck
```

**Test failures:**
```bash
# Install dependencies
npm install

# Check test configuration
cat vitest.config.ts
```

### Debug Mode

Enable verbose logging for troubleshooting:

```bash
export AGENTKIT_CLI_DEBUG=true
agentkit create-plugin --verbose
```

## Integration with IDE

### VS Code

The generated plugins include VS Code configuration:

- TypeScript IntelliSense
- ESLint integration
- Prettier formatting
- Debug configuration
- Test runner integration

### Other IDEs

Generated `tsconfig.json` and `package.json` provide standard TypeScript project configuration compatible with all major IDEs.

## Contributing

The AgentKit CLI is open source. See the main repository for contribution guidelines and development setup instructions.

---

**AgentKit CLI v0.1.0-alpha** - Built for secure, productive plugin development.