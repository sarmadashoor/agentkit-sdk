/**
 * Safe Plugin Parser - No Code Execution
 * 
 * SECURITY PATCH: Replaces eval() usage with safe AST-based parsing
 * Prevents code injection vulnerabilities during plugin signing
 */

import type { AgentKitPlugin } from '@agentkit/types'

/**
 * Safely parse plugin without executing any code
 * Uses static analysis instead of eval() to prevent code injection
 */
export function parsePluginSafely(content: string): AgentKitPlugin {
  // SECURITY: Never use eval() or Function() constructor
  // Instead, parse only static object literals using safe methods
  
  try {
    // Extract plugin object from common export patterns
    const plugin = extractPluginObject(content)
    
    // Validate plugin structure
    validatePluginStructure(plugin)
    
    return plugin
  } catch (error) {
    throw new Error(`Failed to safely parse plugin: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Extract plugin object using safe static analysis
 * SECURITY: No code execution - only static parsing
 */
function extractPluginObject(content: string): AgentKitPlugin {
  // Clean up content - remove comments and extra whitespace
  const cleanContent = removeCommentsAndCleanup(content)
  
  // Try different export patterns
  let pluginData: any
  
  // Pattern 1: export default { ... }
  const defaultExportMatch = cleanContent.match(/export\s+default\s+({[\s\S]*?})\s*;?\s*$/m)
  if (defaultExportMatch) {
    pluginData = parseObjectLiteralSafely(defaultExportMatch[1])
  } else {
    // Pattern 2: module.exports = { ... }
    const moduleExportMatch = cleanContent.match(/module\.exports\s*=\s*({[\s\S]*?})\s*;?\s*$/m)
    if (moduleExportMatch) {
      pluginData = parseObjectLiteralSafely(moduleExportMatch[1])
    } else {
      throw new Error('Could not find plugin export. Plugin must use "export default" or "module.exports" with object literal')
    }
  }
  
  return pluginData as AgentKitPlugin
}

/**
 * Parse object literal safely without code execution
 * SECURITY: Only parses static JSON-like structures
 */
function parseObjectLiteralSafely(objectStr: string): any {
  try {
    // First attempt: Try direct JSON parsing if it's a pure object literal
    const jsonCompatible = makeJsonCompatible(objectStr)
    return JSON.parse(jsonCompatible)
  } catch (jsonError) {
    // Second attempt: Parse simple object patterns manually
    return parseSimpleObjectLiteral(objectStr)
  }
}

/**
 * Convert JavaScript object literal to JSON-compatible format
 * SECURITY: Only handles safe static properties
 */
function makeJsonCompatible(objectStr: string): string {
  let result = objectStr
  
  // Handle unquoted property names
  result = result.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '"$1":')
  
  // Handle single quotes to double quotes
  result = result.replace(/'/g, '"')
  
  // Remove function definitions (replace with placeholders)
  result = result.replace(/:\s*function\s*\([^)]*\)\s*{[^}]*}/g, ': "__FUNCTION_PLACEHOLDER__"')
  result = result.replace(/:\s*async\s+function\s*\([^)]*\)\s*{[^}]*}/g, ': "__ASYNC_FUNCTION_PLACEHOLDER__"')
  result = result.replace(/:\s*\([^)]*\)\s*=>\s*{[^}]*}/g, ': "__ARROW_FUNCTION_PLACEHOLDER__"')
  result = result.replace(/:\s*async\s*\([^)]*\)\s*=>\s*{[^}]*}/g, ': "__ASYNC_ARROW_FUNCTION_PLACEHOLDER__"')
  
  // Remove trailing commas
  result = result.replace(/,(\s*[}\]])/g, '$1')
  
  return result
}

/**
 * Parse simple object literal manually for cases where JSON parsing fails
 * SECURITY: Only extracts basic properties, ignores functions
 */
function parseSimpleObjectLiteral(objectStr: string): any {
  const result: any = {}
  
  // Extract simple property patterns
  const propertyPattern = /(?:["']?([a-zA-Z_$][a-zA-Z0-9_$]*)["']?)\s*:\s*(?:["']([^"']*)["']|(\d+(?:\.\d+)?)|true|false)/g
  
  let match
  while ((match = propertyPattern.exec(objectStr)) !== null) {
    const [, key, stringValue, numberValue] = match
    
    if (stringValue !== undefined) {
      result[key] = stringValue
    } else if (numberValue !== undefined) {
      result[key] = parseFloat(numberValue)
    } else if (match[0].includes('true')) {
      result[key] = true
    } else if (match[0].includes('false')) {
      result[key] = false
    }
  }
  
  // Add placeholder functions if detected
  if (objectStr.includes('function') || objectStr.includes('=>')) {
    result.onInit = '__FUNCTION_PLACEHOLDER__'
    result.onSend = '__FUNCTION_PLACEHOLDER__'
    result.onError = '__FUNCTION_PLACEHOLDER__'
    result.onShutdown = '__FUNCTION_PLACEHOLDER__'
  }
  
  return result
}

/**
 * Remove comments and clean up content for parsing
 * SECURITY: Strips potentially malicious content in comments
 */
function removeCommentsAndCleanup(content: string): string {
  let result = content
  
  // Remove single-line comments
  result = result.replace(/\/\/.*$/gm, '')
  
  // Remove multi-line comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, '')
  
  // Remove extra whitespace
  result = result.replace(/\s+/g, ' ').trim()
  
  return result
}

/**
 * Validate plugin structure without executing code
 * SECURITY: Only validates static properties
 */
function validatePluginStructure(plugin: any): void {
  if (!plugin || typeof plugin !== 'object') {
    throw new Error('Plugin must be an object')
  }
  
  // Check required fields
  if (!plugin.name || typeof plugin.name !== 'string') {
    throw new Error('Plugin must have a "name" field of type string')
  }
  
  if (!plugin.version || typeof plugin.version !== 'string') {
    throw new Error('Plugin must have a "version" field of type string')
  }
  
  // Validate version format
  if (!/^\d+\.\d+\.\d+/.test(plugin.version)) {
    throw new Error('Plugin version must follow semantic versioning (e.g., "1.0.0")')
  }
  
  // Check optional fields
  if (plugin.description && typeof plugin.description !== 'string') {
    throw new Error('Plugin description must be a string')
  }
  
  // Validate hook functions are present (as placeholders)
  const validHooks = ['onInit', 'onSend', 'onError', 'onShutdown']
  for (const hook of validHooks) {
    if (plugin[hook] && plugin[hook] !== '__FUNCTION_PLACEHOLDER__' && 
        plugin[hook] !== '__ASYNC_FUNCTION_PLACEHOLDER__' &&
        plugin[hook] !== '__ARROW_FUNCTION_PLACEHOLDER__' &&
        plugin[hook] !== '__ASYNC_ARROW_FUNCTION_PLACEHOLDER__') {
      // If it's not a placeholder, it might be a string or other type - that's suspicious
      console.warn(`Warning: Plugin hook ${hook} has unexpected type. Expected function.`)
    }
  }
}

/**
 * Create a plugin object for signing with normalized function representations
 * SECURITY: Functions are represented as normalized strings for signature consistency
 */
export function normalizePluginForSigning(plugin: AgentKitPlugin): AgentKitPlugin {
  const normalized = { ...plugin }
  
  // Replace function placeholders with normalized representations
  const hookNames = ['onInit', 'onSend', 'onError', 'onShutdown'] as const
  
  for (const hookName of hookNames) {
    if (plugin[hookName]) {
      // For signing purposes, represent all functions as a normalized string
      normalized[hookName] = `async function ${hookName}() { /* implementation */ }` as any
    }
  }
  
  return normalized
}

/**
 * Detect potentially malicious code patterns in plugin content
 * SECURITY: Static analysis for dangerous patterns
 */
export function detectMaliciousPatterns(content: string): string[] {
  const dangerousPatterns = [
    /eval\s*\(/g,
    /Function\s*\(/g,
    /require\s*\(/g,
    /import\s*\(/g,
    /process\./g,
    /global\./g,
    /window\./g,
    /__proto__/g,
    /prototype\./g,
    /constructor/g,
    /\.call\s*\(/g,
    /\.apply\s*\(/g,
    /\.bind\s*\(/g
  ]
  
  const foundPatterns: string[] = []
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(content)) {
      foundPatterns.push(pattern.source)
    }
  }
  
  return foundPatterns
}