import fs from 'fs'
import path from 'path'
import { watch, type FSWatcher } from 'chokidar'
import type { AgentKitPlugin } from '@agentkit/types'

/**
 * Plugin loader that watches for new plugins and auto-registers them
 */
export class PluginLoader {
  private plugins: Map<string, AgentKitPlugin> = new Map()
  private watcher?: FSWatcher
  private pluginsDir: string

  constructor(pluginsDir: string = path.join(process.cwd(), 'plugins')) {
    this.pluginsDir = pluginsDir
  }

  /**
   * Start watching for plugin changes
   */
  async startWatching(): Promise<void> {
    // Ensure plugins directory exists
    await fs.promises.mkdir(this.pluginsDir, { recursive: true })

    // Load existing plugins
    await this.loadExistingPlugins()

    // Watch for new plugins
    this.watcher = watch(this.pluginsDir, {
      ignored: /(^|[/\\])\../, // ignore dotfiles
      persistent: true,
      depth: 1
    })

    this.watcher
      .on('addDir', async (dirPath: string) => {
        if (dirPath !== this.pluginsDir) {
          const pluginName = path.basename(dirPath)
          await this.loadPlugin(pluginName)
        }
      })
      .on('unlinkDir', (dirPath: string) => {
        if (dirPath !== this.pluginsDir) {
          const pluginName = path.basename(dirPath)
          this.unloadPlugin(pluginName)
        }
      })
  }

  /**
   * Stop watching for plugin changes
   */
  async stopWatching(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = undefined
    }
  }

  /**
   * Load all existing plugins
   */
  private async loadExistingPlugins(): Promise<void> {
    try {
      const entries = await fs.promises.readdir(this.pluginsDir, { withFileTypes: true })
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await this.loadPlugin(entry.name)
        }
      }
    } catch (error) {
      // Plugins directory doesn't exist yet
    }
  }

  /**
   * Load a specific plugin
   */
  private async loadPlugin(pluginName: string): Promise<void> {
    const pluginDir = path.join(this.pluginsDir, pluginName)
    const pluginJsonPath = path.join(pluginDir, 'plugin.json')

    try {
      // Check if plugin.json exists
      const pluginJson = await fs.promises.readFile(pluginJsonPath, 'utf-8')
      const metadata = JSON.parse(pluginJson)

      // Try to load the plugin
      const pluginPath = path.join(pluginDir, metadata.main || 'index.js')
      
      if (await this.fileExists(pluginPath)) {
        // In development, we don't actually load the plugin module
        // Just register that it exists
        console.log(`[PluginLoader] Discovered plugin: ${pluginName}`)
        
        // Emit event for plugin discovery
        this.onPluginDiscovered(pluginName, metadata)
      }
    } catch (error) {
      // Plugin not ready yet or invalid
    }
  }

  /**
   * Unload a plugin
   */
  private unloadPlugin(pluginName: string): void {
    if (this.plugins.has(pluginName)) {
      this.plugins.delete(pluginName)
      console.log(`[PluginLoader] Unloaded plugin: ${pluginName}`)
      this.onPluginRemoved(pluginName)
    }
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Called when a new plugin is discovered
   */
  protected onPluginDiscovered(_name: string, _metadata: unknown): void {
    // Override in subclasses or emit events
  }

  /**
   * Called when a plugin is removed
   */
  protected onPluginRemoved(_name: string): void {
    // Override in subclasses or emit events
  }

  /**
   * Get all discovered plugins
   */
  getPlugins(): string[] {
    return Array.from(this.plugins.keys())
  }
}

// Singleton instance for convenience
let defaultLoader: PluginLoader | undefined

export function getPluginLoader(): PluginLoader {
  if (!defaultLoader) {
    defaultLoader = new PluginLoader()
  }
  return defaultLoader
}

export async function startPluginWatcher(): Promise<PluginLoader> {
  const loader = getPluginLoader()
  await loader.startWatching()
  return loader
}

export async function stopPluginWatcher(): Promise<void> {
  if (defaultLoader) {
    await defaultLoader.stopWatching()
  }
}