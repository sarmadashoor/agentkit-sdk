/**
 * PluginCompatibilityValidator - Validates plugin compatibility with current SDK version
 * Ensures plugins meet version requirements and have necessary permissions
 */

import { debugLog } from '../log'
import type { PluginCompatibility, PluginPermissions } from '@agentkit/types'

/**
 * SDK version information
 */
interface SdkVersion {
  version: string
  major: number
  minor: number
  patch: number
}

/**
 * Runtime environment information
 */
interface RuntimeEnvironment {
  isNode: boolean
  isBrowser: boolean
  nodeVersion?: string
  browserInfo?: {
    name: string
    version: string
  }
}

/**
 * Compatibility check result
 */
export interface CompatibilityResult {
  compatible: boolean
  errors: string[]
  warnings: string[]
  permissions: {
    granted: string[]
    denied: string[]
    required: string[]
  }
}

/**
 * Plugin compatibility validator
 */
export class PluginCompatibilityValidator {
  private sdkVersion: SdkVersion
  private environment: RuntimeEnvironment
  private debug: boolean

  constructor(sdkVersion: string, debug: boolean = false) {
    this.sdkVersion = this.parseVersion(sdkVersion)
    this.environment = this.detectEnvironment()
    this.debug = debug

    debugLog.lifecycle('compatibility validator created', 'PluginCompatibilityValidator', {
      sdkVersion: this.sdkVersion,
      environment: this.environment
    }, debug)
  }

