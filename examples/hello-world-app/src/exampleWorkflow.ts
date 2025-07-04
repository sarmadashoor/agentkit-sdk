/**
 * Example Workflow Module
 * 
 * Demonstrates comprehensive testing scenarios including valid/invalid payloads,
 * error handling, concurrency testing, and various agent modes.
 */

import type { AgentRuntimeHandle } from '@agentkit/sdk'
import type { DummyTestAgentMode } from '@agentkit/test-agent'

export interface WorkflowOptions {
  handle: AgentRuntimeHandle
  mode: DummyTestAgentMode
  concurrent?: boolean
  debug?: boolean
}

export interface WorkflowResult {
  messagesProcessed: number
  errorsEncountered: number
  duration: number
  success: boolean
}

/**
 * Execute a comprehensive workflow demonstrating various SDK capabilities
 */
export async function executeWorkflow(options: WorkflowOptions): Promise<WorkflowResult> {
  const { handle, mode, concurrent = false, debug = false } = options
  const startTime = Date.now()
  
  console.log(`\n🎯 Starting workflow for ${mode} mode...`)
  console.log(`   Concurrent: ${concurrent}`)
  console.log(`   Debug: ${debug}`)
  
  let messagesProcessed = 0
  let errorsEncountered = 0
  
  try {
    // Execute mode-specific workflow
    switch (mode) {
      case 'echo':
        await executeEchoWorkflow(handle, debug)
        messagesProcessed = 4
        break
        
      case 'fail':
        const failResult = await executeFailWorkflow(handle, debug)
        messagesProcessed = failResult.processed
        errorsEncountered = failResult.errors
        break
        
      case 'metrics':
        await executeMetricsWorkflow(handle, debug)
        messagesProcessed = 3
        break
        
      case 'recursive':
        await executeRecursiveWorkflow(handle, debug)
        messagesProcessed = 2
        break
        
      case 'validation':
        const validationResult = await executeValidationWorkflow(handle, debug)
        messagesProcessed = validationResult.processed
        errorsEncountered = validationResult.errors
        break
        
      case 'pluginExercise':
        await executePluginWorkflow(handle, debug)
        messagesProcessed = 3
        break
        
      case 'sideEffect':
        await executeSideEffectWorkflow(handle, debug)
        messagesProcessed = 2
        break
        
      default:
        await executeBasicWorkflow(handle, debug)
        messagesProcessed = 3
    }
    
    // Optional concurrency test
    if (concurrent) {
      const concurrentResult = await executeConcurrentWorkflow(handle, debug)
      messagesProcessed += concurrentResult.processed
      errorsEncountered += concurrentResult.errors
    }
    
  } catch (error) {
    errorsEncountered++
    console.error('❌ Workflow error:', error)
  }
  
  const duration = Date.now() - startTime
  const success = errorsEncountered === 0 || mode === 'fail' || mode === 'validation'
  
  console.log(`\n📊 Workflow Results:`)
  console.log(`   Messages processed: ${messagesProcessed}`)
  console.log(`   Errors encountered: ${errorsEncountered}`)
  console.log(`   Duration: ${duration}ms`)
  console.log(`   Success: ${success ? '✅' : '❌'}`)
  
  return {
    messagesProcessed,
    errorsEncountered,
    duration,
    success
  }
}

/**
 * Echo mode workflow - tests basic input/output
 */
