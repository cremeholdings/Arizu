import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs"
import { z } from "zod"
import { planFromPrompt, validateEnvironment } from "@/lib/llm"
import { validatePlanWithErrors } from "@/lib/plan/schema"
import { applyRateLimit, isAnyLimitExceeded, getMostRestrictive } from "@/lib/http/limit"
import { withCircuitBreaker, CircuitBreakerError } from "@/lib/http/circuit"

const requestSchema = z.object({
  prompt: z.string().min(10).max(2000),
})

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { userId, orgId } = auth()

    if (!userId || !orgId) {
      return NextResponse.json(
        { ok: false, error: "Authentication required" },
        { status: 401 }
      )
    }

    // Apply rate limiting
    const clientIp = request.headers.get("x-forwarded-for") ||
                    request.headers.get("x-real-ip") ||
                    "127.0.0.1"

    const rateLimitResults = await applyRateLimit("PLAN_GENERATE", "/api/plan", {
      ip: clientIp,
      orgId,
      userId
    })

    if (isAnyLimitExceeded(rateLimitResults)) {
      const mostRestrictive = getMostRestrictive(rateLimitResults)

      console.warn("Plan generation rate limited", {
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
          code: "RATE_LIMIT",
          error: "Rate limit exceeded",
          limit: mostRestrictive.limit,
          remaining: mostRestrictive.remaining,
          resetTime: mostRestrictive.resetTime
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

    // Validate environment setup
    const envCheck = validateEnvironment()
    if (!envCheck.valid) {
      console.error("LLM environment validation failed", {
        missing: envCheck.missing,
      })
      return NextResponse.json(
        { ok: false, error: "Service configuration error" },
        { status: 500 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const validation = requestSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid request",
          issues: validation.error.issues.map(issue => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      )
    }

    const { prompt } = validation.data

    console.log("Plan generation request", {
      userId: userId.slice(0, 8) + "...",
      orgId: orgId.slice(0, 8) + "...",
      promptLength: prompt.length,
    })

    // Generate plan using LLM with circuit breaker protection
    const result = await withCircuitBreaker(
      `llm-plan-${orgId}`,
      "LLM_API",
      () => planFromPrompt({
        prompt,
        orgId,
        maxRetries: 3,
      })
    )

    if (!result.success) {
      console.warn("Plan generation failed", {
        userId: userId.slice(0, 8) + "...",
        orgId: orgId.slice(0, 8) + "...",
        attempts: result.attempts,
        errors: result.errors,
      })

      return NextResponse.json(
        {
          ok: false,
          error: "Failed to generate valid plan",
          issues: result.errors || ["Unknown error occurred"],
          suggestion: "Try rephrasing your request or being more specific about the automation steps you need.",
        },
        { status: 422 }
      )
    }

    // Double-check plan validation (should already be valid from planFromPrompt)
    const finalValidation = validatePlanWithErrors(result.plan!)
    if (!finalValidation.valid) {
      console.error("Final plan validation failed unexpectedly", {
        userId: userId.slice(0, 8) + "...",
        orgId: orgId.slice(0, 8) + "...",
        errors: finalValidation.errors,
      })

      return NextResponse.json(
        {
          ok: false,
          error: "Generated plan failed validation",
          issues: finalValidation.errors,
          suggestion: "Try rephrasing your request with different wording.",
        },
        { status: 422 }
      )
    }

    console.log("Plan generated successfully", {
      userId: userId.slice(0, 8) + "...",
      orgId: orgId.slice(0, 8) + "...",
      planName: result.plan!.name,
      stepCount: result.plan!.steps.length,
      attempts: result.attempts,
    })

    return NextResponse.json({
      ok: true,
      plan: result.plan,
      meta: {
        attempts: result.attempts,
        stepCount: result.plan!.steps.length,
      },
    })

  } catch (error) {
    // Handle circuit breaker errors specifically
    if (error instanceof CircuitBreakerError) {
      console.warn("Plan API circuit breaker triggered", {
        error: error.message,
        state: error.state,
        lastError: error.lastError?.message
      })

      return NextResponse.json(
        {
          ok: false,
          code: "CIRCUIT_OPEN",
          error: "Service temporarily unavailable",
          suggestion: "The LLM service is experiencing issues. Please try again in a few minutes.",
          state: error.state
        },
        {
          status: 503,
          headers: {
            "Retry-After": "30"
          }
        }
      )
    }

    console.error("Plan API error", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })

    return NextResponse.json(
      {
        ok: false,
        error: "Internal server error",
        suggestion: "Please try again in a moment. If the problem persists, contact support.",
      },
      { status: 500 }
    )
  }
}