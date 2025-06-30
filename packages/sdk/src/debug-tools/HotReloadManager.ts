/**
 * Hot Reload Manager for Plugin Development
 * 
 * Enables hot reloading of plugins during development for rapid iteration
 * and testing without full SDK restart.
 */

import { watch, FSWatcher } from 'fs'
import { readFile, stat } from 'fs/promises'
import { join, resolve, extname } from 'path'
import { createDebugContext } from './debugMode'

/**
 * Hot reload configuration
 */
export interface HotReloadConfig {
  enabled?: boolean
  watchPaths?: string[]
  watchExtensions?: string[]
  debounceMs?: number
  reloadOnError?: boolean
  validateBeforeReload?: boolean
  backupOnReload?: boolean
  excludePatterns?: RegExp[]
  onReload?: (filePath: string, pluginName?: string) => void
  onError?: (error: Error, filePath: string) => void
  onValidation?: (isValid: boolean, filePath: string, errors?: string[]) => void
}

/**
 * Plugin reload information
 */
interface PluginReloadInfo {
  name: string
  filePath: string
  lastModified: number
  reloadCount: number
  lastReloadTime: number
  errors: string[]
  isValid: boolean
}

/**
 * Hot reload manager class
 */
export class HotReloadManager {
  private config: Required<HotReloadConfig>
  private watchers: Map<string, FSWatcher> = new Map()
  private pluginRegistry: Map<string, PluginReloadInfo> = new Map()
  private reloadCallbacks: Map<string, Function[]> = new Map()
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map()
  private debug = createDebugContext('HotReloadManager')
  private isEnabled = false

  constructor(config: HotReloadConfig = {}) {
    this.config = {
      enabled: process.env.NODE_ENV === 'development',
      watchPaths: ['./src/plugins', './plugins'],
      watchExtensions: ['.ts', '.js', '.mjs'],
      debounceMs: 500,
      reloadOnError: false,
      validateBeforeReload: true,
      backupOnReload: true,
      excludePatterns: [/node_modules/, /\.test\./],
      onReload: () => {},
      onError: () => {},
      onValidation: () => {},
      ...config
    }

    if (this.config.enabled) {
      this.initialize()
    }
  }

  /**
   * Initialize hot reload system
   */
  private async initialize(): Promise<void> {
    try {
      this.debug.info('Initializing hot reload system')
      
      for (const watchPath of this.config.watchPaths) {
        await this.setupWatcher(watchPath)
      }
      
      this.isEnabled = true
      this.debug.info('Hot reload system initialized', {
        watchPaths: this.config.watchPaths,
        extensions: this.config.watchExtensions
      })
    } catch (error) {
      this.debug.error('Failed to initialize hot reload system', { error })
      this.config.onError(error as Error, 'initialization')
    }
  }

  /**
   * Enable hot reload
   */
  enable(): void {
    if (!this.isEnabled) {
      this.config.enabled = true
      this.initialize()
    }
  }

  /**
   * Disable hot reload
   */
  disable(): void {
    this.isEnabled = false
    this.config.enabled = false
    
    // Close all watchers
    for (const [path, watcher] of this.watchers) {
      watcher.close()
      this.debug.debug(`Stopped watching ${path}`)
    }
    
    this.watchers.clear()
    this.debug.info('Hot reload system disabled')
  }

  /**
   * Register a plugin for hot reloading
   */
  registerPlugin(name: string, filePath: string): void {
    const absolutePath = resolve(filePath)
    
    this.pluginRegistry.set(name, {
      name,
      filePath: absolutePath,
      lastModified: 0,
      reloadCount: 0,
      lastReloadTime: 0,
      errors: [],
      isValid: true
    })

    this.debug.debug(`Registered plugin for hot reload: ${name}`, { filePath: absolutePath })
  }

  /**
   * Unregister a plugin from hot reloading
   */
  unregisterPlugin(name: string): void {
    this.pluginRegistry.delete(name)
    this.reloadCallbacks.delete(name)
    this.debug.debug(`Unregistered plugin from hot reload: ${name}`)
  }

  /**
   * Add reload callback for a plugin
   */
  onReload(pluginName: string, callback: (newPlugin: any) => void): void {
    if (!this.reloadCallbacks.has(pluginName)) {
      this.reloadCallbacks.set(pluginName, [])
    }
    
    this.reloadCallbacks.get(pluginName)!.push(callback)
    this.debug.debug(`Added reload callback for plugin: ${pluginName}`)
  }

