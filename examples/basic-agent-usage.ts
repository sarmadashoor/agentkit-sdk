/**
 * Basic AgentKit SDK Usage Example
 * 
 * This example demonstrates the fundamental usage pattern of the AgentKit SDK:
 * 1. Register agents and transports 
 * 2. Connect to an agent
 * 3. Send messages
 * 4. Handle responses
 * 5. Clean shutdown
 */

import { connectAgent, AgentRegistry } from '@agentkit/sdk'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'

async function basicExample() {
  console.log('🚀 AgentKit SDK - Basic Usage Example\n')

  // Step 1: Register an agent and transport in the registry
  console.log('📋 Registering agent and transport...')
  
  AgentRegistry.register({
    id: 'echo-agent',
    name: 'Echo Agent', 
    version: '1.0.0',
    description: 'Simple agent that echoes back input with processing info',
    supportedScopes: ['general', 'echo', 'testing'],
    factory: () => new DummyAgent()
  })

  AgentRegistry.registerTransport(new DummyTransport({
    debug: false,
    logMessages: true,
    responseDelay: 100
  }))

  // Step 2: Connect to the agent
  console.log('🔌 Connecting to agent...')
  
  const handle = await connectAgent({
    agent: 'echo-agent',
    transport: 'dummy',
    scope: ['general', 'echo'],
    onOutput: (message) => {
      console.log('📤 Agent output:', JSON.stringify(message, null, 2))
    }
  })

  console.log('✅ Connected successfully!')
  console.log('📊 Agent metadata:', {
    agentId: handle.metadata.agentId,
    transportId: handle.metadata.transportId,
    registeredScopes: handle.metadata.registeredScopes,
    requestedScopes: handle.metadata.requestedScopes
  })

  // Step 3: Send some messages
  console.log('\n💬 Sending messages...')
  
  await handle.send({ 
    type: 'greeting',
    message: 'Hello, AgentKit!'
  })

  await handle.send({
    type: 'question', 
    message: 'What can you do?'
  })

  await handle.send({
    type: 'data',
    payload: { 
      numbers: [1, 2, 3, 4, 5],
      operation: 'sum'
    }
  })

  // Step 4: Clean shutdown
  console.log('\n🛑 Shutting down...')
  await handle.shutdown()
  
  console.log('✅ Example completed successfully!')
}

// Run the example
basicExample().catch(console.error)