#!/usr/bin/env node

/**
 * Hello World AgentKit SDK Example
 * 
 * A comprehensive demonstration of the AgentKit SDK featuring:
 * - Agent lifecycle management (init, send, shutdown)
 * - Plugin integration with logging, metrics, and debugging
 * - Error handling and recovery
 * - Concurrency and resource management
 * - Multiple operational modes
 * - Performance testing
 * 
 * Usage:
 *   pnpm start                    # Default echo mode
 *   AGENT_MODE=metrics pnpm start # Metrics mode
 *   CONCURRENT_DEMO=true pnpm start # Concurrent testing
 */

import { setupAgent, getAvailableModes, type AgentSetupResult } from './agentSetup.js'
import { createPluginsForMode } from './pluginSetup.js'
import { executeWorkflow, executePerformanceTest } from './exampleWorkflow.js'
import type { DummyTestAgentMode } from '@agentkit/test-agent'

// Configuration from environment
const AGENT_MODE = (process.env.AGENT_MODE as DummyTestAgentMode) || 'echo'
const CONCURRENT_DEMO = process.env.CONCURRENT_DEMO === 'true'
const PLUGIN_MODE = process.env.PLUGIN_MODE || 'full'
const PERFORMANCE_TEST = process.env.PERFORMANCE_TEST === 'true'
const DEBUG_MODE = process.env.DEBUG === 'true'

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  console.log('🌟 AgentKit SDK - Hello World Example')
  console.log('=====================================\n')
  
  // Display configuration
  console.log('📋 Configuration:')
  console.log(`   Agent Mode: ${AGENT_MODE}`)
  console.log(`   Plugin Mode: ${PLUGIN_MODE}`)
  console.log(`   Concurrent Demo: ${CONCURRENT_DEMO}`)
  console.log(`   Performance Test: ${PERFORMANCE_TEST}`)
  console.log(`   Debug Mode: ${DEBUG_MODE}`)
  console.log('')
  
  // Show available modes
  console.log('🎯 Available Agent Modes:')
  const modes = getAvailableModes()
  Object.entries(modes).forEach(([mode, description]) => {
    const current = mode === AGENT_MODE ? ' ← CURRENT' : ''
    console.log(`   ${mode}: ${description}${current}`)
  })
  console.log('')
  
  let agentSetup: AgentSetupResult | null = null
  
  try {
    // Setup plugins
    console.log('🔌 Setting up plugins...')
    const plugins = createPluginsForMode(PLUGIN_MODE)
    console.log(`   Created ${plugins.length} plugins:`)
    plugins.forEach(plugin => {
      console.log(`   • ${plugin.name} v${plugin.version}`)
    })
    console.log('')
    
    // Setup agent
    console.log('🚀 Initializing agent...')
    agentSetup = await setupAgent({
      mode: AGENT_MODE,
      plugins,
      debug: DEBUG_MODE,
      config: {
        debug: DEBUG_MODE,
        processingDelay: DEBUG_MODE ? 100 : 50 // Slower for demo visibility
      }
    })
    
    console.log(`✅ Agent ready! ID: ${agentSetup.agentId}`)
    console.log('')
    
    // Execute main workflow
    console.log('🎯 Executing main workflow...')
    const workflowResult = await executeWorkflow({
      handle: agentSetup.handle,
      mode: AGENT_MODE,
      concurrent: CONCURRENT_DEMO,
      debug: DEBUG_MODE
    })
    
    // Optional performance test
    if (PERFORMANCE_TEST && AGENT_MODE !== 'fail') {
      const perfResult = await executePerformanceTest(agentSetup.handle)
      console.log(`\n⚡ Performance Results:`)
      console.log(`   Average Latency: ${perfResult.avgLatency.toFixed(2)}ms`)
      console.log(`   Throughput: ${perfResult.throughput.toFixed(2)} messages/sec`)
    }
    
    // Display final summary
    console.log('\n🎉 Demo Complete!')
    console.log('==================')
    console.log(`✅ Messages Processed: ${workflowResult.messagesProcessed}`)
    console.log(`${workflowResult.errorsEncountered > 0 ? '⚠️ ' : '✅'} Errors: ${workflowResult.errorsEncountered}`)
    console.log(`⏱️  Total Duration: ${workflowResult.duration}ms`)
    console.log(`🎯 Success: ${workflowResult.success ? 'YES' : 'NO'}`)
    
    if (AGENT_MODE === 'fail' && workflowResult.errorsEncountered > 0) {
      console.log('\n💡 Note: Errors were expected in "fail" mode - this demonstrates error handling!')
    }
    
    if (AGENT_MODE === 'validation' && workflowResult.errorsEncountered > 0) {
      console.log('\n💡 Note: Some errors were expected in "validation" mode - this demonstrates input validation!')
    }
    
  } catch (error) {
    console.error('\n❌ Demo failed with error:')
    console.error(`   ${(error as Error).message}`)
    
    if (DEBUG_MODE && error instanceof Error && error.stack) {
      console.error('\n🔍 Stack trace:')
      console.error(error.stack)
    }
    
    process.exit(1)
    
  } finally {
    // Ensure clean shutdown
    if (agentSetup) {
      console.log('\n🛑 Shutting down...')
      try {
        await agentSetup.shutdown()
        console.log('✅ Shutdown complete')
      } catch (shutdownError) {
        console.error('❌ Shutdown error:', shutdownError)
      }
    }
  }
}

