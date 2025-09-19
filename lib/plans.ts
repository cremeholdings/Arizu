import { db } from "@/lib/db"
import { PlanType } from "@prisma/client"

export type PlanKey = "FREE" | "PRO" | "TEAM" | "ENTERPRISE"

export interface PlanFeatures {
  features: string[]
}

export interface PlanLimits {
  monthlyRuns: number
  workflows: number
  actionsAllowed: number
  codeSteps: boolean
}

export const PLAN_FEATURES: Record<PlanKey, PlanFeatures> = {
  FREE: {
    features: [
      "basic_automations",
      "email_notifications",
      "community_support",
    ],
  },
  PRO: {
    features: [
      "basic_automations",
      "advanced_triggers",
      "webhooks",
      "email_notifications",
      "slack_integration",
      "priority_support",
      "analytics_basic",
    ],
  },
  TEAM: {
    features: [
      "basic_automations",
      "advanced_triggers",
      "webhooks",
      "email_notifications",
      "slack_integration",
      "team_collaboration",
      "user_management",
      "priority_support",
      "analytics_advanced",
      "custom_branding",
    ],
  },
  ENTERPRISE: {
    features: [
      "basic_automations",
      "advanced_triggers",
      "webhooks",
      "email_notifications",
      "slack_integration",
      "team_collaboration",
      "user_management",
      "code_steps",
      "custom_integrations",
      "sso",
      "audit_logs",
      "dedicated_support",
      "analytics_enterprise",
      "custom_branding",
      "sla_guarantee",
    ],
  },
}

export const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
  FREE: {
    monthlyRuns: 100,
    workflows: 3,
    actionsAllowed: 5,
    codeSteps: false,
  },
  PRO: {
    monthlyRuns: 10000,
    workflows: 50,
    actionsAllowed: 20,
    codeSteps: false,
  },
  TEAM: {
    monthlyRuns: 50000,
    workflows: 200,
    actionsAllowed: 50,
    codeSteps: true,
  },
  ENTERPRISE: {
    monthlyRuns: 500000,
    workflows: 1000,
    actionsAllowed: 100,
    codeSteps: true,
  },
}

export interface PlanInfo {
  key: PlanKey
  name: string
  description: string
  price: {
    monthly: number
    yearly: number
  }
  features: string[]
  limits: PlanLimits
  popular?: boolean
}

export const PLAN_INFO: Record<PlanKey, PlanInfo> = {
  FREE: {
    key: "FREE",
    name: "Free",
    description: "Perfect for getting started with automation",
    price: {
      monthly: 0,
      yearly: 0,
    },
    features: PLAN_FEATURES.FREE.features,
    limits: PLAN_LIMITS.FREE,
  },
  PRO: {
    key: "PRO",
    name: "Pro",
    description: "For individuals and small teams",
    price: {
      monthly: 29,
      yearly: 290,
    },
    features: PLAN_FEATURES.PRO.features,
    limits: PLAN_LIMITS.PRO,
    popular: true,
  },
  TEAM: {
    key: "TEAM",
    name: "Team",
    description: "For growing teams and businesses",
    price: {
      monthly: 99,
      yearly: 990,
    },
    features: PLAN_FEATURES.TEAM.features,
    limits: PLAN_LIMITS.TEAM,
  },
  ENTERPRISE: {
    key: "ENTERPRISE",
    name: "Enterprise",
    description: "For large organizations with advanced needs",
    price: {
      monthly: 299,
      yearly: 2990,
    },
    features: PLAN_FEATURES.ENTERPRISE.features,
    limits: PLAN_LIMITS.ENTERPRISE,
  },
}

// Map Prisma enum to our PlanKey type
function mapPrismaToPlankKey(planType: PlanType): PlanKey {
  switch (planType) {
    case "FREE":
      return "FREE"
    case "PRO":
      return "PRO"
    case "STARTER":
      return "PRO" // Map STARTER to PRO for compatibility
    case "ENTERPRISE":
      return "ENTERPRISE"
    default:
      return "FREE"
  }
}

export async function getPlanForOrg(orgId: string): Promise<PlanKey> {
  try {
    const organization = await db.organization.findUnique({
      where: { clerkId: orgId },
      select: { planType: true },
    })

    if (!organization) {
      throw new Error(`Organization not found: ${orgId}`)
    }

    return mapPrismaToPlankKey(organization.planType)
  } catch (error) {
    console.error("Error getting plan for organization:", {
      orgId: orgId.slice(0, 8) + "...", // Redact org ID
      error: error instanceof Error ? error.message : "Unknown error",
    })
    // Default to FREE plan on error
    return "FREE"
  }
}

export async function getLimitsForOrg(orgId: string): Promise<PlanLimits> {
  const plan = await getPlanForOrg(orgId)
  return PLAN_LIMITS[plan]
}

