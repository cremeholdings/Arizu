import { db } from "@/lib/db"
import { getCurrentUsage, incrementRunsUsage } from "@/lib/plans"
import { RunStatus } from "@prisma/client"
import { TypedError, throwPlanLimit, LimitMeta } from "@/lib/errors"

export class RunLimitError extends TypedError {
  constructor(
    public code: string,
    message: string,
    public currentUsage?: number,
    public limit?: number
  ) {
    const meta: LimitMeta = {
      limit: limit || 0,
      used: currentUsage || 0
    }
    super({
      ok: false,
      code: 'PLAN_LIMIT',
      message,
      meta
    })
    this.name = "RunLimitError"
  }
}

interface RunEndData {
  status: "ok" | "error"
  errorMessage?: string
  executionTime?: number
  outputData?: Record<string, any>
}

export async function assertRunAllowance(orgId: string): Promise<void> {
  try {
    const usage = await getCurrentUsage(orgId)

    if (usage.monthlyRunsUsed >= usage.monthlyRunsLimit) {
      console.warn("Run limit exceeded", {
        orgId: orgId.slice(0, 8) + "...",
        used: usage.monthlyRunsUsed,
        limit: usage.monthlyRunsLimit,
      })

      throwPlanLimit(
        `Monthly run limit of ${usage.monthlyRunsLimit} exceeded. Current usage: ${usage.monthlyRunsUsed}`,
        {
          limit: usage.monthlyRunsLimit,
          used: usage.monthlyRunsUsed,
          planType: 'runs'
        }
      )
    }

    console.log("Run allowance check passed", {
      orgId: orgId.slice(0, 8) + "...",
      used: usage.monthlyRunsUsed,
      limit: usage.monthlyRunsLimit,
      remaining: usage.monthlyRunsLimit - usage.monthlyRunsUsed,
    })

  } catch (error) {
    if (error instanceof RunLimitError) {
      throw error
    }

    console.error("Error checking run allowance", {
      orgId: orgId.slice(0, 8) + "...",
      error: error instanceof Error ? error.message : "Unknown error",
    })

    throw new RunLimitError(
      "RUN_ALLOWANCE_CHECK_FAILED",
      "Failed to check run allowance. Please try again.",
    )
  }
}

export async function recordRunStart(
  orgId: string,
  runId: string,
  automationId?: string,
  userId?: string
): Promise<void> {
  try {
    console.log("Recording run start", {
      orgId: orgId.slice(0, 8) + "...",
      runId: runId.slice(0, 8) + "...",
      automationId: automationId?.slice(0, 8) + "...",
      userId: userId?.slice(0, 8) + "...",
    })

    // Check if run already exists (idempotent)
    const existingRun = await db.automationRun.findUnique({
      where: { id: runId },
    })

    if (existingRun) {
      console.log("Run already exists, skipping start recording", {
        runId: runId.slice(0, 8) + "...",
        status: existingRun.status,
      })
      return
    }

    // Create automation run record
    await db.automationRun.create({
      data: {
        id: runId,
        organizationId: orgId,
        automationId: automationId || "unknown",
        userId: userId || "system",
        status: RunStatus.RUNNING,
        startedAt: new Date(),
        inputData: {}, // Will be populated by webhook
      },
    })

    // Increment usage counter
    await incrementRunsUsage(orgId, 1)

    console.log("Run start recorded successfully", {
      orgId: orgId.slice(0, 8) + "...",
      runId: runId.slice(0, 8) + "...",
    })

  } catch (error) {
    console.error("Error recording run start", {
      orgId: orgId.slice(0, 8) + "...",
      runId: runId.slice(0, 8) + "...",
      error: error instanceof Error ? error.message : "Unknown error",
    })

    throw new RunLimitError(
      "RUN_START_RECORDING_FAILED",
      "Failed to record run start. Please try again.",
    )
  }
}

export async function recordRunEnd(
  orgId: string,
  runId: string,
  data: RunEndData
): Promise<void> {
  try {
    console.log("Recording run end", {
      orgId: orgId.slice(0, 8) + "...",
      runId: runId.slice(0, 8) + "...",
      status: data.status,
      hasError: !!data.errorMessage,
      executionTime: data.executionTime,
    })

    // Check if run exists
    const existingRun = await db.automationRun.findUnique({
      where: { id: runId },
    })

    if (!existingRun) {
      console.warn("Run not found for end recording", {
        runId: runId.slice(0, 8) + "...",
        status: data.status,
      })

      // Create a minimal run record if it doesn't exist
      await db.automationRun.create({
        data: {
          id: runId,
          organizationId: orgId,
          automationId: "unknown",
          userId: "system",
          status: data.status === "ok" ? RunStatus.SUCCESS : RunStatus.FAILED,
          startedAt: new Date(),
          completedAt: new Date(),
          errorMessage: data.errorMessage ? redactErrorMessage(data.errorMessage) : null,
          outputData: data.outputData ? redactSensitiveData(data.outputData) : null,
        },
      })
    } else {
      // Update existing run
      await db.automationRun.update({
        where: { id: runId },
        data: {
          status: data.status === "ok" ? RunStatus.SUCCESS : RunStatus.FAILED,
          completedAt: new Date(),
          errorMessage: data.errorMessage ? redactErrorMessage(data.errorMessage) : null,
          outputData: data.outputData ? redactSensitiveData(data.outputData) : null,
        },
      })
    }

    console.log("Run end recorded successfully", {
      orgId: orgId.slice(0, 8) + "...",
      runId: runId.slice(0, 8) + "...",
      finalStatus: data.status,
    })

  } catch (error) {
    console.error("Error recording run end", {
      orgId: orgId.slice(0, 8) + "...",
      runId: runId.slice(0, 8) + "...",
      status: data.status,
      error: error instanceof Error ? error.message : "Unknown error",
    })

    throw new RunLimitError(
      "RUN_END_RECORDING_FAILED",
      "Failed to record run end. Please try again.",
    )
  }
}

