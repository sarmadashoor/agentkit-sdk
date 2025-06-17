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
  create-plugin [name]     Create a new AgentKit plugin
  sign-plugin <file>       Sign a plugin file with HMAC or Ed25519
  doctor                   Validate development environment
  --help, -h              Show this help message
  --version, -v           Show version information

${styles.bold("Examples:")}
  agentkit create-plugin my-plugin
  agentkit create-plugin hello-world
  agentkit sign-plugin index.ts --hmac
  agentkit sign-plugin plugin.js --ed25519 --output
  agentkit doctor

${styles.bold("Sign Plugin Options:")}
  --hmac                  Use HMAC-SHA256 signing (requires secret)
  --ed25519               Use Ed25519 signing (default)
  --output, -o            Write signature to plugin.signed.json file
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
    await signPlugin();
    process.exit(0);
  }
  if (command === "doctor") {
    const isValid = await runDoctor();
    process.exit(isValid ? 0 : 1);
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
async function signPlugin() {
  console.log(styles.cyan("\\n\u{1F510} Signing AgentKit plugin...\\n"));
  const pluginFile = args[1];
  if (!pluginFile) {
    console.log(styles.red("\u274C Plugin file path is required"));
    console.log(styles.dim("Usage: agentkit sign-plugin <plugin-file> [--hmac|--ed25519]"));
    process.exit(1);
  }
  if (!fs.existsSync(pluginFile)) {
    console.log(styles.red(`\u274C Plugin file not found: ${pluginFile}`));
    process.exit(1);
  }
  const useHmac = args.includes("--hmac");
  const useEd25519 = args.includes("--ed25519") || !useHmac;
  try {
    console.log(styles.dim(`\u{1F4C4} Loading plugin from: ${pluginFile}`));
    const pluginContent = fs.readFileSync(pluginFile, "utf8");
    const metadata = extractPluginMetadata(pluginContent);
    console.log(styles.dim(`\u{1F4E6} Plugin: ${metadata.name} v${metadata.version}`));
    if (useHmac) {
      await signPluginHMAC(pluginFile, pluginContent, metadata);
    } else {
      await signPluginEd25519(pluginFile, pluginContent, metadata);
    }
  } catch (error) {
    console.log(styles.red("\u274C Error signing plugin:"), error.message);
    process.exit(1);
  }
}
function extractPluginMetadata(content) {
  const metadata = {
    name: "unknown-plugin",
    version: "1.0.0"
  };
  const nameMatch = content.match(/name\s*[:=]\s*['"]([^'"]+)['"]/);
  const versionMatch = content.match(/version\s*[:=]\s*['"]([^'"]+)['"]/);
  const descriptionMatch = content.match(/description\s*[:=]\s*['"]([^'"]+)['"]/);
  if (nameMatch) metadata.name = nameMatch[1];
  if (versionMatch) metadata.version = versionMatch[1];
  if (descriptionMatch) metadata.description = descriptionMatch[1];
  const classMatch = content.match(/export\s+(?:default\s+)?class\s+(\w+)/);
  if (classMatch && metadata.name === "unknown-plugin") {
    metadata.name = classMatch[1].toLowerCase().replace(/plugin$/i, "");
  }
  return metadata;
}
async function signPluginHMAC(filePath, content, metadata) {
  const crypto = require("crypto");
  const secret = process.env.AGENTKIT_SIGNING_SECRET;
  if (!secret) {
    console.log(styles.yellow("\\n\u26A0\uFE0F  No AGENTKIT_SIGNING_SECRET environment variable found"));
    const userSecret = await askQuestion("Enter signing secret: ");
    if (!userSecret || userSecret.length < 16) {
      console.log(styles.red("\u274C Signing secret must be at least 16 characters"));
      process.exit(1);
    }
    process.env.AGENTKIT_SIGNING_SECRET = userSecret;
  }
  console.log(styles.dim("\u{1F511} Using HMAC-SHA256 signing..."));
  const signableContent = JSON.stringify({
    name: metadata.name,
    version: metadata.version,
    description: metadata.description,
    contentHash: crypto.createHash("sha256").update(content).digest("hex"),
    timestamp: Math.floor(Date.now() / 1e3)
  }, null, 2);
  const hmac = crypto.createHmac("sha256", process.env.AGENTKIT_SIGNING_SECRET);
  hmac.update(signableContent);
  const signature = hmac.digest("hex");
  const signatureData = {
    algorithm: "HMAC-SHA256",
    signature,
    hash: crypto.createHash("sha256").update(content).digest("hex"),
    metadata,
    timestamp: Math.floor(Date.now() / 1e3),
    signed: signableContent
  };
  const outputPath = path.join(path.dirname(filePath), "plugin.signed.json");
  fs.writeFileSync(outputPath, JSON.stringify(signatureData, null, 2));
  console.log(styles.green("\\n\u2705 Plugin signed successfully with HMAC!"));
  console.log(styles.dim(`\u{1F4DD} Signature written to: ${outputPath}`));
  console.log(styles.dim(`\u{1F510} Signature: ${signature.substring(0, 32)}...`));
}
async function signPluginEd25519(filePath, content, metadata) {
  const crypto = require("crypto");
  console.log(styles.dim("\u{1F511} Using Ed25519 signing..."));
  const keyPath = path.join(require("os").homedir(), ".agentkit", "keys", "dev.key");
  let keyPair;
  if (fs.existsSync(keyPath)) {
    console.log(styles.dim("\u{1F4C2} Loading existing key..."));
    keyPair = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  } else {
    console.log(styles.dim("\u{1F528} Generating new Ed25519 key pair..."));
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });
    keyPair = {
      publicKey,
      privateKey,
      keyId: crypto.createHash("sha256").update(publicKey).digest("hex").substring(0, 16)
    };
    const keyDir = path.dirname(keyPath);
    fs.mkdirSync(keyDir, { recursive: true });
    fs.writeFileSync(keyPath, JSON.stringify(keyPair, null, 2), { mode: 384 });
    console.log(styles.dim(`\u{1F4BE} Key saved to: ${keyPath}`));
  }
  const message = JSON.stringify({
    name: metadata.name,
    version: metadata.version,
    description: metadata.description,
    contentHash: crypto.createHash("sha256").update(content).digest("hex"),
    timestamp: Math.floor(Date.now() / 1e3),
    expires: Math.floor(Date.now() / 1e3) + 365 * 24 * 60 * 60
    // 1 year
  });
  const signature = crypto.sign(null, Buffer.from(message), keyPair.privateKey).toString("base64");
  const signatureData = {
    algorithm: "Ed25519",
    signature,
    keyId: keyPair.keyId,
    hash: crypto.createHash("sha256").update(content).digest("hex"),
    metadata,
    timestamp: Math.floor(Date.now() / 1e3),
    expires: Math.floor(Date.now() / 1e3) + 365 * 24 * 60 * 60,
    message
  };
  const outputToFile = args.includes("--output") || args.includes("-o");
  if (outputToFile) {
    const outputPath = path.join(path.dirname(filePath), "plugin.signed.json");
    fs.writeFileSync(outputPath, JSON.stringify(signatureData, null, 2));
    console.log(styles.green("\\n\u2705 Plugin signed successfully with Ed25519!"));
    console.log(styles.dim(`\u{1F4DD} Signature written to: ${outputPath}`));
  } else {
    console.log(styles.green("\\n\u2705 Plugin signed successfully with Ed25519!"));
    console.log(styles.cyan("\\n\u{1F4CB} Signature Data:\\n"));
    console.log(JSON.stringify(signatureData, null, 2));
  }
  console.log(styles.dim(`\\n\u{1F510} Key ID: ${keyPair.keyId}`));
  console.log(styles.dim(`\u{1F510} Signature: ${signature.substring(0, 32)}...`));
}
async function runDoctor() {
  console.log(styles.cyan("\\n\u{1F527} AgentKit Doctor - Environment Validation\\n"));
  let allChecksPass = true;
  const results = [];
  const nodeCheck = checkNodeVersion();
  results.push(nodeCheck);
  if (!nodeCheck.status) allChecksPass = false;
  const osCheck = checkOSPlatform();
  results.push(osCheck);
  const pnpmCheck = await checkPnpm();
  results.push(pnpmCheck);
  if (!pnpmCheck.status) allChecksPass = false;
  const tsCheck = await checkTypeScript();
  results.push(tsCheck);
  if (!tsCheck.status) allChecksPass = false;
  const cliCheck = checkCLIVersion();
  results.push(cliCheck);
  const dirCheck = checkPluginDirectory();
  results.push(dirCheck);
  console.log(styles.bold("\u{1F4CB} Environment Checks:\\n"));
  for (const result of results) {
    const icon = result.status ? styles.green("\u2705") : styles.red("\u274C");
    console.log(`${icon} ${result.name}: ${result.message}`);
  }
  console.log();
  if (allChecksPass) {
    console.log(styles.green("\u{1F389} All critical checks passed! Your environment is ready for AgentKit plugin development."));
  } else {
    console.log(styles.red("\u26A0\uFE0F  Some critical checks failed. Please fix the issues above before developing plugins."));
  }
  return allChecksPass;
}
function checkNodeVersion() {
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split(".")[0]);
  const minVersion = 18;
  if (majorVersion >= minVersion) {
    return {
      name: "Node.js Version",
      status: true,
      message: `${nodeVersion} (>= ${minVersion}.0.0 required)`
    };
  } else {
    return {
      name: "Node.js Version",
      status: false,
      message: `${nodeVersion} - Please upgrade to Node.js ${minVersion}.0.0 or higher`
    };
  }
}
function checkOSPlatform() {
  const os = require("os");
  const platform = os.platform();
  const arch = os.arch();
  const release = os.release();
  const supportedPlatforms = ["darwin", "linux", "win32"];
  const supportedArchs = ["x64", "arm64"];
  const platformSupported = supportedPlatforms.includes(platform);
  const archSupported = supportedArchs.includes(arch);
  if (platformSupported && archSupported) {
    return {
      name: "Operating System",
      status: true,
      message: `${platform} ${arch} ${release} - Supported platform`
    };
  } else {
    return {
      name: "Operating System",
      status: true,
      // Warning, not critical
      message: `${platform} ${arch} ${release} - Untested platform, may work`
    };
  }
}
async function checkPnpm() {
  try {
    const { execSync } = require("child_process");
    const version = execSync("pnpm --version", { encoding: "utf8", timeout: 5e3 }).trim();
    return {
      name: "PNPM Package Manager",
      status: true,
      message: `v${version} - Available for workspace development`
    };
  } catch (error) {
    return {
      name: "PNPM Package Manager",
      status: false,
      message: "Not installed - Required for AgentKit workspace development. Install with: npm install -g pnpm"
    };
  }
}
async function checkTypeScript() {
  try {
    const { execSync } = require("child_process");
    const version = execSync("tsc --version", { encoding: "utf8", timeout: 5e3 }).trim();
    return {
      name: "TypeScript Compiler",
      status: true,
      message: `${version} - Available for plugin development`
    };
  } catch (error) {
    return {
      name: "TypeScript Compiler",
      status: false,
      message: "Not installed - Required for plugin development. Install with: npm install -g typescript"
    };
  }
}
function checkCLIVersion() {
  const packageJson = {
    version: "0.1.0-alpha"
    // Hardcoded for standalone CLI
  };
  return {
    name: "AgentKit CLI",
    status: true,
    message: `v${packageJson.version} - Current version`
  };
}
function checkPluginDirectory() {
  const cwd = process.cwd();
  const hasIndexTs = fs.existsSync(path.join(cwd, "index.ts"));
  const hasPluginJson = fs.existsSync(path.join(cwd, "plugin.json"));
  const hasPackageJson = fs.existsSync(path.join(cwd, "package.json"));
  const hasTestDir = fs.existsSync(path.join(cwd, "test"));
  const hasPluginsDir = fs.existsSync(path.join(cwd, "plugins"));
  if (hasIndexTs && hasPackageJson) {
    const score = [hasPluginJson, hasTestDir].filter(Boolean).length;
    return {
      name: "Plugin Directory Structure",
      status: true,
      message: `Plugin detected with ${score + 2}/4 expected files (index.ts, package.json${hasPluginJson ? ", plugin.json" : ""}${hasTestDir ? ", test/" : ""})`
    };
  } else if (hasPluginsDir) {
    const pluginDirs = fs.readdirSync(path.join(cwd, "plugins")).filter((name) => {
      const pluginPath = path.join(cwd, "plugins", name);
      return fs.statSync(pluginPath).isDirectory();
    });
    return {
      name: "Plugin Directory Structure",
      status: true,
      message: `Workspace detected with ${pluginDirs.length} plugin directories`
    };
  } else {
    return {
      name: "Plugin Directory Structure",
      status: true,
      // Info, not critical
      message: 'Not in a plugin directory - Use "agentkit create-plugin" to create one'
    };
  }
}
