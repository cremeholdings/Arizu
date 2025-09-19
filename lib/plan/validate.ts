import { validatePlanWithErrors, type Plan, type PlanStep } from "./schema"

export interface ValidationIssue {
  path: string
  code: string
  message: string
}

export interface ValidationOptions {
  orgId: string
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
}

// TODO: Implement proper action slug resolver based on organization's available actions
async function resolveActionSlug(actionSlug: string, orgId: string): Promise<boolean> {
  // Stub implementation - always returns false for now
  // In the future, this should check against the organization's available custom actions
  console.log(`TODO: Resolve action slug "${actionSlug}" for org ${orgId.slice(0, 8)}...`)
  return false
}

// TODO: Implement proper allowlist for HTTP requests
function isHostAllowed(url: string): boolean {
  // Stub implementation with basic allowed hosts
  // In the future, this should be configurable per organization
  const allowedHosts = [
    'api.slack.com',
    'hooks.slack.com',
    'api.github.com',
    'api.salesforce.com',
    'graph.microsoft.com',
    'api.hubspot.com',
    'api.stripe.com',
    'api.zapier.com',
    'jsonplaceholder.typicode.com', // For testing
  ]

  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname.toLowerCase()

    return allowedHosts.some(allowed =>
      hostname === allowed || hostname.endsWith(`.${allowed}`)
    )
  } catch {
    return false
  }
}

function redactUrl(url: string): string {
  try {
    const parsedUrl = new URL(url)
    return `${parsedUrl.protocol}//${parsedUrl.hostname}${parsedUrl.pathname ? '/...' : ''}`
  } catch {
    return '[INVALID_URL]'
  }
}

function getStepPath(stepIndex: number, nestedPath?: string): string {
  const basePath = `steps[${stepIndex}]`
  return nestedPath ? `${basePath}.${nestedPath}` : basePath
}

async function validateStepRecursive(
  step: PlanStep,
  stepIndex: number,
  orgId: string,
  parentPath?: string
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const stepPath = parentPath ? `${parentPath}.steps[${stepIndex}]` : getStepPath(stepIndex)

  // Validate custom actions
  if (step.type === "custom.action") {
    const actionExists = await resolveActionSlug(step.actionSlug, orgId)
    if (!actionExists) {
      issues.push({
        path: `${stepPath}.actionSlug`,
        code: "UNKNOWN_ACTION_SLUG",
        message: `Custom action "${step.actionSlug}" is not available for your organization. Check the spelling or contact support to add this action.`
      })
    }
  }

  // Validate HTTP requests
  if (step.type === "action.http.request") {
    if (!isHostAllowed(step.url)) {
      issues.push({
        path: `${stepPath}.url`,
        code: "FORBIDDEN_HOST",
        message: `HTTP requests to ${redactUrl(step.url)} are not allowed. Contact support to allowlist this host.`
      })
    }
  }

  // Validate branch steps recursively
  if (step.type === "branch") {
    // Check each case
    for (let caseIndex = 0; caseIndex < step.cases.length; caseIndex++) {
      const branchCase = step.cases[caseIndex]
      const casePath = `${stepPath}.cases[${caseIndex}]`

      // Branch cases must have non-empty steps
      if (!branchCase.steps || branchCase.steps.length === 0) {
        issues.push({
          path: `${casePath}.steps`,
          code: "EMPTY_BRANCH_CASE",
          message: "Branch cases must contain at least one step. Add an action or remove this case."
        })
      } else {
        // Recursively validate nested steps
        for (let nestedIndex = 0; nestedIndex < branchCase.steps.length; nestedIndex++) {
          const nestedIssues = await validateStepRecursive(
            branchCase.steps[nestedIndex],
            nestedIndex,
            orgId,
            casePath
          )
          issues.push(...nestedIssues)
        }
      }
    }

    // Check else clause if present
    if (step.else) {
      if (step.else.length === 0) {
        issues.push({
          path: `${stepPath}.else`,
          code: "EMPTY_BRANCH_ELSE",
          message: "Branch else clause cannot be empty. Add steps or remove the else clause."
        })
      } else {
        // Recursively validate else steps
        for (let elseIndex = 0; elseIndex < step.else.length; elseIndex++) {
          const elseIssues = await validateStepRecursive(
            step.else[elseIndex],
            elseIndex,
            orgId,
            `${stepPath}.else`
          )
          issues.push(...elseIssues)
        }
      }
    }
  }

  return issues
}

