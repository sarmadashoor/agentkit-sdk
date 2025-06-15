/**
 * Example TypeScript plugin demonstrating type-safe plugin development
 * This example shows how to create a fully type-safe plugin using the
 * AgentKit plugin system with proper TypeScript validation.
 */

import type { AgentKitPlugin, AgentContext, SendPayload } from '@agentkit/types'

/**
 * Example: Request Logging Plugin
 * Logs all agent requests with timestamps and metadata
 */
export const requestLoggingPlugin: AgentKitPlugin = {
  name: 'request-logger',
  version: '1.0.0',
  description: 'Logs all agent requests for debugging and monitoring',

  onInit(context: AgentContext): void {
    console.log(`[RequestLogger] Agent ${context.agentId} initialized at ${new Date(context.timestamp).toISOString()}`)
  },

  onSend(payload: SendPayload, context: AgentContext): void {
    console.log(`[RequestLogger] Request ${context.requestId}:`, {
      agentId: context.agentId,
      transportId: context.transportId,
      input: payload.input,
      metadata: payload.metadata,
      timestamp: new Date(context.timestamp).toISOString()
    })
  },

  onError(error: Error, context: AgentContext): void {
    console.error(`[RequestLogger] Error in ${context.agentId}:`, {
      requestId: context.requestId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date(context.timestamp).toISOString()
    })
  },

  onShutdown(context: AgentContext): void {
    console.log(`[RequestLogger] Agent ${context.agentId} shutting down at ${new Date(context.timestamp).toISOString()}`)
  }
}

/**
 * Example: Async Performance Monitoring Plugin
 * Demonstrates async plugin hooks with proper TypeScript typing
 */
export const performanceMonitorPlugin: AgentKitPlugin = {
  name: 'performance-monitor',
  version: '2.0.0',
  description: 'Monitors agent performance metrics asynchronously',

  async onInit(context: AgentContext): Promise<void> {
    // Simulate async initialization (e.g., connecting to metrics service)
    await new Promise(resolve => setTimeout(resolve, 10))
    console.log(`[PerfMonitor] Started monitoring for agent ${context.agentId}`)
  },

  async onSend(payload: SendPayload, context: AgentContext): Promise<void> {
    const startTime = Date.now()
    
    // Simulate async processing
    await new Promise(resolve => setTimeout(resolve, 5))
    
    const processingTime = Date.now() - startTime
    console.log(`[PerfMonitor] Request ${context.requestId} processed in ${processingTime}ms`)
    
    // Type-safe access to payload properties
    const inputSize = typeof payload.input === 'string' 
      ? payload.input.length 
      : JSON.stringify(payload.input).length
    
    console.log(`[PerfMonitor] Input size: ${inputSize} characters`)
  },

  async onError(error: Error, context: AgentContext): Promise<void> {
    // Async error reporting
    await new Promise(resolve => setTimeout(resolve, 5))
    console.error(`[PerfMonitor] Error tracked for ${context.agentId}: ${error.message}`)
  },

  async onShutdown(context: AgentContext): Promise<void> {
    // Async cleanup
    await new Promise(resolve => setTimeout(resolve, 10))
    console.log(`[PerfMonitor] Monitoring stopped for agent ${context.agentId}`)
  }
}

/**
 * Example: Conditional Plugin with Metadata Validation
 * Shows how to use TypeScript for runtime type checking
 */
export const metadataValidatorPlugin: AgentKitPlugin = {
  name: 'metadata-validator',
  version: '1.2.0',
  description: 'Validates request metadata against predefined schemas',

  onSend(payload: SendPayload, context: AgentContext): void {
    // Type-safe metadata validation
    const metadata = payload.metadata
    
    // Required fields validation
    if (!metadata.userId || typeof metadata.userId !== 'string') {
      throw new Error(`Invalid userId in metadata: expected string, got ${typeof metadata.userId}`)
    }
    
    if (!metadata.sessionId || typeof metadata.sessionId !== 'string') {
      throw new Error(`Invalid sessionId in metadata: expected string, got ${typeof metadata.sessionId}`)
    }
    
    // Optional field validation
    if (metadata.priority && !['low', 'medium', 'high'].includes(metadata.priority as string)) {
      throw new Error(`Invalid priority: ${metadata.priority}. Must be 'low', 'medium', or 'high'`)
    }
    
    console.log(`[MetadataValidator] Validation passed for request ${context.requestId}`)
  },

  onError(error: Error, context: AgentContext): void {
    if (error.message.includes('Invalid')) {
      console.error(`[MetadataValidator] Validation error in ${context.requestId}: ${error.message}`)
    }
  }
}

