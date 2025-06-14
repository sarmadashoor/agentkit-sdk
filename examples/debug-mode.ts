/**
 * AgentKit SDK Debug Mode Example
 * 
 * This example shows how to use the SDK with debug mode enabled to:
 * 1. See detailed lifecycle logging
 * 2. Monitor scope mismatches
 * 3. Track agent and transport operations
 * 4. Use lifecycle hooks for observability
 */

import { connectAgent, AgentRegistry } from '@agentkit/sdk'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'

async function debugExample() {
  console.log('🔍 AgentKit SDK - Debug Mode Example\n')

  // Clear registry to start fresh
  AgentRegistry.clear()

  // Register an agent with limited scopes to demonstrate scope mismatch logging
  console.log('📋 Registering limited-scope agent...')
  
  AgentRegistry.register({
    id: 'limited-agent',
    name: 'Limited Scope Agent',
    version: '1.0.0', 
    description: 'Agent with limited scopes to demonstrate scope validation',
    supportedScopes: ['read', 'basic'], // Only supports read and basic operations
    factory: () => new DummyAgent()
  })

  AgentRegistry.registerTransport(new DummyTransport({
    debug: true, // Enable transport debug logging
    logMessages: true,
    responseDelay: 50
  }))

  // Track lifecycle events
  const lifecycleEvents: string[] = []
  
  console.log('🔌 Connecting with debug mode and lifecycle hooks...')
  
  const handle = await connectAgent({
    agent: 'limited-agent',
    transport: 'dummy',
    scope: ['read', 'write', 'admin'], // Request more scopes than supported
    debug: true, // Enable debug logging
    
    // Lifecycle hooks for observability
    onInit: (agentId) => {
      lifecycleEvents.push(`INIT: ${agentId}`)
      console.log(`🎯 onInit hook called for agent: ${agentId}`)
    },
    
    onShutdown: (agentId) => {
      lifecycleEvents.push(`SHUTDOWN: ${agentId}`)
      console.log(`🎯 onShutdown hook called for agent: ${agentId}`)
    },
    
    onError: (error) => {
      lifecycleEvents.push(`ERROR: ${error.message}`)
      console.log(`🎯 onError hook called:`, error.message)
    },
    
    onOutput: (message) => {
      console.log('📤 Debug output capture:', JSON.stringify(message, null, 2))
    }
  })

  console.log('\n📊 Connection established with metadata:')
  console.log('   Agent ID:', handle.metadata.agentId)
  console.log('   Transport ID:', handle.metadata.transportId)
  console.log('   🟢 Registered scopes:', handle.metadata.registeredScopes)
  console.log('   🔴 Requested scopes:', handle.metadata.requestedScopes)
  console.log('   ⚠️  Scope mismatch detected (check debug logs above)')

  // Send various messages to see debug output
  console.log('\n💬 Sending test messages with debug logging...')
  
  await handle.send({
    type: 'test',
    message: 'Testing debug mode',
    timestamp: new Date().toISOString()
  })

  await handle.send({
    type: 'complex-data',
    data: {
      nested: {
        structure: true,
        values: [1, 2, 3]
      }
    }
  })

  // Demonstrate error handling (this will be handled gracefully)
  console.log('\n🧪 Testing error scenarios...')
  try {
    // Send a message after a brief delay to see timing logs
    setTimeout(async () => {
      await handle.send({ delayed: 'message' })
    }, 100)
  } catch (error) {
    console.log('Handled error:', error)
  }

  // Wait a bit to see all async operations complete
  await new Promise(resolve => setTimeout(resolve, 200))

  console.log('\n🛑 Shutting down with debug logging...')
  await handle.shutdown()

  console.log('\n📈 Lifecycle Events Summary:')
  lifecycleEvents.forEach((event, index) => {
    console.log(`   ${index + 1}. ${event}`)
  })

  console.log('\n✅ Debug example completed!')
  console.log('💡 Check the output above for detailed debug logs showing:')
  console.log('   - Agent and transport initialization')
  console.log('   - Scope mismatch warnings')
  console.log('   - Message processing timing')
  console.log('   - Lifecycle hook execution')
  console.log('   - Graceful shutdown process')
}

// Run the debug example
debugExample().catch(console.error)