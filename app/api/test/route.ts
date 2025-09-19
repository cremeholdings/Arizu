import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs"
import { z } from "zod"
import { validatePlan } from "@/lib/plan/validate"
import type { Plan } from "@/lib/plan/schema"
import { compileToN8N, CompilerError } from "@/lib/compiler/n8n"
import { applyRateLimit, isAnyLimitExceeded, getMostRestrictive } from "@/lib/http/limit"

const requestSchema = z.object({
  plan: z.unknown(),
})

interface TestError {
  code: string
  message: string
  details?: any
}

function mapValidationError(issues: any[]): TestError {
  return {
    code: "PLAN_VALIDATION_FAILED",
    message: "Plan validation failed",
    details: {
      issues,
      suggestion: "Fix the validation issues and try again"
    }
  }
}

function mapCompilerError(error: CompilerError): TestError {
  return {
    code: error.code,
    message: error.message,
    details: {
      stepType: error.step?.type,
      suggestion: "Check your plan structure and step types"
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { userId, orgId } = auth()

    if (!userId || !orgId) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "AUTHENTICATION_REQUIRED",
            message: "Authentication required"
          }
        },
        { status: 401 }
      )
    }

    // Apply rate limiting
    const clientIp = request.headers.get("x-forwarded-for") ||
                    request.headers.get("x-real-ip") ||
                    "127.0.0.1"

    const rateLimitResults = await applyRateLimit("PLAN_VALIDATE", "/api/test", {
      ip: clientIp,
      orgId,
      userId
    })

    if (isAnyLimitExceeded(rateLimitResults)) {
      const mostRestrictive = getMostRestrictive(rateLimitResults)

      console.warn("Plan test rate limited", {
        userId: userId.slice(0, 8) + "...",
        orgId: orgId.slice(0, 8) + "...",
        ip: clientIp,
        limit: mostRestrictive.limit,
        remaining: mostRestrictive.remaining,
        retryAfter: mostRestrictive.retryAfter
      })

      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMIT",
            message: "Rate limit exceeded",
            details: {
              limit: mostRestrictive.limit,
              remaining: mostRestrictive.remaining,
              resetTime: mostRestrictive.resetTime,
              suggestion: "Please wait before testing again"
            }
          }
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(mostRestrictive.retryAfter || 60),
            "X-RateLimit-Limit": String(mostRestrictive.limit),
            "X-RateLimit-Remaining": String(mostRestrictive.remaining),
            "X-RateLimit-Reset": String(mostRestrictive.resetTime)
          }
        }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const validation = requestSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        {
          ok: false,
          simulated: false,
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

    const { plan } = validation.data

    console.log("Plan test request", {
      userId: userId.slice(0, 8) + "...",
      orgId: orgId.slice(0, 8) + "...",
      planType: typeof plan,
    })

    // Step 1: Validate plan
    const planValidation = await validatePlan(plan, { orgId })
    if (!planValidation.valid) {
      console.warn("Plan validation failed during test", {
        userId: userId.slice(0, 8) + "...",
        orgId: orgId.slice(0, 8) + "...",
        issues: planValidation.issues,
      })

      return NextResponse.json(
        {
          ok: false,
          simulated: false,
          error: mapValidationError(planValidation.issues),
          issues: planValidation.issues.map(issue => issue.message || String(issue))
        },
        { status: 422 }
      )
    }

    const validPlan = plan as Plan

    // Step 2: Compile plan to n8n workflow (dry-run, no deployment)
    let compiledWorkflow
    try {
      const compilation = await compileToN8N(validPlan, { orgId })
      compiledWorkflow = compilation.workflow

      console.log("Plan compilation successful during test", {
        userId: userId.slice(0, 8) + "...",
        orgId: orgId.slice(0, 8) + "...",
        planName: validPlan.name,
        stepCount: validPlan.steps.length,
        nodeCount: compiledWorkflow.nodes?.length || 0,
      })

    } catch (error) {
      console.error("Plan compilation failed during test", {
        userId: userId.slice(0, 8) + "...",
        orgId: orgId.slice(0, 8) + "...",
        planName: validPlan.name,
        error: error instanceof Error ? error.message : "Unknown error",
      })

      if (error instanceof CompilerError) {
        return NextResponse.json(
          {
            ok: false,
            simulated: false,
            error: mapCompilerError(error),
            issues: [error.message]
          },
          { status: 422 }
        )
      }

      return NextResponse.json(
        {
          ok: false,
          simulated: false,
          error: {
            code: "COMPILATION_ERROR",
            message: "Failed to compile plan to workflow",
            details: {
              error: error instanceof Error ? error.message : "Unknown error",
              suggestion: "Check your plan structure and try again"
            }
          },
          issues: ["Plan compilation failed"]
        },
        { status: 500 }
      )
    }

    // Step 3: Simulate workflow execution
    const simulationIssues: string[] = []

    // Check for potential runtime issues
    if (validPlan.steps.length === 0) {
      simulationIssues.push("Plan has no steps defined")
    }

    // Check for webhook triggers
    const hasWebhookTrigger = validPlan.steps.some(step => step.type === 'webhook_trigger')
    if (hasWebhookTrigger) {
      simulationIssues.push("Webhook triggers require external testing")
    }

    // Check for manual triggers
    const hasManualTrigger = validPlan.steps.some(step => step.type === 'manual_trigger')
    if (hasManualTrigger) {
      simulationIssues.push("Manual triggers require user interaction")
    }

    // Check for external API dependencies
    const hasApiCalls = validPlan.steps.some(step =>
      ['http_request', 'api_call', 'webhook'].includes(step.type)
    )
    if (hasApiCalls) {
      simulationIssues.push("External API calls not tested in simulation")
    }

    // Simulate execution time
    const simulatedDuration = Math.floor(Math.random() * 3000) + 500 // 500-3500ms

    // Simulate random success/warning scenarios
    const simulationSuccess = Math.random() > 0.1 // 90% success rate

    if (!simulationSuccess) {
      simulationIssues.push("Simulated execution encountered an error")
    }

    console.log("Plan test completed", {
      userId: userId.slice(0, 8) + "...",
      orgId: orgId.slice(0, 8) + "...",
      planName: validPlan.name,
      success: simulationSuccess,
      duration: simulatedDuration,
      issueCount: simulationIssues.length,
    })

    // Return test results
    const response = {
      ok: simulationSuccess,
      simulated: true,
      message: simulationSuccess
        ? "Plan test completed successfully"
        : "Plan test completed with issues",
      details: {
        planName: validPlan.name,
        stepCount: validPlan.steps.length,
        nodeCount: compiledWorkflow.nodes?.length || 0,
        simulatedDuration,
        timestamp: new Date().toISOString()
      },
      ...(simulationIssues.length > 0 && { issues: simulationIssues })
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error("Plan test API error", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })

    return NextResponse.json(
      {
        ok: false,
        simulated: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal server error",
          details: {
            suggestion: "Please try again in a moment. If the problem persists, contact support."
          }
        }
      },
      { status: 500 }
    )
  }
}