import { describe, it, expect } from "vitest"
import { validatePlan, getValidationSummary, categorizeIssues } from "@/lib/plan/validate"
import type { Plan } from "@/lib/plan/schema"
import leadRouterExample from "@/lib/plan/examples/lead-router.json"

const mockOrgId = "org_123456789"

describe("Plan Validation", () => {
  describe("valid plans", () => {
    it("should validate the lead-router example (with expected custom action warning)", async () => {
      const result = await validatePlan(leadRouterExample, { orgId: mockOrgId })

      // The lead router example contains a custom action which will fail validation
      // since we don't have any custom actions registered for testing
      expect(result.valid).toBe(false)
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].code).toBe("UNKNOWN_ACTION_SLUG")
      expect(result.issues[0].message).toContain("enrich-lead-data")
    })

    it("should validate a simple valid plan", async () => {
      const simplePlan: Plan = {
        version: "1",
        name: "Simple Valid Plan",
        steps: [
          {
            type: "trigger.http",
            path: "/webhook/test",
            secretHmac: true
          },
          {
            type: "action.slack.postMessage",
            channel: "#general",
            text: "Hello world"
          }
        ]
      }

      const result = await validatePlan(simplePlan, { orgId: mockOrgId })

      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it("should validate plan with allowed HTTP hosts", async () => {
      const plan: Plan = {
        version: "1",
        name: "HTTP Test Plan",
        steps: [
          {
            type: "trigger.http",
            path: "/webhook/api",
            secretHmac: true
          },
          {
            type: "action.http.request",
            method: "POST",
            url: "https://api.slack.com/api/chat.postMessage"
          }
        ]
      }

      const result = await validatePlan(plan, { orgId: mockOrgId })

      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })
  })

  describe("invalid plans", () => {
    it("should reject plans that don't start with trigger", async () => {
      const invalidPlan: Plan = {
        version: "1",
        name: "No Trigger Plan",
        steps: [
          {
            type: "action.slack.postMessage",
            channel: "#general",
            text: "Hello"
          }
        ]
      }

      const result = await validatePlan(invalidPlan, { orgId: mockOrgId })

      expect(result.valid).toBe(false)
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].code).toBe("MUST_START_WITH_TRIGGER")
      expect(result.issues[0].path).toBe("steps[0].type")
      expect(result.issues[0].message).toContain("must start with a trigger step")
    })

    it("should reject plans with empty steps", async () => {
      const invalidPlan = {
        version: "1",
        name: "Empty Plan",
        steps: []
      }

      const result = await validatePlan(invalidPlan, { orgId: mockOrgId })

      expect(result.valid).toBe(false)
      // The schema validation will catch this as a minItems violation
      expect(result.issues.some(issue => issue.code === "SCHEMA_VALIDATION_FAILED")).toBe(true)
    })

    it("should reject plans with multiple triggers", async () => {
      const invalidPlan: Plan = {
        version: "1",
        name: "Multiple Triggers Plan",
        steps: [
          {
            type: "trigger.http",
            path: "/webhook/one",
            secretHmac: true
          },
          {
            type: "trigger.http",
            path: "/webhook/two",
            secretHmac: true
          }
        ]
      }

      const result = await validatePlan(invalidPlan, { orgId: mockOrgId })

      expect(result.valid).toBe(false)
      expect(result.issues.some(issue => issue.code === "MULTIPLE_TRIGGERS")).toBe(true)
    })

    it("should reject unknown custom actions", async () => {
      const invalidPlan: Plan = {
        version: "1",
        name: "Unknown Action Plan",
        steps: [
          {
            type: "trigger.http",
            path: "/webhook/test",
            secretHmac: true
          },
          {
            type: "custom.action",
            actionSlug: "nonexistent-action"
          }
        ]
      }

      const result = await validatePlan(invalidPlan, { orgId: mockOrgId })

      expect(result.valid).toBe(false)
      expect(result.issues.some(issue => issue.code === "UNKNOWN_ACTION_SLUG")).toBe(true)
      expect(result.issues.find(issue => issue.code === "UNKNOWN_ACTION_SLUG")?.message)
        .toContain("nonexistent-action")
    })

    it("should reject forbidden HTTP hosts", async () => {
      const invalidPlan: Plan = {
        version: "1",
        name: "Forbidden Host Plan",
        steps: [
          {
            type: "trigger.http",
            path: "/webhook/test",
            secretHmac: true
          },
          {
            type: "action.http.request",
            method: "GET",
            url: "https://malicious-site.com/api"
          }
        ]
      }

      const result = await validatePlan(invalidPlan, { orgId: mockOrgId })

      expect(result.valid).toBe(false)
      expect(result.issues.some(issue => issue.code === "FORBIDDEN_HOST")).toBe(true)
      expect(result.issues.find(issue => issue.code === "FORBIDDEN_HOST")?.message)
        .toContain("malicious-site.com")
    })

    it("should reject invalid Slack channel formats", async () => {
      const invalidPlan: Plan = {
        version: "1",
        name: "Invalid Slack Channel Plan",
        steps: [
          {
            type: "trigger.http",
            path: "/webhook/test",
            secretHmac: true
          },
          {
            type: "action.slack.postMessage",
            channel: "general", // Missing #
            text: "Hello"
          }
        ]
      }

      const result = await validatePlan(invalidPlan, { orgId: mockOrgId })

      expect(result.valid).toBe(false)
      expect(result.issues.some(issue => issue.code === "INVALID_SLACK_CHANNEL")).toBe(true)
      expect(result.issues.find(issue => issue.code === "INVALID_SLACK_CHANNEL")?.message)
        .toContain("must start with #")
    })

    it("should reject invalid webhook paths", async () => {
      const invalidPlan: Plan = {
        version: "1",
        name: "Invalid Webhook Path Plan",
        steps: [
          {
            type: "trigger.http",
            path: "webhook/test", // Missing leading /
            secretHmac: true
          }
        ]
      }

      const result = await validatePlan(invalidPlan, { orgId: mockOrgId })

      expect(result.valid).toBe(false)
      expect(result.issues.some(issue => issue.code === "INVALID_WEBHOOK_PATH")).toBe(true)
    })

    it("should reject webhook paths with spaces or query params", async () => {
      const invalidPlan: Plan = {
        version: "1",
        name: "Invalid Webhook Format Plan",
        steps: [
          {
            type: "trigger.http",
            path: "/webhook test?param=value",
            secretHmac: true
          }
        ]
      }

      const result = await validatePlan(invalidPlan, { orgId: mockOrgId })

      expect(result.valid).toBe(false)
      expect(result.issues.some(issue => issue.code === "INVALID_WEBHOOK_PATH_FORMAT")).toBe(true)
    })

    it("should reject empty branch cases", async () => {
      const invalidPlan: Plan = {
        version: "1",
        name: "Empty Branch Case Plan",
        steps: [
          {
            type: "trigger.http",
            path: "/webhook/test",
            secretHmac: true
          },
          {
            type: "branch",
            cases: [
              {
                when: {
                  field: "status",
                  op: "equals",
                  value: "active"
                },
                steps: [] // Empty steps
              }
            ]
          }
        ]
      }

      const result = await validatePlan(invalidPlan, { orgId: mockOrgId })

      expect(result.valid).toBe(false)
      expect(result.issues.some(issue => issue.code === "EMPTY_BRANCH_CASE")).toBe(true)
    })

    it("should reject empty branch else clause", async () => {
      const invalidPlan: Plan = {
        version: "1",
        name: "Empty Branch Else Plan",
        steps: [
          {
            type: "trigger.http",
            path: "/webhook/test",
            secretHmac: true
          },
          {
            type: "branch",
            cases: [
              {
                when: {
                  field: "status",
                  op: "equals",
                  value: "active"
                },
                steps: [
                  {
                    type: "action.slack.postMessage",
                    channel: "#active",
                    text: "Active status"
                  }
                ]
              }
            ],
            else: [] // Empty else
          }
        ]
      }

      const result = await validatePlan(invalidPlan, { orgId: mockOrgId })

      expect(result.valid).toBe(false)
      expect(result.issues.some(issue => issue.code === "EMPTY_BRANCH_ELSE")).toBe(true)
    })

    it("should validate nested branch steps recursively", async () => {
      const invalidPlan: Plan = {
        version: "1",
        name: "Nested Branch Plan",
        steps: [
          {
            type: "trigger.http",
            path: "/webhook/test",
            secretHmac: true
          },
          {
            type: "branch",
            cases: [
              {
                when: {
                  field: "type",
                  op: "equals",
                  value: "important"
                },
                steps: [
                  {
                    type: "custom.action",
                    actionSlug: "unknown-nested-action"
                  }
                ]
              }
            ]
          }
        ]
      }

      const result = await validatePlan(invalidPlan, { orgId: mockOrgId })

      expect(result.valid).toBe(false)
      expect(result.issues.some(issue => issue.code === "UNKNOWN_ACTION_SLUG")).toBe(true)
      expect(result.issues.find(issue => issue.code === "UNKNOWN_ACTION_SLUG")?.path)
        .toContain("cases[0].steps[0]")
    })
  })

  describe("schema validation", () => {
    it("should reject invalid JSON", async () => {
      const invalidJson = "not valid json"

      const result = await validatePlan(invalidJson, { orgId: mockOrgId })

      expect(result.valid).toBe(false)
      expect(result.issues.some(issue => issue.code === "SCHEMA_VALIDATION_FAILED")).toBe(true)
    })

    it("should reject plans missing required fields", async () => {
      const invalidPlan = {
        name: "Missing Version",
        steps: []
      }

      const result = await validatePlan(invalidPlan, { orgId: mockOrgId })

      expect(result.valid).toBe(false)
      expect(result.issues.some(issue => issue.code === "SCHEMA_VALIDATION_FAILED")).toBe(true)
    })
  })

  describe("helper functions", () => {
    it("should generate validation summary for valid plan", async () => {
      const validPlan: Plan = {
        version: "1",
        name: "Simple Valid Plan",
        steps: [
          {
            type: "trigger.http",
            path: "/webhook/test",
            secretHmac: true
          },
          {
            type: "action.slack.postMessage",
            channel: "#general",
            text: "Hello world"
          }
        ]
      }

      const result = await validatePlan(validPlan, { orgId: mockOrgId })
      const summary = getValidationSummary(result)

      expect(summary).toBe("Plan is valid and ready to use.")
    })

    it("should generate validation summary for invalid plan", async () => {
      const invalidPlan: Plan = {
        version: "1",
        name: "Invalid Plan",
        steps: [
          {
            type: "action.slack.postMessage",
            channel: "#general",
            text: "Hello"
          }
        ]
      }

      const result = await validatePlan(invalidPlan, { orgId: mockOrgId })
      const summary = getValidationSummary(result)

      expect(summary).toContain("critical error")
    })

    it("should categorize issues by severity", async () => {
      const invalidPlan: Plan = {
        version: "1",
        name: "Mixed Issues Plan",
        steps: [
          {
            type: "action.slack.postMessage", // Critical: not starting with trigger
            channel: "#general",
            text: "Hello"
          },
          {
            type: "custom.action", // Warning: unknown action
            actionSlug: "unknown-action"
          }
        ]
      }

      const result = await validatePlan(invalidPlan, { orgId: mockOrgId })
      const categorized = categorizeIssues(result.issues)

      expect(categorized.critical.length).toBeGreaterThan(0)
      expect(categorized.warning.length).toBeGreaterThan(0)
      expect(categorized.critical.some(issue => issue.code === "MUST_START_WITH_TRIGGER")).toBe(true)
      expect(categorized.warning.some(issue => issue.code === "UNKNOWN_ACTION_SLUG")).toBe(true)
    })
  })
})