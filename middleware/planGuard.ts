import { getCurrentUsage } from "@/lib/plans"
import { throwPlanLimit, throwFeatureLocked, LimitMeta, FeatureMeta } from "@/lib/errors"

// Plan feature capabilities
interface PlanFeatures {
  maxWorkflows: number
  maxStepsPerWorkflow: number
  maxMonthlyRuns: number
  hasAdvancedConnectors: boolean
  hasCustomCode: boolean
  hasScheduledTriggers: boolean
  hasWebhookTriggers: boolean
  hasAPIAccess: boolean
  hasTeamCollaboration: boolean
  hasPrioritySupport: boolean
  hasAdvancedAnalytics: boolean
}

// Plan type definitions
const PLAN_FEATURES: Record<string, PlanFeatures> = {
  free: {
    maxWorkflows: 3,
    maxStepsPerWorkflow: 5,
    maxMonthlyRuns: 100,
    hasAdvancedConnectors: false,
    hasCustomCode: false,
    hasScheduledTriggers: false,
    hasWebhookTriggers: true,
    hasAPIAccess: false,
    hasTeamCollaboration: false,
    hasPrioritySupport: false,
    hasAdvancedAnalytics: false
  },
  starter: {
    maxWorkflows: 10,
    maxStepsPerWorkflow: 10,
    maxMonthlyRuns: 1000,
    hasAdvancedConnectors: true,
    hasCustomCode: false,
    hasScheduledTriggers: true,
    hasWebhookTriggers: true,
    hasAPIAccess: true,
    hasTeamCollaboration: false,
    hasPrioritySupport: false,
    hasAdvancedAnalytics: false
  },
  pro: {
    maxWorkflows: 50,
    maxStepsPerWorkflow: 25,
    maxMonthlyRuns: 10000,
    hasAdvancedConnectors: true,
    hasCustomCode: true,
    hasScheduledTriggers: true,
    hasWebhookTriggers: true,
    hasAPIAccess: true,
    hasTeamCollaboration: true,
    hasPrioritySupport: true,
    hasAdvancedAnalytics: true
  },
  enterprise: {
    maxWorkflows: -1, // Unlimited
    maxStepsPerWorkflow: -1, // Unlimited
    maxMonthlyRuns: -1, // Unlimited
    hasAdvancedConnectors: true,
    hasCustomCode: true,
    hasScheduledTriggers: true,
    hasWebhookTriggers: true,
    hasAPIAccess: true,
    hasTeamCollaboration: true,
    hasPrioritySupport: true,
    hasAdvancedAnalytics: true
  }
}

export async function assertWorkflowLimit(orgId: string): Promise<void> {
  try {
    const usage = await getCurrentUsage(orgId)
    const planFeatures = PLAN_FEATURES[usage.planType] || PLAN_FEATURES.free

    // Check if plan has unlimited workflows
    if (planFeatures.maxWorkflows === -1) {
      return
    }

    if (usage.workflowsCount >= planFeatures.maxWorkflows) {
      console.warn("Workflow limit exceeded", {
        orgId: orgId.slice(0, 8) + "...",
        used: usage.workflowsCount,
        limit: planFeatures.maxWorkflows,
        planType: usage.planType
      })

      throwPlanLimit(
        `Workflow limit of ${planFeatures.maxWorkflows} exceeded. Current usage: ${usage.workflowsCount}`,
        {
          limit: planFeatures.maxWorkflows,
          used: usage.workflowsCount,
          planType: usage.planType
        }
      )
    }

    console.log("Workflow limit check passed", {
      orgId: orgId.slice(0, 8) + "...",
      used: usage.workflowsCount,
      limit: planFeatures.maxWorkflows,
      remaining: planFeatures.maxWorkflows - usage.workflowsCount,
      planType: usage.planType
    })

  } catch (error) {
    if (error instanceof Error && error.name === 'TypedError') {
      throw error
    }

    console.error("Error checking workflow limit", {
      orgId: orgId.slice(0, 8) + "...",
      error: error instanceof Error ? error.message : "Unknown error"
    })

    throwPlanLimit("Failed to check workflow limits. Please try again.")
  }
}

