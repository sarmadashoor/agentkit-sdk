/**
 * CLI-specific Plugin HMAC Signer
 * 
 * Re-exports the signing functionality for CLI use
 */

export {
  signPlugin,
  serializePluginForSigning,
  createSignedPlugin,
  validatePluginSignatureFields,
  type PluginSignatureMetadata,
  type SigningOptions
} from '@agentkit/sdk'