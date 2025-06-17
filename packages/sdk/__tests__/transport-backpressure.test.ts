import { describe, it, expect, beforeEach } from 'vitest'
import { AgentManager } from '../src/AgentManager'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'
import { TransportSendError } from '../src/errors'

describe('Transport Backpressure API', () => {
  let agent: DummyAgent
  let manager: AgentManager

  beforeEach(async () => {
    agent = new DummyAgent()
  })

  describe('Backpressure Detection', () => {
    it('should respect transport backpressure when queue is full', async () => {
      const transport = new DummyTransport({
        enableBackpressure: true,
        maxQueueSize: 2, // Very small queue
        debug: true
      })

      manager = new AgentManager(agent, transport, { debug: true }, [], 'backpressure-test')
      await manager.initialize()

      // Fill up the queue
      await manager.send({ msg: 1 })
      await manager.send({ msg: 2 })

      // Third message should fail due to backpressure
      await expect(manager.send({ msg: 3 })).rejects.toThrow('queue is full')
      await expect(manager.send({ msg: 3 })).rejects.toThrow('Cannot accept more messages')

      await manager.shutdown()
    })

    it('should allow unlimited messages when backpressure is disabled', async () => {
      const transport = new DummyTransport({
        enableBackpressure: false,
        maxQueueSize: 2 // Should be ignored
      })

      manager = new AgentManager(agent, transport, { debug: true }, [], 'no-backpressure-test')
      await manager.initialize()

      // Should be able to send many messages
      for (let i = 0; i < 10; i++) {
        await manager.send({ msg: i })
      }

      const status = manager.getTransportStatus()
      expect(status.canAcceptMore).toBe(true)

      await manager.shutdown()
    })

    it('should provide accurate queue size information', async () => {
      const transport = new DummyTransport({
        enableBackpressure: true,
        maxQueueSize: 5
      })

      manager = new AgentManager(agent, transport, { debug: true }, [], 'queue-size-test')
      await manager.initialize()

      // Initially empty
      let status = manager.getTransportStatus()
      expect(status.queueSize).toBe(0)
      expect(status.maxQueueSize).toBe(5)
      expect(status.canAcceptMore).toBe(true)

      // Send some messages
      await manager.send({ msg: 1 })
      await manager.send({ msg: 2 })

      status = manager.getTransportStatus()
      expect(status.queueSize).toBe(2)
      expect(status.canAcceptMore).toBe(true)

      await manager.shutdown()
    })
  })

  describe('Transport Status API', () => {
    it('should provide complete transport status', async () => {
      const transport = new DummyTransport({
        enableBackpressure: true,
        maxQueueSize: 10
      })

      manager = new AgentManager(agent, transport, { debug: true }, [], 'status-test')
      await manager.initialize()

      const status = manager.getTransportStatus()
      
      expect(status).toMatchObject({
        canAcceptMore: true,
        queueSize: expect.any(Number),
        maxQueueSize: 10,
        isHealthy: true,
        healthMessage: expect.any(String)
      })

      await manager.shutdown()
    })

    it('should report unhealthy status when transport is not initialized', async () => {
      const transport = new DummyTransport({
        enableBackpressure: true,
        maxQueueSize: 10
      })

      manager = new AgentManager(agent, transport, { debug: true }, [], 'unhealthy-test')
      // Don't initialize

      const status = manager.getTransportStatus()
      expect(status.isHealthy).toBe(false)
      expect(status.healthMessage).toContain('not ready')
    })

    it('should handle transports without backpressure API gracefully', async () => {
      // Create a transport without backpressure methods
      const basicTransport = {
        id: 'basic',
        name: 'Basic Transport',
        config: {},
        init: async () => {},
        send: async () => {},
        receive: async () => ({ content: null, metadata: {} })
      }

      manager = new AgentManager(agent, basicTransport, { debug: true }, [], 'basic-transport-test')
      await manager.initialize()

      // Should work fine even without backpressure methods
      await manager.send({ msg: 'test' })

      const status = manager.getTransportStatus()
      expect(status.canAcceptMore).toBe(true)
      expect(status.queueSize).toBe(0)
      expect(status.maxQueueSize).toBeUndefined()

      await manager.shutdown()
    })
  })

  describe('Backpressure Integration with BoundedExecutor', () => {
    it('should work together with bounded executor limits', async () => {
      console.time('transport-backpressure-bounded-executor')
      const transport = new DummyTransport({
        enableBackpressure: true,
        maxQueueSize: 3,
        responseDelay: 50 // Slow to create queue buildup
      })

      manager = new AgentManager(
        agent,
        transport,
        {
          debug: true,
          resourceLimits: {
            maxConcurrentRequests: 2,
            maxQueueSize: 10, // BoundedExecutor queue limit
            requestTimeoutMs: 1000
          }
        },
        [],
        'bounded-backpressure-test'
      )
      await manager.initialize()

      // Send multiple messages rapidly
      const promises = []
      for (let i = 0; i < 8; i++) {
        promises.push(
          manager.send({ msg: i }).catch(error => ({
            error: error.message,
            index: i
          }))
        )
      }

      const results = await Promise.allSettled(promises)
      
      // Some should succeed, some should fail due to backpressure
      const successes = results.filter(r => r.status === 'fulfilled').length
      const failures = results.filter(r => r.status === 'rejected').length
      
      expect(successes + failures).toBe(8)
      expect(failures).toBeGreaterThan(0) // Some should fail due to backpressure

      await manager.shutdown()
      console.timeEnd('transport-backpressure-bounded-executor')
    }, { timeout: 15000 })

    it('should handle backpressure errors gracefully during high load', async () => {
      console.time('transport-backpressure-high-load')
      const transport = new DummyTransport({
        enableBackpressure: true,
        maxQueueSize: 1, // Very tight limit
        responseDelay: 10
      })

      manager = new AgentManager(agent, transport, { debug: true }, [], 'high-load-test')
      await manager.initialize()

      const results = []
      
      // Rapid fire sending
      for (let i = 0; i < 20; i++) {
        try {
          await manager.send({ msg: i })
          results.push({ success: true, msg: i })
        } catch (error) {
          results.push({ success: false, error: error.message, msg: i })
        }
      }

      // Should have mix of successes and failures
      const successes = results.filter(r => r.success).length
      const failures = results.filter(r => !r.success).length
      
      expect(successes).toBeGreaterThan(0)
      expect(failures).toBeGreaterThan(0)
      
      // All failures should be backpressure related
      const backpressureFailures = results
        .filter(r => !r.success)
        .filter(r => r.error.includes('queue is full'))
      
      expect(backpressureFailures.length).toBe(failures)

      await manager.shutdown()
      console.timeEnd('transport-backpressure-high-load')
    }, { timeout: 15000 })
  })

  describe('Dynamic Queue Management', () => {
    it('should recover from backpressure when queue drains', async () => {
      const transport = new DummyTransport({
        enableBackpressure: true,
        maxQueueSize: 2,
        responseDelay: 10
      })

      manager = new AgentManager(agent, transport, { debug: true }, [], 'recovery-test')
      await manager.initialize()

      // Fill queue
      await manager.send({ msg: 1 })
      await manager.send({ msg: 2 })

      // Should be at capacity
      expect(manager.getTransportStatus().canAcceptMore).toBe(false)

      // Try to send another - should fail
      await expect(manager.send({ msg: 3 })).rejects.toThrow('queue is full')

      // Drain the queue by receiving messages
      await transport.receive()
      await transport.receive()

      // Should be able to send again
      expect(manager.getTransportStatus().canAcceptMore).toBe(true)
      await manager.send({ msg: 4 }) // Should succeed

      await manager.shutdown()
    })

    it('should provide real-time queue size updates', async () => {
      const transport = new DummyTransport({
        enableBackpressure: true,
        maxQueueSize: 5,
        responseDelay: 5
      })

      manager = new AgentManager(agent, transport, { debug: true }, [], 'realtime-test')
      await manager.initialize()

      // Track queue size changes
      const queueSizes = []
      
      queueSizes.push(manager.getTransportStatus().queueSize)
      
      await manager.send({ msg: 1 })
      queueSizes.push(manager.getTransportStatus().queueSize)
      
      await manager.send({ msg: 2 })
      queueSizes.push(manager.getTransportStatus().queueSize)
      
      await transport.receive()
      queueSizes.push(manager.getTransportStatus().queueSize)

      // Should show progression: 0 -> 1 -> 2 -> 1
      expect(queueSizes).toEqual([0, 1, 2, 1])

      await manager.shutdown()
    })
  })
})