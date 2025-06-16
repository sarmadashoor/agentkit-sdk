import type { PluginHookName } from '@agentkit/types'

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
}

export interface ConfigField {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  required: boolean
  description?: string
  default?: any
}