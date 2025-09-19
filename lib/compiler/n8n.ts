import type { Plan, PlanStep, BranchStep, FilterWhen } from "@/lib/plan/schema"
import { autoLayout } from "./layout"

export class CompilerError extends Error {
  constructor(
    public code: string,
    message: string,
    public step?: PlanStep
  ) {
    super(message)
    this.name = "CompilerError"
  }
}

export interface N8nNode {
  id: string
  name: string
  type: string
  typeVersion: number
  position: [number, number]
  parameters: Record<string, any>
  webhookId?: string
}

export interface N8nConnection {
  source: string
  sourceOutput: string
  target: string
  targetInput: string
}

export interface N8nWorkflow {
  nodes: N8nNode[]
  connections: Record<string, Record<string, N8nConnection[]>>
  name: string
}

export interface CompilerOptions {
  orgId: string
}

export interface CompileResult {
  workflow: N8nWorkflow
  name: string
}

// TODO: Implement proper action definition resolver based on organization's available actions
async function resolveActionDefinition(actionSlug: string, orgId: string): Promise<{
  url: string
  method: string
  headers?: Record<string, any>
  body?: Record<string, any>
} | null> {
  // Stub implementation - returns null for now
  // In the future, this should resolve custom actions from the organization's action library
  console.log(`TODO: Resolve action definition "${actionSlug}" for org ${orgId.slice(0, 8)}...`)
  return null
}

function generateNodeId(prefix: string, index: number): string {
  return `${prefix}_${index.toString().padStart(3, '0')}`
}

function escapeNodeName(name: string): string {
  // Ensure node names are safe for n8n
  return name.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 50)
}

function templateString(template: string): string {
  // Convert our template format {{field.subfield}} to n8n format {{ $json.field.subfield }}
  return template.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
    const trimmed = variable.trim()

    // Handle secrets
    if (trimmed.startsWith('secrets.')) {
      const secretKey = trimmed.replace('secrets.', '')
      return `{{ $vars.${secretKey} }}`
    }

    // Handle regular variables
    return `{{ $json.${trimmed} }}`
  })
}

function createWebhookNode(step: Extract<PlanStep, { type: "trigger.http" }>, nodeId: string): N8nNode {
  return {
    id: nodeId,
    name: escapeNodeName(`Webhook_${step.path.replace(/[^a-zA-Z0-9]/g, '_')}`),
    type: "n8n-nodes-base.webhook",
    typeVersion: 1,
    position: [0, 0], // Will be updated by autoLayout
    parameters: {
      path: step.path,
      httpMethod: "POST",
      responseMode: "responseNode",
      options: {
        noResponseBody: false,
        ...(step.secretHmac && {
          authentication: "headerAuth",
          headerAuth: {
            name: "X-Hub-Signature-256",
            value: "={{ $vars.webhook_secret }}"
          }
        })
      }
    },
    webhookId: `webhook_${Math.random().toString(36).substring(2, 15)}`
  }
}

function createFilterNode(step: Extract<PlanStep, { type: "filter" }>, nodeId: string): N8nNode {
  const condition = createCondition(step.when)

  return {
    id: nodeId,
    name: escapeNodeName(`Filter_${step.when.field}`),
    type: "n8n-nodes-base.if",
    typeVersion: 1,
    position: [0, 0], // Will be updated by autoLayout
    parameters: {
      conditions: {
        string: [condition]
      }
    }
  }
}

function createCondition(when: FilterWhen): Record<string, any> {
  const field = `{{ $json.${when.field} }}`

  switch (when.op) {
    case "equals":
      return {
        value1: field,
        operation: "equal",
        value2: when.value
      }
    case "contains":
      return {
        value1: field,
        operation: "contains",
        value2: when.value
      }
    case "gt":
      return {
        value1: field,
        operation: "larger",
        value2: when.value
      }
    case "lt":
      return {
        value1: field,
        operation: "smaller",
        value2: when.value
      }
    case "regex":
      return {
        value1: field,
        operation: "regex",
        value2: when.value
      }
    default:
      throw new CompilerError(
        "UNSUPPORTED_FILTER_OPERATION",
        `Unsupported filter operation "${when.op}". Supported operations: equals, contains, gt, lt, regex`
      )
  }
}

