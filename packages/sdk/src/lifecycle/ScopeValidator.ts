import { debugLog } from '../log'

/**
 * Scope validation utility for agent lifecycle
 */
export class ScopeValidator {
  /**
   * Validate agent scopes against requested scopes
   */
  static validateScopes(
    requestedScopes: string[] | undefined,
    registeredScopes: string[],
    agentId: string,
    debug: boolean = false
  ): void {
    if (!requestedScopes || requestedScopes.length === 0) {
      debugLog.operation('scope check', { 
        note: 'No scopes requested - skipping validation' 
      }, debug)
      return
    }

    const supportedScopes = registeredScopes

    // If no registered scopes, assume all scopes are supported
    if (supportedScopes.length === 0) {
      debugLog.operation('scope check', { 
        note: 'No registered scopes - assuming all scopes supported',
        requestedScopes 
      }, debug)
      return
    }

    // Check for unsupported scopes
    const unsupportedScopes = requestedScopes.filter(scope => !supportedScopes.includes(scope))
    
    if (unsupportedScopes.length > 0) {
      const message = `Scope mismatch: requested [${requestedScopes.join(', ')}] but agent only supports [${supportedScopes.join(', ')}]`
      debugLog.warn(message, { 
        agentId,
        requestedScopes,
        supportedScopes,
        unsupportedScopes 
      })
      debugLog.warn(message, {}, debug)
    } else {
      debugLog.operation('scope check', { 
        status: 'all requested scopes supported',
        requestedScopes,
        supportedScopes 
      }, debug)
    }
  }

  /**
   * Check if all requested scopes are supported
   */
  static areScopesSupported(
    requestedScopes: string[] | undefined,
    registeredScopes: string[]
  ): boolean {
    if (!requestedScopes || requestedScopes.length === 0) {
      return true
    }

    if (registeredScopes.length === 0) {
      return true // Assume all scopes supported if none registered
    }

    return requestedScopes.every(scope => registeredScopes.includes(scope))
  }

  /**
   * Get unsupported scopes
   */
  static getUnsupportedScopes(
    requestedScopes: string[] | undefined,
    registeredScopes: string[]
  ): string[] {
    if (!requestedScopes || requestedScopes.length === 0) {
      return []
    }

    if (registeredScopes.length === 0) {
      return [] // Assume all scopes supported if none registered
    }

    return requestedScopes.filter(scope => !registeredScopes.includes(scope))
  }
}