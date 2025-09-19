import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs"
import { z } from "zod"
import { validatePlan } from "@/lib/plan/validate"
import type { Plan } from "@/lib/plan/schema"
import { compileToN8N, CompilerError } from "@/lib/compiler/n8n"
import { createN8nClient, N8nError } from "@/lib/n8n/client"
import { getCurrentUsage } from "@/lib/plans"
import { applyRateLimit, isAnyLimitExceeded, getMostRestrictive } from "@/lib/http/limit"
import { withCircuitBreaker, CircuitBreakerError } from "@/lib/http/circuit"
import { assertWorkflowLimit, validateWorkflowPlan } from "@/middleware/planGuard"
import {
  TypedError,
  getErrorStatusCode,
  unauthorized,
  rateLimit,
  validationError,
  compilationError,
  serverError
} from "@/lib/errors"

const requestSchema = z.object({
  plan: z.unknown(),
  workflowName: z.string().min(1).max(100),
})

interface DeployError {
  code: string
  message: string
  details?: any
}

function mapValidationError(issues: any[]): DeployError {
  return {
    code: "PLAN_VALIDATION_FAILED",
    message: "Plan validation failed",
    details: {
      issues,
      suggestion: "Fix the validation issues and try again"
    }
  }
}

function mapCompilerError(error: CompilerError): DeployError {
  return {
    code: error.code,
    message: error.message,
    details: {
      stepType: error.step?.type,
      suggestion: "Check your plan structure and step types"
    }
  }
}

function mapN8nError(error: N8nError): DeployError {
  const baseError = {
    code: "N8N_API_ERROR",
    message: `N8n deployment failed: ${error.message}`,
    details: {
      status: error.status,
      suggestion: "Check your N8n instance configuration and try again"
    }
  }

  // Map specific N8n errors to more helpful codes
  if (error.status === 401) {
    return {
      ...baseError,
      code: "N8N_UNAUTHORIZED",
      message: "N8n API authentication failed",
      details: {
        ...baseError.details,
        suggestion: "Check your N8N_API_KEY configuration"
      }
    }
  }

  if (error.status === 404) {
    return {
      ...baseError,
      code: "N8N_NOT_FOUND",
      message: "N8n API endpoint not found",
      details: {
        ...baseError.details,
        suggestion: "Check your N8N_URL configuration and ensure n8n is running"
      }
    }
  }

  if (error.status >= 500) {
    return {
      ...baseError,
      code: "N8N_SERVER_ERROR",
      message: "N8n server error",
      details: {
        ...baseError.details,
        suggestion: "Check n8n server logs and try again"
      }
    }
  }

  return baseError
}

