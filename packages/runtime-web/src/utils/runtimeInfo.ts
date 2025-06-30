/**
 * Runtime Environment Detection Utility
 * 
 * Provides comprehensive environment detection and capability reporting
 * for AgentKit runtime adaptations.
 */

/**
 * Runtime environment information
 */
export interface RuntimeInfo {
  // Platform detection
  platform: 'browser' | 'node' | 'webworker' | 'serviceworker' | 'unknown'
  environment: 'development' | 'production' | 'test' | 'unknown'
  
  // Browser-specific info
  browser?: {
    name: string
    version: string
    userAgent: string
    isMobile: boolean
    isTablet: boolean
    isDesktop: boolean
  }
  
  // Node.js-specific info
  node?: {
    version: string
    arch: string
    platform: string
  }
  
  // Feature capabilities
  capabilities: {
    // Core JavaScript features
    asyncAwait: boolean
    promises: boolean
    modules: boolean
    classes: boolean
    
    // Browser APIs
    fetch: boolean
    abortController: boolean
    webWorkers: boolean
    serviceWorkers: boolean
    localStorage: boolean
    sessionStorage: boolean
    indexedDB: boolean
    webSockets: boolean
    
    // Advanced browser features
    webAssembly: boolean
    offscreenCanvas: boolean
    broadcastChannel: boolean
    performanceObserver: boolean
    intersectionObserver: boolean
    
    // Security features
    crossOriginIsolated: boolean
    secureContext: boolean
    
    // Memory and performance
    memoryAPI: boolean
    
    // Network features
    navigator: boolean
    geolocation: boolean
    camera: boolean
    microphone: boolean
    
    // Node.js features (when in Node)
    vm: boolean
    crypto: boolean
    filesystem: boolean
    childProcess: boolean
  }
  
  // Performance characteristics
  performance: {
    memoryUsage?: number
    maxMemory?: number
    cpuCores?: number
    platform: string
  }
  
  // Security context
  security: {
    isSecureContext: boolean
    crossOriginIsolated: boolean
    cookiesEnabled: boolean
    javaScriptEnabled: boolean
  }
  
  // Metadata
  timestamp: number
  agentKitVersion?: string
}

/**
 * Detect the current runtime environment and capabilities
 */
export function getRuntimeInfo(): RuntimeInfo {
  const timestamp = Date.now()
  
  // Platform detection
  const platform = detectPlatform()
  const environment = detectEnvironment()
  
  // Browser detection
  const browser = platform === 'browser' ? detectBrowser() : undefined
  
  // Node.js detection  
  const node = platform === 'node' ? detectNode() : undefined
  
  // Capability detection
  const capabilities = detectCapabilities()
  
  // Performance info
  const performance = detectPerformance()
  
  // Security context
  const security = detectSecurity()
  
  return {
    platform,
    environment,
    browser,
    node,
    capabilities,
    performance,
    security,
    timestamp,
    agentKitVersion: detectAgentKitVersion()
  }
}

/**
 * Detect the platform type
 */
function detectPlatform(): RuntimeInfo['platform'] {
  // Check for Node.js
  if (typeof process !== 'undefined' && process.versions?.node) {
    return 'node'
  }
  
  // Check for Web Worker
  if (typeof (globalThis as any).importScripts === 'function' && typeof postMessage === 'function') {
    return 'webworker'
  }
  
  // Check for Service Worker
  if (typeof self !== 'undefined' && 'ServiceWorkerGlobalScope' in self) {
    return 'serviceworker'
  }
  
  // Check for browser
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'browser'
  }
  
  return 'unknown'
}

/**
 * Detect the environment type
 */
function detectEnvironment(): RuntimeInfo['environment'] {
  // Node.js environment detection
  if (typeof process !== 'undefined') {
    const nodeEnv = process.env.NODE_ENV
    if (nodeEnv === 'development') {return 'development'}
    if (nodeEnv === 'production') {return 'production'}
    if (nodeEnv === 'test') {return 'test'}
  }
  
  // Browser environment detection
  if (typeof window !== 'undefined') {
    // Check for common development indicators
    if (window.location?.hostname === 'localhost' ||
        window.location?.hostname === '127.0.0.1' ||
        window.location?.hostname.includes('dev') ||
        window.location?.port) {
      return 'development'
    }
    
    // Check for test environment indicators
    if (window.location?.hostname.includes('test') ||
        window.location?.hostname.includes('staging')) {
      return 'test'
    }
    
    // Production if HTTPS and proper domain
    if (window.location?.protocol === 'https:' &&
        !window.location?.hostname.includes('localhost')) {
      return 'production'
    }
  }
  
  return 'unknown'
}

/**
 * Detect browser information
 */
