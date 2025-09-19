import { db } from "@/lib/db"

export interface LogEntry {
  step: string
  input?: Record<string, any>
  output?: Record<string, any>
  error?: string
  timestamp?: Date
}

interface RunLog {
  id: string
  runId: string
  step: string
  inputData: Record<string, any> | null
  outputData: Record<string, any> | null
  errorMessage: string | null
  timestamp: Date
  createdAt: Date
}

const MAX_PAYLOAD_SIZE = 10 * 1024 // 10KB
const MAX_STRING_LENGTH = 1000
const MAX_OBJECT_DEPTH = 5
const MAX_ARRAY_LENGTH = 50

export async function appendLog(runId: string, entry: LogEntry): Promise<void> {
  try {
    console.log("Appending log entry", {
      runId: runId.slice(0, 8) + "...",
      step: entry.step,
      hasInput: !!entry.input,
      hasOutput: !!entry.output,
      hasError: !!entry.error,
    })

    // Validate and redact input data
    const inputData = entry.input ? redactAndLimitData(entry.input) : null
    const outputData = entry.output ? redactAndLimitData(entry.output) : null
    const errorMessage = entry.error ? redactErrorMessage(entry.error) : null

    // Create log entry
    await db.$executeRaw`
      INSERT INTO run_logs (id, run_id, step, input_data, output_data, error_message, timestamp)
      VALUES (
        ${generateLogId()},
        ${runId},
        ${entry.step},
        ${inputData ? JSON.stringify(inputData) : null}::jsonb,
        ${outputData ? JSON.stringify(outputData) : null}::jsonb,
        ${errorMessage},
        ${entry.timestamp || new Date()}
      )
      ON CONFLICT (run_id, step, timestamp) DO NOTHING
    `

    console.log("Log entry appended successfully", {
      runId: runId.slice(0, 8) + "...",
      step: entry.step,
    })

  } catch (error) {
    console.error("Error appending log entry", {
      runId: runId.slice(0, 8) + "...",
      step: entry.step,
      error: error instanceof Error ? error.message : "Unknown error",
    })

    // Don't throw - logging failures shouldn't break the run
  }
}

