import Ajv, { JSONSchemaType } from "ajv"
import addFormats from "ajv-formats"

// Filter condition types
export interface FilterWhen {
  field: string
  op: "contains" | "equals" | "gt" | "lt" | "regex"
  value: any
}

// Step types
export interface TriggerHttpStep {
  type: "trigger.http"
  path: string
  secretHmac: boolean
}

export interface FilterStep {
  type: "filter"
  when: FilterWhen
}

export interface BranchCase {
  when: FilterWhen
  steps: PlanStep[]
}

export interface BranchStep {
  type: "branch"
  cases: BranchCase[]
  else?: PlanStep[]
}

export interface SlackPostMessageStep {
  type: "action.slack.postMessage"
  channel: string
  text: string
}

export interface HttpRequestStep {
  type: "action.http.request"
  method: "GET" | "POST" | "PUT" | "DELETE"
  url: string
  headers?: Record<string, any>
  body?: Record<string, any>
}

export interface CustomActionStep {
  type: "custom.action"
  actionSlug: string
  input?: Record<string, any>
}

export type PlanStep =
  | TriggerHttpStep
  | FilterStep
  | BranchStep
  | SlackPostMessageStep
  | HttpRequestStep
  | CustomActionStep

export interface Plan {
  version: "1"
  name: string
  steps: PlanStep[]
}

// JSON Schema definitions
const filterWhenSchema: JSONSchemaType<FilterWhen> = {
  type: "object",
  properties: {
    field: { type: "string" },
    op: { type: "string", enum: ["contains", "equals", "gt", "lt", "regex"] },
    value: {} // any type
  },
  required: ["field", "op", "value"],
  additionalProperties: false
}

const triggerHttpStepSchema: JSONSchemaType<TriggerHttpStep> = {
  type: "object",
  properties: {
    type: { type: "string", const: "trigger.http" },
    path: { type: "string" },
    secretHmac: { type: "boolean" }
  },
  required: ["type", "path", "secretHmac"],
  additionalProperties: false
}

const filterStepSchema: JSONSchemaType<FilterStep> = {
  type: "object",
  properties: {
    type: { type: "string", const: "filter" },
    when: filterWhenSchema
  },
  required: ["type", "when"],
  additionalProperties: false
}

const slackPostMessageStepSchema: JSONSchemaType<SlackPostMessageStep> = {
  type: "object",
  properties: {
    type: { type: "string", const: "action.slack.postMessage" },
    channel: { type: "string" },
    text: { type: "string" }
  },
  required: ["type", "channel", "text"],
  additionalProperties: false
}

const httpRequestStepSchema: JSONSchemaType<HttpRequestStep> = {
  type: "object",
  properties: {
    type: { type: "string", const: "action.http.request" },
    method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"] },
    url: { type: "string" },
    headers: {
      type: "object",
      nullable: true,
      additionalProperties: true
    },
    body: {
      type: "object",
      nullable: true,
      additionalProperties: true
    }
  },
  required: ["type", "method", "url"],
  additionalProperties: false
}

const customActionStepSchema: JSONSchemaType<CustomActionStep> = {
  type: "object",
  properties: {
    type: { type: "string", const: "custom.action" },
    actionSlug: { type: "string" },
    input: {
      type: "object",
      nullable: true,
      additionalProperties: true
    }
  },
  required: ["type", "actionSlug"],
  additionalProperties: false
}

// Use a schema with $ref to handle recursion properly
const stepSchemaRef = {
  $id: "stepSchema",
  oneOf: [
    triggerHttpStepSchema,
    filterStepSchema,
    slackPostMessageStepSchema,
    httpRequestStepSchema,
    customActionStepSchema,
    {
      type: "object",
      properties: {
        type: { type: "string", const: "branch" },
        cases: {
          type: "array",
          items: {
            type: "object",
            properties: {
              when: filterWhenSchema,
              steps: {
                type: "array",
                items: { $ref: "stepSchema" }
              }
            },
            required: ["when", "steps"],
            additionalProperties: false
          },
          minItems: 1
        },
        else: {
          type: "array",
          items: { $ref: "stepSchema" },
          nullable: true
        }
      },
      required: ["type", "cases"],
      additionalProperties: false
    }
  ]
}