export async function hasFeature(orgId: string, featureKey: string): Promise<boolean> {
  try {
    const plan = await getPlanForOrg(orgId)
    const features = PLAN_FEATURES[plan].features
    return features.includes(featureKey)
  } catch (error) {
    console.error("Error checking feature for organization:", {
      orgId: orgId.slice(0, 8) + "...", // Redact org ID
      featureKey,
      error: error instanceof Error ? error.message : "Unknown error",
    })
    // Default to false on error (deny access)
    return false
  }
}

export function getCurrentPeriodKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export async function getCurrentUsage(orgId: string): Promise<{
  monthlyRunsUsed: number
  monthlyRunsLimit: number
  workflowsCount: number
  workflowsLimit: number
  actionsLimit: number
  hasCodeSteps: boolean
}> {
  try {
    const [plan, counter, workflowCount] = await Promise.all([
      getPlanForOrg(orgId),
      getUsageCounter(orgId),
      getWorkflowCount(orgId),
    ])

    const limits = PLAN_LIMITS[plan]

    return {
      monthlyRunsUsed: counter.monthlyRunsUsed,
      monthlyRunsLimit: limits.monthlyRuns,
      workflowsCount: workflowCount,
      workflowsLimit: limits.workflows,
      actionsLimit: limits.actionsAllowed,
      hasCodeSteps: limits.codeSteps,
    }
  } catch (error) {
    console.error("Error getting current usage:", {
      orgId: orgId.slice(0, 8) + "...", // Redact org ID
      error: error instanceof Error ? error.message : "Unknown error",
    })

    // Return safe defaults on error
    return {
      monthlyRunsUsed: 0,
      monthlyRunsLimit: 0,
      workflowsCount: 0,
      workflowsLimit: 0,
      actionsLimit: 0,
      hasCodeSteps: false,
    }
  }
}

export async function getUsageCounter(orgId: string) {
  const periodKey = getCurrentPeriodKey()

  // Get or create usage counter for current period
  const counter = await db.usageCounter.upsert({
    where: {
      organizationId_periodKey: {
        organizationId: orgId,
        periodKey,
      },
    },
    update: {},
    create: {
      organizationId: orgId,
      periodKey,
      monthlyRunsUsed: 0,
      monthlyRunsLimit: 0, // Will be set by plan limits
      workflowsCount: 0,
    },
  })

  return counter
}

export async function getWorkflowCount(orgId: string): Promise<number> {
  const count = await db.automation.count({
    where: {
      organizationId: orgId,
      isActive: true,
    },
  })

  return count
}

export async function incrementRunsUsage(orgId: string, amount: number = 1): Promise<void> {
  const periodKey = getCurrentPeriodKey()

  await db.usageCounter.upsert({
    where: {
      organizationId_periodKey: {
        organizationId: orgId,
        periodKey,
      },
    },
    update: {
      monthlyRunsUsed: {
        increment: amount,
      },
    },
    create: {
      organizationId: orgId,
      periodKey,
      monthlyRunsUsed: amount,
      monthlyRunsLimit: 0,
      workflowsCount: 0,
    },
  })
}

export async function updateWorkflowCount(orgId: string): Promise<void> {
  const periodKey = getCurrentPeriodKey()
  const workflowCount = await getWorkflowCount(orgId)

  await db.usageCounter.upsert({
    where: {
      organizationId_periodKey: {
        organizationId: orgId,
        periodKey,
      },
    },
    update: {
      workflowsCount: workflowCount,
    },
    create: {
      organizationId: orgId,
      periodKey,
      monthlyRunsUsed: 0,
      monthlyRunsLimit: 0,
      workflowsCount: workflowCount,
    },
  })
}

export function getUsagePercentage(used: number, limit: number): number {
  if (limit === 0) return 0
  return Math.min(Math.round((used / limit) * 100), 100)
}

export function isUsageNearLimit(used: number, limit: number, threshold: number = 80): boolean {
  return getUsagePercentage(used, limit) >= threshold
}

export function getNextPlan(currentPlan: PlanKey): PlanKey | null {
  const planOrder: PlanKey[] = ["FREE", "PRO", "TEAM", "ENTERPRISE"]
  const currentIndex = planOrder.indexOf(currentPlan)

  if (currentIndex === -1 || currentIndex === planOrder.length - 1) {
    return null
  }

  return planOrder[currentIndex + 1]
}

export function getPlanUpgradeMessage(currentPlan: PlanKey, featureOrLimit: string): string {
  const nextPlan = getNextPlan(currentPlan)

  if (!nextPlan) {
    return `You've reached the ${currentPlan} plan limit for ${featureOrLimit}. Contact support for custom solutions.`
  }

  const nextPlanInfo = PLAN_INFO[nextPlan]
  return `You've hit the ${currentPlan} plan limit for ${featureOrLimit}. Upgrade to ${nextPlanInfo.name} to continue.`
}