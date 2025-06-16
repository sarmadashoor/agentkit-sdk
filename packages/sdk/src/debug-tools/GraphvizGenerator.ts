/**
 * Graphviz Generator for Plugin Execution Visualization
 * 
 * Generates Graphviz DOT format graphs for visualizing plugin execution flow,
 * performance bottlenecks, and dependency relationships.
 */

import { ExecutionGraph, GraphNode, GraphEdge, LifecycleTimelineEntry } from './types'
import { DebugManager } from './DebugManager'

/**
 * Graphviz generation options
 */
export interface GraphvizOptions {
  includeTimings?: boolean
  includeMemoryUsage?: boolean
  includeErrorDetails?: boolean
  colorScheme?: 'default' | 'performance' | 'status' | 'memory'
  layout?: 'dot' | 'neato' | 'fdp' | 'sfdp' | 'circo' | 'twopi'
  rankdir?: 'TB' | 'BT' | 'LR' | 'RL'
  showLegend?: boolean
  groupByPlugin?: boolean
  highlightSlowOperations?: boolean
  performanceThreshold?: number
  compactMode?: boolean
}

/**
 * Graphviz generator class
 */
export class GraphvizGenerator {
  private debugManager: DebugManager
  private defaultOptions: Required<GraphvizOptions> = {
    includeTimings: true,
    includeMemoryUsage: true,
    includeErrorDetails: true,
    colorScheme: 'performance',
    layout: 'dot',
    rankdir: 'TB',
    showLegend: true,
    groupByPlugin: true,
    highlightSlowOperations: true,
    performanceThreshold: 100,
    compactMode: false
  }

  constructor(debugManager?: DebugManager) {
    this.debugManager = debugManager || DebugManager.getInstance()
  }

  /**
   * Generate Graphviz DOT from timeline entries
   */
  generateFromTimeline(
    entries: LifecycleTimelineEntry[],
    options: Partial<GraphvizOptions> = {}
  ): string {
    const mergedOptions = { ...this.defaultOptions, ...options }
    const graph = this.createExecutionGraph(entries)
    
    return this.generateDotFromGraph(graph, mergedOptions)
  }

  /**
   * Generate Graphviz DOT from execution graph
   */
  generateDotFromGraph(
    graph: ExecutionGraph,
    options: Partial<GraphvizOptions> = {}
  ): string {
    const mergedOptions = { ...this.defaultOptions, ...options }
    
    let dot = this.generateHeader(mergedOptions)
    
    if (mergedOptions.groupByPlugin) {
      dot += this.generateGroupedNodes(graph, mergedOptions)
    } else {
      dot += this.generateFlatNodes(graph, mergedOptions)
    }
    
    dot += this.generateEdges(graph, mergedOptions)
    
    if (mergedOptions.showLegend) {
      dot += this.generateLegend(mergedOptions)
    }
    
    dot += '}\n'
    
    return dot
  }

  /**
   * Generate performance heatmap
   */
  generatePerformanceHeatmap(
    entries: LifecycleTimelineEntry[],
    options: Partial<GraphvizOptions> = {}
  ): string {
    const mergedOptions = { 
      ...this.defaultOptions, 
      ...options, 
      colorScheme: 'performance',
      highlightSlowOperations: true
    }
    
    return this.generateFromTimeline(entries, mergedOptions)
  }

  /**
   * Generate dependency graph
   */
  generateDependencyGraph(
    entries: LifecycleTimelineEntry[],
    options: Partial<GraphvizOptions> = {}
  ): string {
    const mergedOptions = { 
      ...this.defaultOptions, 
      ...options,
      layout: 'neato',
      rankdir: 'LR',
      compactMode: true
    }
    
    // Create simplified graph focusing on dependencies
    const graph = this.createDependencyGraph(entries)
    return this.generateDotFromGraph(graph, mergedOptions)
  }