// Plan schema
export const planSchema = {
  type: "object",
  properties: {
    version: { type: "string", const: "1" },
    name: { type: "string", minLength: 1, maxLength: 100 },
    steps: {
      type: "array",
      items: { $ref: "stepSchema" },
      minItems: 1,
      maxItems: 50
    }
  },
  required: ["version", "name", "steps"],
  additionalProperties: false
} as const

// AJV instance with configuration
export const ajv = new Ajv({
  allErrors: true,
  verbose: true,
  strict: true,
  removeAdditional: false
})

addFormats(ajv)

// Add the recursive step schema
ajv.addSchema(stepSchemaRef)

// Compile the schema
export const validatePlan = ajv.compile(planSchema)

// Validation function with better error messages
export function validatePlanWithErrors(plan: unknown): {
  valid: boolean
  errors: string[]
  data?: Plan
} {
  const valid = validatePlan(plan)

  if (valid) {
    return { valid: true, errors: [], data: plan as Plan }
  }

  const errors = validatePlan.errors?.map(error => {
    const path = error.instancePath || "root"
    const message = error.message || "validation failed"

    // Improve error messages for better UX
    if (error.keyword === "required") {
      const missingProperty = error.params?.missingProperty
      return `Missing required property "${missingProperty}" at ${path}`
    }

    if (error.keyword === "enum") {
      const allowedValues = error.params?.allowedValues
      return `Invalid value at ${path}. Must be one of: ${allowedValues?.join(", ")}`
    }

    if (error.keyword === "const") {
      const allowedValue = error.params?.allowedValue
      return `Invalid value at ${path}. Must be: ${allowedValue}`
    }

    if (error.keyword === "minItems") {
      const limit = error.params?.limit
      return `Array at ${path} must have at least ${limit} items`
    }

    if (error.keyword === "maxItems") {
      const limit = error.params?.limit
      return `Array at ${path} must have no more than ${limit} items`
    }

    if (error.keyword === "minLength") {
      const limit = error.params?.limit
      return `String at ${path} must be at least ${limit} characters long`
    }

    if (error.keyword === "maxLength") {
      const limit = error.params?.limit
      return `String at ${path} must be no more than ${limit} characters long`
    }

    if (error.keyword === "oneOf") {
      return `Invalid step type at ${path}. Must be one of: trigger.http, filter, branch, action.slack.postMessage, action.http.request, custom.action`
    }

    // Default message with path
    return `${message} at ${path}`
  }) || ["Unknown validation error"]

  return { valid: false, errors }
}

// Helper function to check if a plan has a specific step type
export function hasStepType(plan: Plan, stepType: string): boolean {
  const checkSteps = (steps: PlanStep[]): boolean => {
    return steps.some(step => {
      if (step.type === stepType) return true
      if (step.type === "branch") {
        return step.cases.some(c => checkSteps(c.steps)) ||
               (step.else && checkSteps(step.else))
      }
      return false
    })
  }

  return checkSteps(plan.steps)
}

// Helper function to get all step types used in a plan
export function getUsedStepTypes(plan: Plan): string[] {
  const types = new Set<string>()

  const collectTypes = (steps: PlanStep[]): void => {
    steps.forEach(step => {
      types.add(step.type)
      if (step.type === "branch") {
        step.cases.forEach(c => collectTypes(c.steps))
        if (step.else) collectTypes(step.else)
      }
    })
  }

  collectTypes(plan.steps)
  return Array.from(types)
}

// Helper function to count total steps in a plan (including nested)
export function countTotalSteps(plan: Plan): number {
  const countSteps = (steps: PlanStep[]): number => {
    return steps.reduce((count, step) => {
      let stepCount = 1
      if (step.type === "branch") {
        stepCount += step.cases.reduce((caseCount, c) => caseCount + countSteps(c.steps), 0)
        if (step.else) stepCount += countSteps(step.else)
      }
      return count + stepCount
    }, 0)
  }

  return countSteps(plan.steps)
}