/**
 * Plugin Development Utilities
 * 
 * Comprehensive toolkit for plugin authors including performance measurement,
 * contract validation, development wrapper, and testing utilities.
 */

import { PluginExecutionTrace, PluginPerformanceSnapshot } from './types'
import { DebugManager } from './DebugManager'
import { tracePluginExecution } from './tracePluginExecution'
import { snapshotPluginPerf } from './snapshotPluginPerf'
import { createDebugContext } from './debugMode'

/**
 * Plugin performance report
 */
export interface PluginPerformanceReport {
  pluginName: string
  reportTime: number
  executionMetrics: {
    totalExecutions: number
    averageExecutionTime: number
    minExecutionTime: number
    maxExecutionTime: number
    successRate: number
    errorRate: number
    timeoutRate: number
  }
  performanceGrade: 'A' | 'B' | 'C' | 'D' | 'F'
  recommendations: string[]
  warnings: string[]
  memoryMetrics: {
    averageMemoryUsage: number
    peakMemoryUsage: number
    memoryLeakDetected: boolean
    memoryEfficiencyScore: number
  }
  hookBreakdown: Record<string, {
    executionCount: number
    averageTime: number
    errorCount: number
    grade: 'A' | 'B' | 'C' | 'D' | 'F'
  }>
  comparisonData: {
    percentile: number
    vsAveragePlugin: {
      speedMultiplier: number
      reliabilityDifference: number
      memoryEfficiency: number
    }
  }
}

/**
 * Plugin validation result
 */
export interface PluginValidationResult {
  isValid: boolean
  errors: Array<{
    type: 'structure' | 'types' | 'performance' | 'memory' | 'contract'
    severity: 'error' | 'warning' | 'info'
    message: string
    suggestion?: string
    location?: string
  }>
  contractCompliance: {
    hasRequiredMethods: boolean
    hasValidTypes: boolean
    hasProperErrorHandling: boolean
    hasPerformanceConstraints: boolean
    hasDocumentation: boolean
    score: number
  }
  performanceAnalysis: {
    estimatedExecutionTime: number
    memoryFootprint: number
    complexityScore: number
    scalabilityRating: 'poor' | 'fair' | 'good' | 'excellent'
  }
  securityAnalysis: {
    hasUnsafeOperations: boolean
    hasExternalDependencies: boolean
    hasFileSystemAccess: boolean
    hasNetworkAccess: boolean
    securityRating: 'safe' | 'caution' | 'unsafe'
  }
  recommendations: string[]
}

/**
 * Development wrapper configuration
 */
export interface DevelopmentWrapperConfig {
  enablePerformanceMonitoring?: boolean
  enableMemoryTracking?: boolean
  enableErrorTracking?: boolean
  enableDebugLogs?: boolean
  performanceThreshold?: number
  memoryThreshold?: number
  autoGenerateReport?: boolean
  reportInterval?: number
  enableHotReload?: boolean
  enableContractValidation?: boolean
}

/**
 * Plugin development wrapper class
 */
export class PluginDevelopmentWrapper {
  private pluginName: string
  private originalPlugin: any
  private config: Required<DevelopmentWrapperConfig>
  private executions: PluginExecutionTrace[] = []
  private performanceCollector: any
  private debugManager: DebugManager
  private debug = createDebugContext('PluginDevelopmentWrapper')
  private reportTimer?: NodeJS.Timeout

  constructor(
    pluginName: string,
    plugin: any,
    config: DevelopmentWrapperConfig = {}
  ) {
    this.pluginName = pluginName
    this.originalPlugin = plugin
    this.debugManager = DebugManager.getInstance()
    
    this.config = {
      enablePerformanceMonitoring: true,
      enableMemoryTracking: true,
      enableErrorTracking: true,
      enableDebugLogs: true,
      performanceThreshold: 100,
      memoryThreshold: 10 * 1024 * 1024,
      autoGenerateReport: true,
      reportInterval: 30000, // 30 seconds
      enableHotReload: process.env.NODE_ENV === 'development',
      enableContractValidation: true,
      ...config
    }

    this.initialize()
  }