function detectBrowser(): RuntimeInfo['browser'] | undefined {
  if (typeof navigator === 'undefined') {return undefined}
  
  const userAgent = navigator.userAgent
  const name = detectBrowserName(userAgent)
  const version = detectBrowserVersion(userAgent, name)
  
  return {
    name,
    version,
    userAgent,
    isMobile: detectMobile(),
    isTablet: detectTablet(), 
    isDesktop: detectDesktop()
  }
}

/**
 * Detect browser name from user agent
 */
function detectBrowserName(userAgent: string): string {
  if (userAgent.includes('Firefox/')) {return 'Firefox'}
  if (userAgent.includes('Safari/') && userAgent.includes('Version/')) {return 'Safari'}
  if (userAgent.includes('Chrome/')) {return 'Chrome'}
  if (userAgent.includes('Edge/')) {return 'Edge'}
  if (userAgent.includes('Opera/')) {return 'Opera'}
  return 'Unknown'
}

/**
 * Detect browser version
 */
function detectBrowserVersion(userAgent: string, browserName: string): string {
  const patterns: Record<string, RegExp> = {
    'Firefox': /Firefox\/(\d+\.\d+)/,
    'Safari': /Version\/(\d+\.\d+)/,
    'Chrome': /Chrome\/(\d+\.\d+)/,
    'Edge': /Edge\/(\d+\.\d+)/,
    'Opera': /Opera\/(\d+\.\d+)/
  }
  
  const pattern = patterns[browserName]
  if (pattern) {
    const match = userAgent.match(pattern)
    if (match) {return match[1]}
  }
  
  return 'Unknown'
}

/**
 * Detect if device is mobile
 */
function detectMobile(): boolean {
  if (typeof navigator === 'undefined') {return false}
  
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         (typeof window !== 'undefined' && window.innerWidth <= 768)
}

/**
 * Detect if device is tablet
 */
function detectTablet(): boolean {
  if (typeof navigator === 'undefined') {return false}
  
  return /iPad|Android/i.test(navigator.userAgent) &&
         (typeof window !== 'undefined' && window.innerWidth > 768 && window.innerWidth <= 1024)
}

/**
 * Detect if device is desktop
 */
function detectDesktop(): boolean {
  return !detectMobile() && !detectTablet()
}

/**
 * Detect Node.js information
 */
function detectNode(): RuntimeInfo['node'] | undefined {
  if (typeof process === 'undefined') {return undefined}
  
  return {
    version: process.version,
    arch: process.arch,
    platform: process.platform
  }
}

/**
 * Detect runtime capabilities
 */
function detectCapabilities(): RuntimeInfo['capabilities'] {
  return {
    // Core JavaScript features
    asyncAwait: detectAsyncAwait(),
    promises: typeof Promise !== 'undefined',
    modules: detectModules(),
    classes: detectClasses(),
    
    // Browser APIs
    fetch: typeof fetch !== 'undefined',
    abortController: typeof AbortController !== 'undefined',
    webWorkers: typeof Worker !== 'undefined',
    serviceWorkers: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    localStorage: typeof localStorage !== 'undefined',
    sessionStorage: typeof sessionStorage !== 'undefined',
    indexedDB: typeof indexedDB !== 'undefined',
    webSockets: typeof WebSocket !== 'undefined',
    
    // Advanced browser features
    webAssembly: typeof WebAssembly !== 'undefined',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    broadcastChannel: typeof BroadcastChannel !== 'undefined',
    performanceObserver: typeof PerformanceObserver !== 'undefined',
    intersectionObserver: typeof IntersectionObserver !== 'undefined',
    
    // Security features
    crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated,
    secureContext: typeof isSecureContext !== 'undefined' && isSecureContext,
    
    // Memory and performance
    memoryAPI: typeof performance !== 'undefined' && 'memory' in performance,
    
    // Network features  
    navigator: typeof navigator !== 'undefined',
    geolocation: typeof navigator !== 'undefined' && 'geolocation' in navigator,
    camera: detectCamera(),
    microphone: detectMicrophone(),
    
    // Node.js features
    vm: detectVM(),
    crypto: detectCrypto(),
    filesystem: detectFilesystem(),
    childProcess: detectChildProcess()
  }
}

/**
 * Detect async/await support
 */
function detectAsyncAwait(): boolean {
  try {
    eval('(async () => {})')
    return true
  } catch {
    return false
  }
}

/**
 * Detect ES6 modules support
 */
function detectModules(): boolean {
  try {
    eval('import.meta')
    return true
  } catch {
    return false
  }
}

/**
 * Detect class support
 */
function detectClasses(): boolean {
  try {
    eval('class Test {}')
    return true
  } catch {
    return false
  }
}

/**
 * Detect camera access
 */
function detectCamera(): boolean {
  return typeof navigator !== 'undefined' && 
         'mediaDevices' in navigator &&
         'getUserMedia' in navigator.mediaDevices
}

