/**
 * Plugin Testing Utilities
 * 
 * Utilities for testing plugins within VM sandbox constraints.
 * These utilities work with observable behavior rather than closure-based state.
 */

import { AgentRegistry } from '@agentkit/registry'
import { DummyTransport } from '@agentkit/transports-dummy'
import { connectAgent } from '../../src/index'
import { AgentKitPlugin } from '../../src/plugins'
import { createTestAgent } from '@agentkit/test-agent'

export interface PluginTestOptions {
  /** Plugin to test */
  plugin: AgentKitPlugin
  /** Input to send to agent (optional) */
  handleInput?: any
  /** Agent ID for test */
  agentId?: string
  /** Transport configuration */
  transportConfig?: any
  /** Debug mode */
  debug?: boolean
  /** Additional options for connectAgent */
  connectOptions?: any
}

export interface PluginTestResult {
  /** Agent response (if handleInput was provided) */
  response?: any
  /** Transport messages sent */
  transportMessages: any[]
  /** Console logs captured during test */
  logs: string[]
  /** Any errors that occurred */
  errors: Error[]
}

/**
 * Run a plugin test with observable behavior capture
 */
export async function runPluginTest(options: PluginTestOptions): Promise<PluginTestResult> {
  const {
    plugin,
    handleInput,
    agentId = 'test-agent',
    transportConfig = { debug: false, logMessages: true },
    debug = false,
    connectOptions = {}
  } = options

  const registry = new AgentRegistry()
  const transport = new DummyTransport(transportConfig)
  const logs: string[] = []
  const errors: Error[] = []
  const transportMessages: any[] = []

  // Capture console logs
  const originalConsoleLog = console.log
  const originalConsoleDebug = console.debug
  const originalConsoleInfo = console.info
  const originalConsoleWarn = console.warn
  const originalConsoleError = console.error

  console.log = (...args) => {
    logs.push(`LOG: ${args.join(' ')}`)
    originalConsoleLog(...args)
  }
  console.debug = (...args) => {
    logs.push(`DEBUG: ${args.join(' ')}`)
    originalConsoleDebug(...args)
  }
  console.info = (...args) => {
    logs.push(`INFO: ${args.join(' ')}`)
    originalConsoleInfo(...args)
  }
  console.warn = (...args) => {
    logs.push(`WARN: ${args.join(' ')}`)
    originalConsoleWarn(...args)
  }
  console.error = (...args) => {
    logs.push(`ERROR: ${args.join(' ')}`)
    originalConsoleError(...args)
  }

  // Capture transport messages
  const originalSend = transport.send.bind(transport)
  transport.send = async (message: any) => {
    transportMessages.push({
      timestamp: Date.now(),
      message: JSON.parse(JSON.stringify(message)) // Deep clone
    })
    return originalSend(message)
  }

  try {
    // Register test agent
    registry.register({
      id: agentId,
      name: 'Test Agent',
      version: '1.0.0',
      factory: () => createTestAgent()
    })

    registry.registerTransport(transport)

    // Connect agent with plugin - handle null plugin case
    const pluginsToUse = (plugin && plugin !== null) ? [plugin] : (connectOptions.plugins || [])
    const handle = await connectAgent({
      agent: agentId,
      transport: 'dummy',
      registry,
      plugins: pluginsToUse,
      debug,
      // Disable sandboxing for tests to ensure console.log works
      features: { enableCircuitBreaker: false },
      ...connectOptions
    })

    let response: any = undefined

    // Send input if provided
    if (handleInput !== undefined) {
      response = await handle.send(handleInput)
    }

    // Clean shutdown
    await handle.shutdown()

    return {
      response,
      transportMessages,
      logs,
      errors
    }

  } catch (error) {
    errors.push(error instanceof Error ? error : new Error(String(error)))
    return {
      transportMessages,
      logs,
      errors
    }
  } finally {
    // Restore console
    console.log = originalConsoleLog
    console.debug = originalConsoleDebug
    console.info = originalConsoleInfo
    console.warn = originalConsoleWarn
    console.error = originalConsoleError
  }
}

