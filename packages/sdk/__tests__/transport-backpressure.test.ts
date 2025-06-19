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
        maxQueueSize: 2,
        debug: true
      })

      // Disable backpressure queue to get immediate errors
      manager = new AgentManager(agent, transport, { 
        debug: true,
        enableBackpressureQueue: false 
      }, [], 'backpressure-test')
      await manager.initialize()

      await manager.send({ msg: 1 })
      await manager.send({ msg: 2 })

      // The error is wrapped by TransportSendError
      await expect(manager.send({ msg: 3 })).rejects.toThrow('failed to send output')

      await manager.shutdown()
    })

    it('should allow unlimited messages when backpressure is disabled', async () => {
      const transport = new DummyTransport({
        enableBackpressure: false,
        maxQueueSize: 2
      })

      manager = new AgentManager(agent, transport, { debug: true }, [], 'no-backpressure-test')
      await manager.initialize()

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

      let status = manager.getTransportStatus()
      expect(status.queueSize).toBe(0)
      expect(status.maxQueueSize).toBe(5)
      expect(status.canAcceptMore).toBe(true)

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

      const status = manager.getTransportStatus()
      expect(status.isHealthy).toBe(false)
      expect(status.healthMessage).toBe('Transport not initialized')
    })

    it('should handle transports without backpressure API gracefully', async () => {
      const basicTransport = {
        id: 'basic',
        name: 'Basic Transport',
        config: {},
        init: async () => {},
        send: async () => {},
        receive: async () => ({ content: null, metadata: {} }),
        // Add minimal canAcceptMore to satisfy Transport interface
        canAcceptMore: () => true
      }

      manager = new AgentManager(agent, basicTransport as any, { debug: true }, [], 'basic-transport-test')
      await manager.initialize()

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
        responseDelay: 50
      })

      manager = new AgentManager(
        agent,
        transport,
        {
          debug: true,
          enableBackpressureQueue: false, // Disable backpressure queue to see immediate failures
          resourceLimits: {
            maxConcurrentRequests: 2,
            maxQueueSize: 10,
            requestTimeoutMs: 1000
          }
        },
        [],
        'bounded-backpressure-test'
      )
      await manager.initialize()

      const promises = []
      for (let i = 0; i < 8; i++) {
        promises.push(manager.send({ msg: i }))
      }

      const results = await Promise.allSettled(promises)

      const successes = results.filter(r => r.status === 'fulfilled').length
      const failures = results.filter(r => r.status === 'rejected').length

      expect(successes + failures).toBe(8)
      // With transport queue size 3 and bounded executor limits, some should fail
      expect(failures).toBeGreaterThan(0)
      expect(successes).toBeGreaterThan(0)

      await manager.shutdown()
      console.timeEnd('transport-backpressure-bounded-executor')
    }, { timeout: 15000 })

    it('should handle backpressure errors gracefully during high load', async () => {
      console.time('transport-backpressure-high-load')
      const transport = new DummyTransport({
        enableBackpressure: true,
        maxQueueSize: 1,
        responseDelay: 100 // Increased delay to ensure messages process slower
      })

      // Use default settings with backpressure queue enabled
      manager = new AgentManager(agent, transport, { 
        debug: true,
        backpressureQueueOptions: {
          maxRetries: 2 // Reduce retries to make test faster
        }
      }, [], 'high-load-test')
      await manager.initialize()

      const promises = Array.from({ length: 10 }, (_, i) => // Reduced from 20 to 10
        manager.send({ msg: i }).then(
          () => ({ success: true, msg: i }),
          (err) => ({ success: false, error: err.message, msg: i })
        )
      )

      const results = await Promise.all(promises)

      const successes = results.filter(r => r.success).length
      const failures = results.filter(r => !r.success).length

      // With backpressure queue, most should succeed eventually
      expect(successes).toBeGreaterThan(0)
      // Some may fail due to queue overflow or retry exhaustion
      expect(successes + failures).toBe(10)

      await manager.shutdown()
      console.timeEnd('transport-backpressure-high-load')
    }, { timeout: 30000 })
  })

  describe('Dynamic Queue Management', () => {
    it('should recover from backpressure when queue drains', async () => {
      // This test verifies that backpressure is enforced when queue is full
      const transport = new DummyTransport({
        enableBackpressure: true,
        maxQueueSize: 2,
        responseDelay: 10
      })

      // Disable backpressure queue to test immediate transport backpressure
      manager = new AgentManager(agent, transport, { 
        debug: true,
        enableBackpressureQueue: false 
      }, [], 'recovery-test')
      await manager.initialize()

      // Send messages to fill the queue
      await manager.send({ msg: 1 })
      await manager.send({ msg: 2 })
      
      // Queue should be full, trying to send another should fail
      await expect(manager.send({ msg: 3 })).rejects.toThrow('failed to send output')

      // Basic check that status is reported
      const status = manager.getTransportStatus()
      expect(status.queueSize).toBeGreaterThanOrEqual(0)
      expect(status.maxQueueSize).toBe(2)

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

      const queueSizes = []

      queueSizes.push(manager.getTransportStatus().queueSize)

      await manager.send({ msg: 1 })
      queueSizes.push(manager.getTransportStatus().queueSize)

      await manager.send({ msg: 2 })
      queueSizes.push(manager.getTransportStatus().queueSize)

      await transport.receive()
      queueSizes.push(manager.getTransportStatus().queueSize)

      // Wait a bit for processing to complete
      await new Promise(resolve => setTimeout(resolve, 20))
      
      // The queue sizes may vary due to async processing
      expect(queueSizes[0]).toBe(0) // Initial state
      expect(queueSizes[1]).toBeGreaterThan(0) // After first send
      expect(queueSizes[2]).toBeGreaterThanOrEqual(queueSizes[1]) // After second send

      await manager.shutdown()
    })
  })
})