async function executeEchoWorkflow(handle: AgentRuntimeHandle, _debug: boolean): Promise<void> {
  console.log('📨 Testing echo responses...')
  
  const messages = [
    { type: 'string', content: 'Hello, AgentKit!' },
    { type: 'greeting', message: 'Hello from object' },
    { complex: { nested: { data: [1, 2, 3] } } },
    { type: 'number', value: 42 }
  ]
  
  for (const [index, message] of messages.entries()) {
    console.log(`   Sending message ${index + 1}: ${typeof message}`)
    await handle.send(message)
    
    if (_debug) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
}

/**
 * Fail mode workflow - tests error handling
 */
async function executeFailWorkflow(handle: AgentRuntimeHandle, _debug: boolean): Promise<{ processed: number; errors: number }> {
  console.log('💥 Testing error handling...')
  
  let processed = 0
  let errors = 0
  
  const messages = [
    { type: 'fail-test', content: 'This should fail' },
    { trigger: 'error', data: 'test' },
    { type: 'fail-test', content: 'Another failure test' }
  ]
  
  for (const [index, message] of messages.entries()) {
    try {
      console.log(`   Sending message ${index + 1} (expecting failure)`)
      await handle.send(message)
      processed++
      console.log(`   ⚠️  Message ${index + 1} unexpectedly succeeded`)
    } catch (error) {
      errors++
      console.log(`   ✅ Message ${index + 1} failed as expected: ${(error as Error).message}`)
    }
  }
  
  return { processed, errors }
}

/**
 * Metrics mode workflow - tests observability
 */
async function executeMetricsWorkflow(handle: AgentRuntimeHandle, _debug: boolean): Promise<void> {
  console.log('📊 Testing metrics collection...')
  
  const messages = [
    { type: 'metrics-test', size: 'small' },
    { type: 'metrics-test', size: 'large', data: Array(100).fill('data') },
    { type: 'performance-test', timestamp: Date.now() }
  ]
  
  for (const [index, message] of messages.entries()) {
    console.log(`   Sending metrics message ${index + 1}`)
    await handle.send(message)
    
    // Allow time for metrics collection
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

/**
 * Recursive mode workflow - tests recursion handling
 */
async function executeRecursiveWorkflow(handle: AgentRuntimeHandle, _debug: boolean): Promise<void> {
  console.log('🔄 Testing recursive processing...')
  
  const messages = [
    { type: 'recursive-test', depth: 1 },
    { type: 'recursive-test', depth: 2, data: { complex: true } }
  ]
  
  for (const [index, message] of messages.entries()) {
    console.log(`   Sending recursive message ${index + 1}`)
    await handle.send(message)
    
    // Allow time for recursive processing
    await new Promise(resolve => setTimeout(resolve, 150))
  }
}

/**
 * Validation mode workflow - tests input validation
 */
async function executeValidationWorkflow(handle: AgentRuntimeHandle, _debug: boolean): Promise<{ processed: number; errors: number }> {
  console.log('✅ Testing input validation...')
  
  let processed = 0
  let errors = 0
  
  // Valid payload
  try {
    console.log('   Sending valid payload')
    await handle.send({
      type: 'test',
      data: {
        message: 'valid message',
        userId: 'user123'
      },
      timestamp: new Date().toISOString()
    })
    processed++
    console.log('   ✅ Valid payload accepted')
  } catch (error) {
    errors++
    console.log(`   ❌ Valid payload rejected: ${(error as Error).message}`)
  }
  
  // Invalid payload
  try {
    console.log('   Sending invalid payload')
    await handle.send({
      invalid: 'payload',
      missing: 'required fields'
    })
    processed++
    console.log('   ⚠️  Invalid payload unexpectedly accepted')
  } catch (error) {
    errors++
    console.log(`   ✅ Invalid payload rejected as expected: ${(error as Error).message}`)
  }
  
  return { processed, errors }
}

/**
 * Plugin exercise workflow - tests plugin integration
 */
async function executePluginWorkflow(handle: AgentRuntimeHandle, _debug: boolean): Promise<void> {
  console.log('🔌 Testing plugin integration...')
  
  const messages = [
    { type: 'plugin-test', action: 'trigger-all-hooks' },
    { type: 'plugin-test', action: 'generate-events' },
    { type: 'plugin-test', action: 'collect-metrics' }
  ]
  
  for (const [index, message] of messages.entries()) {
    console.log(`   Sending plugin message ${index + 1}`)
    await handle.send(message)
    
    // Allow time for plugin processing
    await new Promise(resolve => setTimeout(resolve, 75))
  }
}

/**
 * Side effect workflow - tests security guardrails
 */
async function executeSideEffectWorkflow(handle: AgentRuntimeHandle, _debug: boolean): Promise<void> {
  console.log('🛡️  Testing security guardrails...')
  
  const messages = [
    { type: 'side-effect-test', action: 'attempt-global-mutation' },
    { type: 'side-effect-test', action: 'test-isolation' }
  ]
  
  for (const [index, message] of messages.entries()) {
    console.log(`   Sending side effect message ${index + 1}`)
    await handle.send(message)
    
    // Allow time for side effect processing
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

/**
 * Basic workflow for unknown modes
 */
async function executeBasicWorkflow(handle: AgentRuntimeHandle, _debug: boolean): Promise<void> {
  console.log('📝 Executing basic workflow...')
  
  const messages = [
    { type: 'basic', content: 'Basic test message' },
    { type: 'basic', data: 'test' },
    { type: 'timestamp', timestamp: Date.now() }
  ]
  
  for (const [index, message] of messages.entries()) {
    console.log(`   Sending basic message ${index + 1}`)
    await handle.send(message)
  }
}

/**
 * Concurrent workflow - tests handling multiple simultaneous messages
 */
async function executeConcurrentWorkflow(handle: AgentRuntimeHandle, _debug: boolean): Promise<{ processed: number; errors: number }> {
  console.log('⚡ Testing concurrent message processing...')
  
  const concurrentMessages = Array.from({ length: 5 }, (_, i) => ({
    type: 'concurrent-test',
    messageId: i + 1,
    timestamp: Date.now(),
    data: `Concurrent message ${i + 1}`
  }))
  
  let processed = 0
  let errors = 0
  
  // Send all messages concurrently
  const promises = concurrentMessages.map(async (message, index) => {
    try {
      console.log(`   Sending concurrent message ${index + 1}`)
      await handle.send(message)
      processed++
      return { success: true, messageId: message.messageId }
    } catch (error) {
      errors++
      console.error(`   ❌ Concurrent message ${index + 1} failed: ${(error as Error).message}`)
      return { success: false, messageId: message.messageId, error }
    }
  })
  
  // Wait for all messages to complete
  const results = await Promise.allSettled(promises)
  const successful = results.filter(r => r.status === 'fulfilled').length
  
  console.log(`   Concurrent results: ${successful}/${concurrentMessages.length} successful`)
  
  return { processed, errors }
}

/**
 * Performance test workflow
 */
export async function executePerformanceTest(handle: AgentRuntimeHandle): Promise<{ avgLatency: number; throughput: number }> {
  console.log('\n⚡ Running performance test...')
  
  const messageCount = 10
  const messages = Array.from({ length: messageCount }, (_, i) => ({
    type: 'performance-test',
    messageId: i + 1,
    timestamp: Date.now()
  }))
  
  const startTime = Date.now()
  const latencies: number[] = []
  
  for (const message of messages) {
    const messageStart = Date.now()
    
    try {
      await handle.send(message)
      const latency = Date.now() - messageStart
      latencies.push(latency)
    } catch (error) {
      console.error(`Performance test message failed: ${(error as Error).message}`)
    }
  }
  
  const totalTime = Date.now() - startTime
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length
  const throughput = (messageCount / totalTime) * 1000 // messages per second
  
  console.log(`   Messages: ${messageCount}`)
  console.log(`   Total time: ${totalTime}ms`)
  console.log(`   Average latency: ${avgLatency.toFixed(2)}ms`)
  console.log(`   Throughput: ${throughput.toFixed(2)} msg/sec`)
  
  return { avgLatency, throughput }
}