/**
 * Browser Example: Using AgentKit SDK with BrowserTransport
 * 
 * This example demonstrates how to use the AgentKit SDK in a browser environment
 * with the BrowserTransport for communicating with MCP servers over HTTP/HTTPS.
 */

import { BrowserTransport } from './BrowserTransport'

/**
 * Note: This file contains example code for documentation purposes.
 * In a real browser application, you would:
 * 1. Install: npm install @agentkit/sdk @agentkit/runtime-web
 * 2. Import: import { connectAgent, AgentRegistry } from '@agentkit/sdk'
 */

// Example 1: Basic usage with BrowserTransport
async function basicExample() {
  console.log('🌐 Basic Browser Transport Example')

  // Create a browser transport instance
  const transport = new BrowserTransport({
    endpoint: 'https://api.example.com/mcp',
    timeout: 10000,
    maxRetries: 3,
    headers: {
      'Authorization': 'Bearer your-api-token',
      'X-Client-Version': '1.0.0'
    }
  })

  try {
    // In a real app, you would import connectAgent from '@agentkit/sdk'
    // const { connectAgent } = await import('@agentkit/sdk')
    // const agent = await connectAgent({
    //   agent: 'chat-agent',
    //   transport: transport,
    //   debug: true
    // })
    
    console.log('🔗 Would connect agent with transport:', transport)

    // Send a message
    await agent.send({
      type: 'chat',
      message: 'Hello from the browser!',
      timestamp: new Date().toISOString()
    })

    console.log('✅ Message sent successfully')

    // Clean shutdown
    await agent.shutdown()
    console.log('🔄 Agent shutdown complete')

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Example 2: Using with custom agent registry and error handling
async function advancedExample() {
  console.log('🎯 Advanced Browser Transport Example')

  // Create custom transport with retry configuration
  const transport = new BrowserTransport({
    endpoint: 'https://mcp-server.yourapp.com/api/v1',
    timeout: 5000,       // 5 second timeout
    maxRetries: 2,       // 2 retry attempts
    retryDelay: 1000,    // 1 second initial delay
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'AgentKit-Browser/1.0'
    }
  })

  // Create a custom registry
  const registry = new AgentRegistry()

  // Register the transport
  registry.registerTransport(transport)

  let agent

  try {
    // Connect with lifecycle hooks
    agent = await connectAgent({
      agent: 'assistant-agent',
      transport: 'browser', // Use registered transport by ID
      registry: registry,
      scope: ['read', 'write'],
      debug: true,
      
      // Lifecycle hooks
      onInit: (agentId: string) => {
        console.log(`🚀 Agent ${agentId} initialized`)
      },
      
      onShutdown: (agentId: string) => {
        console.log(`🛑 Agent ${agentId} shutdown`)
      },
      
      onError: (error: Error) => {
        console.error('🚨 Agent error:', error.message)
      },
      
      onCleanup: (agentId: string) => {
        console.log(`🧹 Cleanup completed for agent ${agentId}`)
      }
    })

    // Send multiple messages with error handling
    const messages = [
      { task: 'analyze', data: 'Sample text for analysis' },
      { task: 'summarize', data: 'Long document content...' },
      { task: 'translate', data: 'Hello world', target: 'es' }
    ]

    for (const message of messages) {
      try {
        await agent.send(message)
        console.log(`✅ Processed task: ${message.task}`)
      } catch (error) {
        console.error(`❌ Failed task ${message.task}:`, error)
      }
    }

  } catch (error) {
    console.error('❌ Connection failed:', error)
    
    // Handle specific error types
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.includes('CORS')) {
      console.error('💡 CORS issue detected. Ensure your server has proper CORS headers.')
    } else if (errorMessage.includes('timeout')) {
      console.error('⏰ Request timed out. Consider increasing timeout or checking server status.')
    } else if (errorMessage.includes('HTTP 4')) {
      console.error('🔒 Client error. Check your API credentials and request format.')
    }
  } finally {
    // Always cleanup
    if (agent) {
      await agent.shutdown()
    }
  }
}

// Example 3: Real-time chat application
async function chatExample() {
  console.log('💬 Chat Application Example')

  const transport = new BrowserTransport({
    endpoint: 'wss://chat-server.example.com/mcp', // Note: This would need WebSocket support
    timeout: 30000, // Longer timeout for chat
    headers: {
      'X-Chat-Session': crypto.randomUUID()
    }
  })

  try {
    const chatAgent = await connectAgent({
      agent: 'chat-bot',
      transport: transport,
      scope: ['chat', 'history'],
      debug: false, // Disable debug in production
      
      onOutput: (message: any) => {
        // Handle real-time responses
        console.log('💬 Received:', message)
        displayMessage(message)
      }
    })

    // Simulate user input
    const userMessages = [
      'Hi there!',
      'What can you help me with?',
      'Tell me about the weather'
    ]

    for (let i = 0; i < userMessages.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000)) // 2 second delay
      
      await chatAgent.send({
        type: 'user_message',
        content: userMessages[i],
        messageId: `msg_${Date.now()}_${i}`,
        userId: 'user123'
      })
      
      console.log(`📤 Sent: ${userMessages[i]}`)
    }

    await chatAgent.shutdown()

  } catch (error) {
    console.error('❌ Chat error:', error)
  }
}

// Helper function to display messages (would integrate with your UI)
function displayMessage(message: any) {
  if (typeof document !== 'undefined') {
    const chatContainer = document.getElementById('chat-container')
    if (chatContainer) {
      const messageElement = document.createElement('div')
      messageElement.className = 'message'
      messageElement.textContent = JSON.stringify(message, null, 2)
      chatContainer.appendChild(messageElement)
    }
  }
}

// Example 4: Error recovery and resilience
async function resilientExample() {
  console.log('🛡️ Resilient Transport Example')

  const transport = new BrowserTransport({
    endpoint: 'https://unreliable-server.example.com/mcp',
    timeout: 3000,
    maxRetries: 5,        // More retries for unreliable connection
    retryDelay: 500,      // Shorter initial delay
    headers: {
      'X-Retry-Strategy': 'exponential-backoff'
    }
  })

  try {
    const agent = await connectAgent({
      agent: 'resilient-agent',
      transport: transport,
      debug: true
    })

    // Simulate sending messages that might fail
    for (let i = 0; i < 10; i++) {
      try {
        await agent.send({
          id: i,
          data: `Message ${i}`,
          timestamp: Date.now()
        })
        console.log(`✅ Message ${i} sent successfully`)
      } catch (error) {
        console.log(`⚠️ Message ${i} failed, continuing...`)
        // Continue with next message instead of failing completely
      }
    }

    await agent.shutdown()

  } catch (error) {
    console.error('❌ Resilient example failed:', error)
  }
}

// Browser integration example
function setupBrowserIntegration() {
  if (typeof window !== 'undefined') {
    // Add examples to window for testing in browser console
    (window as any).agentKitExamples = {
      basicExample,
      advancedExample,
      chatExample,
      resilientExample
    }

    console.log('🎉 AgentKit Browser Examples loaded!')
    console.log('Run examples with: agentKitExamples.basicExample()')
  }
}

// Auto-setup when loaded in browser
setupBrowserIntegration()

// Export for ES module usage
export {
  basicExample,
  advancedExample,
  chatExample,
  resilientExample
}