export async function assertRunLimit(orgId: string): Promise<void> {
  try {
    const usage = await getCurrentUsage(orgId)
    const planFeatures = PLAN_FEATURES[usage.planType] || PLAN_FEATURES.free

    // Check if plan has unlimited runs
    if (planFeatures.maxMonthlyRuns === -1) {
      return
    }

    if (usage.monthlyRunsUsed >= planFeatures.maxMonthlyRuns) {
      console.warn("Monthly run limit exceeded", {
        orgId: orgId.slice(0, 8) + "...",
        used: usage.monthlyRunsUsed,
        limit: planFeatures.maxMonthlyRuns,
        planType: usage.planType
      })

      throwPlanLimit(
        `Monthly run limit of ${planFeatures.maxMonthlyRuns} exceeded. Current usage: ${usage.monthlyRunsUsed}`,
        {
          limit: planFeatures.maxMonthlyRuns,
          used: usage.monthlyRunsUsed,
          planType: usage.planType
        }
      )
    }

    console.log("Monthly run limit check passed", {
      orgId: orgId.slice(0, 8) + "...",
      used: usage.monthlyRunsUsed,
      limit: planFeatures.maxMonthlyRuns,
      remaining: planFeatures.maxMonthlyRuns - usage.monthlyRunsUsed,
      planType: usage.planType
    })

  } catch (error) {
    if (error instanceof Error && error.name === 'TypedError') {
      throw error
    }

    console.error("Error checking run limit", {
      orgId: orgId.slice(0, 8) + "...",
      error: error instanceof Error ? error.message : "Unknown error"
    })

    throwPlanLimit("Failed to check run limits. Please try again.")
  }
}

export async function assertStepLimit(orgId: string, stepCount: number): Promise<void> {
  try {
    const usage = await getCurrentUsage(orgId)
    const planFeatures = PLAN_FEATURES[usage.planType] || PLAN_FEATURES.free

    // Check if plan has unlimited steps
    if (planFeatures.maxStepsPerWorkflow === -1) {
      return
    }

    if (stepCount > planFeatures.maxStepsPerWorkflow) {
      console.warn("Workflow step limit exceeded", {
        orgId: orgId.slice(0, 8) + "...",
        stepCount,
        limit: planFeatures.maxStepsPerWorkflow,
        planType: usage.planType
      })

      throwPlanLimit(
        `Workflow step limit of ${planFeatures.maxStepsPerWorkflow} exceeded. Your workflow has ${stepCount} steps`,
        {
          limit: planFeatures.maxStepsPerWorkflow,
          used: stepCount,
          planType: usage.planType
        }
      )
    }

    console.log("Workflow step limit check passed", {
      orgId: orgId.slice(0, 8) + "...",
      stepCount,
      limit: planFeatures.maxStepsPerWorkflow,
      planType: usage.planType
    })

  } catch (error) {
    if (error instanceof Error && error.name === 'TypedError') {
      throw error
    }

    console.error("Error checking step limit", {
      orgId: orgId.slice(0, 8) + "...",
      error: error instanceof Error ? error.message : "Unknown error"
    })

    throwPlanLimit("Failed to check step limits. Please try again.")
  }
}

