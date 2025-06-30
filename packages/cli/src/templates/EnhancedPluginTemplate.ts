import { PluginConfig } from '../types'
import type { PluginHookName as _PluginHookName } from '../types/agentkit-types'

export class EnhancedPluginTemplate {
  generate(config: PluginConfig): string {
    const className = this.toPascalCase(config.name)
    const imports = this.generateImports(config)
    const hookImplementations = this.generateHookImplementations(config)
    const debugFeatures = config.withDebug ? this.generateDebugFeatures(config) : ''
    const performanceFeatures = config.withPerformance ? this.generatePerformanceFeatures(config) : ''
    const hotReloadFeatures = config.withHotReload ? this.generateHotReloadFeatures(config) : ''
    const browserSafeComment = config.browserSafe ? '// @browser-safe' : ''

    return `${browserSafeComment}
${imports}

/**
 * ${config.description || `${config.name} plugin for AgentKit`}
 * 
 * Enhanced with world-class DX features:
 * ${config.withDebug ? '- 🐛 Debug mode with runtime tracing' : ''}
 * ${config.withPerformance ? '- 📊 Performance monitoring and profiling' : ''}
 * ${config.withHotReload ? '- 🔥 Hot reload for rapid development' : ''}
 * ${config.withTests ? '- 🧪 Comprehensive test suite' : ''}
 * 
 * @author ${config.author}
 * @license ${config.license}
 * @version 1.0.0
 */
${config.withDebug ? '@debugTrace()' : ''}
${config.withPerformance ? '@debugPerformance(50)' : ''}
${config.withHotReload ? '@hotReload("${config.name}")' : ''}
export class ${className} implements AgentKitPlugin {
  name = '${config.name}'
  version = '1.0.0'
  description = '${config.description || `${config.name} plugin for AgentKit`}'
  
  ${config.browserSafe ? this.generateBrowserCompatibility() : ''}
  ${debugFeatures}
  ${performanceFeatures}
  
  constructor(private config?: ${className}Config) {
    // Validate config if provided
    if (config) {
      this.validateConfig(config)
    }
    
    ${config.withDebug ? this.generateDebugInitialization(config) : ''}
    ${config.withPerformance ? this.generatePerformanceInitialization(config) : ''}
    ${config.withHotReload ? this.generateHotReloadInitialization(config) : ''}
  }

  private validateConfig(config: unknown): asserts config is ${className}Config {
    const result = ${className}ConfigSchema.safeParse(config)
    if (!result.success) {
      throw new Error(\`Invalid ${config.name} config: \${result.error.message}\`)
    }
  }

${hookImplementations}

  ${config.withDebug ? this.generateDebugMethods(config) : ''}
  ${config.withPerformance ? this.generatePerformanceMethods(config) : ''}
}

// Enhanced configuration schema with DX features
export const ${className}ConfigSchema = z.object({
  // Core configuration
  enabled: z.boolean().default(true),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  
  ${config.withDebug ? this.generateDebugConfigSchema() : ''}
  ${config.withPerformance ? this.generatePerformanceConfigSchema() : ''}
  ${config.withHotReload ? this.generateHotReloadConfigSchema() : ''}
  
  // Plugin-specific configuration
  // TODO: Add your custom configuration fields here
})

export type ${className}Config = z.infer<typeof ${className}ConfigSchema>

${config.withDebug ? this.generateDebugUtilities(config) : ''}
${config.withPerformance ? this.generatePerformanceUtilities(config) : ''}
${hotReloadFeatures}

// Plugin factory for easy instantiation
export function create${className}(config?: Partial<${className}Config>): ${className} {
  return new ${className}(config)
}

// Plugin development utilities
${config.withDebug ? this.generateDevelopmentUtilities(config) : ''}

// Export for hot reload registration
${config.withHotReload ? `
if (process.env.NODE_ENV === 'development') {
  // Auto-register for hot reload
  const { globalHotReloadManager } = require('@agentkit/sdk/debug-tools')
  globalHotReloadManager.registerPlugin('${config.name}', __filename)
}
` : ''}
`
  }

  private generateImports(config: PluginConfig): string {
    const imports = [
      "import type { AgentKitPlugin, AgentContext, SendPayload } from '../types/agentkit-types'",
      "import { z } from 'zod'"
    ]

    if (config.withDebug) {
      imports.push(
        "// import { debugTrace, debugPerformance, createDebugContext } from '@agentkit/sdk/debug-tools'"
      )
    }

    if (config.withPerformance) {
      imports.push(
        "// import { measurePluginPerformance, createPluginDevelopmentWrapper } from '@agentkit/sdk/debug-tools'"
      )
    }

    if (config.withHotReload) {
      imports.push(
        "// import { hotReload, globalHotReloadManager } from '@agentkit/sdk/debug-tools'"
      )
    }

    return imports.join('\n')
  }