  /**
   * Remove reload callback for a plugin
   */
  offReload(pluginName: string, callback: Function): void {
    const callbacks = this.reloadCallbacks.get(pluginName)
    if (callbacks) {
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  /**
   * Manually trigger reload for a plugin
   */
  async reloadPlugin(name: string): Promise<boolean> {
    const pluginInfo = this.pluginRegistry.get(name)
    if (!pluginInfo) {
      this.debug.warn(`Plugin not registered for hot reload: ${name}`)
      return false
    }

    return this.performReload(pluginInfo.filePath)
  }

  /**
   * Get plugin reload statistics
   */
  getPluginStats(name: string): PluginReloadInfo | null {
    return this.pluginRegistry.get(name) || null
  }

  /**
   * Get all plugin statistics
   */
  getAllPluginStats(): PluginReloadInfo[] {
    return Array.from(this.pluginRegistry.values())
  }

  /**
   * Check if a plugin is being watched
   */
  isWatching(name: string): boolean {
    return this.pluginRegistry.has(name)
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<HotReloadConfig> {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<HotReloadConfig>): void {
    const wasEnabled = this.config.enabled
    this.config = { ...this.config, ...updates }
    
    // Restart if enabled state changed
    if (wasEnabled !== this.config.enabled) {
      if (this.config.enabled) {
        this.enable()
      } else {
        this.disable()
      }
    }
  }

  private async setupWatcher(watchPath: string): Promise<void> {
    try {
      const absolutePath = resolve(watchPath)
      const pathStat = await stat(absolutePath)
      
      if (!pathStat.isDirectory()) {
        this.debug.warn(`Watch path is not a directory: ${absolutePath}`)
        return
      }

      const watcher = watch(absolutePath, { recursive: true }, (eventType, filename) => {
        if (!filename) {return}
        
        const filePath = join(absolutePath, filename)
        this.handleFileChange(eventType, filePath)
      })

      this.watchers.set(absolutePath, watcher)
      this.debug.debug(`Started watching directory: ${absolutePath}`)
      
    } catch (error) {
      this.debug.error(`Failed to setup watcher for ${watchPath}`, { error })
    }
  }

  private handleFileChange(eventType: string, filePath: string): void {
    // Check if file should be watched
    if (!this.shouldWatchFile(filePath)) {
      return
    }

    this.debug.trace(`File change detected: ${eventType} ${filePath}`)

    // Debounce file changes
    const existingTimer = this.debounceTimers.get(filePath)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath)
      this.performReload(filePath)
    }, this.config.debounceMs)

    this.debounceTimers.set(filePath, timer)
  }

  private shouldWatchFile(filePath: string): boolean {
    // Check extension
    const ext = extname(filePath)
    if (!this.config.watchExtensions.includes(ext)) {
      return false
    }

    // Check exclude patterns
    for (const pattern of this.config.excludePatterns) {
      if (pattern.test(filePath)) {
        return false
      }
    }

    return true
  }

  private async performReload(filePath: string): Promise<boolean> {
    try {
      this.debug.info(`Attempting to reload: ${filePath}`)

      // Find plugin by file path
      const pluginInfo = this.findPluginByPath(filePath)
      if (!pluginInfo) {
        this.debug.trace(`File not associated with registered plugin: ${filePath}`)
        return false
      }

      // Check if file was actually modified
      const fileStat = await stat(filePath)
      if (fileStat.mtime.getTime() <= pluginInfo.lastModified) {
        this.debug.trace(`File not modified since last reload: ${filePath}`)
        return false
      }

      // Validate plugin before reload if enabled
      if (this.config.validateBeforeReload) {
        const isValid = await this.validatePlugin(filePath)
        if (!isValid && !this.config.reloadOnError) {
          this.debug.warn(`Plugin validation failed, skipping reload: ${filePath}`)
          return false
        }
      }

      // Create backup if enabled
      if (this.config.backupOnReload) {
        await this.createBackup(filePath)
      }

      // Clear module cache
      this.clearModuleCache(filePath)

      // Load new plugin
      const newPlugin = await this.loadPlugin(filePath)
      
      // Update plugin info
      pluginInfo.lastModified = fileStat.mtime.getTime()
      pluginInfo.reloadCount++
      pluginInfo.lastReloadTime = Date.now()
      pluginInfo.errors = []
      pluginInfo.isValid = true

      // Trigger reload callbacks
      const callbacks = this.reloadCallbacks.get(pluginInfo.name) || []
      for (const callback of callbacks) {
        try {
          await callback(newPlugin)
        } catch (error) {
          this.debug.error(`Reload callback failed for ${pluginInfo.name}`, { error })
        }
      }

      this.debug.info(`Successfully reloaded plugin: ${pluginInfo.name}`, {
        filePath,
        reloadCount: pluginInfo.reloadCount
      })

      this.config.onReload(filePath, pluginInfo.name)
      return true

    } catch (error) {
      this.debug.error(`Failed to reload plugin: ${filePath}`, { error })
      
      // Update plugin info with error
      const pluginInfo = this.findPluginByPath(filePath)
      if (pluginInfo) {
        pluginInfo.errors.push(error instanceof Error ? error.message : String(error))
        pluginInfo.isValid = false
      }

      this.config.onError(error as Error, filePath)
      return false
    }
  }