/**
 * Create a test plugin that modifies agent responses with observable markers
 */
export function createObservablePlugin(name: string, markers: {
  onInit?: string
  onSend?: string
  onShutdown?: string
}): AgentKitPlugin {
  // Create self-contained functions that don't rely on closure variables
  const plugin: AgentKitPlugin = {
    name,
    version: '1.0.0'
  }

  if (markers.onInit) {
    // Create a self-contained function string and eval it to avoid closure issues
    const initMarker = markers.onInit
    const pluginName = name
    plugin.onInit = eval(`(function(context) {
      console.log('PLUGIN_LIFECYCLE:${pluginName}:onInit:${initMarker}:' + context.agentId)
    })`)
  }

  if (markers.onSend) {
    const sendMarker = markers.onSend  
    const pluginName = name
    plugin.onSend = eval(`(function(payload, context) {
      console.log('PLUGIN_LIFECYCLE:${pluginName}:onSend:${sendMarker}:' + JSON.stringify(payload.input))
      if (payload.metadata) {
        payload.metadata['${pluginName}_marker'] = '${sendMarker}'
      }
    })`)
  }

  if (markers.onShutdown) {
    const shutdownMarker = markers.onShutdown
    const pluginName = name
    plugin.onShutdown = eval(`(function(context) {
      console.log('PLUGIN_LIFECYCLE:${pluginName}:onShutdown:${shutdownMarker}:' + context.agentId)
    })`)
  }

  return plugin
}

/**
 * Create a plugin that attempts to breach sandbox security
 */
export function createSecurityTestPlugin(name: string): AgentKitPlugin {
  const plugin: AgentKitPlugin = {
    name,
    version: '1.0.0'
  }

  // Create self-contained function to avoid closure issues in VM sandbox
  const pluginName = name
  plugin.onInit = eval(`(function(context) {
    try {
      // Attempt global leakage
      (globalThis || {}).securityBreach = '${pluginName}_leaked'
      console.log('SECURITY_TEST:${pluginName}:attempted_global_leak')
    } catch (error) {
      console.log('SECURITY_TEST:${pluginName}:global_leak_blocked:' + (error.message || 'unknown error'))
    }

    try {
      // Attempt to access process
      const proc = (globalThis || {}).process
      if (proc) {
        console.log('SECURITY_TEST:${pluginName}:process_access_success')
      } else {
        console.log('SECURITY_TEST:${pluginName}:process_access_blocked')
      }
    } catch (error) {
      console.log('SECURITY_TEST:${pluginName}:process_access_error:' + (error.message || 'unknown error'))
    }

    try {
      // Attempt to access require
      const req = (globalThis || {}).require
      if (req) {
        console.log('SECURITY_TEST:${pluginName}:require_access_success')
      } else {
        console.log('SECURITY_TEST:${pluginName}:require_access_blocked')
      }
    } catch (error) {
      console.log('SECURITY_TEST:${pluginName}:require_access_error:' + (error.message || 'unknown error'))
    }
  })`)

  return plugin
}

/**
 * Extract plugin lifecycle events from captured logs
 */
export function extractPluginLifecycleEvents(logs: string[]): {
  init: string[]
  send: string[]
  shutdown: string[]
  security: string[]
} {
  const init: string[] = []
  const send: string[] = []
  const shutdown: string[] = []
  const security: string[] = []

  for (const log of logs) {
    if (log.includes('PLUGIN_LIFECYCLE:') && log.includes(':onInit:')) {
      init.push(log)
    } else if (log.includes('PLUGIN_LIFECYCLE:') && log.includes(':onSend:')) {
      send.push(log)
    } else if (log.includes('PLUGIN_LIFECYCLE:') && log.includes(':onShutdown:')) {
      shutdown.push(log)
    } else if (log.includes('SECURITY_TEST:')) {
      security.push(log)
    }
  }

  return { init, send, shutdown, security }
}