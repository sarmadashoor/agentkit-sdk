/**
 * Demo of the AgentKit SDK connectAgent() API
 */

import { connectAgent, AgentRegistry } from '@agentkit/sdk'
import { createTestAgent } from '@agentkit/test-agent'
import { createDummyTransport } from '@agentkit/transports-dummy'

async function demo() {
  console.log('🚀 AgentKit SDK Demo\n')

  // Method 1: Direct agent and transport instances
  console.log('1️⃣ Using direct instances:')
  const agent = createTestAgent({ debug: true })
  const transport = createDummyTransport({ debug: true })

  const handle1 = await connectAgent({
    agent,
    transport,
    onOutput: (output) => {
      console.log('📤 Output received:', output)
    },
    debug: true
  })

  await handle1.send({ message: 'Hello from direct instance!' })
  await handle1.shutdown()

  console.log('\n' + '='.repeat(50) + '\n')

  // Method 2: Using registry
  console.log('2️⃣ Using registry:')
  
  // Register agent metadata
  AgentRegistry.register({
    id: 'test-agent',
    name: 'Test Agent',
    version: '1.0.0',
    description: 'A test agent for demonstrations',
    factory: () => createTestAgent({ debug: true })
  })

  // Register transport
  AgentRegistry.registerTransport(createDummyTransport({ debug: true }))

  const handle2 = await connectAgent({
    agent: 'test-agent',
    transport: 'dummy-transport',
    scope: ['demo', 'test'],
    techStack: 'typescript',
    onOutput: (output) => {
      console.log('📤 Output received:', output)
    },
    debug: true
  })

  await handle2.send({ message: 'Hello from registry!' })
  await handle2.shutdown()

  console.log('\n✅ Demo completed!')
}

// Run the demo
demo().catch(console.error)