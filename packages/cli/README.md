# @agentkit/cli

AgentKit CLI - Build plugins with excellent developer experience

## Installation

```bash
npm install -g @agentkit/cli
# or
yarn global add @agentkit/cli
# or
pnpm add -g @agentkit/cli
```

## Usage

### Create a New Plugin

```bash
agentkit create-plugin
```

This interactive command will guide you through creating a new AgentKit plugin with:

- ✅ Full TypeScript support with types
- ✅ Zod validation schemas
- ✅ Comprehensive test templates
- ✅ ESLint and Prettier configuration
- ✅ Hot-reload development setup
- ✅ Git repository initialization
- ✅ Detailed documentation

#### Command Options

```bash
agentkit create-plugin [options]

Options:
  -n, --name <name>          Plugin name
  -h, --hooks <hooks...>     Hook points to implement (onInit, onSend, onError, onShutdown)
  --with-tests              Generate comprehensive test suite (default: true)
  --browser-safe            Mark plugin as browser-safe (Web Worker compatible)
  --scoped <scope>          Create scoped package (e.g., @myorg)
  -a, --author <author>     Plugin author
  -l, --license <license>   Plugin license (default: MIT)
  --skip-prompts            Skip interactive prompts and use defaults
```

#### Examples

Create a basic plugin interactively:
```bash
agentkit create-plugin
```

Create a plugin with specific hooks:
```bash
agentkit create-plugin --name my-logger --hooks onInit onSend onError
```

Create a browser-safe plugin:
```bash
agentkit create-plugin --name browser-analytics --browser-safe
```

Create a scoped plugin:
```bash
agentkit create-plugin --name custom-transport --scoped @mycompany
```

### Future Commands

#### Doctor (Coming Soon)

Validate all plugin contracts and dependencies:

```bash
agentkit doctor
```

#### Publish Plugin (Coming Soon)

Publish your plugin to the registry:

```bash
agentkit publish-plugin <plugin-name>
```

## Plugin Development

### Quick Start

After creating a plugin, you can start development immediately:

```bash
cd plugins/my-plugin
npm install
npm run dev
```

### Development Scripts

All generated plugins come with these scripts:

- `npm run dev` - Start development with hot-reload
- `npm test` - Run tests in watch mode
- `npm run test:run` - Run tests once
- `npm run test:coverage` - Run tests with coverage
- `npm run lint` - Check for linting errors
- `npm run lint:fix` - Fix linting errors
- `npm run format` - Format code with Prettier
- `npm run build` - Build for production

### Plugin Structure

```
plugins/my-plugin/
├── src/
│   └── index.ts          # Main plugin implementation
├── plugin.json           # Plugin metadata
├── plugin.test.ts        # Unit tests
├── plugin.integration.test.ts # Integration tests
├── README.md             # Plugin documentation
├── package.json          # NPM package configuration
├── tsconfig.json         # TypeScript configuration
├── vitest.config.ts      # Test configuration
├── .eslintrc.js          # ESLint configuration
└── .prettierrc           # Prettier configuration
```

### Browser-Safe Plugins

For browser-safe plugins, additional files are generated:

```
plugins/browser-plugin/
├── plugin.browser.test.ts # Playwright browser tests
├── playwright.config.ts   # Playwright configuration
└── test-harness.html     # Browser test harness
```

## Features

### 🚀 Rapid Development

- **< 90 seconds** from zero to working plugin
- Interactive prompts guide you through setup
- All boilerplate is generated automatically

### 📦 Production Ready

- TypeScript with full type safety
- Comprehensive test coverage
- Linting and formatting pre-configured
- Git hooks with lint-staged

### 🧪 Testing Excellence

- Unit tests with Vitest
- Integration tests included
- Browser tests with Playwright (for browser-safe plugins)
- Coverage reporting built-in

### 🔧 Developer Experience

- Hot-reload during development
- Clear error messages
- Detailed documentation
- 100% keyboard accessible

### 🌐 Browser Support

- Web Worker isolation
- CSP compliance testing
- Cross-browser compatibility
- Structured cloning for safety

## Configuration

The CLI can be configured through environment variables:

- `AGENTKIT_PLUGINS_DIR` - Custom plugins directory (default: `./plugins`)
- `AGENTKIT_CLI_DEBUG` - Enable debug logging

## Contributing

See the main [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## License

MIT