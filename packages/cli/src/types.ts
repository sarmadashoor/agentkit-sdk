import type { PluginHookName } from './types/agentkit-types'

export interface PluginConfig {
  name: string
  hooks: PluginHookName[]
  author: string
  license: string
  description?: string
  withTests?: boolean
  browserSafe?: boolean
  scoped?: string
  browserTargets?: string[]
  // Enhanced DX features
  withDebug?: boolean
  withHotReload?: boolean
  withPerformance?: boolean
  withDocs?: boolean
  template?: 'basic' | 'advanced' | 'performance' | 'debug'
}

export interface ConfigField {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  required: boolean
  description?: string
  default?: any
}