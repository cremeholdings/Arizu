import { db } from "@/lib/db"
import { N8nClient } from "@/lib/n8n/client"

export type ComponentStatus = "ok" | "down"

export interface HealthCheckResult {
  status: ComponentStatus
  message?: string
  responseTime?: number
}

export async function dbCheck(): Promise<HealthCheckResult> {
  const startTime = Date.now()

  try {
    // Simple query to test database connectivity
    await db.$queryRaw`SELECT 1 as health_check`

    const responseTime = Date.now() - startTime

    return {
      status: "ok",
      responseTime,
    }
  } catch (error) {
    const responseTime = Date.now() - startTime

    console.error("Database health check failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      responseTime,
    })

    return {
      status: "down",
      message: "Database connection failed",
      responseTime,
    }
  }
}

export async function redisCheck(): Promise<HealthCheckResult> {
  const startTime = Date.now()

  try {
    // Import Redis dynamically to avoid loading if not configured
    const { createClient } = await import("redis")

    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379"
    const client = createClient({ url: redisUrl })

    await client.connect()

    // Test Redis with a simple ping
    const result = await client.ping()

    await client.disconnect()

    const responseTime = Date.now() - startTime

    if (result === "PONG") {
      return {
        status: "ok",
        responseTime,
      }
    } else {
      return {
        status: "down",
        message: "Redis ping failed",
        responseTime,
      }
    }
  } catch (error) {
    const responseTime = Date.now() - startTime

    console.error("Redis health check failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      responseTime,
    })

    return {
      status: "down",
      message: "Redis connection failed",
      responseTime,
    }
  }
}

export async function n8nCheck(client?: N8nClient): Promise<HealthCheckResult> {
  const startTime = Date.now()

  try {
    // Use provided client or create a new one
    const n8nClient = client || new N8nClient({
      baseURL: process.env.N8N_API_URL || "http://localhost:5678",
      apiKey: process.env.N8N_API_KEY || "",
    })

    // Test n8n connectivity with a simple API call
    const response = await n8nClient.listWorkflows()

    const responseTime = Date.now() - startTime

    // If we get a response (even if empty), n8n is healthy
    return {
      status: "ok",
      responseTime,
    }
  } catch (error) {
    const responseTime = Date.now() - startTime

    console.error("n8n health check failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      responseTime,
    })

    return {
      status: "down",
      message: "n8n API connection failed",
      responseTime,
    }
  }
}

export function version(): string {
  // Get version from package.json or environment
  try {
    // In production, version might be set via environment variable
    if (process.env.APP_VERSION) {
      return process.env.APP_VERSION
    }

    // In development, try to read from package.json
    if (process.env.NODE_ENV === "development") {
      try {
        const packageJson = require("../../package.json")
        return packageJson.version || "0.1.0"
      } catch {
        // Fallback if package.json is not accessible
        return "0.1.0"
      }
    }

    // Default version for production if not set
    return "1.0.0"
  } catch (error) {
    console.warn("Failed to determine application version", {
      error: error instanceof Error ? error.message : "Unknown error",
    })

    return "unknown"
  }
}

export interface ComponentChecks {
  db: HealthCheckResult
  redis: HealthCheckResult
  n8n: HealthCheckResult
}

export async function runAllChecks(n8nClient?: N8nClient): Promise<ComponentChecks> {
  // Run all health checks in parallel for faster response
  const [dbResult, redisResult, n8nResult] = await Promise.allSettled([
    dbCheck(),
    redisCheck(),
    n8nCheck(n8nClient),
  ])

  return {
    db: dbResult.status === "fulfilled" ? dbResult.value : {
      status: "down",
      message: "Health check failed to execute",
    },
    redis: redisResult.status === "fulfilled" ? redisResult.value : {
      status: "down",
      message: "Health check failed to execute",
    },
    n8n: n8nResult.status === "fulfilled" ? n8nResult.value : {
      status: "down",
      message: "Health check failed to execute",
    },
  }
}

export function isSystemHealthy(checks: ComponentChecks): boolean {
  // System is healthy if all critical components are up
  // Redis is considered non-critical for basic functionality
  return checks.db.status === "ok" && checks.n8n.status === "ok"
}

export function getOverallStatus(checks: ComponentChecks): ComponentStatus {
  return isSystemHealthy(checks) ? "ok" : "down"
}