export async function getRunLogs(runId: string): Promise<LogEntry[]> {
  try {
    const logs = await db.$queryRaw<RunLog[]>`
      SELECT id, run_id, step, input_data, output_data, error_message, timestamp, created_at
      FROM run_logs
      WHERE run_id = ${runId}
      ORDER BY timestamp ASC, created_at ASC
    `

    return logs.map(log => ({
      step: log.step,
      input: log.inputData || undefined,
      output: log.outputData || undefined,
      error: log.errorMessage || undefined,
      timestamp: log.timestamp,
    }))

  } catch (error) {
    console.error("Error fetching run logs", {
      runId: runId.slice(0, 8) + "...",
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return []
  }
}

export async function getRecentLogs(orgId: string, limit = 100): Promise<Array<{
  runId: string
  step: string
  timestamp: Date
  hasError: boolean
}>> {
  try {
    const logs = await db.$queryRaw<Array<{
      run_id: string
      step: string
      timestamp: Date
      error_message: string | null
    }>>`
      SELECT DISTINCT ON (rl.run_id, rl.step)
        rl.run_id,
        rl.step,
        rl.timestamp,
        rl.error_message
      FROM run_logs rl
      INNER JOIN automation_runs ar ON ar.id = rl.run_id
      WHERE ar.organization_id = ${orgId}
      ORDER BY rl.run_id, rl.step, rl.timestamp DESC
      LIMIT ${limit}
    `

    return logs.map(log => ({
      runId: log.run_id,
      step: log.step,
      timestamp: log.timestamp,
      hasError: !!log.error_message,
    }))

  } catch (error) {
    console.error("Error fetching recent logs", {
      orgId: orgId.slice(0, 8) + "...",
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return []
  }
}

export async function clearOldLogs(olderThanDays = 90): Promise<number> {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

    const result = await db.$executeRaw`
      DELETE FROM run_logs
      WHERE created_at < ${cutoffDate}
    `

    console.log("Cleared old logs", {
      deletedCount: result,
      olderThanDays,
      cutoffDate,
    })

    return typeof result === "number" ? result : 0

  } catch (error) {
    console.error("Error clearing old logs", {
      olderThanDays,
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return 0
  }
}

function generateLogId(): string {
  // Generate a unique ID for the log entry
  return `log_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
}

function redactErrorMessage(message: string): string {
  // Redact common sensitive patterns from error messages
  return message
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL]")
    .replace(/\b(?:sk|pk)_[a-zA-Z0-9]{32,}\b/g, "[API_KEY]")
    .replace(/\b(?:Bearer\s+)[a-zA-Z0-9_-]+/g, "Bearer [TOKEN]")
    .replace(/\b(?:password|pwd|secret|token|key)\s*[:=]\s*\S+/gi, "$1: [REDACTED]")
    .substring(0, MAX_STRING_LENGTH)
}

function redactAndLimitData(data: Record<string, any>): Record<string, any> {
  const sensitiveKeys = [
    "password", "pwd", "secret", "token", "key", "auth", "authorization",
    "email", "phone", "ssn", "credit_card", "creditcard", "cc_number",
    "api_key", "apikey", "access_token", "refresh_token", "bearer",
    "x-api-key", "x-auth-token", "x-hub-signature", "x-signature"
  ]

  function processValue(value: any, depth = 0): any {
    // Prevent infinite recursion
    if (depth > MAX_OBJECT_DEPTH) {
      return "[MAX_DEPTH_EXCEEDED]"
    }

    // Handle null/undefined
    if (value === null || value === undefined) {
      return value
    }

    // Handle primitives
    if (typeof value === "string") {
      return value.length > MAX_STRING_LENGTH
        ? value.substring(0, MAX_STRING_LENGTH) + "... [TRUNCATED]"
        : value
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return value
    }

    // Handle arrays
    if (Array.isArray(value)) {
      const limitedArray = value.slice(0, MAX_ARRAY_LENGTH)
      const processedArray = limitedArray.map(item => processValue(item, depth + 1))

      if (value.length > MAX_ARRAY_LENGTH) {
        processedArray.push(`... [${value.length - MAX_ARRAY_LENGTH} more items truncated]`)
      }

      return processedArray
    }

    // Handle objects
    if (typeof value === "object") {
      const result: Record<string, any> = {}
      let keyCount = 0

      for (const [key, val] of Object.entries(value)) {
        if (keyCount >= 20) {
          result["..."] = "[TOO_MANY_KEYS_TRUNCATED]"
          break
        }

        const lowerKey = key.toLowerCase()

        // Check if key is sensitive
        if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
          result[key] = "[REDACTED]"
        } else {
          result[key] = processValue(val, depth + 1)
        }

        keyCount++
      }

      return result
    }

    // Fallback for other types
    return String(value).substring(0, MAX_STRING_LENGTH)
  }

  const processed = processValue(data)

  // Check total size and truncate if necessary
  const serialized = JSON.stringify(processed)
  if (serialized.length > MAX_PAYLOAD_SIZE) {
    return {
      ...processed,
      _truncated: true,
      _originalSize: serialized.length,
      _note: "Data truncated due to size limits"
    }
  }

  return processed
}

// Helper function to get log statistics
export async function getLogStatistics(orgId: string, runId?: string): Promise<{
  totalLogs: number
  errorLogs: number
  uniqueSteps: number
  avgLogsPerRun: number
}> {
  try {
    const whereClause = runId
      ? `WHERE ar.organization_id = ${orgId} AND rl.run_id = ${runId}`
      : `WHERE ar.organization_id = ${orgId}`

    const stats = await db.$queryRaw<Array<{
      total_logs: bigint
      error_logs: bigint
      unique_steps: bigint
      unique_runs: bigint
    }>>`
      SELECT
        COUNT(*) as total_logs,
        COUNT(CASE WHEN rl.error_message IS NOT NULL THEN 1 END) as error_logs,
        COUNT(DISTINCT rl.step) as unique_steps,
        COUNT(DISTINCT rl.run_id) as unique_runs
      FROM run_logs rl
      INNER JOIN automation_runs ar ON ar.id = rl.run_id
      ${whereClause}
    `

    const stat = stats[0]
    const totalLogs = Number(stat.total_logs)
    const errorLogs = Number(stat.error_logs)
    const uniqueSteps = Number(stat.unique_steps)
    const uniqueRuns = Number(stat.unique_runs)

    return {
      totalLogs,
      errorLogs,
      uniqueSteps,
      avgLogsPerRun: uniqueRuns > 0 ? Math.round(totalLogs / uniqueRuns) : 0,
    }

  } catch (error) {
    console.error("Error getting log statistics", {
      orgId: orgId.slice(0, 8) + "...",
      runId: runId?.slice(0, 8) + "...",
      error: error instanceof Error ? error.message : "Unknown error",
    })

    return {
      totalLogs: 0,
      errorLogs: 0,
      uniqueSteps: 0,
      avgLogsPerRun: 0,
    }
  }
}