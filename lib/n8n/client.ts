import type { N8nWorkflow } from "@/lib/compiler/n8n"

export interface N8nClientConfig {
  baseURL: string
  apiKey: string
}

export interface N8nWorkflowResponse {
  id: string
  name: string
  active: boolean
  nodes: any[]
  connections: Record<string, any>
  settings?: Record<string, any>
  staticData?: Record<string, any>
  tags?: string[]
  versionId?: string
  createdAt?: string
  updatedAt?: string
}

export interface N8nCreateWorkflowRequest {
  name: string
  nodes: any[]
  connections: Record<string, any>
  active?: boolean
  settings?: Record<string, any>
  staticData?: Record<string, any>
  tags?: string[]
}

export interface N8nVersionResponse {
  n8n: {
    version: string
  }
}

export interface N8nWebhookInfo {
  url: string
  method: string
  path: string
}

export class N8nError extends Error {
  constructor(
    public status: number,
    message: string,
    public response?: any
  ) {
    super(message)
    this.name = "N8nError"
  }
}

export class N8nClient {
  private baseURL: string
  private apiKey: string
  private apiBasePath: string | null = null

  constructor(config: N8nClientConfig) {
    this.baseURL = config.baseURL.replace(/\/$/, "") // Remove trailing slash
    this.apiKey = config.apiKey
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any
  ): Promise<T> {
    // Auto-detect API base path if not already done
    if (!this.apiBasePath) {
      await this.detectApiBasePath()
    }

    const url = `${this.baseURL}${this.apiBasePath}${path}`

    const headers: Record<string, string> = {
      "X-N8N-API-KEY": this.apiKey,
      "Content-Type": "application/json",
    }

    console.log(`N8n API request: ${method} ${path}`, {
      url: url.replace(this.apiKey, "[REDACTED]"),
      hasBody: !!body,
      bodySize: body ? JSON.stringify(body).length : 0,
    })

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      })

      const responseText = await response.text()
      let responseData: any

      try {
        responseData = responseText ? JSON.parse(responseText) : null
      } catch {
        responseData = { raw: responseText }
      }

      if (!response.ok) {
        console.error("N8n API error", {
          status: response.status,
          statusText: response.statusText,
          url: url.replace(this.apiKey, "[REDACTED]"),
          response: responseData,
        })

        throw new N8nError(
          response.status,
          `N8n API error (${response.status}): ${responseData?.message || response.statusText}`,
          responseData
        )
      }

      console.log(`N8n API response: ${method} ${path}`, {
        status: response.status,
        hasData: !!responseData,
        dataSize: responseText.length,
      })

      return responseData
    } catch (error) {
      if (error instanceof N8nError) {
        throw error
      }

      console.error("N8n API request failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        url: url.replace(this.apiKey, "[REDACTED]"),
      })

      throw new N8nError(
        0,
        `N8n API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    }
  }

  private async detectApiBasePath(): Promise<void> {
    const paths = ["/api/v1", "/rest"]

    for (const path of paths) {
      try {
        this.apiBasePath = path
        await this.getVersion()
        console.log(`N8n API base path detected: ${path}`)
        return
      } catch (error) {
        console.log(`N8n API path ${path} failed, trying next...`)
        continue
      }
    }

    throw new N8nError(
      0,
      "Could not detect N8n API base path. Tried /api/v1 and /rest. Check your N8n installation and API configuration."
    )
  }

  async getVersion(): Promise<N8nVersionResponse> {
    return this.request<N8nVersionResponse>("GET", "/")
  }

  async listWorkflows(): Promise<N8nWorkflowResponse[]> {
    const response = await this.request<{ data: N8nWorkflowResponse[] }>("GET", "/workflows")
    return response.data || []
  }

  async getWorkflow(id: string): Promise<N8nWorkflowResponse> {
    return this.request<N8nWorkflowResponse>("GET", `/workflows/${id}`)
  }

  async createWorkflow(workflow: N8nCreateWorkflowRequest): Promise<N8nWorkflowResponse> {
    return this.request<N8nWorkflowResponse>("POST", "/workflows", workflow)
  }

  async updateWorkflow(id: string, workflow: Partial<N8nCreateWorkflowRequest>): Promise<N8nWorkflowResponse> {
    return this.request<N8nWorkflowResponse>("PUT", `/workflows/${id}`, workflow)
  }

  async activateWorkflow(id: string, active: boolean): Promise<N8nWorkflowResponse> {
    return this.request<N8nWorkflowResponse>("PATCH", `/workflows/${id}`, { active })
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.request<void>("DELETE", `/workflows/${id}`)
  }

  async upsertByName(name: string, workflow: N8nWorkflow): Promise<{
    workflowId: string
    isNew: boolean
    webhookUrl?: string
  }> {
    try {
      // Find existing workflow by name
      const existingWorkflows = await this.listWorkflows()
      const existing = existingWorkflows.find(w => w.name === name)

      const workflowData: N8nCreateWorkflowRequest = {
        name: workflow.name || name,
        nodes: workflow.nodes,
        connections: workflow.connections,
        active: false, // Will be activated separately
        settings: {
          timezone: "America/New_York",
          saveDataErrorExecution: "all",
          saveDataSuccessExecution: "all",
          saveManualExecutions: true,
        },
        tags: ["arizu-generated"]
      }

      let result: N8nWorkflowResponse
      let isNew = false

      if (existing) {
        console.log(`Updating existing workflow: ${name} (${existing.id})`)
        result = await this.updateWorkflow(existing.id, workflowData)
      } else {
        console.log(`Creating new workflow: ${name}`)
        result = await this.createWorkflow(workflowData)
        isNew = true
      }

      // Extract webhook URL if present
      const webhookUrl = this.extractWebhookUrl(result)

      return {
        workflowId: result.id,
        isNew,
        webhookUrl
      }

    } catch (error) {
      console.error("Failed to upsert workflow", {
        name,
        error: error instanceof Error ? error.message : "Unknown error",
      })

      if (error instanceof N8nError) {
        throw error
      }

      throw new N8nError(
        0,
        `Failed to upsert workflow "${name}": ${error instanceof Error ? error.message : "Unknown error"}`
      )
    }
  }

  private extractWebhookUrl(workflow: N8nWorkflowResponse): string | undefined {
    try {
      // Look for webhook nodes in the workflow
      const webhookNode = workflow.nodes?.find(node =>
        node.type === "n8n-nodes-base.webhook" && node.webhookId
      )

      if (webhookNode && webhookNode.parameters?.path) {
        const path = webhookNode.parameters.path
        // Construct webhook URL based on n8n instance URL
        const baseUrl = this.baseURL.replace(/\/api.*$/, "") // Remove /api/v1 or /rest suffix
        return `${baseUrl}/webhook${path}`
      }

      return undefined
    } catch (error) {
      console.warn("Failed to extract webhook URL", {
        error: error instanceof Error ? error.message : "Unknown error",
      })
      return undefined
    }
  }

  // Helper method to get workflow by name
  async getWorkflowByName(name: string): Promise<N8nWorkflowResponse | null> {
    try {
      const workflows = await this.listWorkflows()
      return workflows.find(w => w.name === name) || null
    } catch (error) {
      console.error("Failed to get workflow by name", {
        name,
        error: error instanceof Error ? error.message : "Unknown error",
      })
      return null
    }
  }

  // Helper method to check if n8n is reachable
  async healthCheck(): Promise<boolean> {
    try {
      await this.getVersion()
      return true
    } catch (error) {
      console.error("N8n health check failed", {
        baseURL: this.baseURL,
        error: error instanceof Error ? error.message : "Unknown error",
      })
      return false
    }
  }
}

// Helper function to create client from environment
export function createN8nClient(): N8nClient {
  const baseURL = process.env.N8N_URL
  const apiKey = process.env.N8N_API_KEY

  if (!baseURL) {
    throw new Error("N8N_URL environment variable is required")
  }

  if (!apiKey) {
    throw new Error("N8N_API_KEY environment variable is required")
  }

  return new N8nClient({ baseURL, apiKey })
}