  /**
   * Parse semantic version string
   */
  private parseVersion(version: string): SdkVersion {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
    if (!match) {
      throw new Error(`Invalid version format: ${version}`)
    }

    return {
      version,
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10)
    }
  }

  /**
   * Detect runtime environment
   */
  private detectEnvironment(): RuntimeEnvironment {
    const isNode = typeof process !== 'undefined' && process.versions?.node
    const isBrowser = typeof window !== 'undefined'

    const environment: RuntimeEnvironment = {
      isNode: !!isNode,
      isBrowser: !!isBrowser
    }

    if (isNode) {
      environment.nodeVersion = process.versions.node
    }

    if (isBrowser && typeof navigator !== 'undefined') {
      environment.browserInfo = this.detectBrowser()
    }

    return environment
  }

  /**
   * Detect browser type and version
   */
  private detectBrowser(): { name: string; version: string } {
    const userAgent = navigator.userAgent

    // Chrome
    if (userAgent.includes('Chrome/')) {
      const match = userAgent.match(/Chrome\/(\d+\.\d+)/)
      return { name: 'chrome', version: match?.[1] || 'unknown' }
    }

    // Firefox
    if (userAgent.includes('Firefox/')) {
      const match = userAgent.match(/Firefox\/(\d+\.\d+)/)
      return { name: 'firefox', version: match?.[1] || 'unknown' }
    }

    // Safari
    if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
      const match = userAgent.match(/Version\/(\d+\.\d+)/)
      return { name: 'safari', version: match?.[1] || 'unknown' }
    }

    // Edge
    if (userAgent.includes('Edg/')) {
      const match = userAgent.match(/Edg\/(\d+\.\d+)/)
      return { name: 'edge', version: match?.[1] || 'unknown' }
    }

    return { name: 'unknown', version: 'unknown' }
  }

  /**
   * Compare version strings
   */
  private compareVersions(version1: string, version2: string): number {
    const v1 = this.parseVersion(version1)
    const v2 = this.parseVersion(version2)

    if (v1.major !== v2.major) {
      return v1.major - v2.major
    }
    if (v1.minor !== v2.minor) {
      return v1.minor - v2.minor
    }
    return v1.patch - v2.patch
  }

  /**
   * Validate SDK version compatibility
   */
  private validateSdkCompatibility(compatibility: PluginCompatibility): { errors: string[]; warnings: string[] } {
    const errors: string[] = []
    const warnings: string[] = []

    // Check minimum version
    if (compatibility.minSdkVersion) {
      if (this.compareVersions(this.sdkVersion.version, compatibility.minSdkVersion) < 0) {
        errors.push(`Plugin requires SDK version >= ${compatibility.minSdkVersion}, but current version is ${this.sdkVersion.version}`)
      }
    }

    // Check maximum version
    if (compatibility.maxSdkVersion) {
      if (this.compareVersions(this.sdkVersion.version, compatibility.maxSdkVersion) > 0) {
        errors.push(`Plugin requires SDK version <= ${compatibility.maxSdkVersion}, but current version is ${this.sdkVersion.version}`)
      }
    }

    // Check supported versions
    if (compatibility.supportedVersions && compatibility.supportedVersions.length > 0) {
      const isSupported = compatibility.supportedVersions.some(supportedVersion => {
        try {
          return this.compareVersions(this.sdkVersion.version, supportedVersion) === 0
        } catch {
          return false
        }
      })

      if (!isSupported) {
        errors.push(`Plugin only supports SDK versions: ${compatibility.supportedVersions.join(', ')}, but current version is ${this.sdkVersion.version}`)
      }
    }

    return { errors, warnings }
  }

  /**
   * Validate Node.js version compatibility
   */
  private validateNodeCompatibility(compatibility: PluginCompatibility): { errors: string[]; warnings: string[] } {
    const errors: string[] = []
    const warnings: string[] = []

    if (!this.environment.isNode) {
      return { errors, warnings }
    }

    if (compatibility.nodeVersion && this.environment.nodeVersion) {
      try {
        if (this.compareVersions(this.environment.nodeVersion, compatibility.nodeVersion) < 0) {
          errors.push(`Plugin requires Node.js version >= ${compatibility.nodeVersion}, but current version is ${this.environment.nodeVersion}`)
        }
      } catch (error) {
        warnings.push(`Could not validate Node.js version compatibility: ${error}`)
      }
    }

    return { errors, warnings }
  }

  /**
   * Validate browser compatibility
   */
  private validateBrowserCompatibility(compatibility: PluginCompatibility): { errors: string[]; warnings: string[] } {
    const errors: string[] = []
    const warnings: string[] = []

    if (!this.environment.isBrowser || !compatibility.browserCompatibility || !this.environment.browserInfo) {
      return { errors, warnings }
    }

    const { browserInfo } = this.environment
    const browserRequirements = compatibility.browserCompatibility

    const requiredVersion = browserRequirements[browserInfo.name as keyof typeof browserRequirements]
    
    if (requiredVersion) {
      try {
        if (this.compareVersions(browserInfo.version, requiredVersion) < 0) {
          errors.push(`Plugin requires ${browserInfo.name} version >= ${requiredVersion}, but current version is ${browserInfo.version}`)
        }
      } catch (error) {
        warnings.push(`Could not validate ${browserInfo.name} version compatibility: ${error}`)
      }
    }

    return { errors, warnings }
  }

  /**
   * Validate plugin permissions
   */
  private validatePermissions(permissions: PluginPermissions): {
    granted: string[]
    denied: string[]
    required: string[]
  } {
    const granted: string[] = []
    const denied: string[] = []
    const required: string[] = []

    // Network permissions
    if (permissions.network !== undefined) {
      required.push('network')
      if (this.environment.isBrowser) {
        // Browsers have network access by default (with CORS restrictions)
        granted.push('network')
      } else if (this.environment.isNode) {
        // Node.js has network access by default
        granted.push('network')
      } else {
        denied.push('network')
      }
    }

    // Filesystem permissions
    if (permissions.filesystem !== undefined) {
      required.push('filesystem')
      if (this.environment.isNode) {
        // Node.js has filesystem access
        granted.push('filesystem')
      } else {
        // Browsers don't have direct filesystem access
        denied.push('filesystem')
      }
    }

    // System permissions
    if (permissions.system !== undefined) {
      required.push('system')
      if (this.environment.isNode) {
        // Node.js has system access
        granted.push('system')
      } else {
        // Browsers don't have system access
        denied.push('system')
      }
    }

    // Custom permissions
    if (permissions.custom) {
      Object.keys(permissions.custom).forEach(permission => {
        required.push(`custom:${permission}`)
        // For now, deny all custom permissions for security
        denied.push(`custom:${permission}`)
      })
    }

    return { granted, denied, required }
  }

  /**
   * Validate plugin compatibility
   */
  validate(
    pluginName: string,
    compatibility?: PluginCompatibility,
    permissions?: PluginPermissions
  ): CompatibilityResult {
    const errors: string[] = []
    const warnings: string[] = []

    debugLog.operation('validating plugin compatibility', {
      pluginName,
      compatibility,
      permissions
    }, this.debug)

    // Validate SDK compatibility
    if (compatibility) {
      const sdkResult = this.validateSdkCompatibility(compatibility)
      errors.push(...sdkResult.errors)
      warnings.push(...sdkResult.warnings)

      // Validate Node.js compatibility
      const nodeResult = this.validateNodeCompatibility(compatibility)
      errors.push(...nodeResult.errors)
      warnings.push(...nodeResult.warnings)

      // Validate browser compatibility
      const browserResult = this.validateBrowserCompatibility(compatibility)
      errors.push(...browserResult.errors)
      warnings.push(...browserResult.warnings)
    }

    // Validate permissions
    const permissionResult = permissions ? this.validatePermissions(permissions) : {
      granted: [],
      denied: [],
      required: []
    }

    // Check for denied required permissions
    const deniedRequired = permissionResult.denied.filter(permission => 
      permissionResult.required.includes(permission)
    )

    if (deniedRequired.length > 0) {
      errors.push(`Plugin requires permissions that are not available: ${deniedRequired.join(', ')}`)
    }

    const result: CompatibilityResult = {
      compatible: errors.length === 0,
      errors,
      warnings,
      permissions: permissionResult
    }

    debugLog.operation('plugin compatibility validation result', {
      pluginName,
      result
    }, this.debug)

    return result
  }

  /**
   * Get current environment information
   */
  getEnvironmentInfo(): {
    sdkVersion: SdkVersion
    environment: RuntimeEnvironment
  } {
    return {
      sdkVersion: { ...this.sdkVersion },
      environment: { ...this.environment }
    }
  }
}