function redactErrorMessage(message: string): string {
  // Redact common sensitive patterns from error messages
  return message
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL]")
    .replace(/\b(?:sk|pk)_[a-zA-Z0-9]{32,}\b/g, "[API_KEY]")
    .replace(/\b(?:Bearer\s+)[a-zA-Z0-9_-]+/g, "Bearer [TOKEN]")
    .replace(/\b(?:password|pwd|secret|token|key)\s*[:=]\s*\S+/gi, "$1: [REDACTED]")
    .substring(0, 1000) // Limit length
}

function redactSensitiveData(data: Record<string, any>): Record<string, any> {
  const sensitiveKeys = [
    "password", "pwd", "secret", "token", "key", "auth", "authorization",
    "email", "phone", "ssn", "credit_card", "creditcard", "cc_number",
    "api_key", "apikey", "access_token", "refresh_token", "bearer",
    "x-api-key", "x-auth-token"
  ]

  function redactObject(obj: any, depth = 0): any {
    if (depth > 5) return "[MAX_DEPTH_EXCEEDED]"

    if (typeof obj !== "object" || obj === null) {
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.slice(0, 10).map(item => redactObject(item, depth + 1))
    }

    const result: Record<string, any> = {}
    let keyCount = 0

    for (const [key, value] of Object.entries(obj)) {
      if (keyCount >= 20) {
        result["..."] = "[TRUNCATED]"
        break
      }

      const lowerKey = key.toLowerCase()

      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        result[key] = "[REDACTED]"
      } else if (typeof value === "string" && value.length > 500) {
        result[key] = value.substring(0, 500) + "... [TRUNCATED]"
      } else {
        result[key] = redactObject(value, depth + 1)
      }

      keyCount++
    }

    return result
  }

  return redactObject(data)
}

// Helper function to get run statistics
export async function getRunStatistics(orgId: string, days = 30): Promise<{
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  averageExecutionTime: number
  mostActiveAutomations: Array<{ id: string; name: string; runCount: number }>
}> {
  try {
    const since = new Date()
    since.setDate(since.getDate() - days)

    const runs = await db.automationRun.findMany({
      where: {
        organizationId: orgId,
        startedAt: {
          gte: since,
        },
      },
      include: {
        automation: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    const totalRuns = runs.length
    const successfulRuns = runs.filter(run => run.status === RunStatus.SUCCESS).length
    const failedRuns = runs.filter(run => run.status === RunStatus.FAILED).length

    // Calculate average execution time
    const completedRuns = runs.filter(run => run.startedAt && run.completedAt)
    const totalExecutionTime = completedRuns.reduce((total, run) => {
      const executionTime = run.completedAt!.getTime() - run.startedAt.getTime()
      return total + executionTime
    }, 0)
    const averageExecutionTime = completedRuns.length > 0
      ? Math.round(totalExecutionTime / completedRuns.length)
      : 0

    // Get most active automations
    const automationCounts = new Map<string, { name: string; count: number }>()
    runs.forEach(run => {
      const id = run.automationId
      const name = run.automation?.name || "Unknown"
      const current = automationCounts.get(id) || { name, count: 0 }
      automationCounts.set(id, { name, count: current.count + 1 })
    })

    const mostActiveAutomations = Array.from(automationCounts.entries())
      .map(([id, data]) => ({ id, name: data.name, runCount: data.count }))
      .sort((a, b) => b.runCount - a.runCount)
      .slice(0, 5)

    return {
      totalRuns,
      successfulRuns,
      failedRuns,
      averageExecutionTime,
      mostActiveAutomations,
    }

  } catch (error) {
    console.error("Error getting run statistics", {
      orgId: orgId.slice(0, 8) + "...",
      error: error instanceof Error ? error.message : "Unknown error",
    })

    return {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      averageExecutionTime: 0,
      mostActiveAutomations: [],
    }
  }
}