  private generateHookImplementations(config: PluginConfig): string {
    return config.hooks.map(hook => {
      switch (hook) {
        case 'onInit':
          return this.generateOnInitHook(config)
        case 'onSend':
          return this.generateOnSendHook(config)
        case 'onError':
          return this.generateOnErrorHook(config)
        case 'onShutdown':
          return this.generateOnShutdownHook(config)
        default:
          return ''
      }
    }).join('\n\n')
  }

  private generateOnInitHook(config: PluginConfig): string {
    return `  /**
   * Initialize plugin
   * ${config.withDebug ? '@debugTrace()' : ''}
   */
  ${config.withDebug ? '@debugTrace()' : ''}
  async onInit(context: AgentContext): Promise<void> {
    ${config.withDebug ? `this.debug.info('Plugin initializing', { agentId: context.agentId })` : ''}
    ${config.withPerformance ? `const startTime = performance.now()` : ''}
    
    try {
      // TODO: Implement your initialization logic here
      console.log(\`\${this.name} plugin initialized for agent \${context.agentId}\`)
      
      ${config.withPerformance ? `
      const duration = performance.now() - startTime
      this.metrics.recordInitTime(duration)
      ` : ''}
      
      ${config.withDebug ? `this.debug.info('Plugin initialized successfully', { duration: performance.now() - Date.now() })` : ''}
    } catch (error) {
      ${config.withDebug ? `this.debug.error('Plugin initialization failed', { error })` : ''}
      throw error
    }
  }`
  }

  private generateOnSendHook(config: PluginConfig): string {
    return `  /**
   * Process outgoing messages
   * ${config.withDebug ? '@debugTrace()' : ''}
   * ${config.withPerformance ? '@debugPerformance(50)' : ''}
   */
  ${config.withDebug ? '@debugTrace()' : ''}
  ${config.withPerformance ? '@debugPerformance(50)' : ''}
  async onSend(payload: SendPayload, context: AgentContext): Promise<void> {
    ${config.withDebug ? `this.debug.debug('Processing outgoing message', { 
      agentId: context.agentId, 
      payloadSize: JSON.stringify(payload).length 
    })` : ''}
    ${config.withPerformance ? `const startTime = performance.now()` : ''}
    
    try {
      // TODO: Implement your send processing logic here
      console.log(\`\${this.name} processing send for agent \${context.agentId}\`)
      
      ${config.withPerformance ? `
      const duration = performance.now() - startTime
      this.metrics.recordSendTime(duration)
      ` : ''}
      
      ${config.withDebug ? `this.debug.debug('Message processed successfully')` : ''}
    } catch (error) {
      ${config.withDebug ? `this.debug.error('Send processing failed', { error })` : ''}
      ${config.withPerformance ? `this.metrics.recordError('send', error)` : ''}
      throw error
    }
  }`
  }

  private generateOnErrorHook(config: PluginConfig): string {
    return `  /**
   * Handle errors
   * ${config.withDebug ? '@debugTrace()' : ''}
   */
  ${config.withDebug ? '@debugTrace()' : ''}
  async onError(error: Error, context: AgentContext): Promise<void> {
    ${config.withDebug ? `this.debug.error('Handling error', { 
      error: error.message, 
      agentId: context.agentId 
    })` : ''}
    
    try {
      // TODO: Implement your error handling logic here
      console.error(\`\${this.name} handling error for agent \${context.agentId}:\`, error.message)
      
      ${config.withPerformance ? `this.metrics.recordError('general', error)` : ''}
    } catch (handlingError) {
      ${config.withDebug ? `this.debug.error('Error handling failed', { handlingError })` : ''}
      // Don't throw from error handler to avoid infinite loops
      console.error('Error handling failed:', handlingError)
    }
  }`
  }

