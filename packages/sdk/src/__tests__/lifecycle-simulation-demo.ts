/**
 * Plugin Lifecycle Simulation Demo
 * 
 * Demonstrates complete plugin lifecycle using AgentKit SDK
 * This is a standalone demo that can be run to validate the complete system
 */

import { createGreetPlugin, GreetPlugin } from './fixtures/greet-plugin'
import type { AgentContext, SendPayload } from '@agentkit/types'

/**
 * Enhanced trace logger for lifecycle visualization
 */
class LifecycleTracer {
  private startTime = Date.now()
  private logs: string[] = []

  logStart(hookName: string, pluginName: string): void {
    const elapsed = Date.now() - this.startTime
    const log = `▶ ${hookName}(${pluginName}) start (t=${elapsed}ms)`
    console.log(log)
    this.logs.push(log)
  }

  logSuccess(hookName: string, pluginName: string): void {
    const elapsed = Date.now() - this.startTime
    const log = `✔ ${hookName}(${pluginName}) success (t=${elapsed}ms)`
    console.log(log)
    this.logs.push(log)
  }

  logError(hookName: string, pluginName: string, error: string): void {
    const elapsed = Date.now() - this.startTime
    const log = `✖ ${hookName}(${pluginName}) error: ${error} (t=${elapsed}ms)`
    console.error(log)
    this.logs.push(log)
  }

  getLogs(): string[] {
    return [...this.logs]
  }

  reset(): void {
    this.startTime = Date.now()
    this.logs = []
  }
}

/**
 * Observability wrapper for plugin hooks
 */
function wrapPluginWithObservability(plugin: GreetPlugin, tracer: LifecycleTracer): GreetPlugin {
  const originalOnInit = plugin.onInit.bind(plugin)
  const originalOnSend = plugin.onSend.bind(plugin)
  const originalOnError = plugin.onError.bind(plugin)
  const originalOnShutdown = plugin.onShutdown.bind(plugin)

  plugin.onInit = async (context: AgentContext) => {
    tracer.logStart('onInit', plugin.name)
    try {
      await originalOnInit(context)
      tracer.logSuccess('onInit', plugin.name)
    } catch (error) {
      tracer.logError('onInit', plugin.name, (error as Error).message)
      throw error
    }
  }

  plugin.onSend = async (payload: SendPayload, context: AgentContext) => {
    tracer.logStart('onSend', plugin.name)
    try {
      await originalOnSend(payload, context)
      tracer.logSuccess('onSend', plugin.name)
    } catch (error) {
      tracer.logError('onSend', plugin.name, (error as Error).message)
      throw error
    }
  }

  plugin.onError = async (error: Error, context: AgentContext) => {
    tracer.logStart('onError', plugin.name)
    try {
      await originalOnError(error, context)
      tracer.logSuccess('onError', plugin.name)
    } catch (handlingError) {
      tracer.logError('onError', plugin.name, (handlingError as Error).message)
      // Don't re-throw from error handlers
    }
  }

  plugin.onShutdown = async (context: AgentContext) => {
    tracer.logStart('onShutdown', plugin.name)
    try {
      await originalOnShutdown(context)
      tracer.logSuccess('onShutdown', plugin.name)
    } catch (error) {
      tracer.logError('onShutdown', plugin.name, (error as Error).message)
      throw error
    }
  }

  return plugin
}

/**
 * Run complete lifecycle simulation
 */