function createBranchNode(step: BranchStep, nodeId: string): N8nNode {
  const cases = step.cases.map((branchCase, index) => ({
    value: index.toString(),
    condition: createCondition(branchCase.when)
  }))

  return {
    id: nodeId,
    name: escapeNodeName("Branch_Switch"),
    type: "n8n-nodes-base.switch",
    typeVersion: 1,
    position: [0, 0], // Will be updated by autoLayout
    parameters: {
      dataType: "string",
      value1: "={{ $json }}",
      rules: {
        values: cases.map((c, index) => ({
          conditions: {
            string: [c.condition]
          },
          output: index
        }))
      },
      fallbackOutput: step.else ? step.cases.length : -1
    }
  }
}

function createSlackNode(step: Extract<PlanStep, { type: "action.slack.postMessage" }>, nodeId: string): N8nNode {
  return {
    id: nodeId,
    name: escapeNodeName(`Slack_${step.channel.replace('#', '').replace('@', '')}`),
    type: "n8n-nodes-base.slack",
    typeVersion: 1,
    position: [0, 0], // Will be updated by autoLayout
    parameters: {
      operation: "postMessage",
      channel: step.channel,
      text: templateString(step.text),
      otherOptions: {},
      authentication: "oAuth2"
    }
  }
}

function createHttpNode(step: Extract<PlanStep, { type: "action.http.request" }>, nodeId: string): N8nNode {
  const url = new URL(step.url)
  const nodeName = `HTTP_${url.hostname.replace(/[^a-zA-Z0-9]/g, '_')}`

  return {
    id: nodeId,
    name: escapeNodeName(nodeName),
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4,
    position: [0, 0], // Will be updated by autoLayout
    parameters: {
      method: step.method,
      url: step.url,
      authentication: "none",
      options: {
        response: {
          fullResponse: false
        },
        ...(step.headers && {
          headers: Object.entries(step.headers).map(([name, value]) => ({
            name,
            value: typeof value === 'string' ? templateString(value) : value
          }))
        }),
        ...(step.body && {
          bodyContentType: "json",
          jsonBody: JSON.stringify(step.body, null, 2)
        })
      }
    }
  }
}

async function createCustomActionNode(
  step: Extract<PlanStep, { type: "custom.action" }>,
  nodeId: string,
  orgId: string
): Promise<N8nNode> {
  const actionDef = await resolveActionDefinition(step.actionSlug, orgId)

  if (!actionDef) {
    throw new CompilerError(
      "UNKNOWN_CUSTOM_ACTION",
      `Custom action "${step.actionSlug}" is not available for your organization. Check the spelling or contact support to add this action.`,
      step
    )
  }

  // Convert custom action to HTTP request node
  return {
    id: nodeId,
    name: escapeNodeName(`Custom_${step.actionSlug}`),
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4,
    position: [0, 0], // Will be updated by autoLayout
    parameters: {
      method: actionDef.method.toUpperCase(),
      url: actionDef.url,
      authentication: "none",
      options: {
        response: {
          fullResponse: false
        },
        ...(actionDef.headers && {
          headers: Object.entries(actionDef.headers).map(([name, value]) => ({
            name,
            value: typeof value === 'string' ? templateString(value) : value
          }))
        }),
        ...(actionDef.body && {
          bodyContentType: "json",
          jsonBody: JSON.stringify({
            ...actionDef.body,
            ...step.input
          }, null, 2)
        })
      }
    }
  }
}

async function compileStep(
  step: PlanStep,
  nodeId: string,
  orgId: string
): Promise<N8nNode> {
  switch (step.type) {
    case "trigger.http":
      return createWebhookNode(step, nodeId)

    case "filter":
      return createFilterNode(step, nodeId)

    case "branch":
      return createBranchNode(step, nodeId)

    case "action.slack.postMessage":
      return createSlackNode(step, nodeId)

    case "action.http.request":
      return createHttpNode(step, nodeId)

    case "custom.action":
      return await createCustomActionNode(step, nodeId, orgId)

    default:
      throw new CompilerError(
        "UNSUPPORTED_STEP_TYPE",
        `Unsupported step type "${(step as any).type}". Use custom.action for unsupported integrations.`,
        step
      )
  }
}