/**
 * Example: Feature Flag Plugin
 * Demonstrates conditional behavior based on agent context
 */
export const featureFlagPlugin: AgentKitPlugin = {
  name: 'feature-flags',
  version: '1.0.0',
  description: 'Manages feature flags for agent requests',

  onSend(payload: SendPayload, context: AgentContext): void {
    // Type-safe access to context metadata
    const enabledFeatures = context.metadata?.features as string[] | undefined
    
    if (enabledFeatures && Array.isArray(enabledFeatures)) {
      console.log(`[FeatureFlags] Agent ${context.agentId} has features: ${enabledFeatures.join(', ')}`)
      
      // Feature-specific logic
      if (enabledFeatures.includes('enhanced-logging')) {
        console.log(`[FeatureFlags] Enhanced logging enabled for ${context.requestId}`)
        console.log(`[FeatureFlags] Full payload:`, JSON.stringify(payload, null, 2))
      }
      
      if (enabledFeatures.includes('rate-limiting')) {
        console.log(`[FeatureFlags] Rate limiting enabled for ${context.agentId}`)
        // Could implement rate limiting logic here
      }
    }
  }
}

/**
 * Type-safe plugin factory function
 * Demonstrates how to create plugins with configuration
 */
export function createConfigurableLoggingPlugin(config: {
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  includeMetadata: boolean
  maxLogLength: number
}): AgentKitPlugin {
  return {
    name: 'configurable-logger',
    version: '1.0.0',
    description: `Configurable logging plugin with level: ${config.logLevel}`,

    onSend(payload: SendPayload, context: AgentContext): void {
      if (config.logLevel === 'debug') {
        let logMessage = `[ConfigLogger] ${context.requestId}: ${JSON.stringify(payload.input)}`
        
        if (logMessage.length > config.maxLogLength) {
          logMessage = logMessage.substring(0, config.maxLogLength) + '...'
        }
        
        console.log(logMessage)
        
        if (config.includeMetadata) {
          console.log(`[ConfigLogger] Metadata:`, payload.metadata)
        }
      }
    },

    onError(error: Error, context: AgentContext): void {
      if (['debug', 'info', 'warn', 'error'].includes(config.logLevel)) {
        console.error(`[ConfigLogger] Error in ${context.requestId}: ${error.message}`)
      }
    }
  }
}

/**
 * Example usage and type validation
 */
export function demonstrateTypeSafety(): void {
  // ✅ Valid plugins - TypeScript will validate these at compile time
  const validPlugins: AgentKitPlugin[] = [
    requestLoggingPlugin,
    performanceMonitorPlugin,
    metadataValidatorPlugin,
    featureFlagPlugin
  ]

  // ✅ Valid plugin creation with configuration
  const configurablePlugin = createConfigurableLoggingPlugin({
    logLevel: 'debug',
    includeMetadata: true,
    maxLogLength: 1000
  })

  console.log(`Created ${validPlugins.length} valid plugins`)
  console.log(`Configurable plugin: ${configurablePlugin.name}`)

  // ✅ Type-safe plugin registration (would be used with PluginManager)
  // pluginManager.register(requestLoggingPlugin)
  // pluginManager.register(configurablePlugin)

  // ❌ The following would cause TypeScript compilation errors:
  
  /*
  const invalidPlugin1: AgentKitPlugin = {
    name: 'invalid',
    version: '1.0.0',
    onInit(wrongParam: string) { // ❌ Error: wrong parameter type
      console.log(wrongParam)
    }
  }

  const invalidPlugin2: AgentKitPlugin = {
    name: 'invalid',
    version: '1.0.0',
    onSend(payload: SendPayload, context: AgentContext): string { // ❌ Error: wrong return type
      return 'invalid'
    }
  }

  const invalidPlugin3: AgentKitPlugin = {
    // ❌ Error: missing required 'name' and 'version' properties
    onInit(context: AgentContext) {
      console.log(context.agentId)
    }
  }
  */
}

// Export for use in examples
export default {
  requestLoggingPlugin,
  performanceMonitorPlugin,
  metadataValidatorPlugin,
  featureFlagPlugin,
  createConfigurableLoggingPlugin,
  demonstrateTypeSafety
}