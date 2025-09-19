import type { N8nNode, N8nConnection } from "./n8n"

export interface LayoutOptions {
  nodeWidth?: number
  nodeHeight?: number
  horizontalSpacing?: number
  verticalSpacing?: number
  startX?: number
  startY?: number
}

const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  nodeWidth: 240,
  nodeHeight: 100,
  horizontalSpacing: 300,
  verticalSpacing: 150,
  startX: 100,
  startY: 100
}

interface LayoutNode extends N8nNode {
  level: number
  column: number
}

function buildDependencyGraph(nodes: N8nNode[], connections: Record<string, Record<string, N8nConnection[]>>): Map<string, string[]> {
  const graph = new Map<string, string[]>()

  // Initialize all nodes with empty dependencies
  nodes.forEach(node => {
    graph.set(node.id, [])
  })

  // Build dependency relationships
  Object.entries(connections).forEach(([sourceId, outputs]) => {
    Object.values(outputs).forEach(connectionList => {
      connectionList.forEach(connection => {
        const targets = graph.get(connection.target) || []
        if (!targets.includes(sourceId)) {
          targets.push(sourceId)
          graph.set(connection.target, targets)
        }
      })
    })
  })

  return graph
}

function calculateLevels(nodes: N8nNode[], dependencyGraph: Map<string, string[]>): Map<string, number> {
  const levels = new Map<string, number>()
  const visited = new Set<string>()

  function calculateLevel(nodeId: string): number {
    if (visited.has(nodeId)) {
      return levels.get(nodeId) || 0
    }

    visited.add(nodeId)

    const dependencies = dependencyGraph.get(nodeId) || []
    if (dependencies.length === 0) {
      // No dependencies, this is a root node (trigger)
      levels.set(nodeId, 0)
      return 0
    }

    // Level is 1 + max level of dependencies
    const depLevels = dependencies.map(depId => calculateLevel(depId))
    const level = Math.max(...depLevels) + 1
    levels.set(nodeId, level)
    return level
  }

  // Calculate levels for all nodes
  nodes.forEach(node => calculateLevel(node.id))

  return levels
}

function groupNodesByLevel(nodes: N8nNode[], levels: Map<string, number>): Map<number, N8nNode[]> {
  const groups = new Map<number, N8nNode[]>()

  nodes.forEach(node => {
    const level = levels.get(node.id) || 0
    const group = groups.get(level) || []
    group.push(node)
    groups.set(level, group)
  })

  return groups
}

function calculatePositions(
  levelGroups: Map<number, N8nNode[]>,
  options: Required<LayoutOptions>
): Map<string, [number, number]> {
  const positions = new Map<string, [number, number]>()

  levelGroups.forEach((nodesInLevel, level) => {
    const levelX = options.startX + (level * options.horizontalSpacing)

    // Sort nodes in level for consistent ordering
    const sortedNodes = nodesInLevel.sort((a, b) => a.name.localeCompare(b.name))

    sortedNodes.forEach((node, index) => {
      // Center nodes vertically if there are multiple at the same level
      const totalHeight = sortedNodes.length * options.nodeHeight + (sortedNodes.length - 1) * options.verticalSpacing
      const startY = options.startY - (totalHeight / 2)
      const nodeY = startY + (index * (options.nodeHeight + options.verticalSpacing))

      positions.set(node.id, [levelX, nodeY])
    })
  })

  return positions
}

export function autoLayout(
  nodes: N8nNode[],
  connections: Record<string, Record<string, N8nConnection[]>>,
  options: LayoutOptions = {}
): N8nNode[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  if (nodes.length === 0) {
    return []
  }

  if (nodes.length === 1) {
    // Single node, just position it at the start
    return [
      {
        ...nodes[0],
        position: [opts.startX, opts.startY]
      }
    ]
  }

  try {
    // Build dependency graph (reverse of connections)
    const dependencyGraph = buildDependencyGraph(nodes, connections)

    // Calculate level for each node (distance from trigger)
    const levels = calculateLevels(nodes, dependencyGraph)

    // Group nodes by level
    const levelGroups = groupNodesByLevel(nodes, levels)

    // Calculate positions for each node
    const positions = calculatePositions(levelGroups, opts)

    // Apply positions to nodes
    return nodes.map(node => ({
      ...node,
      position: positions.get(node.id) || [opts.startX, opts.startY]
    }))

  } catch (error) {
    console.warn("Auto-layout failed, falling back to simple grid layout", {
      error: error instanceof Error ? error.message : "Unknown error",
      nodeCount: nodes.length
    })

    // Fallback to simple grid layout
    return nodes.map((node, index) => ({
      ...node,
      position: [
        opts.startX + (index % 3) * opts.horizontalSpacing,
        opts.startY + Math.floor(index / 3) * opts.verticalSpacing
      ] as [number, number]
    }))
  }
}

// Helper function to validate layout results
export function validateLayout(nodes: N8nNode[]): {
  valid: boolean
  issues: string[]
} {
  const issues: string[] = []

  // Check for overlapping nodes
  const positions = new Set<string>()
  nodes.forEach(node => {
    const posKey = `${node.position[0]},${node.position[1]}`
    if (positions.has(posKey)) {
      issues.push(`Overlapping nodes detected at position ${posKey}`)
    }
    positions.add(posKey)
  })

  // Check for negative positions
  nodes.forEach(node => {
    if (node.position[0] < 0 || node.position[1] < 0) {
      issues.push(`Node ${node.name} has negative position: [${node.position[0]}, ${node.position[1]}]`)
    }
  })

  return {
    valid: issues.length === 0,
    issues
  }
}

// Helper function to get layout bounds
export function getLayoutBounds(nodes: N8nNode[]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
} {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
  }

  const positions = nodes.map(node => node.position)
  const minX = Math.min(...positions.map(p => p[0]))
  const minY = Math.min(...positions.map(p => p[1]))
  const maxX = Math.max(...positions.map(p => p[0]))
  const maxY = Math.max(...positions.map(p => p[1]))

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  }
}