  private generateOnShutdownHook(config: PluginConfig): string {
    return `  /**
   * Clean up plugin resources
   * ${config.withDebug ? '@debugTrace()' : ''}
   */
  ${config.withDebug ? '@debugTrace()' : ''}
  async onShutdown(context: AgentContext): Promise<void> {
    ${config.withDebug ? `this.debug.info('Plugin shutting down', { agentId: context.agentId })` : ''}
    
    try {
      // TODO: Implement your cleanup logic here
      console.log(\`\${this.name} plugin shutting down for agent \${context.agentId}\`)
      
      ${config.withPerformance ? `this.metrics.export()` : ''}
      ${config.withDebug ? `this.debug.info('Plugin shutdown completed')` : ''}
    } catch (error) {
      ${config.withDebug ? `this.debug.error('Plugin shutdown failed', { error })` : ''}
      // Log but don't throw during shutdown
      console.error('Plugin shutdown error:', error)
    }
  }`
  }

  private generateDebugFeatures(config: PluginConfig): string {
    return `
  // Debug tools integration
  private debug = createDebugContext('${config.name}')
  private debugEnabled = process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true'`
  }

  private generatePerformanceFeatures(_config: PluginConfig): string {
    return `
  // Performance monitoring
  private metrics = {
    initTime: 0,
    sendTimes: [] as number[],
    errors: [] as Array<{ type: string, error: Error, timestamp: number }>,
    
    recordInitTime: (duration: number) => {
      this.metrics.initTime = duration
    },
    
    recordSendTime: (duration: number) => {
      this.metrics.sendTimes.push(duration)
      if (this.metrics.sendTimes.length > 100) {
        this.metrics.sendTimes = this.metrics.sendTimes.slice(-50)
      }
    },
    
    recordError: (type: string, error: Error) => {
      this.metrics.errors.push({ type, error, timestamp: Date.now() })
      if (this.metrics.errors.length > 50) {
        this.metrics.errors = this.metrics.errors.slice(-25)
      }
    },
    
    export: () => {
      if (this.debugEnabled) {
        console.table({
          'Init Time': \`\${this.metrics.initTime.toFixed(2)}ms\`,
          'Avg Send Time': this.metrics.sendTimes.length > 0 
            ? \`\${(this.metrics.sendTimes.reduce((a, b) => a + b, 0) / this.metrics.sendTimes.length).toFixed(2)}ms\`
            : 'N/A',
          'Total Sends': this.metrics.sendTimes.length,
          'Total Errors': this.metrics.errors.length
        })
      }
    }
  }`
  }

  private generateBrowserCompatibility(): string {
    return `// Browser compatibility markers
  static readonly browserCompatible = true
  static readonly requiresDOM = false
  static readonly requiresFileSystem = false
  static readonly requiresNetwork = false
  `
  }

  private generateDebugInitialization(config: PluginConfig): string {
    return `
    // Initialize debug tools
    if (this.debugEnabled) {
      this.debug.info('Debug mode enabled for ${config.name}')
    }`
  }

  private generatePerformanceInitialization(config: PluginConfig): string {
    return `
    // Initialize performance monitoring
    if (process.env.NODE_ENV === 'development') {
      console.log('📊 Performance monitoring enabled for ${config.name}')
    }`
  }

  private generateHotReloadInitialization(config: PluginConfig): string {
    return `
    // Initialize hot reload
    if (process.env.NODE_ENV === 'development') {
      this.debug.info('Hot reload enabled for ${config.name}')
    }`
  }

  private generateDebugMethods(_config: PluginConfig): string {
    return `
  /**
   * Get debug information about plugin state
   */
  getDebugInfo(): object {
    return {
      name: this.name,
      version: this.version,
      config: this.config,
      debugEnabled: this.debugEnabled,
      timestamp: Date.now()
    }
  }

  /**
   * Enable debug mode programmatically
   */
  enableDebug(): void {
    this.debugEnabled = true
    this.debug.info('Debug mode enabled programmatically')
  }

  /**
   * Disable debug mode
   */
  disableDebug(): void {
    this.debugEnabled = false
    this.debug.info('Debug mode disabled')
  }`
  }

  private generatePerformanceMethods(_config: PluginConfig): string {
    return `
  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): object {
    const avgSendTime = this.metrics.sendTimes.length > 0 
      ? this.metrics.sendTimes.reduce((a, b) => a + b, 0) / this.metrics.sendTimes.length 
      : 0

    return {
      initTime: this.metrics.initTime,
      averageSendTime: avgSendTime,
      totalSends: this.metrics.sendTimes.length,
      totalErrors: this.metrics.errors.length,
      errorRate: this.metrics.sendTimes.length > 0 
        ? (this.metrics.errors.length / this.metrics.sendTimes.length) * 100 
        : 0
    }
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.metrics.sendTimes = []
    this.metrics.errors = []
    this.metrics.initTime = 0
    this.debug.info('Performance metrics reset')
  }`
  }

