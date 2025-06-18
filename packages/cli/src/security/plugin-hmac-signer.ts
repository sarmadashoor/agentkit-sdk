/**
 * CLI-specific Plugin HMAC Signer
 * 
 * Re-exports the signing functionality for CLI use
 */

// These would normally be imported from @agentkit/sdk
// For CLI build purposes, commenting out for now
// export {
//   signPlugin,
//   serializePluginForSigning,
//   createSignedPlugin,
//   validatePluginSignatureFields,
//   type PluginSignatureMetadata,
//   type SigningOptions
// } from '@agentkit/sdk'

// Temporary stub exports for CLI build
export type PluginSignatureMetadata = {
  algorithm: string
  hash: string
  signature: string
  [key: string]: any
}
export type SigningOptions = any

export const signPlugin = (_plugin: any, _secret: string): PluginSignatureMetadata => { throw new Error('SDK integration not available in CLI build') }
export const serializePluginForSigning = (_plugin: any): string => { throw new Error('SDK integration not available in CLI build') }
export const createSignedPlugin = () => { throw new Error('SDK integration not available in CLI build') }
export const validatePluginSignatureFields = () => { throw new Error('SDK integration not available in CLI build') }