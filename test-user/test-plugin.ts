import { connectAgent, AgentRegistry, PluginManager } from '@agentkit/sdk'
import { DummyAgent } from '@agentkit/test-agent'
import { DummyTransport } from '@agentkit/transports-dummy'
import helloWorldPlugin from './hello-world-plugin'

async function testHelloWorldPlugin() {
  console.log('🚀 Starting AgentKit plugin test...')
  
  try {
    // Step 1: Register an agent and transport
    console.log('📝 Registering agent and transport...')
    
    AgentRegistry.register({
      id: 'test-agent',
      name: 'Test Agent',
      version: '1.0.0',
      supportedScopes: ['chat'],
      factory: () => new DummyAgent()
    })
    
    AgentRegistry.registerTransport(new DummyTransport())
    
    // Step 2: Setup plugin manager with debug mode
    console.log('🔧 Setting up plugin manager with debug mode...')
    
    const pluginManager = new PluginManager({
      debug: true,
      observabilityHooks: {
        onPluginStart: (name, hook) => console.log(`🔄 Plugin Start: ${name}.${hook}`),
        onPluginSuccess: (name, hook, duration) => console.log(`✅ Plugin Success: ${name}.${hook} (${duration}ms)`),
        onPluginError: (name, hook, error, duration) => console.log(`❌ Plugin Error: ${name}.${hook} failed after ${duration}ms:`, error),
        onPluginTimeout: (name, hook, timeout) => console.log(`⏰ Plugin Timeout: ${name}.${hook} timed out after ${timeout}ms`)
      }
    })
    
    // Step 3: Register our hello world plugin
    console.log('🧩 Registering hello world plugin...')
    pluginManager.register(helloWorldPlugin)
    
    // Step 4: Connect agent with plugins
    console.log('🔗 Connecting agent with plugin manager...')
    
    const handle = await connectAgent({
      agent: 'test-agent',
      transport: 'dummy',
      scope: ['chat'],
      debug: true,
      pluginManager,
      onOutput: (message) => {
        console.log('🎯 Agent Output:', message)
      },
      onInit: (agentId) => console.log(`🎯 Agent ${agentId} initialized`),
      onShutdown: (agentId) => console.log(`👋 Agent ${agentId} shutdown`)
    })
    
    console.log('📊 Agent Handle Metadata:', handle.metadata)
    
    // Step 5: Enable debug mode for comprehensive observability
    console.log('🔍 Enabling debug mode...')
    
    if (handle.observability) {
      handle.observability.enableDebugMode({
        verbose: true,
        level: 'debug'
      })
    }
    
    // Step 6: Test the ping-pong functionality
    console.log('\n🏓 Testing ping-pong functionality...')
    
    console.log('📤 Sending "ping" message...')
    await handle.send({ message: 'ping' })
    
    console.log('📤 Sending "hello" message...')
    await handle.send({ message: 'hello' })
    
    console.log('📤 Sending another "ping" message...')
    await handle.send({ message: 'ping' })
    
    // Step 7: Capture execution timeline if available
    console.log('\n📈 Capturing execution timeline...')
    
    if (handle.observability) {
      try {
        const timeline = handle.observability.getDebugTimeline()
        if (timeline) {
          console.log('⏱️ Execution Timeline:', timeline)
        }
        
        // Print timeline to console for debugging
        handle.observability.printTimeline()
        
        // Get performance statistics
        const metrics = handle.observability.getMetrics()
        if (metrics) {
          console.log('📊 Performance Metrics:', metrics)
        }
        
        // Export Prometheus metrics
        const prometheusMetrics = handle.observability.exportPrometheusMetrics()
        if (prometheusMetrics) {
          console.log('📈 Prometheus Metrics:', prometheusMetrics)
        }
        
      } catch (error) {
        console.log('⚠️ Could not capture timeline:', error.message)
      }
    }
    
    // Step 8: Clean shutdown
    console.log('\n👋 Shutting down...')
    await handle.shutdown()
    
    console.log('✅ Test completed successfully!')
    
  } catch (error) {
    console.error('💥 Test failed:', error)
    throw error
  }
}

// Run the test
testHelloWorldPlugin().catch(console.error)