function mapPlanLimitError(): DeployError {
  return {
    code: "PLAN_LIMIT_EXCEEDED",
    message: "Workflow limit exceeded for your plan",
    details: {
      suggestion: "Upgrade your plan or delete existing workflows to continue"
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { userId, orgId } = auth()

    if (!userId || !orgId) {
      const errorResponse = unauthorized()
      return NextResponse.json(errorResponse, { status: getErrorStatusCode(errorResponse) })
    }

    // Apply rate limiting
    const clientIp = request.headers.get("x-forwarded-for") ||
                    request.headers.get("x-real-ip") ||
                    "127.0.0.1"

    const rateLimitResults = await applyRateLimit("DEPLOY", "/api/deploy", {
      ip: clientIp,
      orgId,
      userId
    })

    if (isAnyLimitExceeded(rateLimitResults)) {
      const mostRestrictive = getMostRestrictive(rateLimitResults)

      console.warn("Deploy rate limited", {
        userId: userId.slice(0, 8) + "...",
        orgId: orgId.slice(0, 8) + "...",
        ip: clientIp,
        limit: mostRestrictive.limit,
        remaining: mostRestrictive.remaining,
        retryAfter: mostRestrictive.retryAfter
      })

      const errorResponse = rateLimit(
        "Rate limit exceeded. Please wait before deploying again.",
        mostRestrictive.retryAfter || 60,
        {
          retryAfterSec: mostRestrictive.retryAfter || 60,
          resetTime: mostRestrictive.resetTime,
          endpoint: "/api/deploy"
        }
      )

      return NextResponse.json(errorResponse, {
        status: getErrorStatusCode(errorResponse),
        headers: {
          "Retry-After": String(mostRestrictive.retryAfter || 60),
          "X-RateLimit-Limit": String(mostRestrictive.limit),
          "X-RateLimit-Remaining": String(mostRestrictive.remaining),
          "X-RateLimit-Reset": String(mostRestrictive.resetTime)
        }
      })
    }

    // Parse and validate request body
    const body = await request.json()
    const validation = requestSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid request format",
            details: {
              issues: validation.error.issues.map(issue => ({
                field: issue.path.join("."),
                message: issue.message,
              }))
            }
          }
        },
        { status: 400 }
      )
    }

    const { plan, workflowName } = validation.data

    console.log("Deployment request", {
      userId: userId.slice(0, 8) + "...",
      orgId: orgId.slice(0, 8) + "...",
      workflowName,
      planType: typeof plan,
    })

    // Step 1: Validate plan
    const planValidation = await validatePlan(plan, { orgId })
    if (!planValidation.valid) {
      console.warn("Plan validation failed during deploy", {
        userId: userId.slice(0, 8) + "...",
        orgId: orgId.slice(0, 8) + "...",
        workflowName,
        issues: planValidation.issues,
      })

      const errorResponse = validationError(
        "Plan validation failed",
        planValidation.issues
      )
      return NextResponse.json(errorResponse, { status: getErrorStatusCode(errorResponse) })
    }

    const validPlan = plan as Plan

    // Step 2: Check workflow and plan limits
    await assertWorkflowLimit(orgId)
    await validateWorkflowPlan(orgId, validPlan)

    // Step 3: Compile plan to n8n workflow
    let compiledWorkflow
    try {
      const compilation = await compileToN8N(validPlan, { orgId })
      compiledWorkflow = compilation.workflow
    } catch (error) {
      console.error("Plan compilation failed during deploy", {
        userId: userId.slice(0, 8) + "...",
        orgId: orgId.slice(0, 8) + "...",
        workflowName,
        error: error instanceof Error ? error.message : "Unknown error",
      })

      if (error instanceof CompilerError) {
        const errorResponse = compilationError(error.message, {
          stepType: error.step?.type,
          suggestion: "Check your plan structure and step types"
        })
        return NextResponse.json(errorResponse, { status: getErrorStatusCode(errorResponse) })
      }

      const errorResponse = compilationError("Failed to compile plan to workflow", {
        error: error instanceof Error ? error.message : "Unknown error",
        suggestion: "Check your plan structure and try again"
      })
      return NextResponse.json(errorResponse, { status: getErrorStatusCode(errorResponse) })
    }

    // Step 4: Deploy to n8n with circuit breaker protection
    let deployResult
    try {
      deployResult = await withCircuitBreaker(
        `n8n-deploy-${orgId}`,
        "N8N_API",
        async () => {
          const n8nClient = createN8nClient()

          // Health check first
          const isHealthy = await n8nClient.healthCheck()
          if (!isHealthy) {
            throw new N8nError(0, "N8n instance is not reachable")
          }

          // Upsert workflow
          const result = await n8nClient.upsertByName(workflowName, compiledWorkflow)

          // Activate workflow
          await n8nClient.activateWorkflow(result.workflowId, true)

          return result
        }
      )

      console.log("Workflow deployed successfully", {
        userId: userId.slice(0, 8) + "...",
        orgId: orgId.slice(0, 8) + "...",
        workflowName,
        workflowId: deployResult.workflowId,
        isNew: deployResult.isNew,
        hasWebhook: !!deployResult.webhookUrl,
      })

    } catch (error) {
      console.error("N8n deployment failed", {
        userId: userId.slice(0, 8) + "...",
        orgId: orgId.slice(0, 8) + "...",
        workflowName,
        error: error instanceof Error ? error.message : "Unknown error",
      })

      if (error instanceof N8nError) {
        return NextResponse.json(
          {
            ok: false,
            error: mapN8nError(error)
          },
          { status: error.status >= 400 && error.status < 500 ? error.status : 500 }
        )
      }

      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "DEPLOYMENT_ERROR",
            message: "Failed to deploy workflow to n8n",
            details: {
              error: error instanceof Error ? error.message : "Unknown error",
              suggestion: "Check n8n configuration and try again"
            }
          }
        },
        { status: 500 }
      )
    }

    // Success response
    return NextResponse.json({
      ok: true,
      workflowId: deployResult.workflowId,
      workflowName,
      webhookUrl: deployResult.webhookUrl,
      isNew: deployResult.isNew,
      message: deployResult.isNew ? "Workflow created and activated" : "Workflow updated and activated"
    })

  } catch (error) {
    // Handle typed errors
    if (error instanceof TypedError) {
      console.warn("Deploy API typed error", {
        code: error.response.code,
        message: error.response.message,
        meta: error.response.meta
      })

      const response = error.response
      const headers: Record<string, string> = {}

      // Add Retry-After header for rate limit errors
      if (response.retryAfterSec) {
        headers["Retry-After"] = String(response.retryAfterSec)
      }

      return NextResponse.json(response, {
        status: getErrorStatusCode(response),
        headers: Object.keys(headers).length > 0 ? headers : undefined
      })
    }

    console.error("Deploy API error", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })

    const errorResponse = serverError("Internal server error. Please try again in a moment.")
    return NextResponse.json(errorResponse, { status: getErrorStatusCode(errorResponse) })
  }
}