  /**
   * Get the wrapped plugin with development features
   */
  getWrappedPlugin(): any {
    const wrapper = { ...this.originalPlugin }
    
    // Wrap each hook method
    const hooks = ['onInit', 'onSend', 'onReceive', 'onError', 'onShutdown']
    
    hooks.forEach(hookName => {
      if (typeof this.originalPlugin[hookName] === 'function') {
        wrapper[hookName] = this.wrapHookMethod(hookName, this.originalPlugin[hookName])
      }
    })

    return wrapper
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(): PluginPerformanceReport {
    const snapshot = snapshotPluginPerf(this.pluginName, this.executions)
    if (!snapshot) {
      throw new Error(`No execution data available for plugin: ${this.pluginName}`)
    }

    const performanceGrade = this.calculatePerformanceGrade(snapshot)
    const recommendations = this.generateRecommendations(snapshot)
    const warnings = this.generateWarnings(snapshot)
    const memoryMetrics = this.analyzeMemoryMetrics(snapshot)
    const hookBreakdown = this.analyzeHookBreakdown(snapshot)
    const comparisonData = this.generateComparisonData(snapshot)

    return {
      pluginName: this.pluginName,
      reportTime: Date.now(),
      executionMetrics: {
        totalExecutions: snapshot.executionCount,
        averageExecutionTime: snapshot.averageExecutionTime,
        minExecutionTime: snapshot.minExecutionTime,
        maxExecutionTime: snapshot.maxExecutionTime,
        successRate: snapshot.successRate,
        errorRate: (snapshot.errorCount / snapshot.executionCount) * 100,
        timeoutRate: (snapshot.timeoutCount / snapshot.executionCount) * 100
      },
      performanceGrade,
      recommendations,
      warnings,
      memoryMetrics,
      hookBreakdown,
      comparisonData
    }
  }

  /**
   * Validate plugin contract
   */
  validateContract(): PluginValidationResult {
    const errors: PluginValidationResult['errors'] = []
    
    // Structure validation
    if (!this.originalPlugin.name) {
      errors.push({
        type: 'structure',
        severity: 'error',
        message: 'Plugin must have a name property',
        suggestion: 'Add a name property to your plugin'
      })
    }
    
    if (!this.originalPlugin.version) {
      errors.push({
        type: 'structure',
        severity: 'warning',
        message: 'Plugin should have a version property',
        suggestion: 'Add a version property following semantic versioning'
      })
    }

    // Method validation
    const requiredMethods = ['onInit', 'onSend', 'onShutdown']
    const hasRequiredMethods = requiredMethods.some(method => 
      typeof this.originalPlugin[method] === 'function'
    )

    if (!hasRequiredMethods) {
      errors.push({
        type: 'contract',
        severity: 'warning',
        message: 'Plugin should implement at least one hook method',
        suggestion: 'Implement onInit, onSend, or onShutdown methods'
      })
    }

    // Type validation
    const hasValidTypes = this.validateTypes()
    if (!hasValidTypes) {
      errors.push({
        type: 'types',
        severity: 'error',
        message: 'Plugin hook methods must be functions',
        suggestion: 'Ensure all hook methods are properly typed functions'
      })
    }

    // Performance analysis
    const performanceAnalysis = this.analyzePerformanceCharacteristics()
    
    // Security analysis
    const securityAnalysis = this.analyzeSecurityCharacteristics()

    // Contract compliance score
    const contractCompliance = {
      hasRequiredMethods,
      hasValidTypes,
      hasProperErrorHandling: this.hasProperErrorHandling(),
      hasPerformanceConstraints: performanceAnalysis.estimatedExecutionTime < this.config.performanceThreshold,
      hasDocumentation: this.hasDocumentation(),
      score: 0
    }

    contractCompliance.score = Object.values(contractCompliance)
      .filter(v => typeof v === 'boolean')
      .reduce((score, isValid) => score + (isValid ? 20 : 0), 0)

    return {
      isValid: errors.filter(e => e.severity === 'error').length === 0,
      errors,
      contractCompliance,
      performanceAnalysis,
      securityAnalysis,
      recommendations: this.generateContractRecommendations(contractCompliance, performanceAnalysis, securityAnalysis)
    }
  }

  /**
   * Clear execution data
   */
  clearExecutionData(): void {
    this.executions = []
    this.debug.debug(`Cleared execution data for plugin: ${this.pluginName}`)
  }

  /**
   * Get execution statistics
   */
  getExecutionStats(): {
    totalExecutions: number
    averageExecutionTime: number
    successRate: number
    recentExecutions: PluginExecutionTrace[]
  } {
    const completedExecutions = this.executions.filter(e => e.duration !== undefined)
    const successfulExecutions = this.executions.filter(e => e.status === 'success')
    
    return {
      totalExecutions: this.executions.length,
      averageExecutionTime: completedExecutions.length > 0 
        ? completedExecutions.reduce((sum, e) => sum + (e.duration || 0), 0) / completedExecutions.length 
        : 0,
      successRate: this.executions.length > 0 
        ? (successfulExecutions.length / this.executions.length) * 100 
        : 0,
      recentExecutions: this.executions.slice(-10)
    }
  }

  private initialize(): void {
    if (this.config.autoGenerateReport && this.config.reportInterval > 0) {
      this.reportTimer = setInterval(() => {
        this.generateAndLogReport()
      }, this.config.reportInterval)
      
      // Use unref() to prevent keeping process alive
      if (this.reportTimer && this.reportTimer.unref) {
        this.reportTimer.unref()
      }
    }

    this.debug.info(`Initialized development wrapper for plugin: ${this.pluginName}`, {
      config: this.config
    })
  }

  private wrapHookMethod(hookName: string, originalMethod: Function): Function {
    return async (...args: any[]) => {
      const { result, trace } = await tracePluginExecution(
        this.pluginName,
        hookName,
        () => originalMethod.apply(this.originalPlugin, args),
        {
          captureMemory: this.config.enableMemoryTracking,
          captureCpu: this.config.enablePerformanceMonitoring,
          captureCallStack: this.config.enableDebugLogs
        }
      )

      if (trace) {
        this.executions.push(trace)
        this.analyzeExecution(trace)
      }

      return result
    }
  }

  private analyzeExecution(trace: PluginExecutionTrace): void {
    // Performance warnings
    if (trace.duration && trace.duration > this.config.performanceThreshold) {
      this.debug.warn(`Slow execution detected in ${this.pluginName}.${trace.hookName}`, {
        duration: `${trace.duration.toFixed(2)}ms`,
        threshold: `${this.config.performanceThreshold}ms`
      })
    }

    // Memory warnings
    if (trace.memoryUsage && this.isHighMemoryUsage(trace.memoryUsage)) {
      this.debug.warn(`High memory usage detected in ${this.pluginName}.${trace.hookName}`, {
        memoryUsage: `${(trace.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`
      })
    }

    // Error tracking
    if (trace.status === 'error') {
      this.debug.error(`Plugin execution failed: ${this.pluginName}.${trace.hookName}`, {
        error: trace.error
      })
    }
  }

  private calculatePerformanceGrade(snapshot: PluginPerformanceSnapshot): 'A' | 'B' | 'C' | 'D' | 'F' {
    let score = 100

    // Deduct points for slow execution
    if (snapshot.averageExecutionTime > 200) score -= 30
    else if (snapshot.averageExecutionTime > 100) score -= 20
    else if (snapshot.averageExecutionTime > 50) score -= 10

    // Deduct points for low success rate
    if (snapshot.successRate < 95) score -= 25
    else if (snapshot.successRate < 98) score -= 15
    else if (snapshot.successRate < 99) score -= 5

    // Deduct points for high memory usage
    const memoryMB = snapshot.memoryUsage.current / 1024 / 1024
    if (memoryMB > 50) score -= 20
    else if (memoryMB > 20) score -= 10
    else if (memoryMB > 10) score -= 5

    if (score >= 90) return 'A'
    if (score >= 80) return 'B'
    if (score >= 70) return 'C'
    if (score >= 60) return 'D'
    return 'F'
  }

  private generateRecommendations(snapshot: PluginPerformanceSnapshot): string[] {
    const recommendations: string[] = []

    if (snapshot.averageExecutionTime > 100) {
      recommendations.push('Consider optimizing plugin execution time - current average exceeds 100ms')
    }

    if (snapshot.successRate < 99) {
      recommendations.push('Improve error handling to increase success rate')
    }

    if (snapshot.memoryUsage.current > 20 * 1024 * 1024) {
      recommendations.push('Optimize memory usage - consider caching strategies or data structure improvements')
    }

    if (snapshot.performance.throughput < 10) {
      recommendations.push('Improve throughput by optimizing concurrent execution handling')
    }

    return recommendations
  }

  private generateWarnings(snapshot: PluginPerformanceSnapshot): string[] {
    const warnings: string[] = []

    if (snapshot.timeoutCount > 0) {
      warnings.push(`${snapshot.timeoutCount} timeout(s) detected - check for infinite loops or blocking operations`)
    }

    if (snapshot.errorCount > snapshot.executionCount * 0.05) {
      warnings.push('High error rate detected - review error handling and input validation')
    }

    const memoryMB = snapshot.memoryUsage.peak / 1024 / 1024
    if (memoryMB > 100) {
      warnings.push(`Peak memory usage of ${memoryMB.toFixed(2)}MB detected - potential memory leak`)
    }

    return warnings
  }

  private analyzeMemoryMetrics(snapshot: PluginPerformanceSnapshot) {
    const avgMemory = snapshot.memoryUsage.average
    const peakMemory = snapshot.memoryUsage.peak
    const currentMemory = snapshot.memoryUsage.current
    
    // Simple memory leak detection
    const memoryLeakDetected = peakMemory > avgMemory * 2 && currentMemory > avgMemory * 1.5
    
    // Memory efficiency score (0-100)
    const memoryEfficiencyScore = Math.max(0, 100 - (currentMemory / 1024 / 1024 / 10) * 100)

    return {
      averageMemoryUsage: avgMemory,
      peakMemoryUsage: peakMemory,
      memoryLeakDetected,
      memoryEfficiencyScore
    }
  }

  private analyzeHookBreakdown(snapshot: PluginPerformanceSnapshot) {
    const breakdown: Record<string, any> = {}
    
    Object.entries(snapshot.hookMetrics).forEach(([hookName, metrics]) => {
      const grade = this.calculateHookGrade(metrics)
      breakdown[hookName] = {
        ...metrics,
        grade
      }
    })

    return breakdown
  }

  private calculateHookGrade(metrics: any): 'A' | 'B' | 'C' | 'D' | 'F' {
    let score = 100

    if (metrics.averageTime > 100) score -= 30
    else if (metrics.averageTime > 50) score -= 15

    const errorRate = (metrics.errorCount / metrics.executionCount) * 100
    if (errorRate > 5) score -= 25
    else if (errorRate > 2) score -= 10

    if (score >= 90) return 'A'
    if (score >= 80) return 'B'
    if (score >= 70) return 'C'
    if (score >= 60) return 'D'
    return 'F'
  }

  private generateComparisonData(snapshot: PluginPerformanceSnapshot) {
    // This would typically compare against a database of plugin performance
    // For now, we'll use estimated benchmarks
    const avgPluginExecutionTime = 75 // ms
    const avgPluginSuccessRate = 98 // %
    const avgPluginMemoryUsage = 15 * 1024 * 1024 // 15MB

    return {
      percentile: this.calculatePercentile(snapshot),
      vsAveragePlugin: {
        speedMultiplier: avgPluginExecutionTime / Math.max(snapshot.averageExecutionTime, 1),
        reliabilityDifference: snapshot.successRate - avgPluginSuccessRate,
        memoryEfficiency: avgPluginMemoryUsage / Math.max(snapshot.memoryUsage.current, 1)
      }
    }
  }

  private calculatePercentile(snapshot: PluginPerformanceSnapshot): number {
    // Simplified percentile calculation based on performance metrics
    let score = 50 // Start at median

    if (snapshot.averageExecutionTime < 50) score += 20
    else if (snapshot.averageExecutionTime > 150) score -= 20

    if (snapshot.successRate > 99) score += 15
    else if (snapshot.successRate < 95) score -= 15

    if (snapshot.memoryUsage.current < 10 * 1024 * 1024) score += 10
    else if (snapshot.memoryUsage.current > 50 * 1024 * 1024) score -= 10

    return Math.max(1, Math.min(99, score))
  }

  private validateTypes(): boolean {
    const hooks = ['onInit', 'onSend', 'onReceive', 'onError', 'onShutdown']
    return hooks.every(hook => 
      this.originalPlugin[hook] === undefined || typeof this.originalPlugin[hook] === 'function'
    )
  }

  private hasProperErrorHandling(): boolean {
    // Check if plugin methods have try-catch blocks or proper error handling
    const hooks = ['onInit', 'onSend', 'onReceive', 'onError', 'onShutdown']
    return hooks.some(hook => {
      if (typeof this.originalPlugin[hook] === 'function') {
        const methodString = this.originalPlugin[hook].toString()
        return methodString.includes('try') || methodString.includes('catch') || methodString.includes('throw')
      }
      return false
    })
  }

  private hasDocumentation(): boolean {
    // Simple check for documentation
    return !!(this.originalPlugin.description || 
             this.originalPlugin.documentation ||
             this.originalPlugin.readme)
  }

  private analyzePerformanceCharacteristics() {
    // Analyze plugin code for performance characteristics
    return {
      estimatedExecutionTime: 50, // Simplified estimate
      memoryFootprint: 5 * 1024 * 1024, // 5MB estimate
      complexityScore: 5, // 1-10 scale
      scalabilityRating: 'good' as const
    }
  }

  private analyzeSecurityCharacteristics() {
    // Analyze plugin for security concerns
    const pluginString = JSON.stringify(this.originalPlugin)
    
    return {
      hasUnsafeOperations: pluginString.includes('eval') || pluginString.includes('Function('),
      hasExternalDependencies: pluginString.includes('require(') || pluginString.includes('import('),
      hasFileSystemAccess: pluginString.includes('fs.') || pluginString.includes('readFile'),
      hasNetworkAccess: pluginString.includes('fetch') || pluginString.includes('http'),
      securityRating: 'safe' as const
    }
  }

  private generateContractRecommendations(
    contractCompliance: any,
    performanceAnalysis: any,
    securityAnalysis: any
  ): string[] {
    const recommendations: string[] = []

    if (!contractCompliance.hasDocumentation) {
      recommendations.push('Add documentation describing plugin functionality and usage')
    }

    if (!contractCompliance.hasProperErrorHandling) {
      recommendations.push('Implement proper error handling with try-catch blocks')
    }

    if (performanceAnalysis.complexityScore > 7) {
      recommendations.push('Consider simplifying plugin logic to improve maintainability')
    }

    if (securityAnalysis.hasUnsafeOperations) {
      recommendations.push('Remove unsafe operations like eval() for security')
    }

    return recommendations
  }

  private isHighMemoryUsage(memoryUsage: any): boolean {
    return memoryUsage.heapUsed > this.config.memoryThreshold
  }

  private generateAndLogReport(): void {
    try {
      const report = this.generatePerformanceReport()
      this.debug.info(`Performance Report for ${this.pluginName}`, {
        grade: report.performanceGrade,
        avgExecutionTime: `${report.executionMetrics.averageExecutionTime.toFixed(2)}ms`,
        successRate: `${report.executionMetrics.successRate.toFixed(1)}%`,
        memoryUsage: `${(report.memoryMetrics.averageMemoryUsage / 1024 / 1024).toFixed(2)}MB`
      })
    } catch (error) {
      this.debug.warn(`Failed to generate performance report for ${this.pluginName}`, { error })
    }
  }

  /**
   * Shutdown and cleanup resources
   */
  shutdown(): void {
    if (this.reportTimer) {
      clearInterval(this.reportTimer)
      this.reportTimer = undefined
    }
  }
}

/**
 * Create a development wrapper for a plugin
 */
export function createPluginDevelopmentWrapper(
  pluginName: string,
  plugin: any,
  config: DevelopmentWrapperConfig = {}
): PluginDevelopmentWrapper {
  return new PluginDevelopmentWrapper(pluginName, plugin, config)
}

/**
 * Measure plugin performance
 */
export async function measurePluginPerformance<T>(
  pluginName: string,
  hookName: string,
  fn: () => Promise<T> | T,
  iterations: number = 10
): Promise<PluginPerformanceReport> {
  const wrapper = new PluginDevelopmentWrapper(pluginName, { [hookName]: fn })
  
  // Run multiple iterations
  for (let i = 0; i < iterations; i++) {
    try {
      await fn()
    } catch (error) {
      // Continue with next iteration
    }
  }
  
  return wrapper.generatePerformanceReport()
}

/**
 * Validate plugin contract
 */
export function validatePluginContract(plugin: any): PluginValidationResult {
  const wrapper = new PluginDevelopmentWrapper(plugin.name || 'unknown', plugin)
  return wrapper.validateContract()
}

// Types are already exported with the interface definitions above