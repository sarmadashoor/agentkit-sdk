/**
 * Zod validation wrapper with clear developer-friendly error messages
 */

import { ZodSchema, ZodError } from 'zod'
import { SchemaValidationError, InvalidInputError } from './errors'
import { debugLog } from './log'

/**
 * Validate input against a Zod schema with clear error messages
 */
export function validateSchema<T>(
  schema: ZodSchema<T>, 
  input: unknown, 
  label: string,
  debug: boolean = false
): T {
  debugLog.validation(`${label} schema`, true, undefined, debug)
  
  const result = schema.safeParse(input)
  
  if (!result.success) {
    const errorDetails = formatZodError(result.error)
    debugLog.validation(`${label} schema`, false, errorDetails, debug)
    
    throw SchemaValidationError.fromZodError(result.error, {
      context: { 
        label,
        input: typeof input === 'object' ? JSON.stringify(input, null, 2) : input
      }
    })
  }

  debugLog.validation(`${label} schema`, true, 'Validation successful', debug)
  return result.data
}

/**
 * Format Zod error into developer-friendly message
 */
function formatZodError(error: ZodError): string {
  const issues = error.errors.map(issue => {
    const path = issue.path.length > 0 ? ` at "${issue.path.join('.')}"` : ''
    return `${issue.message}${path}`
  })

  if (issues.length === 1) {
    return issues[0]
  }

  return issues.map((issue, index) => `${index + 1}. ${issue}`).join('; ')
}

/**
 * Validate agent configuration with helpful context
 */
export function validateAgentConfig(input: unknown, debug: boolean = false): unknown {
  // For now, we don't have a specific agent config schema
  // but we can validate that it's an object if provided
  if (input !== undefined && input !== null && typeof input !== 'object') {
    throw new InvalidInputError(
      'agentConfig',
      'must be an object',
      { context: { input, type: typeof input } }
    )
  }
  
  debugLog.validation('agent config', true, 'Agent config is valid', debug)
  return input
}

/**
 * Validate transport configuration with helpful context
 */
export function validateTransportConfig(input: unknown, debug: boolean = false): unknown {
  // For now, we don't have a specific transport config schema
  // but we can validate that it's an object if provided
  if (input !== undefined && input !== null && typeof input !== 'object') {
    throw new InvalidInputError(
      'transportConfig',
      'must be an object', 
      { context: { input, type: typeof input } }
    )
  }
  
  debugLog.validation('transport config', true, 'Transport config is valid', debug)
  return input
}

/**
 * Validate scope array
 */
export function validateScope(scope: unknown, debug: boolean = false): string[] | undefined {
  if (scope === undefined || scope === null) {
    return undefined
  }

  if (!Array.isArray(scope)) {
    throw new InvalidInputError(
      'scope',
      'must be an array of strings',
      { context: { scope, type: typeof scope } }
    )
  }

  for (let i = 0; i < scope.length; i++) {
    if (typeof scope[i] !== 'string') {
      throw new InvalidInputError(
        `scope[${i}]`,
        'must be a string',
        { context: { scope, invalidItem: scope[i], index: i } }
      )
    }
  }

  debugLog.validation('scope', true, `Validated scope with ${scope.length} items`, debug)
  return scope as string[]
}

/**
 * Create a validation context for debugging
 */
export function createValidationContext(
  schemaName: string,
  input: unknown
): Record<string, unknown> {
  return {
    schema: schemaName,
    inputType: typeof input,
    inputKeys: input && typeof input === 'object' ? Object.keys(input) : undefined,
    timestamp: new Date().toISOString()
  }
}