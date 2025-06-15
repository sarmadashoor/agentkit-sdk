/**
 * Snapshot Agent Integration Example
 * 
 * This file demonstrates how a real-world application would integrate
 * with the AgentKit SDK. It shows the complete lifecycle:
 * - SDK initialization
 * - Agent registration
 * - Transport setup
 * - Plugin configuration
 * - Message handling
 * - Error handling
 * - Proper shutdown
 */

// IMPORTANT: Only importing from public SDK APIs
import { 
  connectAgent, 
  AgentRegistry,
  type AgentRuntimeHandle,
  type AgentKitPlugin
} from '@agentkit/sdk'

import { SnapshotAgent } from './SnapshotAgent.js'
import { MockTransport } from './MockTransport.js'
import { SnapshotLoggingPlugin } from './SnapshotLoggingPlugin.js'

export interface SnapshotServiceConfig {
  /** Enable debug logging */
  debug?: boolean
  /** Transport configuration */
  transport?: 'reliable' | 'unreliable' | 'slow'
  /** Max snapshots to store */
  maxSnapshots?: number
  /** Enable custom logging plugin */
  enableCustomLogging?: boolean
}

export class SnapshotService {
  private handle?: AgentRuntimeHandle
  private registry: AgentRegistry
  private config: Required<SnapshotServiceConfig>

  constructor(config: SnapshotServiceConfig = {}) {
    this.config = {
      debug: config.debug ?? false,
      transport: config.transport ?? 'reliable',
      maxSnapshots: config.maxSnapshots ?? 50,
      enableCustomLogging: config.enableCustomLogging ?? true
    }

    this.registry = new AgentRegistry()
  }

  /**
   * Initialize the snapshot service
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Snapshot Service...')

    // 1. Create and register the snapshot agent
    const snapshotAgent = new SnapshotAgent({
      scope: ['read', 'write'],
      techStack: 'node.js',
      maxSnapshots: this.config.maxSnapshots,
      debug: this.config.debug
    })

    this.registry.register({
      id: 'snapshot-agent',
      name: 'Snapshot Agent',
      version: '1.0.0',
      factory: () => snapshotAgent,
      supportedScopes: ['read', 'write']
    })

    // 2. Create and register the transport
    let transport: MockTransport
    switch (this.config.transport) {
      case 'reliable':
        transport = MockTransport.createReliableTransport()
        break
      case 'unreliable':
        transport = new MockTransport({ failureRate: 0.3 })
        break
      case 'slow':
        transport = MockTransport.createSlowTransport()
        break
      default:
        transport = MockTransport.createReliableTransport()
    }

    this.registry.registerTransport(transport)

    // 3. Setup plugins
    const plugins: AgentKitPlugin[] = []
    
    if (this.config.enableCustomLogging) {
      const loggingPlugin = new SnapshotLoggingPlugin({
        logLevel: this.config.debug ? 'debug' : 'info',
        includePayloads: this.config.debug,
        enableMetrics: true
      })
      plugins.push(loggingPlugin)
    }

    // 4. Connect to the agent using the SDK
    try {
      this.handle = await connectAgent({
        agent: 'snapshot-agent',
        transport: 'mock-transport',
        registry: this.registry,
        scope: ['read', 'write'],
        debug: this.config.debug,
        plugins,
        // Lifecycle hooks
        onInit: (agentId) => {
          console.log(`✅ Agent ${agentId} initialized successfully`)
        },
        onShutdown: (agentId) => {
          console.log(`🔄 Agent ${agentId} shutdown complete`)
        },
        onError: (error) => {
          console.error(`💥 Agent error:`, error.message)
        }
      })

      console.log('✅ Snapshot Service initialized successfully')
      
    } catch (error) {
      console.error('❌ Failed to initialize Snapshot Service:', error)
      throw error
    }
  }

  /**
   * Create a new snapshot
   */
  async createSnapshot(data: unknown, snapshotId?: string): Promise<any> {
    if (!this.handle) {
      throw new Error('Service not initialized. Call initialize() first.')
    }

    try {
      await this.handle.send({
        action: 'create',
        snapshotId,
        data,
        metadata: {
          createdBy: 'snapshot-service',
          timestamp: Date.now()
        }
      })

      console.log(`📸 Snapshot created successfully: ${snapshotId || 'auto-generated'}`)
      
    } catch (error) {
      console.error('❌ Failed to create snapshot:', error)
      throw error
    }
  }

