/**
 * Unit Tests for SnapshotAgent
 * 
 * These tests validate the SnapshotAgent implementation in isolation,
 * ensuring it behaves correctly according to the Agent interface.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SnapshotAgent } from '../src/SnapshotAgent.js'

describe('SnapshotAgent Unit Tests', () => {
  let agent: SnapshotAgent

  beforeEach(() => {
    agent = new SnapshotAgent({
      debug: false,
      maxSnapshots: 5
    })
  })

  describe('Agent Lifecycle', () => {
    it('should implement Agent interface correctly', () => {
      expect(agent.id).toBe('snapshot-agent')
      expect(agent.name).toBe('Snapshot Agent')
      expect(agent.version).toBe('1.0.0')
      expect(typeof agent.init).toBe('function')
      expect(typeof agent.handle).toBe('function')
      expect(typeof agent.shutdown).toBe('function')
    })

    it('should initialize successfully', async () => {
      expect(agent.getStats().isInitialized).toBe(false)
      
      await agent.init()
      
      expect(agent.getStats().isInitialized).toBe(true)
    })

    it('should prevent double initialization', async () => {
      await agent.init()
      
      await expect(agent.init()).rejects.toThrow('already initialized')
    })

    it('should shutdown successfully', async () => {
      await agent.init()
      expect(agent.getStats().isInitialized).toBe(true)
      
      await agent.shutdown()
      
      expect(agent.getStats().isInitialized).toBe(false)
      expect(agent.getStats().requestCount).toBe(0)
      expect(agent.getStats().snapshotCount).toBe(0)
    })

    it('should require initialization before handling requests', async () => {
      await expect(agent.handle({ action: 'list' }))
        .rejects.toThrow('must be initialized')
    })

    it('should require initialization before shutdown', async () => {
      await expect(agent.shutdown())
        .rejects.toThrow('not initialized')
    })
  })

  describe('Snapshot Operations', () => {
    beforeEach(async () => {
      await agent.init()
    })

    describe('Create Snapshots', () => {
      it('should create snapshot with auto-generated ID', async () => {
        const result = await agent.handle({
          action: 'create',
          data: { test: 'data' }
        })

        expect(result.success).toBe(true)
        expect(result.snapshotId).toBeDefined()
        expect(result.snapshotId).toMatch(/^snapshot-\d+-[a-z0-9]+$/)
        expect(agent.getStats().snapshotCount).toBe(1)
      })

      it('should create snapshot with custom ID', async () => {
        const result = await agent.handle({
          action: 'create',
          snapshotId: 'custom-snapshot',
          data: { custom: 'data' }
        })

        expect(result.success).toBe(true)
        expect(result.snapshotId).toBe('custom-snapshot')
        expect(agent.getStats().snapshotCount).toBe(1)
      })

      it('should reject create without data', async () => {
        const result = await agent.handle({
          action: 'create'
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('missing data')
        expect(agent.getStats().snapshotCount).toBe(0)
      })

      it('should enforce storage limits', async () => {
        // Fill up to the limit
        for (let i = 0; i < 5; i++) {
          await agent.handle({
            action: 'create',
            snapshotId: `snapshot-${i}`,
            data: { id: i }
          })
        }

        expect(agent.getStats().snapshotCount).toBe(5)

        // Next create should fail
        const result = await agent.handle({
          action: 'create',
          data: { overflow: true }
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('Storage limit reached')
        expect(agent.getStats().snapshotCount).toBe(5)
      })
    })

    describe('Retrieve Snapshots', () => {
      it('should retrieve existing snapshot', async () => {
        const createResult = await agent.handle({
          action: 'create',
          snapshotId: 'test-snapshot',
          data: { message: 'hello' }
        })

        expect(createResult.success).toBe(true)

        const getResult = await agent.handle({
          action: 'get',
          snapshotId: 'test-snapshot'
        })

        expect(getResult.success).toBe(true)
        expect(getResult.snapshotId).toBe('test-snapshot')
        expect(getResult.data).toEqual({ message: 'hello' })
      })

      it('should fail to retrieve non-existent snapshot', async () => {
        const result = await agent.handle({
          action: 'get',
          snapshotId: 'non-existent'
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('Snapshot not found')
      })

      it('should require snapshotId for get', async () => {
        const result = await agent.handle({
          action: 'get'
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('missing snapshotId')
      })
    })

    describe('List Snapshots', () => {
      it('should list empty snapshots initially', async () => {
        const result = await agent.handle({
          action: 'list'
        })

        expect(result.success).toBe(true)
        expect(result.snapshots).toEqual([])
      })

      it('should list all snapshot IDs', async () => {
        // Create multiple snapshots
        const ids = ['snap-1', 'snap-2', 'snap-3']
        for (const id of ids) {
          await agent.handle({
            action: 'create',
            snapshotId: id,
            data: { id }
          })
        }

        const result = await agent.handle({
          action: 'list'
        })

        expect(result.success).toBe(true)
        expect(result.snapshots).toEqual(expect.arrayContaining(ids))
        expect(result.snapshots).toHaveLength(3)
      })
    })

    describe('Delete Snapshots', () => {
      it('should delete existing snapshot', async () => {
        await agent.handle({
          action: 'create',
          snapshotId: 'to-delete',
          data: { temp: true }
        })

        expect(agent.getStats().snapshotCount).toBe(1)

        const result = await agent.handle({
          action: 'delete',
          snapshotId: 'to-delete'
        })

        expect(result.success).toBe(true)
        expect(result.snapshotId).toBe('to-delete')
        expect(agent.getStats().snapshotCount).toBe(0)
      })

      it('should fail to delete non-existent snapshot', async () => {
        const result = await agent.handle({
          action: 'delete',
          snapshotId: 'non-existent'
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('Snapshot not found')
      })

      it('should require snapshotId for delete', async () => {
        const result = await agent.handle({
          action: 'delete'
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('missing snapshotId')
      })
    })

    describe('Process Data', () => {
      it('should process data without storing', async () => {
        const inputData = { message: 'process me' }
        
        const result = await agent.handle({
          action: 'process',
          data: inputData
        })

        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()
        expect(result.data.originalData).toEqual(inputData)
        expect(result.data.processingInfo).toBeDefined()
        expect(result.data.processingInfo.agent).toBe('Snapshot Agent')
        
        // Should not store snapshot
        expect(agent.getStats().snapshotCount).toBe(0)
      })

      it('should require data for process', async () => {
        const result = await agent.handle({
          action: 'process'
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('missing data')
      })
    })
  })

  describe('Input Validation', () => {
    beforeEach(async () => {
      await agent.init()
    })

    it('should reject non-object input', async () => {
      const inputs = [null, undefined, 'string', 123, true]
      
      for (const input of inputs) {
        const result = await agent.handle(input)
        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid request format')
      }
      
      // Arrays are objects but missing action field, so different error
      const result = await agent.handle([])
      expect(result.success).toBe(false)
      expect(result.error).toContain('Missing required field: action')
    })

    it('should reject requests without action', async () => {
      const result = await agent.handle({
        data: { test: 'data' }
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Missing required field: action')
    })

    it('should reject unknown actions', async () => {
      const result = await agent.handle({
        action: 'unknown-action'
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unknown action: unknown-action')
    })
  })

  describe('Error Handling', () => {
    beforeEach(async () => {
      await agent.init()
    })

    it('should return proper error response format', async () => {
      const result = await agent.handle({
        action: 'get',
        snapshotId: 'non-existent'
      })

      expect(result).toMatchObject({
        success: false,
        error: expect.any(String),
        timestamp: expect.any(Number),
        agentVersion: '1.0.0'
      })
    })

    it('should handle unexpected errors gracefully', async () => {
      // Force an error by corrupting internal state
      const originalMap = agent['snapshots']
      agent['snapshots'] = null as any

      const result = await agent.handle({
        action: 'list'
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()

      // Restore for cleanup
      agent['snapshots'] = originalMap
    })
  })

  describe('Agent Statistics', () => {
    it('should track request count', async () => {
      await agent.init()
      
      expect(agent.getStats().requestCount).toBe(0)

      await agent.handle({ action: 'list' })
      expect(agent.getStats().requestCount).toBe(1)

      await agent.handle({ action: 'list' })
      expect(agent.getStats().requestCount).toBe(2)
    })

    it('should track snapshot count', async () => {
      await agent.init()
      
      expect(agent.getStats().snapshotCount).toBe(0)

      await agent.handle({
        action: 'create',
        data: { test: 'data' }
      })
      expect(agent.getStats().snapshotCount).toBe(1)

      await agent.handle({
        action: 'create',
        data: { test: 'data2' }
      })
      expect(agent.getStats().snapshotCount).toBe(2)
    })

    it('should provide complete stats', async () => {
      await agent.init()
      
      const stats = agent.getStats()
      
      expect(stats).toMatchObject({
        isInitialized: true,
        requestCount: expect.any(Number),
        snapshotCount: expect.any(Number),
        maxSnapshots: expect.any(Number)
      })
    })
  })
})