export async function validatePlan(
  plan: unknown,
  options: ValidationOptions
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = []

  // First, validate against JSON schema
  const schemaValidation = validatePlanWithErrors(plan)
  if (!schemaValidation.valid) {
    return {
      valid: false,
      issues: schemaValidation.errors.map(error => ({
        path: "schema",
        code: "SCHEMA_VALIDATION_FAILED",
        message: error
      }))
    }
  }

  const validPlan = schemaValidation.data!

  // Custom lint rules
  try {
    // Rule 1: Must start with a trigger
    if (validPlan.steps.length === 0) {
      issues.push({
        path: "steps",
        code: "NO_STEPS",
        message: "Plan must contain at least one step."
      })
    } else {
      const firstStep = validPlan.steps[0]
      if (!firstStep.type.startsWith("trigger.")) {
        issues.push({
          path: "steps[0].type",
          code: "MUST_START_WITH_TRIGGER",
          message: "Plan must start with a trigger step (e.g., trigger.http). Add a trigger as the first step."
        })
      }
    }

    // Rule 2: Validate each step recursively
    for (let i = 0; i < validPlan.steps.length; i++) {
      const stepIssues = await validateStepRecursive(validPlan.steps[i], i, options.orgId)
      issues.push(...stepIssues)
    }

    // Rule 3: No multiple triggers (business rule)
    const triggerSteps = validPlan.steps.filter(step => step.type.startsWith("trigger."))
    if (triggerSteps.length > 1) {
      issues.push({
        path: "steps",
        code: "MULTIPLE_TRIGGERS",
        message: "Plan can only have one trigger step. Remove extra trigger steps or create separate plans."
      })
    }

    // Rule 4: Validate Slack channels format
    validPlan.steps.forEach((step, index) => {
      if (step.type === "action.slack.postMessage") {
        if (!step.channel.startsWith("#") && !step.channel.startsWith("@")) {
          issues.push({
            path: getStepPath(index, "channel"),
            code: "INVALID_SLACK_CHANNEL",
            message: `Slack channel must start with # for channels or @ for users. Got: "${step.channel}"`
          })
        }
      }
    })

    // Rule 5: Validate HTTP paths for triggers
    validPlan.steps.forEach((step, index) => {
      if (step.type === "trigger.http") {
        if (!step.path.startsWith("/")) {
          issues.push({
            path: getStepPath(index, "path"),
            code: "INVALID_WEBHOOK_PATH",
            message: `Webhook path must start with /. Got: "${step.path}"`
          })
        }

        if (step.path.includes(" ") || step.path.includes("?")) {
          issues.push({
            path: getStepPath(index, "path"),
            code: "INVALID_WEBHOOK_PATH_FORMAT",
            message: `Webhook path cannot contain spaces or query parameters. Got: "${step.path}"`
          })
        }
      }
    })

  } catch (error) {
    console.error("Error during plan validation:", {
      orgId: options.orgId.slice(0, 8) + "...",
      error: error instanceof Error ? error.message : "Unknown error",
    })

    issues.push({
      path: "validation",
      code: "VALIDATION_ERROR",
      message: "An error occurred during plan validation. Please try again."
    })
  }

  return {
    valid: issues.length === 0,
    issues
  }
}

// Helper function to get validation summary
export function getValidationSummary(result: ValidationResult): string {
  if (result.valid) {
    return "Plan is valid and ready to use."
  }

  const errorCount = result.issues.length
  const criticalIssues = result.issues.filter(issue =>
    issue.code === "SCHEMA_VALIDATION_FAILED" ||
    issue.code === "MUST_START_WITH_TRIGGER"
  ).length

  if (criticalIssues > 0) {
    return `Plan has ${errorCount} issue${errorCount > 1 ? 's' : ''} including ${criticalIssues} critical error${criticalIssues > 1 ? 's' : ''}. Fix critical errors first.`
  }

  return `Plan has ${errorCount} issue${errorCount > 1 ? 's' : ''} that should be addressed before deployment.`
}

// Helper function to group issues by severity
export function categorizeIssues(issues: ValidationIssue[]): {
  critical: ValidationIssue[]
  warning: ValidationIssue[]
  info: ValidationIssue[]
} {
  const critical = issues.filter(issue =>
    issue.code === "SCHEMA_VALIDATION_FAILED" ||
    issue.code === "MUST_START_WITH_TRIGGER" ||
    issue.code === "NO_STEPS" ||
    issue.code === "EMPTY_BRANCH_CASE"
  )

  const warning = issues.filter(issue =>
    issue.code === "UNKNOWN_ACTION_SLUG" ||
    issue.code === "FORBIDDEN_HOST" ||
    issue.code === "MULTIPLE_TRIGGERS"
  )

  const info = issues.filter(issue =>
    !critical.includes(issue) && !warning.includes(issue)
  )

  return { critical, warning, info }
}