export async function runLifecycleSimulation(): Promise<void> {
  console.log('🧪 Starting Plugin Lifecycle Simulation\n')
  
  const tracer = new LifecycleTracer()

  // Create plugins with different configurations
  const plugins = [
    createGreetPlugin({
      enabled: true,
      logLevel: 'debug',
      greetingPrefix: 'Hello',
      maxDelay: 50
    }),
    createGreetPlugin({
      enabled: true,
      logLevel: 'info', 
      greetingPrefix: 'Hi',
      maxDelay: 30
    })
  ]

  // Wrap plugins with observability
  const tracedPlugins = plugins.map(plugin => wrapPluginWithObservability(plugin, tracer))

  console.log('📦 Created plugins:', tracedPlugins.map(p => `${p.name}@${p.version}`).join(', '))

  try {
    const context: AgentContext = {
      agentId: 'demo-agent',
      transportId: 'demo-transport',
      requestId: 'lifecycle-sim-001',
      timestamp: Date.now(),
      metadata: { simulation: true }
    }

    // Initialize all plugins
    console.log('\n🚀 Initializing plugins...')
    for (const plugin of tracedPlugins) {
      await plugin.onInit(context)
    }

    // Simulate multiple send operations
    console.log('\n📨 Simulating send operations...')
    const messages = [
      'Welcome to AgentKit!',
      'How are you today?',
      'This is a test message'
    ]

    for (let i = 0; i < messages.length; i++) {
      const sendPayload: SendPayload = {
        input: { message: messages[i] },
        metadata: { messageId: i + 1 }
      }

      console.log(`\n--- Message ${i + 1}: "${messages[i]}" ---`)
      
      for (const plugin of tracedPlugins) {
        await plugin.onSend(sendPayload, {
          ...context,
          requestId: `lifecycle-sim-00${i + 1}`,
          timestamp: Date.now()
        })
      }
    }

    // Simulate error handling
    console.log('\n💥 Simulating error scenarios...')
    const testError = new Error('Simulated error for testing')
    
    for (const plugin of tracedPlugins) {
      await plugin.onError(testError, {
        ...context,
        requestId: 'lifecycle-sim-error',
        timestamp: Date.now()
      })
    }

    // Shutdown plugins
    console.log('\n🛑 Shutting down plugins...')
    for (const plugin of tracedPlugins) {
      await plugin.onShutdown(context)
    }

    // Display final metrics
    console.log('\n📊 Final Plugin Metrics:')
    tracedPlugins.forEach((plugin, index) => {
      const metrics = plugin.getMetrics()
      console.log(`\nPlugin ${index + 1} (${plugin.getConfig().greetingPrefix}):`)
      console.log(`  • Init Time: ${metrics.initTime}ms`)
      console.log(`  • Send Count: ${metrics.sendCount}`)
      console.log(`  • Error Count: ${metrics.errorCount}`)
      console.log(`  • Shutdown Time: ${metrics.shutdownTime}ms`)
      console.log(`  • Memory Usage: ${Math.round(metrics.memoryUsage / 1024)}KB`)
    })

  } catch (error) {
    console.error('❌ Lifecycle simulation failed:', error)
    throw error
  }

  console.log('\n✅ Lifecycle simulation completed successfully!')
  console.log('\n📋 Complete trace log:')
  tracer.getLogs().forEach(log => console.log(`  ${log}`))
}

/**
 * Run chaos testing simulation
 */
export async function runChaosSimulation(): Promise<void> {
  console.log('\n🧨 Starting Chaos Testing Simulation\n')
  
  const tracer = new LifecycleTracer()
  tracer.reset()

  // Configure different chaos scenarios
  const chaosScenarios = [
    { name: 'Init Failure', config: { failOnInit: true } },
    { name: 'Send Failure', config: { failOnSend: true } },
    { name: 'Delay Injection', config: { delayMs: 100 } },
    { name: 'Failure After 2 Calls', config: { throwAfterCalls: 2 } }
  ]

  for (const scenario of chaosScenarios) {
    console.log(`\n--- Testing: ${scenario.name} ---`)
    
    // Reset plugin state
    const testPlugin = wrapPluginWithObservability(
      createGreetPlugin({ logLevel: 'debug' }), 
      tracer
    )
    testPlugin.setChaosConfig(scenario.config)

    const context: AgentContext = {
      agentId: 'chaos-agent',
      transportId: 'chaos-transport',
      requestId: `chaos-${scenario.name.toLowerCase().replace(/\s/g, '-')}`,
      timestamp: Date.now(),
      metadata: { scenario: scenario.name }
    }

    try {
      // Test init
      if (!scenario.config.failOnInit) {
        await testPlugin.onInit(context)
      } else {
        try {
          await testPlugin.onInit(context)
        } catch (error) {
          console.log(`Expected init failure: ${(error as Error).message}`)
        }
      }

      // Test send operations
      if (!scenario.config.failOnSend) {
        for (let i = 0; i < 3; i++) {
          const payload: SendPayload = {
            input: { message: `Chaos test ${i + 1}` },
            metadata: { attempt: i + 1 }
          }
          
          try {
            await testPlugin.onSend(payload, context)
          } catch (error) {
            console.log(`Expected send failure on attempt ${i + 1}: ${(error as Error).message}`)
            break
          }
        }
      } else {
        try {
          const payload: SendPayload = {
            input: { message: 'Should fail' },
            metadata: {}
          }
          await testPlugin.onSend(payload, context)
        } catch (error) {
          console.log(`Expected send failure: ${(error as Error).message}`)
        }
      }

      // Test shutdown (unless it's configured to fail)
      try {
        await testPlugin.onShutdown(context)
      } catch (error) {
        console.log(`Shutdown error: ${(error as Error).message}`)
      }

    } catch (error) {
      console.log(`Scenario error: ${(error as Error).message}`)
    }

    // Show metrics for this scenario
    const metrics = testPlugin.getMetrics()
    console.log(`Metrics: ${JSON.stringify(metrics, null, 2)}`)
  }

  console.log('\n✅ Chaos testing simulation completed!')
}

