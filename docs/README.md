# AgentKit SDK Documentation

Welcome to the comprehensive documentation for AgentKit SDK - a modular, secure, agent-agnostic TypeScript framework for managing AI agents inside host applications.

**Version:** 0.1.0-alpha | **License:** MIT

## 📍 Quick Navigation

| 🎯 **What You Want to Do** | 📖 **Go Here** |
|---------------------------|----------------|
| **Get started quickly** | [🚀 Quick Start](#quick-start) |
| **Learn core concepts** | [📚 Developer Guide](./developer-guide.md) |
| **Find specific APIs** | [📋 API Reference](./api-reference.md) |
| **Solve a problem** | [🔧 Troubleshooting](./troubleshooting.md) |
| **Run tests** | [🧪 Testing Strategy](./development/testing-strategy.md) |
| **Build plugins** | [🔌 Plugin Development](./architecture/plugins/) |

---

## 🎯 User Journeys by Persona

### 👨‍💻 **First-Time User** → *"I want to integrate AI agents into my app"*
**Goal:** Get AgentKit working with a simple example
```
1. 📖 [Developer Guide - Installation & Setup](./developer-guide.md#installation--setup)
2. 🚀 [Quick Start](#quick-start) (below)
3. 💡 [Basic Usage Examples](../examples/) 
4. 🔧 [Troubleshooting](./troubleshooting.md) (if needed)
```

### 🏗️ **Plugin Developer** → *"I want to extend AgentKit functionality"*
**Goal:** Create secure, reusable plugins for the ecosystem
```
1. 🔌 [Plugin System Architecture](./architecture/plugins/README.md)
2. 📋 [Plugin Security Guide](./architecture/plugins/PLUGIN_SECURITY_GUIDE.md)
3. ⚙️ [Plugin Implementation Guide](./architecture/plugins/IMPLEMENTATION_GUIDE.md)
4. 🔄 [Plugin Hook Execution Order](./architecture/plugins/HOOK_EXECUTION_ORDER.md)
5. 🧪 [Testing Strategy](./development/testing-strategy.md)
```

### 🏢 **Enterprise Integrator** → *"I need production-ready agent management"*
**Goal:** Deploy AgentKit with observability, security, and scalability
```
1. 🏗️ [Architecture Overview](./architecture/overview.md)
2. 📊 [Observability Framework](./architecture/observability.md)
3. 🛡️ [Design Decisions & Constraints](./architecture/design-decisions.md)
4. 📚 [Developer Guide - Production Features](./developer-guide.md#production-features)
5. 🗂️ [Registry Patterns](./registry.md)
6. 🧪 [Testing Strategy](./development/testing-strategy.md)
```

### 🔧 **Platform Engineer** → *"I need to understand the system architecture"*
**Goal:** Deploy, monitor, and maintain AgentKit in production
```
1. 🏗️ [Architecture Overview](./architecture/overview.md)
2. 🛡️ [Design Decisions & Constraints](./architecture/design-decisions.md)
3. 📊 [Observability Framework](./architecture/observability.md)
4. 🐛 [Debugging Guide](./development/debugging.md)
5. 🚀 [Migration Guide](./migration.md)
6. 📋 [Changelog](./CHANGELOG.md)
```

### 🧪 **Contributor/Maintainer** → *"I want to contribute to AgentKit"*
**Goal:** Understand codebase structure and development workflow
```
1. 🏗️ [Architecture Overview](./architecture/overview.md)
2. 🧪 [Testing Strategy](./development/testing-strategy.md)
3. 🐛 [Debugging Guide](./development/debugging.md)
4. 🛡️ [Design Decisions & Constraints](./architecture/design-decisions.md)
5. 📋 [API Reference](./api-reference.md)
6. 🚀 [Migration Guide](./migration.md)
```

---

## 🚀 Quick Start

### 📦 Installation
```bash
# Install pnpm (required package manager)
npm install -g pnpm

# Install AgentKit SDK
pnpm add @agentkit/sdk @agentkit/types
```

### 💡 5-Minute Example
```typescript
import { connectAgent, AgentRegistry } from '@agentkit/sdk'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'

// 1. Register components
AgentRegistry.register({
  id: 'my-agent',
  name: 'My Agent',
  version: '1.0.0',
  factory: () => new DummyAgent()
})
AgentRegistry.registerTransport(new DummyTransport())

// 2. Connect and use
const handle = await connectAgent({
  agent: 'my-agent',
  transport: 'dummy',
  onOutput: (msg) => console.log('Response:', msg)
})

// 3. Send messages
await handle.send({ message: 'Hello, AgentKit!' })
await handle.shutdown()
```

**Next Steps:** [📚 Complete Developer Guide](./developer-guide.md)

---

## 📚 Complete Documentation Index

### 🎯 **Getting Started**
| Document | Description | Audience |
|----------|-------------|----------|
| [📚 **Developer Guide**](./developer-guide.md) | **Complete usage guide with examples and patterns** | All Users |
| [📋 **API Reference**](./api-reference.md) | **Comprehensive API documentation** | All Users |
| [🔧 **Troubleshooting**](./troubleshooting.md) | **Common issues and solutions** | All Users |

### 🏗️ **Architecture & Design**
| Document | Description | Audience |
|----------|-------------|----------|
| [📖 **Architecture Overview**](./architecture/overview.md) | System design and core principles | Platform Engineers, Contributors |
| [🛡️ **Design Decisions**](./architecture/design-decisions.md) | Architectural constraints and assertions | Platform Engineers, Contributors |
| [📊 **Observability Framework**](./architecture/observability.md) | Metrics, monitoring, and debugging | Enterprise Integrators, Platform Engineers |

### 🔌 **Plugin System**
| Document | Description | Audience |
|----------|-------------|----------|
| [🔌 **Plugin System Overview**](./architecture/plugins/README.md) | Plugin architecture and capabilities | Plugin Developers |
| [🛡️ **Plugin Security Guide**](./architecture/plugins/PLUGIN_SECURITY_GUIDE.md) | Security model and best practices | Plugin Developers |
| [⚙️ **Plugin Implementation Guide**](./architecture/plugins/IMPLEMENTATION_GUIDE.md) | Step-by-step plugin development | Plugin Developers |
| [🔄 **Hook Execution Order**](./architecture/plugins/HOOK_EXECUTION_ORDER.md) | Plugin lifecycle and hook timing | Plugin Developers |

### ⚙️ **Development & Testing**
| Document | Description | Audience |
|----------|-------------|----------|
| [🧪 **Testing Strategy**](./development/testing-strategy.md) | **Testing commands, strategies, and best practices** | All Developers |
| [🐛 **Debugging Guide**](./development/debugging.md) | Debug techniques and tools | All Developers |

### 📋 **Reference & Utilities**
| Document | Description | Audience |
|----------|-------------|----------|
| [🗂️ **Registry Patterns**](./registry.md) | Agent and transport registration patterns | All Users |
| [🚀 **Migration Guide**](./migration.md) | Version upgrades and breaking changes | All Users |
| [📋 **Changelog**](./CHANGELOG.md) | Release history and feature additions | All Users |

---

## 💡 Examples & Tutorials

### 📁 **Code Examples**
| Example | Description | Complexity |
|---------|-------------|------------|
| [**Basic Agent Usage**](../examples/basic-agent-usage.ts) | Simple agent connection and messaging | Beginner |
| [**Debug Mode**](../examples/debug-mode.ts) | Lifecycle hooks and debugging | Intermediate |
| [**Hello World App**](../examples/hello-world-app/) | Complete standalone application | Intermediate |
| [**Snapshot Agent**](../examples/snapshot-agent/) | Advanced agent with testing | Advanced |

### 🎓 **Learning Path by Experience**

#### **🌟 Beginner** → *"New to AgentKit"*
```
1. [Developer Guide - Overview](./developer-guide.md#overview)
2. [Quick Start](#quick-start) (above)
3. [Basic Agent Usage Example](../examples/basic-agent-usage.ts)
4. [Troubleshooting](./troubleshooting.md)
```

#### **⚡ Intermediate** → *"Building production apps"*
```
1. [Developer Guide - Production Features](./developer-guide.md#production-features)
2. [Hello World App Example](../examples/hello-world-app/)
3. [Testing Strategy](./development/testing-strategy.md)
4. [Registry Patterns](./registry.md)
```

#### **🚀 Advanced** → *"Extending & contributing"*
```
1. [Architecture Overview](./architecture/overview.md)
2. [Plugin Development](./architecture/plugins/)
3. [Snapshot Agent Example](../examples/snapshot-agent/)
4. [Design Decisions](./architecture/design-decisions.md)
```

---

## 🧪 Testing & Development

### **⚡ Quick Testing (Development)**
```bash
npm run test:fast      # 4 packages, ~30 seconds ✅ RECOMMENDED
npm test               # Adaptive testing (fast in dev, full in CI)
```

### **🔬 Comprehensive Testing (CI/CD)**
```bash
npm run test:ci        # All 92 tests, sequential, 5-10 minutes
```

### **📦 Package-Specific Testing**
```bash
cd packages/sdk && npm test         # SDK tests (60 files)
cd packages/runtime-web && npm test # Browser tests (11 files)
cd packages/cli && npm test         # CLI tests (7 files)
```

**📖 Complete guide:** [Testing Strategy](./development/testing-strategy.md)

---

## 🗺️ Documentation Sitemap

```
docs/
├── README.md                           # 📍 This index (YOU ARE HERE)
├── developer-guide.md                  # 📚 Complete usage guide
├── api-reference.md                    # 📋 API documentation
├── troubleshooting.md                  # 🔧 Common issues & solutions
├── registry.md                         # 🗂️ Registration patterns
├── migration.md                        # 🚀 Version & upgrade guide
├── CHANGELOG.md                        # 📋 Release history
│
├── architecture/                       # 🏗️ System Design
│   ├── overview.md                     # 📖 Architecture principles
│   ├── design-decisions.md             # 🛡️ Constraints & assertions
│   ├── observability.md                # 📊 Monitoring framework
│   └── plugins/                        # 🔌 Plugin System
│       ├── README.md                   # 🔌 Plugin overview
│       ├── PLUGIN_SECURITY_GUIDE.md    # 🛡️ Security model
│       ├── IMPLEMENTATION_GUIDE.md     # ⚙️ Development guide
│       └── HOOK_EXECUTION_ORDER.md     # 🔄 Lifecycle timing
│
└── development/                        # ⚙️ Development Guides
    ├── testing-strategy.md              # 🧪 Testing best practices
    └── debugging.md                     # 🐛 Debug techniques
```

---

## 🤝 Contributing

### **📝 Documentation Guidelines**
- Each section should link to exactly **one canonical document**
- Use clear, action-oriented headings
- Include code examples where appropriate
- Keep examples up-to-date with the current API

### **🔗 Cross-References**
- **Main Repository:** [../README.md](../README.md)
- **Examples:** [../examples/](../examples/)
- **Source Code:** [../packages/](../packages/)

### **📞 Support Channels**
- 🐛 **Issues:** [GitHub Issues](https://github.com/your-org/agentkit-sdk/issues)
- 💬 **Discussions:** [GitHub Discussions](https://github.com/your-org/agentkit-sdk/discussions)
- 📧 **Security:** security@agentkit.dev

---

**AgentKit SDK v0.1.0-alpha** - Built for reliable AI agent integration.

*This documentation index was last updated: Current*