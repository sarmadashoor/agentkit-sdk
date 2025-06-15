/**
 * Chaos Test Plugin Suite
 * Collection of misbehaving plugins for testing fault tolerance
 */

import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'

/**
 * Plugin that throws errors during initialization
 */
export const FaultyPlugin: AgentKitPlugin = {
  name: 'FaultyPlugin',
  version: '1.0.0',
  onInit: (context: AgentContext) => {
    throw new Error(`FaultyPlugin intentionally crashed during onInit for agent ${context.agentId}`)
  },
  onSend: (payload: SendPayload, context: AgentContext) => {
    throw new Error(`FaultyPlugin intentionally crashed during onSend for agent ${context.agentId}`)
  },
  onError: (error: Error, context: AgentContext) => {
    throw new Error(`FaultyPlugin intentionally crashed during onError for agent ${context.agentId}: ${error.message}`)
  },
  onShutdown: (context: AgentContext) => {
    throw new Error(`FaultyPlugin intentionally crashed during onShutdown for agent ${context.agentId}`)
  }
}

/**
 * Plugin that introduces delays to test timeout handling
 */
export const SlowPlugin: AgentKitPlugin = {
  name: 'SlowPlugin',
  version: '1.0.0',
  onInit: async (context: AgentContext) => {
    await new Promise(resolve => setTimeout(resolve, 100)) // Small delay for init
  },
  onSend: async (payload: SendPayload, context: AgentContext) => {
    await new Promise(resolve => setTimeout(resolve, 2000)) // Long delay that might timeout
  },
  onError: async (error: Error, context: AgentContext) => {
    await new Promise(resolve => setTimeout(resolve, 50)) // Small delay for error handling
  },
  onShutdown: async (context: AgentContext) => {
    await new Promise(resolve => setTimeout(resolve, 200)) // Moderate delay for shutdown
  }
}

/**
 * Plugin that attempts to make recursive calls to SDK methods
 * This should be blocked by the recursive call protection
 */
export class ReentrantPlugin implements AgentKitPlugin {
  name = 'ReentrantPlugin'
  version = '1.0.0'
  
  // Store reference to agent manager for recursive calls
  private agentManager: any = null
  private connectAgent: any = null

  constructor(agentManager?: any, connectAgent?: any) {
    this.agentManager = agentManager
    this.connectAgent = connectAgent
  }

  onInit = (context: AgentContext) => {
    // Attempt recursive connectAgent call
    if (this.connectAgent) {
      try {
        this.connectAgent({
          agent: 'dummy-agent',
          transport: 'dummy-transport'
        })
      } catch (error) {
        // Expected to be blocked
      }
    }
  }

  onSend = (payload: SendPayload, context: AgentContext) => {
    // Attempt recursive send call
    if (this.agentManager && this.agentManager.send) {
      try {
        this.agentManager.send({ message: 'recursive call' })
      } catch (error) {
        // Expected to be blocked
      }
    }
  }

  onError = (error: Error, context: AgentContext) => {
    // Attempt recursive operation during error handling
    if (this.agentManager && this.agentManager.getState) {
      try {
        this.agentManager.getState()
      } catch (error) {
        // Expected to be blocked
      }
    }
  }

  onShutdown = (context: AgentContext) => {
    // Attempt recursive shutdown call
    if (this.agentManager && this.agentManager.shutdown) {
      try {
        this.agentManager.shutdown()
      } catch (error) {
        // Expected to be blocked
      }
    }
  }
}

/**
 * Plugin that modifies its input parameters to test immutability
 */
export const MutatingPlugin: AgentKitPlugin = {
  name: 'MutatingPlugin',
  version: '1.0.0',
  onInit: (context: AgentContext) => {
    try {
      ;(context as any).agentId = 'HACKED'
      ;(context as any).maliciousData = 'injected'
    } catch (error) {
      // Mutations should be prevented by immutability protection
    }
  },
  onSend: (payload: SendPayload, context: AgentContext) => {
    try {
      ;(payload as any).input = { hacked: true }
      ;(payload as any).metadata = { compromised: true }
      ;(context as any).agentId = 'COMPROMISED'
    } catch (error) {
      // Mutations should be prevented by immutability protection
    }
  },
  onError: (error: Error, context: AgentContext) => {
    try {
      ;(error as any).message = 'Error message hijacked'
      ;(context as any).transportId = 'HIJACKED'
    } catch (error) {
      // Mutations should be prevented by immutability protection
    }
  },
  onShutdown: (context: AgentContext) => {
    try {
      ;(context as any).agentId = 'SHUTDOWN_HIJACKED'
    } catch (error) {
      // Mutations should be prevented by immutability protection
    }
  }
}

