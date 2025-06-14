# @agentkit/runtime-web

Browser runtime and transport for the AgentKit SDK. This package provides a `BrowserTransport` class that enables AgentKit to work in web browsers using the Fetch API to communicate with MCP servers.

## Features

- 🌐 **Browser-first**: Built specifically for web environments using fetch API
- 🔄 **Retry Logic**: Exponential backoff with configurable retry attempts
- ⏱️ **Timeout Handling**: Configurable request timeouts with abort controller
- 🛡️ **CORS Safe**: Proper headers and error handling for cross-origin requests
- 📦 **ESM Only**: Modern ES modules for optimal bundle size
- 🎯 **Type Safe**: Full TypeScript support with exported types

## Installation

```bash
npm install @agentkit/runtime-web @agentkit/sdk
```

## Quick Start

```typescript
import { connectAgent } from '@agentkit/sdk'
import { BrowserTransport } from '@agentkit/runtime-web'

// Create a browser transport
const transport = new BrowserTransport({
  endpoint: 'https://your-mcp-server.com/api',
  timeout: 5000,
  maxRetries: 3
})

// Use with connectAgent
const agent = await connectAgent({
  agent: 'your-agent-id',
  transport: transport
})

// Send messages
await agent.send({ message: 'Hello from browser!' })
await agent.shutdown()
```

## Configuration

The `BrowserTransport` accepts the following options:

```typescript
interface BrowserTransportConfig {
  endpoint: string        // MCP server endpoint URL
  timeout?: number       // Request timeout in ms (default: 10000)
  maxRetries?: number    // Max retry attempts (default: 3)
  retryDelay?: number    // Initial retry delay in ms (default: 1000)
  headers?: Record<string, string> // Additional headers
}
```

## Browser Compatibility

This package works in all modern browsers that support:
- Fetch API
- AbortController
- ES2020 features

For older browsers, you may need polyfills for fetch and AbortController.

## Error Handling

The transport handles various error scenarios:

- **Network errors**: Automatic retries with exponential backoff
- **Server errors**: HTTP 4xx/5xx responses with proper error messages
- **Timeout errors**: Configurable timeout with abort controller
- **CORS errors**: Clear error messages for cross-origin issues

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## License

MIT