function createConnections(nodes: N8nNode[], branchMap: Map<string, { cases: number; hasElse: boolean }>): Record<string, Record<string, N8nConnection[]>> {
  const connections: Record<string, Record<string, N8nConnection[]>> = {}

  for (let i = 0; i < nodes.length - 1; i++) {
    const currentNode = nodes[i]
    const nextNode = nodes[i + 1]

    if (!connections[currentNode.id]) {
      connections[currentNode.id] = {}
    }

    const branchInfo = branchMap.get(currentNode.id)

    if (currentNode.type === "n8n-nodes-base.if") {
      // IF node: true goes to next, false goes to end or next non-branch node
      connections[currentNode.id]["main"] = [
        {
          source: currentNode.id,
          sourceOutput: "main",
          target: nextNode.id,
          targetInput: "main"
        },
        // False path - could connect to end or skip
        {
          source: currentNode.id,
          sourceOutput: "main",
          target: nextNode.id,
          targetInput: "main"
        }
      ]
    } else if (currentNode.type === "n8n-nodes-base.switch" && branchInfo) {
      // Switch node: create outputs for each case + else
      const outputs: N8nConnection[] = []

      for (let caseIndex = 0; caseIndex < branchInfo.cases; caseIndex++) {
        outputs.push({
          source: currentNode.id,
          sourceOutput: "main",
          target: nextNode.id,
          targetInput: "main"
        })
      }

      if (branchInfo.hasElse) {
        outputs.push({
          source: currentNode.id,
          sourceOutput: "main",
          target: nextNode.id,
          targetInput: "main"
        })
      }

      connections[currentNode.id]["main"] = outputs
    } else {
      // Regular node: simple connection to next
      connections[currentNode.id]["main"] = [
        {
          source: currentNode.id,
          sourceOutput: "main",
          target: nextNode.id,
          targetInput: "main"
        }
      ]
    }
  }

  return connections
}

async function compileStepsRecursively(
  steps: PlanStep[],
  orgId: string,
  nodeCounter: { count: number },
  branchMap: Map<string, { cases: number; hasElse: boolean }>
): Promise<N8nNode[]> {
  const nodes: N8nNode[] = []

  for (const step of steps) {
    const nodeId = generateNodeId("node", nodeCounter.count++)

    if (step.type === "branch") {
      // Store branch info for connection generation
      branchMap.set(nodeId, {
        cases: step.cases.length,
        hasElse: !!step.else
      })

      const branchNode = await compileStep(step, nodeId, orgId)
      nodes.push(branchNode)

      // Compile nested steps in cases
      for (const branchCase of step.cases) {
        const caseNodes = await compileStepsRecursively(branchCase.steps, orgId, nodeCounter, branchMap)
        nodes.push(...caseNodes)
      }

      // Compile else steps if present
      if (step.else) {
        const elseNodes = await compileStepsRecursively(step.else, orgId, nodeCounter, branchMap)
        nodes.push(...elseNodes)
      }
    } else {
      const node = await compileStep(step, nodeId, orgId)
      nodes.push(node)
    }
  }

  return nodes
}

export async function compileToN8N(plan: Plan, opts: CompilerOptions): Promise<CompileResult> {
  try {
    console.log("Compiling plan to n8n workflow", {
      planName: plan.name,
      stepCount: plan.steps.length,
      orgId: opts.orgId.slice(0, 8) + "...",
    })

    const nodeCounter = { count: 0 }
    const branchMap = new Map<string, { cases: number; hasElse: boolean }>()

    // Compile all steps recursively
    const nodes = await compileStepsRecursively(plan.steps, opts.orgId, nodeCounter, branchMap)

    if (nodes.length === 0) {
      throw new CompilerError(
        "NO_NODES_GENERATED",
        "Plan compilation resulted in no nodes. Ensure the plan has valid steps."
      )
    }

    // Generate connections between nodes
    const connections = createConnections(nodes, branchMap)

    // Apply auto-layout to position nodes
    const layoutNodes = autoLayout(nodes, connections)

    const workflow: N8nWorkflow = {
      nodes: layoutNodes,
      connections,
      name: plan.name
    }

    console.log("Plan compiled successfully", {
      planName: plan.name,
      nodeCount: layoutNodes.length,
      connectionCount: Object.keys(connections).length,
      orgId: opts.orgId.slice(0, 8) + "...",
    })

    return {
      workflow,
      name: plan.name
    }

  } catch (error) {
    if (error instanceof CompilerError) {
      console.error("Plan compilation failed", {
        code: error.code,
        message: error.message,
        stepType: error.step?.type,
        orgId: opts.orgId.slice(0, 8) + "...",
      })
      throw error
    }

    console.error("Unexpected compilation error", {
      error: error instanceof Error ? error.message : "Unknown error",
      orgId: opts.orgId.slice(0, 8) + "...",
    })

    throw new CompilerError(
      "COMPILATION_ERROR",
      `Failed to compile plan: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}