/**
 * Plugin that hangs indefinitely to test timeout handling
 */
export const HangingPlugin: AgentKitPlugin = {
  name: 'HangingPlugin',
  version: '1.0.0',
  onInit: async (context: AgentContext) => {
    // Hang indefinitely
    await new Promise(() => {}) // Never resolves
  },
  onSend: async (payload: SendPayload, context: AgentContext) => {
    // Hang indefinitely
    await new Promise(() => {}) // Never resolves
  },
  onError: async (error: Error, context: AgentContext) => {
    // Hang indefinitely
    await new Promise(() => {}) // Never resolves
  },
  onShutdown: async (context: AgentContext) => {
    // Hang indefinitely
    await new Promise(() => {}) // Never resolves
  }
}

/**
 * Plugin that throws different types of errors for comprehensive testing
 */
export const MultiErrorPlugin: AgentKitPlugin = {
  name: 'MultiErrorPlugin',
  version: '1.0.0',
  onInit: (context: AgentContext) => {
    const errors = [
      new TypeError('Type error in plugin'),
      new RangeError('Range error in plugin'),
      new ReferenceError('Reference error in plugin'),
      new Error('Generic error in plugin')
    ]
    throw errors[Math.floor(Math.random() * errors.length)]
  },
  onSend: (payload: SendPayload, context: AgentContext) => {
    throw new Error(`Multi-error plugin failed with payload: ${JSON.stringify(payload)}`)
  },
  onError: (error: Error, context: AgentContext) => {
    throw new Error(`Multi-error plugin cascade: ${error.message}`)
  },
  onShutdown: (context: AgentContext) => {
    throw new Error('Multi-error plugin shutdown failure')
  }
}

/**
 * Plugin that behaves properly (control group)
 */
export const WellBehavedPlugin: AgentKitPlugin = {
  name: 'WellBehavedPlugin',
  version: '1.0.0',
  onInit: (context: AgentContext) => {
    // Do nothing, behave properly
  },
  onSend: (payload: SendPayload, context: AgentContext) => {
    // Do nothing, behave properly
  },
  onError: (error: Error, context: AgentContext) => {
    // Do nothing, behave properly
  },
  onShutdown: (context: AgentContext) => {
    // Do nothing, behave properly
  }
}

/**
 * Plugin execution tracker for testing
 */
export class PluginExecutionTracker {
  private executions: Array<{
    pluginName: string
    hookName: string
    timestamp: number
    success: boolean
    error?: Error
    duration: number
    isolated: boolean
  }> = []

  logExecution(
    pluginName: string, 
    hookName: string, 
    success: boolean, 
    duration: number,
    isolated: boolean,
    error?: Error
  ) {
    this.executions.push({
      pluginName,
      hookName,
      timestamp: Date.now(),
      success,
      error,
      duration,
      isolated
    })

    const status = success ? 'complete' : 'failed'
    const isolation = isolated ? '(isolated)' : '(not isolated)'
    const delayed = duration > 1000 ? '(delayed)' : ''
    
    console.log(`Executed plugin: ${pluginName} - ${status} ${isolation} ${delayed}`)
  }

  getExecutions() {
    return [...this.executions]
  }

  getExecutionsByPlugin(pluginName: string) {
    return this.executions.filter(e => e.pluginName === pluginName)
  }

  getFailedExecutions() {
    return this.executions.filter(e => !e.success)
  }

  getSuccessfulExecutions() {
    return this.executions.filter(e => e.success)
  }

  reset() {
    this.executions = []
  }

  getStats() {
    return {
      total: this.executions.length,
      successful: this.getSuccessfulExecutions().length,
      failed: this.getFailedExecutions().length,
      isolated: this.executions.filter(e => e.isolated).length,
      averageDuration: this.executions.length > 0 
        ? this.executions.reduce((sum, e) => sum + e.duration, 0) / this.executions.length 
        : 0
    }
  }
}

/**
 * Factory function to create chaos plugins for testing
 */
export function createChaosPluginSuite() {
  return {
    FaultyPlugin,
    SlowPlugin,
    ReentrantPlugin,
    MutatingPlugin,
    HangingPlugin,
    MultiErrorPlugin,
    WellBehavedPlugin,
    PluginExecutionTracker
  }
}