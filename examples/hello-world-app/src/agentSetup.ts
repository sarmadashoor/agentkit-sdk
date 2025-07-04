/**
 * Agent Setup Module
 * 
 * Configures and initializes DummyTestAgent with different operational modes.
 * Supports plugin integration and provides clean shutdown capabilities.
 */

import { connectAgent, type AgentRuntimeHandle } from '@agentkit/sdk'
import { DummyTransport } from '@agentkit/transports-dummy'
import { 
  createDummyTestAgent, 
  type DummyTestAgentMode,
  type DummyTestAgentConfig 
} from '@agentkit/test-agent'
import type { AgentKitPlugin } from '@agentkit/types'

export interface AgentSetupOptions {
  mode: DummyTestAgentMode
  plugins?: AgentKitPlugin[]
  debug?: boolean
  config?: Partial<DummyTestAgentConfig>
}

export interface AgentSetupResult {
  handle: AgentRuntimeHandle
  transport: DummyTransport
  agentId: string
  mode: DummyTestAgentMode
  shutdown: () => Promise<void>
}

/**
 * Sets up and connects a DummyTestAgent with the specified configuration
 */
export async function setupAgent(options: AgentSetupOptions): Promise<AgentSetupResult> {
  const { mode, plugins = [], debug = false, config = {} } = options
  
  console.log(`🚀 Setting up DummyTestAgent in "${mode}" mode...`)
  
  // Create agent with mode-specific configuration
  const agentConfig: Partial<DummyTestAgentConfig> = {
    debug,
    processingDelay: 50, // Reasonable delay for demo purposes
    ...getDefaultConfigForMode(mode),
    ...config
  }
  
  const agent = createDummyTestAgent(mode, agentConfig)
  const agentId = `hello-world-${mode}-agent`
  
  // Create transport with demo-friendly settings
  const transport = new DummyTransport({
    debug,
    logMessages: debug,
    responseDelay: 20,
    maxQueueSize: 50,
    enableBackpressure: true
  })
  
  // Collect outputs and errors for demonstration
  const outputs: unknown[] = []
  const errors: Error[] = []
  
  console.log(`🔌 Connecting agent with ${plugins.length} plugin${plugins.length !== 1 ? 's' : ''}...`)
  
  // Connect agent with full configuration
  const handle = await connectAgent({
    agent,
    transport,
    plugins,
    features: { 
      sandbox: false // Disabled for development demo
    },
    resourceLimits: {
      maxConcurrentRequests: 10,
      maxQueueSize: 25,
      requestTimeoutMs: 5000
    },
    debug,
    onInit: (agentId) => {
      console.log(`✅ Agent "${agentId}" initialized successfully`)
    },
    onOutput: (output) => {
      outputs.push(output)
      if (debug) {
        console.log('📤 Agent Output:', JSON.stringify(output, null, 2))
      }
    },
    onError: (error) => {
      errors.push(error)
      console.error('❌ Agent Error:', error.message)
    },
    onShutdown: (agentId) => {
      console.log(`🛑 Agent "${agentId}" shutdown complete`)
    }
  })
  
  // Create shutdown function with cleanup
  const shutdown = async (): Promise<void> => {
    console.log(`🛑 Shutting down ${mode} agent...`)
    
    try {
      await handle.shutdown()
      console.log('✅ Agent shutdown successful')
      
      // Log final statistics
      console.log(`📊 Final Stats:`)
      console.log(`  • Outputs captured: ${outputs.length}`)
      console.log(`  • Errors encountered: ${errors.length}`)
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error)
      throw error
    }
  }
  
  console.log(`✅ Agent setup complete! Mode: ${mode}`)
  
  return {
    handle,
    transport,
    agentId,
    mode,
    shutdown
  }
}

/**
 * Get default configuration for each agent mode
 */
function getDefaultConfigForMode(mode: DummyTestAgentMode): Partial<DummyTestAgentConfig> {
  switch (mode) {
    case 'echo':
      return {
        processingDelay: 10
      }
    
    case 'fail':
      return {
        failOn: 'handle', // Default to failing on handle for demo
        failMessage: 'Demo failure simulation'
      }
    
    case 'metrics':
      return {
        emitMetrics: true,
        processingDelay: 30 // Longer delay to see metrics
      }
    
    case 'recursive':
      return {
        recursionDepth: 3,
        processingDelay: 20
      }
    
    case 'validation':
      return {
        strictValidation: true
      }
    
    case 'pluginExercise':
      return {
        processingDelay: 15
      }
    
    case 'sideEffect':
      return {
        attemptGlobalMutation: true,
        processingDelay: 25
      }
    
    default:
      return {}
  }
}

/**
 * Quick setup function for common use cases
 */
export async function quickSetup(mode: DummyTestAgentMode = 'echo'): Promise<AgentSetupResult> {
  return setupAgent({
    mode,
    debug: true
  })
}

/**
 * Get available agent modes with descriptions
 */
export function getAvailableModes(): Record<DummyTestAgentMode, string> {
  return {
    echo: 'Replies with exact input - perfect for basic validation',
    fail: 'Throws intentional errors - tests error handling',
    metrics: 'Emits fake observability signals - demonstrates monitoring',
    recursive: 'Makes recursive calls - tests concurrency limits',
    validation: 'Requires strict payload shapes - validates input/output',
    pluginExercise: 'Triggers all plugin hooks - tests plugin integration',
    sideEffect: 'Attempts global mutations - validates security guardrails'
  }
}