/**
 * Handle CLI arguments and help
 */
function handleCLI(): void {
  const args = process.argv.slice(2)
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp()
    process.exit(0)
  }
  
  if (args.includes('--modes')) {
    showModes()
    process.exit(0)
  }
}

/**
 * Show help information
 */
function showHelp(): void {
  console.log('AgentKit SDK - Hello World Example')
  console.log('==================================\n')
  console.log('Usage:')
  console.log('  pnpm start                     # Run with default settings')
  console.log('  pnpm demo:echo                 # Run in echo mode')
  console.log('  pnpm demo:metrics              # Run in metrics mode')
  console.log('  pnpm demo:fail                 # Run in fail mode (demonstrates error handling)')
  console.log('  pnpm demo:concurrent           # Run with concurrent testing')
  console.log('')
  console.log('Environment Variables:')
  console.log('  AGENT_MODE=<mode>              # Set agent operational mode')
  console.log('  PLUGIN_MODE=<mode>             # Set plugin configuration (minimal|full|metrics-only|debug-only)')
  console.log('  CONCURRENT_DEMO=true           # Enable concurrent message testing')
  console.log('  PERFORMANCE_TEST=true          # Run performance benchmarks')
  console.log('  DEBUG=true                     # Enable debug output')
  console.log('')
  console.log('Examples:')
  console.log('  AGENT_MODE=metrics DEBUG=true pnpm start')
  console.log('  CONCURRENT_DEMO=true PERFORMANCE_TEST=true pnpm start')
  console.log('')
  console.log('Options:')
  console.log('  --help, -h                     # Show this help')
  console.log('  --modes                        # List available agent modes')
}

/**
 * Show available modes
 */
function showModes(): void {
  console.log('Available Agent Modes:')
  console.log('=====================\n')
  
  const modes = getAvailableModes()
  Object.entries(modes).forEach(([mode, description]) => {
    console.log(`${mode}:`)
    console.log(`  ${description}\n`)
  })
  
  console.log('Usage: AGENT_MODE=<mode> pnpm start')
}

/**
 * Error handler for uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  console.error('\n💥 Uncaught Exception:')
  console.error(error)
  process.exit(1)
})

/**
 * Error handler for unhandled promise rejections
 */
process.on('unhandledRejection', (reason) => {
  console.error('\n💥 Unhandled Promise Rejection:')
  console.error(reason)
  process.exit(1)
})

/**
 * Graceful shutdown handler
 */
process.on('SIGINT', () => {
  console.log('\n\n👋 Received SIGINT, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n\n👋 Received SIGTERM, shutting down gracefully...')
  process.exit(0)
})

// Handle CLI and run main function
handleCLI()
main().catch((error) => {
  console.error('\n💥 Application Error:')
  console.error(error)
  process.exit(1)
})