export async function assertFeatureAccess(orgId: string, feature: keyof PlanFeatures): Promise<void> {
  try {
    const usage = await getCurrentUsage(orgId)
    const planFeatures = PLAN_FEATURES[usage.planType] || PLAN_FEATURES.free

    if (!planFeatures[feature]) {
      console.warn("Feature access denied", {
        orgId: orgId.slice(0, 8) + "...",
        feature,
        planType: usage.planType,
        hasFeature: planFeatures[feature]
      })

      const featureName = getFeatureName(feature)
      const requiredPlan = getRequiredPlanForFeature(feature)

      throwFeatureLocked(
        `${featureName} is not available on your current plan`,
        {
          feature: featureName,
          requiredPlan,
          currentPlan: usage.planType
        }
      )
    }

    console.log("Feature access check passed", {
      orgId: orgId.slice(0, 8) + "...",
      feature,
      planType: usage.planType,
      hasFeature: planFeatures[feature]
    })

  } catch (error) {
    if (error instanceof Error && error.name === 'TypedError') {
      throw error
    }

    console.error("Error checking feature access", {
      orgId: orgId.slice(0, 8) + "...",
      feature,
      error: error instanceof Error ? error.message : "Unknown error"
    })

    throwFeatureLocked("Failed to check feature access. Please try again.")
  }
}

// Helper functions
function getFeatureName(feature: keyof PlanFeatures): string {
  const featureNames: Record<keyof PlanFeatures, string> = {
    maxWorkflows: "Workflow Limit",
    maxStepsPerWorkflow: "Step Limit",
    maxMonthlyRuns: "Monthly Run Limit",
    hasAdvancedConnectors: "Advanced Connectors",
    hasCustomCode: "Custom Code Execution",
    hasScheduledTriggers: "Scheduled Triggers",
    hasWebhookTriggers: "Webhook Triggers",
    hasAPIAccess: "API Access",
    hasTeamCollaboration: "Team Collaboration",
    hasPrioritySupport: "Priority Support",
    hasAdvancedAnalytics: "Advanced Analytics"
  }

  return featureNames[feature] || feature.toString()
}

function getRequiredPlanForFeature(feature: keyof PlanFeatures): string {
  // Find the minimum plan that includes this feature
  for (const [planType, features] of Object.entries(PLAN_FEATURES)) {
    if (features[feature]) {
      return planType
    }
  }
  return 'pro'
}

export function getPlanFeatures(planType: string): PlanFeatures {
  return PLAN_FEATURES[planType] || PLAN_FEATURES.free
}

export function getAvailablePlans(): Array<{
  type: string
  name: string
  features: PlanFeatures
}> {
  return [
    { type: 'free', name: 'Free', features: PLAN_FEATURES.free },
    { type: 'starter', name: 'Starter', features: PLAN_FEATURES.starter },
    { type: 'pro', name: 'Pro', features: PLAN_FEATURES.pro },
    { type: 'enterprise', name: 'Enterprise', features: PLAN_FEATURES.enterprise }
  ]
}

// Validation helpers for plans and workflows
export async function validateWorkflowPlan(orgId: string, workflow: any): Promise<void> {
  // Check step count limit
  if (workflow.steps && Array.isArray(workflow.steps)) {
    await assertStepLimit(orgId, workflow.steps.length)
  }

  // Check for feature usage in workflow
  if (workflow.steps) {
    for (const step of workflow.steps) {
      // Check for custom code
      if (step.type === 'custom_code' || step.config?.customCode) {
        await assertFeatureAccess(orgId, 'hasCustomCode')
      }

      // Check for scheduled triggers
      if (step.type === 'schedule_trigger' || step.type === 'cron_trigger') {
        await assertFeatureAccess(orgId, 'hasScheduledTriggers')
      }

      // Check for advanced connectors
      if (step.type && isAdvancedConnector(step.type)) {
        await assertFeatureAccess(orgId, 'hasAdvancedConnectors')
      }
    }
  }
}

function isAdvancedConnector(stepType: string): boolean {
  const advancedConnectors = [
    'salesforce', 'hubspot', 'zendesk', 'jira', 'confluence',
    'marketo', 'pardot', 'dynamics', 'servicenow', 'workday',
    'netsuite', 'oracle', 'sap', 'snowflake', 'databricks'
  ]

  return advancedConnectors.some(connector =>
    stepType.toLowerCase().includes(connector)
  )
}