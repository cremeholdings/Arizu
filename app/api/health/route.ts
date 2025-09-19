import { NextRequest, NextResponse } from "next/server"
import {
  runAllChecks,
  getOverallStatus,
  version,
  type ComponentStatus
} from "@/lib/health/checks"
import { getAppP95, getApiP95 } from "@/lib/health/latency"
import sloConfig from "@/config/slo.json"

export interface HealthResponse {
  ok: boolean
  components: {
    db: ComponentStatus
    redis: ComponentStatus
    n8n: ComponentStatus
  }
  slo: {
    availability_app_pct: number
    availability_n8n_pct: number
    latency_app_p95_ms: number
    latency_api_p95_ms: number
    error_budget_pct: number
  }
  version: string
  p95: {
    app: number
    api: number
  }
  timestamp: string
  responseTime?: number
}

export interface DetailedHealthResponse extends HealthResponse {
  details: {
    db: {
      status: ComponentStatus
      message?: string
      responseTime?: number
    }
    redis: {
      status: ComponentStatus
      message?: string
      responseTime?: number
    }
    n8n: {
      status: ComponentStatus
      message?: string
      responseTime?: number
    }
  }
}

export async function GET(request: NextRequest): Promise<NextResponse<HealthResponse | DetailedHealthResponse>> {
  const startTime = Date.now()

  try {
    console.log("Health check requested", {
      userAgent: request.headers.get("user-agent"),
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"),
    })

    // Check for detailed health information
    const url = new URL(request.url)
    const detailed = url.searchParams.get("detailed") === "true"

    // Run all component health checks
    const checks = await runAllChecks()

    // Get current latency metrics
    const appP95 = getAppP95()
    const apiP95 = getApiP95()

    // Determine overall system health
    const systemStatus = getOverallStatus(checks)
    const isHealthy = systemStatus === "ok"

    const responseTime = Date.now() - startTime

    // Base response structure
    const healthResponse: HealthResponse = {
      ok: isHealthy,
      components: {
        db: checks.db.status,
        redis: checks.redis.status,
        n8n: checks.n8n.status,
      },
      slo: sloConfig,
      version: version(),
      p95: {
        app: appP95,
        api: apiP95,
      },
      timestamp: new Date().toISOString(),
      responseTime,
    }

    // Add detailed information if requested
    if (detailed) {
      const detailedResponse: DetailedHealthResponse = {
        ...healthResponse,
        details: {
          db: {
            status: checks.db.status,
            message: checks.db.message,
            responseTime: checks.db.responseTime,
          },
          redis: {
            status: checks.redis.status,
            message: checks.redis.message,
            responseTime: checks.redis.responseTime,
          },
          n8n: {
            status: checks.n8n.status,
            message: checks.n8n.message,
            responseTime: checks.n8n.responseTime,
          },
        },
      }

      // Log detailed health check results
      console.log("Detailed health check completed", {
        overall: systemStatus,
        components: detailedResponse.details,
        latency: detailedResponse.p95,
        responseTime,
      })

      return NextResponse.json(detailedResponse, {
        status: isHealthy ? 200 : 503,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Content-Type": "application/json",
        },
      })
    }

    // Log basic health check results
    console.log("Health check completed", {
      overall: systemStatus,
      components: healthResponse.components,
      latency: healthResponse.p95,
      responseTime,
    })

    return NextResponse.json(healthResponse, {
      status: isHealthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Content-Type": "application/json",
      },
    })

  } catch (error) {
    const responseTime = Date.now() - startTime

    console.error("Health check failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      responseTime,
    })

    // Return error response with minimal information
    const errorResponse: HealthResponse = {
      ok: false,
      components: {
        db: "down",
        redis: "down",
        n8n: "down",
      },
      slo: sloConfig,
      version: version(),
      p95: {
        app: getAppP95(),
        api: getApiP95(),
      },
      timestamp: new Date().toISOString(),
      responseTime,
    }

    return NextResponse.json(errorResponse, {
      status: 503,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Content-Type": "application/json",
      },
    })
  }
}

// Health check endpoint that returns simple "OK" for load balancers
export async function HEAD(): Promise<NextResponse> {
  try {
    const checks = await runAllChecks()
    const isHealthy = getOverallStatus(checks) === "ok"

    return new NextResponse(null, {
      status: isHealthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    })
  } catch (error) {
    console.error("HEAD health check failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    })

    return new NextResponse(null, {
      status: 503,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    })
  }
}

// OPTIONS for CORS preflight
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  })
}