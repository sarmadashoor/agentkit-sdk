import { z } from 'zod'

/**
 * Agent mode definitions for comprehensive testing
 */
export type DummyTestAgentMode = 
  | 'echo'           // Replies with exact input
  | 'fail'           // Throws errors intentionally
  | 'metrics'        // Emits fake observability signals  
  | 'recursive'      // Calls its own handleMessage
  | 'validation'     // Requires strict typed payload shape
  | 'pluginExercise' // Triggers all plugin hooks explicitly
  | 'sideEffect'     // Attempts to mutate global state

/**
 * Configuration schema for DummyTestAgent
 */
export const DummyTestAgentConfigSchema = z.object({
  mode: z.enum(['echo', 'fail', 'metrics', 'recursive', 'validation', 'pluginExercise', 'sideEffect']).default('echo'),
  debug: z.boolean().optional().default(false),
  processingDelay: z.number().optional().default(10),
  
  // Fail mode specific options
  failOn: z.enum(['init', 'handle', 'shutdown', 'all']).optional().default('handle'),
  failMessage: z.string().optional().default('Intentional test failure'),
  
  // Recursive mode options
  recursionDepth: z.number().optional().default(3),
  
  // Validation mode options
  strictValidation: z.boolean().optional().default(true),
  
  // Metrics mode options
  emitMetrics: z.boolean().optional().default(true),
  
  // Side effect mode options
  attemptGlobalMutation: z.boolean().optional().default(true)
})

export type DummyTestAgentConfig = z.infer<typeof DummyTestAgentConfigSchema>

/**
 * Test results interface for integration testing
 */
export interface DummyTestAgentTestResult {
  mode: DummyTestAgentMode
  success: boolean
  error?: string
  metrics?: string[]
  pluginHooks?: string[]
  recursionCount?: number
  globalStateMutations?: number
  duration?: number
}