  /**
   * Retrieve a snapshot
   */
  async getSnapshot(snapshotId: string): Promise<any> {
    if (!this.handle) {
      throw new Error('Service not initialized. Call initialize() first.')
    }

    try {
      await this.handle.send({
        action: 'get',
        snapshotId
      })

      console.log(`📖 Retrieved snapshot: ${snapshotId}`)
      
    } catch (error) {
      console.error(`❌ Failed to get snapshot ${snapshotId}:`, error)
      throw error
    }
  }

  /**
   * List all snapshots
   */
  async listSnapshots(): Promise<string[]> {
    if (!this.handle) {
      throw new Error('Service not initialized. Call initialize() first.')
    }

    try {
      await this.handle.send({
        action: 'list'
      })

      console.log('📋 Listed all snapshots')
      return [] // In a real implementation, you'd return the actual list
      
    } catch (error) {
      console.error('❌ Failed to list snapshots:', error)
      throw error
    }
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    if (!this.handle) {
      throw new Error('Service not initialized. Call initialize() first.')
    }

    try {
      await this.handle.send({
        action: 'delete',
        snapshotId
      })

      console.log(`🗑️ Deleted snapshot: ${snapshotId}`)
      
    } catch (error) {
      console.error(`❌ Failed to delete snapshot ${snapshotId}:`, error)
      throw error
    }
  }

  /**
   * Process data without storing
   */
  async processData(data: unknown): Promise<any> {
    if (!this.handle) {
      throw new Error('Service not initialized. Call initialize() first.')
    }

    try {
      await this.handle.send({
        action: 'process',
        data
      })

      console.log('⚙️ Data processed successfully')
      
    } catch (error) {
      console.error('❌ Failed to process data:', error)
      throw error
    }
  }

  /**
   * Shutdown the service gracefully
   */
  async shutdown(): Promise<void> {
    if (!this.handle) {
      console.log('ℹ️ Service was not initialized, nothing to shutdown')
      return
    }

    try {
      console.log('🔄 Shutting down Snapshot Service...')
      await this.handle.shutdown()
      this.handle = undefined
      console.log('✅ Snapshot Service shutdown complete')
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error)
      throw error
    }
  }

  /**
   * Get service status
   */
  getStatus(): { initialized: boolean; agentId?: string; transportId?: string } {
    if (!this.handle) {
      return { initialized: false }
    }

    return {
      initialized: true,
      agentId: this.handle.metadata.agentId,
      transportId: this.handle.metadata.transportId
    }
  }
}

/**
 * Example usage demonstration
 */
export async function demonstrateSnapshotService(): Promise<void> {
  console.log('\n🔥 Starting Snapshot Service Demonstration\n')

  const service = new SnapshotService({
    debug: true,
    transport: 'reliable',
    enableCustomLogging: true
  })

  try {
    // Initialize the service
    await service.initialize()

    // Demonstrate various operations
    await service.createSnapshot({ 
      message: 'Hello, World!',
      timestamp: Date.now() 
    }, 'demo-snapshot-1')

    await service.createSnapshot({ 
      data: [1, 2, 3, 4, 5],
      metadata: { type: 'array' } 
    })

    await service.listSnapshots()
    
    await service.getSnapshot('demo-snapshot-1')
    
    await service.processData({
      complex: {
        nested: {
          data: 'structure'
        }
      }
    })

    // Demonstrate error handling
    try {
      await service.getSnapshot('non-existent-snapshot')
    } catch (error) {
      console.log('✅ Error handling working correctly')
    }

    await service.deleteSnapshot('demo-snapshot-1')

  } catch (error) {
    console.error('Demo failed:', error)
  } finally {
    // Always shutdown gracefully
    await service.shutdown()
  }

  console.log('\n🎉 Snapshot Service Demonstration Complete\n')
}

// Run the demonstration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateSnapshotService().catch(console.error)
}