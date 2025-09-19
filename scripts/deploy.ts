#!/usr/bin/env tsx

import { readFileSync } from "fs"
import { join } from "path"

interface DeployRequest {
  plan: unknown
  workflowName: string
}

interface DeployResponse {
  ok: boolean
  workflowId?: string
  workflowName?: string
  webhookUrl?: string
  isNew?: boolean
  message?: string
  error?: {
    code: string
    message: string
    details?: any
  }
}

function printUsage() {
  console.log(`
Usage: npm run deploy [options]

Options:
  --file <path>     Read plan from JSON file
  --name <name>     Workflow name (required)
  --stdin           Read plan from stdin (default)
  --help            Show this help

Examples:
  # Deploy from file
  npm run deploy -- --file examples/lead-router.json --name "Lead Router"

  # Deploy from stdin
  cat examples/lead-router.json | npm run deploy -- --name "Lead Router"

  # Deploy with custom name
  npm run deploy -- --file my-plan.json --name "My Custom Workflow"

Environment Variables:
  NEXT_PUBLIC_APP_URL  - App URL for API calls (default: http://localhost:3000)
  API_TOKEN           - Optional API token for authentication
`)
}

function parseArgs(): {
  file?: string
  name?: string
  stdin: boolean
  help: boolean
} {
  const args = process.argv.slice(2)
  const parsed = {
    file: undefined as string | undefined,
    name: undefined as string | undefined,
    stdin: true,
    help: false
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const nextArg = args[i + 1]

    switch (arg) {
      case "--file":
        if (!nextArg) {
          console.error("Error: --file requires a path argument")
          process.exit(1)
        }
        parsed.file = nextArg
        parsed.stdin = false
        i++ // Skip next arg
        break

      case "--name":
        if (!nextArg) {
          console.error("Error: --name requires a name argument")
          process.exit(1)
        }
        parsed.name = nextArg
        i++ // Skip next arg
        break

      case "--stdin":
        parsed.stdin = true
        parsed.file = undefined
        break

      case "--help":
      case "-h":
        parsed.help = true
        break

      default:
        console.error(`Error: Unknown argument: ${arg}`)
        printUsage()
        process.exit(1)
    }
  }

  return parsed
}

function readPlanFromStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ""

    process.stdin.setEncoding("utf8")

    process.stdin.on("data", (chunk) => {
      data += chunk
    })

    process.stdin.on("end", () => {
      resolve(data.trim())
    })

    process.stdin.on("error", (error) => {
      reject(error)
    })

    // Set a timeout to avoid hanging
    setTimeout(() => {
      if (!data) {
        reject(new Error("No data received from stdin within 5 seconds"))
      }
    }, 5000)
  })
}

function readPlanFromFile(filePath: string): string {
  try {
    const resolvedPath = filePath.startsWith("/")
      ? filePath
      : join(process.cwd(), filePath)

    return readFileSync(resolvedPath, "utf8")
  } catch (error) {
    console.error(`Error reading file: ${filePath}`)
    if (error instanceof Error) {
      console.error(error.message)
    }
    process.exit(1)
  }
}

async function deployWorkflow(request: DeployRequest): Promise<DeployResponse> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const apiToken = process.env.API_TOKEN

  const url = `${appUrl}/api/deploy`
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  }

  if (apiToken) {
    headers["Authorization"] = `Bearer ${apiToken}`
  }

  console.log(`Deploying to: ${url}`)
  console.log(`Workflow name: ${request.workflowName}`)

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(request)
    })

    const result = await response.json() as DeployResponse

    if (!response.ok) {
      console.error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return result

  } catch (error) {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: `Failed to connect to API: ${error instanceof Error ? error.message : "Unknown error"}`,
        details: {
          url,
          suggestion: "Check that the app is running and NEXT_PUBLIC_APP_URL is correct"
        }
      }
    }
  }
}

function formatError(error: any): string {
  if (!error) return "Unknown error"

  let output = `Error: ${error.message || error.code || "Unknown error"}`

  if (error.details?.issues) {
    output += "\n\nValidation issues:"
    error.details.issues.forEach((issue: any, index: number) => {
      output += `\n  ${index + 1}. ${issue.message}`
      if (issue.field) {
        output += ` (field: ${issue.field})`
      }
    })
  }

  if (error.details?.suggestion) {
    output += `\n\nSuggestion: ${error.details.suggestion}`
  }

  return output
}

async function main() {
  const args = parseArgs()

  if (args.help) {
    printUsage()
    process.exit(0)
  }

  if (!args.name) {
    console.error("Error: Workflow name is required (use --name)")
    printUsage()
    process.exit(1)
  }

  try {
    // Read plan data
    let planData: string
    if (args.file) {
      console.log(`Reading plan from file: ${args.file}`)
      planData = readPlanFromFile(args.file)
    } else {
      console.log("Reading plan from stdin...")
      planData = await readPlanFromStdin()
    }

    if (!planData) {
      console.error("Error: No plan data provided")
      process.exit(1)
    }

    // Parse plan JSON
    let plan: unknown
    try {
      plan = JSON.parse(planData)
    } catch (error) {
      console.error("Error: Invalid JSON in plan data")
      if (error instanceof Error) {
        console.error(error.message)
      }
      process.exit(1)
    }

    // Deploy workflow
    const request: DeployRequest = {
      plan,
      workflowName: args.name
    }

    console.log("Deploying workflow...")
    const result = await deployWorkflow(request)

    if (result.ok) {
      console.log("✅ Deployment successful!")
      console.log(`Workflow ID: ${result.workflowId}`)
      console.log(`Workflow Name: ${result.workflowName}`)

      if (result.webhookUrl) {
        console.log(`Webhook URL: ${result.webhookUrl}`)
        console.log("\n💡 Remember to configure HMAC validation for your webhook if using secretHmac: true")
      }

      if (result.isNew) {
        console.log("📝 Created new workflow")
      } else {
        console.log("🔄 Updated existing workflow")
      }

      console.log(`\n${result.message || "Deployment completed"}`)
    } else {
      console.error("❌ Deployment failed!")
      console.error(formatError(result.error))
      process.exit(1)
    }

  } catch (error) {
    console.error("❌ Deployment failed!")
    console.error(error instanceof Error ? error.message : "Unknown error")
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Unexpected error:", error)
    process.exit(1)
  })
}

export { main as deployMain }