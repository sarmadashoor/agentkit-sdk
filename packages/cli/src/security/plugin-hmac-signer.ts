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
export const signPlugin = () => { throw new Error('SDK integration not available in CLI build') }
export const serializePluginForSigning = () => { throw new Error('SDK integration not available in CLI build') }
export const createSignedPlugin = () => { throw new Error('SDK integration not available in CLI build') }
export const validatePluginSignatureFields = () => { throw new Error('SDK integration not available in CLI build') }
export type PluginSignatureMetadata = any
export type SigningOptions = any