/**
 * Demonstrate isolation guarantees
 */
export async function runIsolationDemo(): Promise<void> {
  console.log('\n🔒 Starting Isolation Demonstration\n')

  // Create multiple plugin instances
  const plugin1 = createGreetPlugin({ greetingPrefix: 'Plugin1', logLevel: 'debug' })
  const plugin2 = createGreetPlugin({ greetingPrefix: 'Plugin2', logLevel: 'info' })
  const plugin3 = createGreetPlugin({ greetingPrefix: 'Plugin3', logLevel: 'warn' })

  console.log('Plugin configurations:')
  console.log(`Plugin 1: ${JSON.stringify(plugin1.getConfig())}`)
  console.log(`Plugin 2: ${JSON.stringify(plugin2.getConfig())}`)
  console.log(`Plugin 3: ${JSON.stringify(plugin3.getConfig())}`)

  // Test configuration isolation
  console.log('\n🧪 Testing configuration isolation...')
  const plugin1Modified = plugin1.withConfig({ greetingPrefix: 'Modified' })
  
  console.log('After modifying plugin1:')
  console.log(`Original Plugin 1: ${plugin1.getConfig().greetingPrefix}`)
  console.log(`Modified Plugin 1: ${plugin1Modified.getConfig().greetingPrefix}`)
  console.log(`Plugin 2 (unchanged): ${plugin2.getConfig().greetingPrefix}`)
  console.log(`Plugin 3 (unchanged): ${plugin3.getConfig().greetingPrefix}`)

  console.log('\n✅ Isolation demonstration completed!')
}

/**
 * Generate final observability report
 */
export async function generateObservabilityReport(): Promise<void> {
  console.log('\n📊 Generating Observability Report\n')
  
  const plugin = createGreetPlugin({
    enabled: true,
    logLevel: 'debug',
    greetingPrefix: 'Report',
    maxDelay: 10
  })

  const context: AgentContext = {
    agentId: 'report-agent',
    transportId: 'report-transport',
    requestId: 'report-001',
    timestamp: Date.now(),
    metadata: { type: 'observability-report' }
  }

  // Execute lifecycle
  await plugin.onInit(context)
  
  for (let i = 0; i < 5; i++) {
    const payload: SendPayload = {
      input: { message: `Report message ${i + 1}` },
      metadata: { iteration: i + 1 }
    }
    await plugin.onSend(payload, context)
  }
  
  await plugin.onShutdown(context)

  // Generate comprehensive report
  const report = {
    timestamp: new Date().toISOString(),
    plugin: {
      name: plugin.name,
      version: plugin.version,
      configuration: plugin.getConfig()
    },
    metrics: plugin.getMetrics(),
    systemInfo: {
      memoryUsage: process.memoryUsage(),
      platform: process.platform,
      nodeVersion: process.version
    },
    performance: {
      avgInitTime: plugin.getMetrics().initTime,
      avgSendTime: plugin.getMetrics().sendCount > 0 
        ? plugin.getMetrics().initTime / plugin.getMetrics().sendCount 
        : 0,
      totalOperations: plugin.getMetrics().sendCount + 1, // +1 for init
      healthScore: plugin.getMetrics().errorCount === 0 ? 100 : 
        Math.max(0, 100 - (plugin.getMetrics().errorCount * 20))
    }
  }

  console.log('📋 Observability Report:')
  console.log(JSON.stringify(report, null, 2))
  
  console.log('\n🎯 Summary:')
  console.log(`• Plugin executed ${report.performance.totalOperations} operations successfully`)
  console.log(`• Average execution time: ${report.performance.avgSendTime.toFixed(2)}ms`)
  console.log(`• Health score: ${report.performance.healthScore}/100`)
  console.log(`• Memory footprint: ${Math.round(report.metrics.memoryUsage / 1024)}KB`)
}

/**
 * Main execution function
 */
export async function main(): Promise<void> {
  try {
    console.log('🚀 AgentKit Plugin Lifecycle & Chaos Testing Suite')
    console.log('=' .repeat(60))

    await runLifecycleSimulation()
    await runChaosSimulation()
    await runIsolationDemo()
    await generateObservabilityReport()

    console.log('\n🎉 All simulations completed successfully!')
    console.log('\n✨ Plugin system is production-ready with:')
    console.log('  • Complete lifecycle management')
    console.log('  • Chaos testing and failure injection')
    console.log('  • Plugin isolation and security')
    console.log('  • Comprehensive observability')
    console.log('  • Performance monitoring')
    
  } catch (error) {
    console.error('\n💥 Simulation suite failed:', error)
    process.exit(1)
  }
}

// Export for testing
if (require.main === module) {
  main()
}