  /**
   * Export graph as SVG (requires Graphviz installation)
   */
  async exportAsSVG(
    dot: string,
    outputPath?: string
  ): Promise<string> {
    try {
      const { execSync } = require('child_process')
      const fs = require('fs')
      const path = require('path')
      
      // Write DOT to temporary file
      const tempDotPath = path.join(process.cwd(), 'temp.dot')
      fs.writeFileSync(tempDotPath, dot)
      
      // Generate SVG
      const svgPath = outputPath || path.join(process.cwd(), 'execution-graph.svg')
      execSync(`dot -Tsvg ${tempDotPath} -o ${svgPath}`)
      
      // Clean up
      fs.unlinkSync(tempDotPath)
      
      this.debugManager.log('info', `Graph exported to SVG: ${svgPath}`)
      return svgPath
      
    } catch (error) {
      this.debugManager.log('error', 'Failed to export SVG (Graphviz may not be installed)', { error })
      throw error
    }
  }

  private createExecutionGraph(entries: LifecycleTimelineEntry[]): ExecutionGraph {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []
    const nodeMap = new Map<string, GraphNode>()

    // Create nodes for each plugin execution
    entries.forEach((entry, index) => {
      const nodeId = `${entry.pluginName}_${entry.hookName}_${index}`
      const node: GraphNode = {
        id: nodeId,
        label: this.createNodeLabel(entry),
        type: 'plugin',
        status: this.mapStatus(entry.status),
        duration: entry.duration,
        metadata: {
          pluginName: entry.pluginName,
          hookName: entry.hookName,
          executionOrder: entry.executionOrder,
          isSlowExecution: entry.isSlowExecution,
          memoryDelta: entry.performance?.memoryDelta,
          error: entry.error
        }
      }
      
      nodes.push(node)
      nodeMap.set(nodeId, node)
    })

    // Create edges based on execution order and relationships
    for (let i = 0; i < entries.length - 1; i++) {
      const currentEntry = entries[i]
      const nextEntry = entries[i + 1]
      
      const fromId = `${currentEntry.pluginName}_${currentEntry.hookName}_${i}`
      const toId = `${nextEntry.pluginName}_${nextEntry.hookName}_${i + 1}`
      
      // Determine edge type
      let edgeType: 'calls' | 'triggers' | 'depends_on' | 'contains' = 'triggers'
      if (currentEntry.requestId === nextEntry.requestId) {
        edgeType = 'calls'
      }
      
      edges.push({
        from: fromId,
        to: toId,
        type: edgeType,
        weight: this.calculateEdgeWeight(currentEntry, nextEntry),
        metadata: {
          timeDelta: nextEntry.timestamp - currentEntry.timestamp
        }
      })
    }

    return {
      id: `graph-${Date.now()}`,
      timestamp: Date.now(),
      nodes,
      edges,
      metadata: {
        requestId: entries[0]?.requestId || 'unknown',
        agentId: entries[0]?.agentId || 'unknown',
        duration: entries.length > 0 ? 
          Math.max(...entries.map(e => e.timestamp)) - Math.min(...entries.map(e => e.timestamp)) : 0,
        pluginCount: new Set(entries.map(e => e.pluginName)).size,
        status: entries.some(e => e.status === 'failed') ? 'error' : 
                entries.every(e => e.status === 'completed') ? 'success' : 'partial'
      }
    }
  }

  private createDependencyGraph(entries: LifecycleTimelineEntry[]): ExecutionGraph {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []
    const pluginNodes = new Map<string, GraphNode>()

    // Create plugin nodes
    const plugins = new Set(entries.map(e => e.pluginName))
    plugins.forEach(pluginName => {
      const pluginEntries = entries.filter(e => e.pluginName === pluginName)
      const avgDuration = pluginEntries.reduce((sum, e) => sum + (e.duration || 0), 0) / pluginEntries.length
      
      const node: GraphNode = {
        id: pluginName,
        label: `${pluginName}\\n${avgDuration.toFixed(2)}ms avg`,
        type: 'plugin',
        status: pluginEntries.some(e => e.status === 'failed') ? 'error' : 'completed',
        duration: avgDuration,
        metadata: {
          executionCount: pluginEntries.length,
          totalDuration: pluginEntries.reduce((sum, e) => sum + (e.duration || 0), 0),
          errorCount: pluginEntries.filter(e => e.status === 'failed').length
        }
      }
      
      nodes.push(node)
      pluginNodes.set(pluginName, node)
    })

    // Create dependency edges (simplified - based on execution order)
    const pluginOrder = Array.from(plugins)
    for (let i = 0; i < pluginOrder.length - 1; i++) {
      edges.push({
        from: pluginOrder[i],
        to: pluginOrder[i + 1],
        type: 'depends_on',
        weight: 1
      })
    }

    return {
      id: `dependency-graph-${Date.now()}`,
      timestamp: Date.now(),
      nodes,
      edges,
      metadata: {
        requestId: 'dependency-analysis',
        agentId: entries[0]?.agentId || 'unknown',
        duration: 0,
        pluginCount: plugins.size,
        status: 'success'
      }
    }
  }

