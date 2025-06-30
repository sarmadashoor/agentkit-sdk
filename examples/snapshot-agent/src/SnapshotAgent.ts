/**
 * SnapshotAgent - A realistic example of how external teams would implement
 * agents that integrate with the AgentKit SDK
 * 
 * This agent simulates a "snapshot" service that can:
 * - Take snapshots of data/state
 * - Store and retrieve snapshots
 * - Perform basic data processing
 */

// IMPORTANT: Only importing from public SDK API
import type { Agent } from '@agentkit/sdk'

export interface SnapshotAgentConfig {
  /** Agent scope capabilities */
  scope?: string[]
  /** Tech stack identifier */
  techStack?: string
  /** Maximum number of snapshots to store */
  maxSnapshots?: number
  /** Enable debug logging */
  debug?: boolean
}

export interface SnapshotRequest {
  action: 'create' | 'get' | 'list' | 'delete' | 'process'
  snapshotId?: string
  data?: unknown
  metadata?: Record<string, unknown>
}

export interface SnapshotResponse {
  success: boolean
  snapshotId?: string
  data?: unknown
  snapshots?: string[]
  error?: string
  timestamp: number
  agentVersion: string
}

interface StoredSnapshot {
  id: string
  data: unknown
  metadata: Record<string, unknown>
  createdAt: number
}

export class SnapshotAgent implements Agent {
  readonly id = 'snapshot-agent'
  readonly name = 'Snapshot Agent'
  readonly version = '1.0.0'
  
  private config: Required<SnapshotAgentConfig>
  private isInitialized = false
  private snapshots = new Map<string, StoredSnapshot>()
  private requestCount = 0

  constructor(config: SnapshotAgentConfig = {}) {
    this.config = {
      scope: config.scope ?? ['read', 'write'],
      techStack: config.techStack ?? 'node.js',
      maxSnapshots: config.maxSnapshots ?? 100,
      debug: config.debug ?? false
    }
  }

  async init(agentConfig?: unknown): Promise<void> {
    if (this.isInitialized) {
      throw new Error('SnapshotAgent is already initialized')
    }

    if (this.config.debug) {
      console.log('[SnapshotAgent] Initializing with config:', {
        ...this.config,
        agentConfig
      })
    }

    // Simulate some initialization work
    await new Promise(resolve => setTimeout(resolve, 50))

    // Validate configuration
    if (this.config.maxSnapshots < 1) {
      throw new Error('maxSnapshots must be at least 1')
    }

    this.isInitialized = true
    
    if (this.config.debug) {
      console.log('[SnapshotAgent] Successfully initialized')
    }
  }

  async handle(input: unknown): Promise<SnapshotResponse> {
    if (!this.isInitialized) {
      throw new Error('SnapshotAgent must be initialized before handling requests')
    }

    this.requestCount++
    const requestId = `req-${this.requestCount}-${Date.now()}`

    if (this.config.debug) {
      console.log(`[SnapshotAgent] Handling request ${requestId}:`, input)
    }

    // Validate input format - throw for validation errors so they propagate to handle.send()
    if (!input || typeof input !== 'object') {
      throw new Error('Invalid request format: expected object')
    }

    const request = input as SnapshotRequest

    if (!request.action) {
      throw new Error('Missing required field: action')
    }

    // Process the request based on action
    let result: SnapshotResponse

    switch (request.action) {
      case 'create':
        result = await this.createSnapshot(request)
        break
      case 'get':
        result = await this.getSnapshot(request)
        break
      case 'list':
        result = await this.listSnapshots(request)
        break
      case 'delete':
        result = await this.deleteSnapshot(request)
        break
      case 'process':
        result = await this.processData(request)
        break
      default:
        throw new Error(`Unknown action: ${request.action}`)
    }

    if (this.config.debug) {
      console.log(`[SnapshotAgent] Request ${requestId} completed successfully`)
    }

    return result
  }

  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('SnapshotAgent is not initialized')
    }

    if (this.config.debug) {
      console.log('[SnapshotAgent] Shutting down...', {
        totalRequests: this.requestCount,
        storedSnapshots: this.snapshots.size
      })
    }

    // Cleanup resources but preserve stats for debugging
    this.snapshots.clear()
    // Don't reset requestCount - keep stats for debugging
    this.isInitialized = false

    if (this.config.debug) {
      console.log('[SnapshotAgent] Successfully shut down')
    }
  }

  /**
   * Get agent statistics
   */
  getStats() {
    return {
      isInitialized: this.isInitialized,
      requestCount: this.requestCount,
      snapshotCount: this.snapshots.size,
      maxSnapshots: this.config.maxSnapshots
    }
  }

  // Private methods for handling different actions

  private async createSnapshot(request: SnapshotRequest): Promise<SnapshotResponse> {
    if (!request.data) {
      throw new Error('Cannot create snapshot: missing data')
    }

    // Check storage limits
    if (this.snapshots.size >= this.config.maxSnapshots) {
      throw new Error(`Storage limit reached: maximum ${this.config.maxSnapshots} snapshots`)
    }

    const snapshotId = request.snapshotId || `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`
    
    const snapshot: StoredSnapshot = {
      id: snapshotId,
      data: request.data,
      metadata: request.metadata || {},
      createdAt: Date.now()
    }

    this.snapshots.set(snapshotId, snapshot)

    return {
      success: true,
      snapshotId,
      timestamp: Date.now(),
      agentVersion: this.version
    }
  }

  private async getSnapshot(request: SnapshotRequest): Promise<SnapshotResponse> {
    if (!request.snapshotId) {
      throw new Error('Cannot get snapshot: missing snapshotId')
    }

    const snapshot = this.snapshots.get(request.snapshotId)
    
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${request.snapshotId}`)
    }

    return {
      success: true,
      snapshotId: snapshot.id,
      data: snapshot.data,
      timestamp: Date.now(),
      agentVersion: this.version
    }
  }

  private async listSnapshots(request: SnapshotRequest): Promise<SnapshotResponse> {
    const snapshots = Array.from(this.snapshots.keys())

    return {
      success: true,
      snapshots,
      timestamp: Date.now(),
      agentVersion: this.version
    }
  }

  private async deleteSnapshot(request: SnapshotRequest): Promise<SnapshotResponse> {
    if (!request.snapshotId) {
      throw new Error('Cannot delete snapshot: missing snapshotId')
    }

    const existed = this.snapshots.delete(request.snapshotId)
    
    if (!existed) {
      throw new Error(`Snapshot not found: ${request.snapshotId}`)
    }

    return {
      success: true,
      snapshotId: request.snapshotId,
      timestamp: Date.now(),
      agentVersion: this.version
    }
  }

  private async processData(request: SnapshotRequest): Promise<SnapshotResponse> {
    if (!request.data) {
      throw new Error('Cannot process: missing data')
    }

    // Simulate some data processing
    await new Promise(resolve => setTimeout(resolve, 100))

    const processed = {
      originalData: request.data,
      processedAt: Date.now(),
      processingInfo: {
        type: typeof request.data,
        size: JSON.stringify(request.data).length,
        agent: this.name,
        version: this.version
      }
    }

    return {
      success: true,
      data: processed,
      timestamp: Date.now(),
      agentVersion: this.version
    }
  }
}