  private generateDebugConfigSchema(): string {
    return `
  // Debug configuration
  debug: z.object({
    enabled: z.boolean().default(process.env.NODE_ENV === 'development'),
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
    enableConsoleOutput: z.boolean().default(true)
  }).default({}),`
  }

  private generatePerformanceConfigSchema(): string {
    return `
  // Performance configuration  
  performance: z.object({
    enableMonitoring: z.boolean().default(true),
    warningThreshold: z.number().default(100), // ms
    errorThreshold: z.number().default(1000)   // ms
  }).default({}),`
  }

  private generateHotReloadConfigSchema(): string {
    return `
  // Hot reload configuration
  hotReload: z.object({
    enabled: z.boolean().default(process.env.NODE_ENV === 'development'),
    watchPaths: z.array(z.string()).default(['./src']),
    debounceMs: z.number().default(500)
  }).default({}),`
  }

  private generateDebugUtilities(config: PluginConfig): string {
    return `
// Debug utilities for development
export const ${this.toPascalCase(config.name)}Debug = {
  /**
   * Create a development instance with enhanced debugging
   */
  createDevInstance(config?: Partial<${this.toPascalCase(config.name)}Config>) {
    const instance = new ${this.toPascalCase(config.name)}(config)
    instance.enableDebug()
    return instance
  },

  /**
   * Measure plugin performance
   */
  async measurePerformance(iterations = 10) {
    const instance = new ${this.toPascalCase(config.name)}()
    const results = await measurePluginPerformance(
      '${config.name}',
      'onSend',
      async () => {
        await instance.onSend({ content: 'test' }, {
          agentId: 'test-agent',
          transportId: 'test-transport',
          requestId: 'test-request',
          timestamp: Date.now()
        })
      },
      iterations
    )
    return results
  }
}`
  }

  private generatePerformanceUtilities(config: PluginConfig): string {
    return `
// Performance testing utilities
export const ${this.toPascalCase(config.name)}Performance = {
  /**
   * Run performance benchmark
   */
  async benchmark(config?: Partial<${this.toPascalCase(config.name)}Config>) {
    const instance = new ${this.toPascalCase(config.name)}(config)
    const startTime = performance.now()
    
    // Simulate typical usage
    const context = {
      agentId: 'benchmark-agent',
      transportId: 'benchmark-transport', 
      requestId: 'benchmark-request',
      timestamp: Date.now()
    }
    
    await instance.onInit?.(context)
    
    for (let i = 0; i < 100; i++) {
      await instance.onSend?.({ content: \`test message \${i}\` }, context)
    }
    
    await instance.onShutdown?.(context)
    
    const duration = performance.now() - startTime
    const metrics = instance.getPerformanceMetrics?.()
    
    return {
      totalDuration: duration,
      ...metrics
    }
  }
}`
  }

  private generateHotReloadFeatures(config: PluginConfig): string {
    return `
// Hot reload utilities
export const ${this.toPascalCase(config.name)}HotReload = {
  /**
   * Enable hot reload for this plugin
   */
  enable() {
    if (typeof globalHotReloadManager !== 'undefined') {
      globalHotReloadManager.registerPlugin('${config.name}', __filename)
      console.log('🔥 Hot reload enabled for ${config.name}')
    }
  },

  /**
   * Disable hot reload
   */
  disable() {
    if (typeof globalHotReloadManager !== 'undefined') {
      globalHotReloadManager.unregisterPlugin('${config.name}')
      console.log('🔥 Hot reload disabled for ${config.name}')
    }
  }
}`
  }

  private generateDevelopmentUtilities(config: PluginConfig): string {
    return `
// Development utilities
export const ${this.toPascalCase(config.name)}Dev = {
  /**
   * Create wrapped instance with development features
   */
  createWrapped(config?: Partial<${this.toPascalCase(config.name)}Config>) {
    const instance = new ${this.toPascalCase(config.name)}(config)
    return createPluginDevelopmentWrapper('${config.name}', instance, {
      enablePerformanceMonitoring: true,
      enableMemoryTracking: true,
      enableErrorTracking: true,
      enableDebugLogs: true
    }).getWrappedPlugin()
  },

  /**
   * Validate plugin contract
   */
  validateContract() {
    const instance = new ${this.toPascalCase(config.name)}()
    return validatePluginContract(instance)
  }
}`
  }

  private toPascalCase(str: string): string {
    return str
      .replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '')
      .replace(/^./, char => char.toUpperCase())
  }
}