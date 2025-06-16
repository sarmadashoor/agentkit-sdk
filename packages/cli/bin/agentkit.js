#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/index-standalone.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var import_readline = require("readline");
var styles = {
  cyan: (text) => `\x1B[36m${text}\x1B[0m`,
  green: (text) => `\x1B[32m${text}\x1B[0m`,
  yellow: (text) => `\x1B[33m${text}\x1B[0m`,
  red: (text) => `\x1B[31m${text}\x1B[0m`,
  bold: (text) => `\x1B[1m${text}\x1B[0m`,
  dim: (text) => `\x1B[2m${text}\x1B[0m`
};
console.log(styles.cyan("\u{1F680} AgentKit CLI v0.1.0-alpha"));
var args = process.argv.slice(2);
var command = args[0];
if (!command || command === "--help" || command === "-h") {
  console.log(`
${styles.bold("Usage:")} agentkit <command> [options]

${styles.bold("Commands:")}
  create-plugin [name]  Create a new AgentKit plugin
  sign-plugin <file>    Sign a plugin file (coming soon)
  doctor               Validate dependencies (coming soon)
  --help, -h           Show this help message
  --version, -v        Show version information

${styles.bold("Examples:")}
  agentkit create-plugin my-plugin
  agentkit create-plugin hello-world
`);
  process.exit(0);
}
if (command === "--version" || command === "-v") {
  console.log("0.1.0-alpha");
  process.exit(0);
}
async function main() {
  if (command === "create-plugin") {
    await createPlugin();
    process.exit(0);
  }
  if (command === "sign-plugin") {
    console.log(styles.yellow("\u{1F510} sign-plugin command coming soon!"));
    console.log("This will cryptographically sign plugin files for secure distribution.");
    process.exit(0);
  }
  if (command === "doctor") {
    console.log(styles.yellow("\u{1F527} doctor command coming soon!"));
    console.log("This will validate all plugin contracts and dependencies.");
    process.exit(0);
  }
  console.log(styles.red(`Unknown command: ${command}`));
  console.log('Run "agentkit --help" for available commands.');
  process.exit(1);
}
main().catch((error) => {
  console.log(styles.red("\u274C Error:"), error.message);
  process.exit(1);
});
async function createPlugin() {
  console.log(styles.cyan("\\n\u{1F6E0}\uFE0F  Creating a new AgentKit plugin...\\n"));
  let pluginName = args[1];
  if (!pluginName) {
    pluginName = await askQuestion("Plugin name: ");
  }
  if (!pluginName || pluginName.trim() === "") {
    console.log(styles.red("\u274C Plugin name is required"));
    process.exit(1);
  }
  if (!/^[a-z][a-z0-9-]*$/.test(pluginName)) {
    console.log(styles.red("\u274C Plugin name must be lowercase, start with a letter, and contain only letters, numbers, and hyphens"));
    process.exit(1);
  }
  const pluginDir = path.join(process.cwd(), pluginName);
  if (fs.existsSync(pluginDir)) {
    console.log(styles.red(`\u274C Directory "${pluginName}" already exists`));
    process.exit(1);
  }
  try {
    console.log(styles.dim(`\u{1F4C1} Creating directory: ${pluginDir}`));
    fs.mkdirSync(pluginDir, { recursive: true });
    console.log(styles.dim("\u{1F4DD} Creating plugin files..."));
    await createIndexFile(pluginDir, pluginName);
    await createPluginJson(pluginDir, pluginName);
    await createReadme(pluginDir, pluginName);
    await createTestFile(pluginDir, pluginName);
    await createPackageJson(pluginDir, pluginName);
    console.log(styles.green("\\n\u2705 Plugin created successfully!"));
    console.log(styles.cyan("\\n\u{1F4CB} Next steps:\\n"));
    console.log(`  ${styles.dim("$")} cd ${pluginName}`);
    console.log(`  ${styles.dim("$")} npm install`);
    console.log(`  ${styles.dim("$")} npm test`);
    console.log("");
    console.log(styles.green("\u{1F4D6} Check README.md for usage instructions\\n"));
  } catch (error) {
    console.log(styles.red("\u274C Error creating plugin:"), error.message);
    process.exit(1);
  }
}
async function askQuestion(question) {
  const rl = (0, import_readline.createInterface)({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
async function createIndexFile(pluginDir, pluginName) {
  const className = toPascalCase(pluginName);
  const content = `// ${pluginName} plugin for AgentKit
export class ${className} {
  readonly name = '${pluginName}'
  readonly version = '1.0.0'
  
  /**
   * Called when the agent starts
   */
  async onStart(context: { agentId: string; timestamp: number }) {
    console.log(\`[${pluginName}] Plugin started for agent \${context.agentId}\`)
  }
  
  /**
   * Called when a message is sent
   */
  async onSend(payload: { input: any }, context: { agentId: string }) {
    console.log(\`[${pluginName}] Processing send for agent \${context.agentId}\`)
    return payload
  }
  
  /**
   * Called when the agent shuts down
   */
  async onShutdown(context: { agentId: string }) {
    console.log(\`[${pluginName}] Plugin shutting down for agent \${context.agentId}\`)
  }
}

// Default export for convenience
export default ${className}
`;
  fs.writeFileSync(path.join(pluginDir, "index.ts"), content);
}
async function createPluginJson(pluginDir, pluginName) {
  const metadata = {
    name: pluginName,
    version: "1.0.0",
    description: `${pluginName} plugin for AgentKit`,
    main: "./index.ts",
    hooks: ["onStart", "onSend", "onShutdown"],
    author: "Your Name",
    license: "MIT"
  };
  fs.writeFileSync(
    path.join(pluginDir, "plugin.json"),
    JSON.stringify(metadata, null, 2)
  );
}
async function createReadme(pluginDir, pluginName) {
  const className = toPascalCase(pluginName);
  const content = `# ${pluginName}

A simple AgentKit plugin that demonstrates basic functionality.

## Features

- \u26A1 Zero-config setup
- \u{1F3AF} Implements onStart, onSend, and onShutdown hooks
- \u{1F4DD} TypeScript support
- \u{1F9EA} Test suite included

## Installation

\`\`\`bash
npm install
\`\`\`

## Usage

\`\`\`typescript
import { connectAgent } from '@agentkit/sdk'
import { ${className} } from './'

const plugin = new ${className}()

const { send, shutdown } = await connectAgent({
  agent: 'my-agent',
  transport: 'websocket',
  plugins: [plugin]
})

// Send a message
await send({ message: 'Hello World!' })

// Clean shutdown
await shutdown()
\`\`\`

## Development

\`\`\`bash
# Run tests
npm test

# Watch mode
npm run test:watch
\`\`\`

## API

### onStart(context)

Called when the agent is initialized.

### onSend(payload, context)

Called before sending data to the agent. You can modify the payload here.

### onShutdown(context)

Called when the agent is shutting down. Use for cleanup.

## License

MIT
`;
  fs.writeFileSync(path.join(pluginDir, "README.md"), content);
}
async function createTestFile(pluginDir, pluginName) {
  const testDir = path.join(pluginDir, "test");
  fs.mkdirSync(testDir, { recursive: true });
  const className = toPascalCase(pluginName);
  const content = `import { ${className} } from '../index'

describe('${className}', () => {
  let plugin: ${className}
  
  beforeEach(() => {
    plugin = new ${className}()
  })
  
  test('should have correct metadata', () => {
    expect(plugin.name).toBe('${pluginName}')
    expect(plugin.version).toBe('1.0.0')
  })
  
  test('should handle onStart', async () => {
    const context = { agentId: 'test-agent', timestamp: Date.now() }
    
    // Mock console.log to capture output
    const originalLog = console.log
    const logCalls: string[] = []
    console.log = (message: string) => {
      logCalls.push(message)
    }
    
    await plugin.onStart(context)
    
    expect(logCalls.length).toBe(1)
    expect(logCalls[0]).toContain('Plugin started for agent test-agent')
    
    // Restore console.log
    console.log = originalLog
  })
  
  test('should handle onSend', async () => {
    const payload = { input: { message: 'test' } }
    const context = { agentId: 'test-agent' }
    
    // Mock console.log to capture output
    const originalLog = console.log
    const logCalls: string[] = []
    console.log = (message: string) => {
      logCalls.push(message)
    }
    
    const result = await plugin.onSend(payload, context)
    
    expect(result).toEqual(payload)
    expect(logCalls.length).toBe(1)
    expect(logCalls[0]).toContain('Processing send for agent test-agent')
    
    // Restore console.log
    console.log = originalLog
  })
  
  test('should handle onShutdown', async () => {
    const context = { agentId: 'test-agent' }
    
    // Mock console.log to capture output
    const originalLog = console.log
    const logCalls: string[] = []
    console.log = (message: string) => {
      logCalls.push(message)
    }
    
    await plugin.onShutdown(context)
    
    expect(logCalls.length).toBe(1)
    expect(logCalls[0]).toContain('Plugin shutting down for agent test-agent')
    
    // Restore console.log
    console.log = originalLog
  })
})
`;
  fs.writeFileSync(path.join(testDir, "index.test.ts"), content);
}
async function createPackageJson(pluginDir, pluginName) {
  const packageJson = {
    name: pluginName,
    version: "1.0.0",
    description: `${pluginName} plugin for AgentKit`,
    main: "index.ts",
    scripts: {
      test: "jest",
      "test:watch": "jest --watch"
    },
    devDependencies: {
      "@types/jest": "^29.5.0",
      "@types/node": "^20.0.0",
      jest: "^29.5.0",
      "ts-jest": "^29.1.0",
      typescript: "^5.0.0"
    },
    jest: {
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["**/test/**/*.test.ts"],
      setupFilesAfterEnv: [],
      collectCoverageFrom: [
        "*.ts",
        "!*.test.ts"
      ]
    },
    engines: {
      node: ">=18.0.0"
    },
    keywords: ["agentkit", "plugin"],
    author: "Your Name",
    license: "MIT"
  };
  fs.writeFileSync(
    path.join(pluginDir, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );
}
function toPascalCase(str) {
  return str.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
}