  private findPluginByPath(filePath: string): PluginReloadInfo | null {
    for (const pluginInfo of this.pluginRegistry.values()) {
      if (pluginInfo.filePath === filePath) {
        return pluginInfo
      }
    }
    return null
  }

  private async validatePlugin(filePath: string): Promise<boolean> {
    try {
      // Basic syntax validation by attempting to load
      const content = await readFile(filePath, 'utf-8')
      
      // Check for basic TypeScript/JavaScript syntax errors
      if (content.includes('export') || content.includes('module.exports')) {
        // Try to require/import the module
        delete require.cache[filePath]
        require(filePath)
        return true
      }
      
      return false
    } catch (error) {
      this.debug.warn(`Plugin validation failed: ${filePath}`, { error })
      this.config.onValidation(false, filePath, [error instanceof Error ? error.message : String(error)])
      return false
    }
  }

  private async createBackup(filePath: string): Promise<void> {
    try {
      const backupPath = `${filePath}.backup.${Date.now()}`
      const content = await readFile(filePath, 'utf-8')
      await require('fs/promises').writeFile(backupPath, content)
      this.debug.trace(`Created backup: ${backupPath}`)
    } catch (error) {
      this.debug.warn(`Failed to create backup for ${filePath}`, { error })
    }
  }

  private clearModuleCache(filePath: string): void {
    // Clear from Node.js require cache
    delete require.cache[filePath]
    
    // Clear related modules that might have imported this plugin
    for (const cachedPath of Object.keys(require.cache)) {
      if (cachedPath.includes(filePath) || cachedPath.includes('plugin')) {
        delete require.cache[cachedPath]
      }
    }
  }

  private async loadPlugin(filePath: string): Promise<any> {
    // Dynamic import to get fresh module
    
    if (extname(filePath) === '.ts') {
      // For TypeScript files, we might need to use ts-node or similar
      return require(filePath)
    } else {
      return require(filePath)
    }
  }
}

/**
 * Create a hot reload manager with default configuration
 */
export function createHotReloadManager(config: HotReloadConfig = {}): HotReloadManager {
  return new HotReloadManager(config)
}

/**
 * Global hot reload manager instance
 */
export const globalHotReloadManager = new HotReloadManager({
  enabled: process.env.NODE_ENV === 'development' || process.env.AGENTKIT_HOT_RELOAD === 'true'
})

/**
 * Decorator for automatic hot reload registration
 */
export function hotReload(pluginName?: string) {
  return function <T extends { new(...args: any[]): {} }>(constructor: T) {
    const name = pluginName || constructor.name
    
    // Register plugin for hot reload in development
    if (process.env.NODE_ENV === 'development') {
      // Try to determine file path (this is a simplified approach)
      const stack = new Error().stack
      if (stack) {
        const stackLines = stack.split('\n')
        const callerLine = stackLines[2] // Skip Error and decorator lines
        const match = callerLine.match(/\((.+):\d+:\d+\)/)
        if (match) {
          const filePath = match[1]
          globalHotReloadManager.registerPlugin(name, filePath)
        }
      }
    }
    
    return constructor
  }
}

export type { PluginReloadInfo }