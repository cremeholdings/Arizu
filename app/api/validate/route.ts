import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs"
import { z } from "zod"
import { validatePlan, getValidationSummary, categorizeIssues } from "@/lib/plan/validate"

const requestSchema = z.object({
  plan: z.unknown(),
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

    const { plan } = validation.data

    console.log("Plan validation request", {
      userId: userId.slice(0, 8) + "...",
      orgId: orgId.slice(0, 8) + "...",
      planType: typeof plan,
      hasSteps: plan && typeof plan === 'object' && 'steps' in plan,
    })

    // Validate the plan
    const result = await validatePlan(plan, { orgId })

    // Log validation result
    console.log("Plan validation completed", {
      userId: userId.slice(0, 8) + "...",
      orgId: orgId.slice(0, 8) + "...",
      valid: result.valid,
      issueCount: result.issues.length,
      issueCodes: result.issues.map(i => i.code),
    })

    if (result.valid) {
      return NextResponse.json({
        ok: true,
        message: "Plan is valid and ready to use.",
        summary: getValidationSummary(result),
      })
    }

    // Categorize issues for better presentation
    const categorized = categorizeIssues(result.issues)

    return NextResponse.json(
      {
        ok: false,
        error: "Plan validation failed",
        summary: getValidationSummary(result),
        issues: result.issues,
        categorized: {
          critical: categorized.critical,
          warning: categorized.warning,
          info: categorized.info,
        },
        suggestions: [
          "Review the issues listed above and fix them one by one.",
          "Critical issues must be resolved before the plan can be deployed.",
          "Start with the first issue and work your way down the list.",
        ],
      },
      { status: 422 }
    )

  } catch (error) {
    console.error("Plan validation API error", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })

    return NextResponse.json(
      {
        ok: false,
        error: "Internal server error",
        message: "An error occurred while validating the plan. Please try again.",
      },
      { status: 500 }
    )
  }
}