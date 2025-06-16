import { PluginConfig } from '../../types'
import { PluginTemplateUtils } from '../utils/PluginTemplateUtils'

/**
 * Generates the main plugin code file
 */
export class PluginCodeGenerator {
  /**
   * Generate the complete plugin code
   */
  generatePluginCode(config: PluginConfig): string {
    const className = PluginTemplateUtils.toPascalCase(config.name)
    const imports = this.generateImports(config)
    const hookImplementations = this.generateHookImplementations(config)
    const browserSafeComment = config.browserSafe ? '// @browser-safe' : ''

    return `${browserSafeComment}
${imports}

/**
 * ${config.description || `${config.name} plugin for AgentKit`}
 * 
 * @author ${config.author}
 * @license ${config.license}
 */
export class ${className} implements AgentKitPlugin {
  readonly name = '${config.name}'
  readonly version = '1.0.0'
  readonly description = '${config.description || `${config.name} plugin for AgentKit`}'
  
  ${config.browserSafe ? this.generateBrowserCompatibility() : ''}
  
  private readonly pluginConfig: ${className}Config
  
  constructor(config?: Partial<${className}Config>) {
    // Merge with defaults and validate
    this.pluginConfig = ${className}ConfigSchema.parse(config || {})
  }

  /**
   * Get the current plugin configuration
   */
  getConfig(): Readonly<${className}Config> {
    return { ...this.pluginConfig }
  }

  /**
   * Update plugin configuration (creates new instance)
   */
  withConfig(newConfig: Partial<${className}Config>): ${className} {
    return new ${className}({ ...this.pluginConfig, ...newConfig })
  }

${hookImplementations}
}

// Enhanced configuration schema with validation
export const ${className}ConfigSchema = z.object({
  /** Enable or disable the plugin */
  enabled: z.boolean().default(true),
  /** Logging level for plugin operations */
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Custom configuration for your plugin */
  // Add your specific configuration fields here
}).strict() // Prevent additional properties

export type ${className}Config = z.infer<typeof ${className}ConfigSchema>

/**
 * Plugin factory function for easy instantiation
 */
export function create${className}(config?: Partial<${className}Config>): ${className} {
  return new ${className}(config)
}

/**
 * Register plugin with AgentKit SDK
 * Usage: connectAgent({ plugins: [register${className}()] })
 */
export function register${className}(config?: Partial<${className}Config>) {
  return create${className}(config)
}

// Default export for convenience
export default ${className}
`
  }

  /**
   * Generate import statements based on plugin configuration
   */
  generateImports(config: PluginConfig): string {
    const imports = [
      `import type { AgentKitPlugin, AgentContext${config.hooks.includes('onSend') ? ', SendPayload' : ''} } from '@agentkit/types'`,
      `import { z } from 'zod'`
    ]

    if (!config.browserSafe) {
      // Add Node.js specific imports if needed
    }

    return imports.join('\n')
  }

  /**
   * Generate hook implementations based on selected hooks
   */
  generateHookImplementations(config: PluginConfig): string {
    const implementations: string[] = []

    for (const hook of config.hooks) {
      implementations.push(PluginTemplateUtils.generateHookTemplate(hook))
    }

    return implementations.join('\n')
  }

  /**
   * Generate browser compatibility section
   */
  generateBrowserCompatibility(): string {
    return `
  compatibility = {
    browserCompatibility: {
      chrome: 'latest',
      firefox: 'latest',
      safari: 'latest',
      edge: 'latest'
    }
  }`
  }
}