  private generateHeader(options: Required<GraphvizOptions>): string {
    return `digraph ExecutionGraph {
  layout="${options.layout}";
  rankdir="${options.rankdir}";
  node [shape=box, style=filled, fontname="Helvetica"];
  edge [fontname="Helvetica"];
  
  // Graph attributes
  graph [
    fontname="Helvetica",
    fontsize=12,
    label="Plugin Execution Graph",
    labelloc=top,
    bgcolor=white
  ];
  
`
  }

  private generateGroupedNodes(graph: ExecutionGraph, options: Required<GraphvizOptions>): string {
    let dot = ''
    const plugins = new Set(graph.nodes.map(n => n.metadata?.pluginName).filter(Boolean))
    
    plugins.forEach(pluginName => {
      dot += `  subgraph "cluster_${pluginName}" {\n`
      dot += `    label="${pluginName}";\n`
      dot += `    style=filled;\n`
      dot += `    fillcolor=lightgray;\n`
      
      const pluginNodes = graph.nodes.filter(n => n.metadata?.pluginName === pluginName)
      pluginNodes.forEach(node => {
        dot += this.generateNodeDefinition(node, options)
      })
      
      dot += '  }\n\n'
    })
    
    return dot
  }

  private generateFlatNodes(graph: ExecutionGraph, options: Required<GraphvizOptions>): string {
    let dot = ''
    
    graph.nodes.forEach(node => {
      dot += this.generateNodeDefinition(node, options)
    })
    
    return dot + '\n'
  }

  private generateNodeDefinition(node: GraphNode, options: Required<GraphvizOptions>): string {
    const color = this.getNodeColor(node, options.colorScheme)
    const shape = this.getNodeShape(node)
    const style = this.getNodeStyle(node, options)
    
    let attributes = [
      `fillcolor="${color}"`,
      `shape=${shape}`,
      `style="${style}"`
    ]

    if (node.metadata?.isSlowExecution && options.highlightSlowOperations) {
      attributes.push('penwidth=3', 'color=red')
    }

    if (options.compactMode) {
      attributes.push('fontsize=10', 'width=0.5', 'height=0.3')
    }

    return `    "${node.id}" [${attributes.join(', ')}, label="${node.label}"];\n`
  }

  private generateEdges(graph: ExecutionGraph, options: Required<GraphvizOptions>): string {
    let dot = '\n  // Edges\n'
    
    graph.edges.forEach(edge => {
      const style = this.getEdgeStyle(edge)
      const color = this.getEdgeColor(edge)
      const label = edge.label || ''
      
      let attributes = [
        `style="${style}"`,
        `color="${color}"`
      ]

      if (label && !options.compactMode) {
        attributes.push(`label="${label}"`)
      }

      if (edge.weight && edge.weight > 1) {
        attributes.push(`penwidth=${Math.min(edge.weight, 5)}`)
      }

      dot += `  "${edge.from}" -> "${edge.to}" [${attributes.join(', ')}];\n`
    })
    
    return dot + '\n'
  }

  private generateLegend(options: Required<GraphvizOptions>): string {
    return `
  // Legend
  subgraph cluster_legend {
    label="Legend";
    style=filled;
    fillcolor=white;
    
    legend_success [label="Success", fillcolor=lightgreen, style=filled];
    legend_error [label="Error", fillcolor=lightcoral, style=filled];
    legend_timeout [label="Timeout", fillcolor=orange, style=filled];
    legend_slow [label="Slow (>${options.performanceThreshold}ms)", fillcolor=yellow, style=filled, penwidth=3, color=red];
    
    legend_success -> legend_error -> legend_timeout -> legend_slow [style=invis];
  }
`
  }

