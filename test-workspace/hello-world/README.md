# hello-world

A simple AgentKit plugin that demonstrates basic functionality.

## Features

- ⚡ Zero-config setup
- 🎯 Implements onStart, onSend, and onShutdown hooks
- 📝 TypeScript support
- 🧪 Test suite included

## Installation

```bash
npm install
```

## Usage

```typescript
import { connectAgent } from '@agentkit/sdk'
import { HelloWorld } from './'

const plugin = new HelloWorld()

const { send, shutdown } = await connectAgent({
  agent: 'my-agent',
  transport: 'websocket',
  plugins: [plugin]
})

// Send a message
await send({ message: 'Hello World!' })

// Clean shutdown
await shutdown()
```

## Development

```bash
# Run tests
npm test

# Watch mode
npm run test:watch
```

## API

### onStart(context)

Called when the agent is initialized.

### onSend(payload, context)

Called before sending data to the agent. You can modify the payload here.

### onShutdown(context)

Called when the agent is shutting down. Use for cleanup.

## License

MIT