/**
 * Detect microphone access
 */
function detectMicrophone(): boolean {
  return detectCamera() // Same API
}

/**
 * Detect Node.js VM module
 */
function detectVM(): boolean {
  try {
    return typeof process !== 'undefined' && require('vm') !== undefined
  } catch {
    return false
  }
}

/**
 * Detect Node.js crypto module
 */
function detectCrypto(): boolean {
  try {
    return typeof process !== 'undefined' && require('crypto') !== undefined
  } catch {
    return false
  }
}

/**
 * Detect Node.js filesystem module
 */
function detectFilesystem(): boolean {
  try {
    return typeof process !== 'undefined' && require('fs') !== undefined
  } catch {
    return false
  }
}

/**
 * Detect Node.js child_process module
 */
function detectChildProcess(): boolean {
  try {
    return typeof process !== 'undefined' && require('child_process') !== undefined
  } catch {
    return false
  }
}

/**
 * Detect performance characteristics
 */
function detectPerformance(): RuntimeInfo['performance'] {
  const perf: RuntimeInfo['performance'] = {
    platform: detectPlatform()
  }
  
  // Browser performance API
  if (typeof performance !== 'undefined' && 'memory' in performance) {
    const memory = (performance as any).memory
    perf.memoryUsage = memory.usedJSHeapSize
    perf.maxMemory = memory.jsHeapSizeLimit
  }
  
  // Node.js performance
  if (typeof process !== 'undefined') {
    const memUsage = process.memoryUsage?.()
    if (memUsage) {
      perf.memoryUsage = memUsage.heapUsed
      perf.maxMemory = memUsage.heapTotal
    }
  }
  
  // CPU cores (rough estimate)
  if (typeof navigator !== 'undefined' && 'hardwareConcurrency' in navigator) {
    perf.cpuCores = navigator.hardwareConcurrency
  }
  
  return perf
}

/**
 * Detect security context
 */
function detectSecurity(): RuntimeInfo['security'] {
  return {
    isSecureContext: typeof isSecureContext !== 'undefined' ? isSecureContext : false,
    crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false,
    cookiesEnabled: detectCookiesEnabled(),
    javaScriptEnabled: true // If this runs, JS is enabled
  }
}

/**
 * Detect if cookies are enabled
 */
function detectCookiesEnabled(): boolean {
  if (typeof document === 'undefined') {return false}
  
  try {
    document.cookie = 'test=1'
    const cookiesEnabled = document.cookie.indexOf('test=1') !== -1
    document.cookie = 'test=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    return cookiesEnabled
  } catch {
    return false
  }
}

/**
 * Detect AgentKit version if available
 */
function detectAgentKitVersion(): string | undefined {
  // Try to get version from global AgentKit object
  if (typeof window !== 'undefined' && (window as any).AgentKit?.version) {
    return (window as any).AgentKit.version
  }
  
  // Try to get version from process (Node.js)
  if (typeof process !== 'undefined') {
    try {
      const pkg = require('@agentkit/sdk/package.json')
      return pkg.version
    } catch {
      // Ignore if package.json not found
    }
  }
  
  return undefined
}

/**
 * Get a subset of runtime info for performance-critical scenarios
 */
export function getRuntimeInfoLite(): Pick<RuntimeInfo, 'platform' | 'capabilities' | 'timestamp'> {
  return {
    platform: detectPlatform(),
    capabilities: {
      asyncAwait: detectAsyncAwait(),
      promises: typeof Promise !== 'undefined',
      fetch: typeof fetch !== 'undefined',
      abortController: typeof AbortController !== 'undefined',
      webWorkers: typeof Worker !== 'undefined',
      serviceWorkers: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
      modules: detectModules(),
      classes: detectClasses(),
      localStorage: typeof localStorage !== 'undefined',
      sessionStorage: typeof sessionStorage !== 'undefined',
      indexedDB: typeof indexedDB !== 'undefined',
      webSockets: typeof WebSocket !== 'undefined',
      webAssembly: typeof WebAssembly !== 'undefined',
      offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
      broadcastChannel: typeof BroadcastChannel !== 'undefined',
      performanceObserver: typeof PerformanceObserver !== 'undefined',
      intersectionObserver: typeof IntersectionObserver !== 'undefined',
      crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated,
      secureContext: typeof isSecureContext !== 'undefined' && isSecureContext,
      memoryAPI: typeof performance !== 'undefined' && 'memory' in performance,
      navigator: typeof navigator !== 'undefined',
      geolocation: typeof navigator !== 'undefined' && 'geolocation' in navigator,
      camera: detectCamera(),
      microphone: detectMicrophone(),
      vm: detectVM(),
      crypto: detectCrypto(),
      filesystem: detectFilesystem(),
      childProcess: detectChildProcess()
    },
    timestamp: Date.now()
  }
}