  private createNodeLabel(entry: LifecycleTimelineEntry): string {
    let label = `${entry.pluginName}\\n${entry.hookName}`
    
    if (entry.duration !== undefined) {
      label += `\\n${entry.duration.toFixed(2)}ms`
    }
    
    if (entry.performance?.memoryDelta) {
      const memoryMB = (entry.performance.memoryDelta / 1024 / 1024).toFixed(1)
      label += `\\n${memoryMB}MB`
    }
    
    if (entry.error) {
      const errorPreview = entry.error.length > 20 ? 
        entry.error.substring(0, 20) + '...' : entry.error
      label += `\\nError: ${errorPreview}`
    }
    
    return label
  }

  private mapStatus(status: string): 'pending' | 'running' | 'completed' | 'error' | 'timeout' {
    switch (status) {
      case 'started': return 'running'
      case 'completed': return 'completed'
      case 'failed': return 'error'
      case 'timeout': return 'timeout'
      default: return 'pending'
    }
  }

  private getNodeColor(node: GraphNode, colorScheme: string): string {
    switch (colorScheme) {
      case 'performance':
        if (node.duration === undefined) return 'lightgray'
        if (node.duration > 100) return 'lightcoral'
        if (node.duration > 50) return 'orange'
        return 'lightgreen'
      
      case 'status':
        switch (node.status) {
          case 'completed': return 'lightgreen'
          case 'error': return 'lightcoral'
          case 'timeout': return 'orange'
          case 'running': return 'lightblue'
          default: return 'lightgray'
        }
      
      case 'memory':
        const memoryDelta = node.metadata?.memoryDelta as number
        if (!memoryDelta) return 'lightgray'
        const memoryMB = memoryDelta / 1024 / 1024
        if (memoryMB > 10) return 'lightcoral'
        if (memoryMB > 5) return 'orange'
        return 'lightgreen'
      
      default:
        return 'lightblue'
    }
  }

  private getNodeShape(node: GraphNode): string {
    switch (node.type) {
      case 'plugin': return 'box'
      case 'hook': return 'ellipse'
      case 'agent': return 'diamond'
      case 'transport': return 'hexagon'
      case 'event': return 'circle'
      default: return 'box'
    }
  }

  private getNodeStyle(node: GraphNode, options: Required<GraphvizOptions>): string {
    let style = 'filled'
    
    if (node.status === 'error') {
      style += ',bold'
    }
    
    if (node.metadata?.isSlowExecution && options.highlightSlowOperations) {
      style += ',bold'
    }
    
    return style
  }

  private getEdgeStyle(edge: GraphEdge): string {
    switch (edge.type) {
      case 'calls': return 'solid'
      case 'triggers': return 'dashed'
      case 'depends_on': return 'dotted'
      case 'contains': return 'bold'
      default: return 'solid'
    }
  }

  private getEdgeColor(edge: GraphEdge): string {
    switch (edge.type) {
      case 'calls': return 'blue'
      case 'triggers': return 'green'
      case 'depends_on': return 'gray'
      case 'contains': return 'black'
      default: return 'black'
    }
  }

  private calculateEdgeWeight(from: LifecycleTimelineEntry, to: LifecycleTimelineEntry): number {
    // Calculate weight based on time proximity and relationship
    const timeDelta = to.timestamp - from.timestamp
    if (timeDelta < 10) return 3 // Very close timing
    if (timeDelta < 100) return 2 // Close timing
    return 1 // Normal timing
  }
}

/**
 * Generate Graphviz DOT from timeline entries
 */
export function generateExecutionGraph(
  entries: LifecycleTimelineEntry[],
  options: Partial<GraphvizOptions> = {}
): string {
  const generator = new GraphvizGenerator()
  return generator.generateFromTimeline(entries, options)
}

/**
 * Generate performance heatmap
 */
export function generatePerformanceHeatmap(
  entries: LifecycleTimelineEntry[],
  options: Partial<GraphvizOptions> = {}
): string {
  const generator = new GraphvizGenerator()
  return generator.generatePerformanceHeatmap(entries, options)
}

// Global Graphviz generator
export const globalGraphvizGenerator = new GraphvizGenerator()

export type { GraphvizOptions, ExecutionGraph }