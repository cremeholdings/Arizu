import {
  getPlanForOrg,
  getLimitsForOrg,
  hasFeature,
  getCurrentUsage,
  getPlanUpgradeMessage,
  PlanKey,
} from "@/lib/plans"

export interface PlanError {
  ok: false
  code: "PLAN_LIMIT" | "FEATURE_LOCKED"
  message: string
  details?: {
    currentPlan: PlanKey
    feature?: string
    used?: number
    limit?: number
    upgradeRequired?: PlanKey
  }
}

export class PlanLimitError extends Error {
  public readonly code: "PLAN_LIMIT" | "FEATURE_LOCKED"
  public readonly details: PlanError["details"]

  constructor(
    message: string,
    code: "PLAN_LIMIT" | "FEATURE_LOCKED",
    details?: PlanError["details"]
  ) {
    super(message)
    this.name = "PlanLimitError"
    this.code = code
    this.details = details
  }

  toResponse(): PlanError {
    return {
      ok: false,
      code: this.code,
      message: this.message,
      details: this.details,
    }
  }
}

export async function assertCanCreateWorkflow(orgId: string): Promise<void> {
  try {
    const [plan, usage] = await Promise.all([
      getPlanForOrg(orgId),
      getCurrentUsage(orgId),
    ])

    if (usage.workflowsCount >= usage.workflowsLimit) {
      const message = getPlanUpgradeMessage(plan, "workflows")

      throw new PlanLimitError(message, "PLAN_LIMIT", {
        currentPlan: plan,
        used: usage.workflowsCount,
        limit: usage.workflowsLimit,
        feature: "workflows",
      })
    }
  } catch (error) {
    if (error instanceof PlanLimitError) {
      throw error
    }

    console.error("Error checking workflow creation limit:", {
      orgId: orgId.slice(0, 8) + "...", // Redact org ID
      error: error instanceof Error ? error.message : "Unknown error",
    })

    // On error, be conservative and deny access
    throw new PlanLimitError(
      "Unable to verify workflow limits. Please try again.",
      "PLAN_LIMIT",
      {
        currentPlan: "FREE",
        feature: "workflows",
      }
    )
  }
}

export async function assertCanRun(orgId: string): Promise<void> {
  try {
    const [plan, usage] = await Promise.all([
      getPlanForOrg(orgId),
      getCurrentUsage(orgId),
    ])

    if (usage.monthlyRunsUsed >= usage.monthlyRunsLimit) {
      const message = getPlanUpgradeMessage(plan, "automation runs")

      throw new PlanLimitError(message, "PLAN_LIMIT", {
        currentPlan: plan,
        used: usage.monthlyRunsUsed,
        limit: usage.monthlyRunsLimit,
        feature: "automation_runs",
      })
    }
  } catch (error) {
    if (error instanceof PlanLimitError) {
      throw error
    }

    console.error("Error checking run limit:", {
      orgId: orgId.slice(0, 8) + "...", // Redact org ID
      error: error instanceof Error ? error.message : "Unknown error",
    })

    // On error, be conservative and deny access
    throw new PlanLimitError(
      "Unable to verify run limits. Please try again.",
      "PLAN_LIMIT",
      {
        currentPlan: "FREE",
        feature: "automation_runs",
      }
    )
  }
}

export async function assertFeature(orgId: string, featureKey: string): Promise<void> {
  try {
    const [hasAccess, plan] = await Promise.all([
      hasFeature(orgId, featureKey),
      getPlanForOrg(orgId),
    ])

    if (!hasAccess) {
      const message = getPlanUpgradeMessage(plan, featureKey.replace("_", " "))

      throw new PlanLimitError(message, "FEATURE_LOCKED", {
        currentPlan: plan,
        feature: featureKey,
      })
    }
  } catch (error) {
    if (error instanceof PlanLimitError) {
      throw error
    }

    console.error("Error checking feature access:", {
      orgId: orgId.slice(0, 8) + "...", // Redacted org ID
      featureKey,
      error: error instanceof Error ? error.message : "Unknown error",
    })

    // On error, be conservative and deny access
    throw new PlanLimitError(
      `Feature "${featureKey}" is not available. Please upgrade your plan.`,
      "FEATURE_LOCKED",
      {
        currentPlan: "FREE",
        feature: featureKey,
      }
    )
  }
}

export async function assertCanUseCodeSteps(orgId: string): Promise<void> {
  await assertFeature(orgId, "code_steps")
}

export async function assertCanUseWebhooks(orgId: string): Promise<void> {
  await assertFeature(orgId, "webhooks")
}

export async function assertCanUseAdvancedTriggers(orgId: string): Promise<void> {
  await assertFeature(orgId, "advanced_triggers")
}

export async function assertCanUseSlackIntegration(orgId: string): Promise<void> {
  await assertFeature(orgId, "slack_integration")
}

export async function assertCanUseCustomIntegrations(orgId: string): Promise<void> {
  await assertFeature(orgId, "custom_integrations")
}

export async function assertCanUseSSO(orgId: string): Promise<void> {
  await assertFeature(orgId, "sso")
}

export async function assertCanViewAuditLogs(orgId: string): Promise<void> {
  await assertFeature(orgId, "audit_logs")
}

export async function assertCanUseAnalytics(orgId: string, level: "basic" | "advanced" | "enterprise" = "basic"): Promise<void> {
  const featureKey = `analytics_${level}`
  await assertFeature(orgId, featureKey)
}

// Workflow validation helpers
export async function assertWorkflowComplexity(
  orgId: string,
  actionsCount: number
): Promise<void> {
  try {
    const limits = await getLimitsForOrg(orgId)

    if (actionsCount > limits.actionsAllowed) {
      const plan = await getPlanForOrg(orgId)
      const message = getPlanUpgradeMessage(plan, "workflow actions")

      throw new PlanLimitError(message, "PLAN_LIMIT", {
        currentPlan: plan,
        used: actionsCount,
        limit: limits.actionsAllowed,
        feature: "workflow_actions",
      })
    }
  } catch (error) {
    if (error instanceof PlanLimitError) {
      throw error
    }

    console.error("Error checking workflow complexity:", {
      orgId: orgId.slice(0, 8) + "...", // Redact org ID
      actionsCount,
      error: error instanceof Error ? error.message : "Unknown error",
    })

    throw new PlanLimitError(
      "Unable to verify workflow complexity limits. Please try again.",
      "PLAN_LIMIT",
      {
        currentPlan: "FREE",
        feature: "workflow_actions",
      }
    )
  }
}

// Helper to check multiple conditions at once
export async function assertCanCreateComplexWorkflow(
  orgId: string,
  actionsCount: number,
  hasCodeSteps: boolean = false,
  usesWebhooks: boolean = false,
  usesAdvancedTriggers: boolean = false
): Promise<void> {
  // Check if org can create another workflow
  await assertCanCreateWorkflow(orgId)

  // Check workflow complexity
  await assertWorkflowComplexity(orgId, actionsCount)

  // Check feature requirements
  if (hasCodeSteps) {
    await assertCanUseCodeSteps(orgId)
  }

  if (usesWebhooks) {
    await assertCanUseWebhooks(orgId)
  }

  if (usesAdvancedTriggers) {
    await assertCanUseAdvancedTriggers(orgId)
  }
}

// Utility to check if error is a plan error
export function isPlanError(error: unknown): error is PlanLimitError {
  return error instanceof PlanLimitError
}

// Utility to get plan error response
export function getPlanErrorResponse(error: unknown): PlanError | null {
  if (isPlanError(error)) {
    return error.toResponse()
  }
  return null
}