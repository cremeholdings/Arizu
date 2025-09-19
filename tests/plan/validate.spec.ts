import { describe, it, expect } from "vitest"
import { validatePlanWithErrors, hasStepType, getUsedStepTypes, countTotalSteps } from "@/lib/plan/schema"
import type { Plan } from "@/lib/plan/schema"
import leadRouterExample from "@/lib/plan/examples/lead-router.json"

describe("Plan Schema Validation", () => {
  describe("valid plans", () => {
    it("should validate the lead-router example", () => {
      const result = validatePlanWithErrors(leadRouterExample)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.data).toBeDefined()
      expect(result.data?.name).toBe("Lead Router")
      expect(result.data?.version).toBe("1")
    })

    it("should validate a minimal plan", () => {
      const minimalPlan = {
        version: "1",
        name: "Minimal Plan",
        steps: [
          {
            type: "trigger.http",
            path: "/webhook/test",
            secretHmac: false
          }
        ]
      }

      const result = validatePlanWithErrors(minimalPlan)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it("should validate all step types", () => {
      const allStepsExample = {
        version: "1",
        name: "All Steps Example",
        steps: [
          {
            type: "trigger.http",
            path: "/webhook/all",
            secretHmac: true
          },
          {
            type: "filter",
            when: {
              field: "status",
              op: "equals",
              value: "active"
            }
          },
          {
            type: "action.slack.postMessage",
            channel: "#general",
            text: "Hello world"
          },
          {
            type: "action.http.request",
            method: "GET",
            url: "https://api.example.com/data"
          },
          {
            type: "custom.action",
            actionSlug: "my-custom-action"
          },
          {
            type: "branch",
            cases: [
              {
                when: {
                  field: "type",
                  op: "contains",
                  value: "premium"
                },
                steps: [
                  {
                    type: "action.slack.postMessage",
                    channel: "#premium",
                    text: "Premium user action"
                  }
                ]
              }
            ]
          }
        ]
      }

      const result = validatePlanWithErrors(allStepsExample)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe("invalid plans", () => {
    it("should reject plans without version", () => {
      const invalidPlan = {
        name: "No Version",
        steps: []
      }

      const result = validatePlanWithErrors(invalidPlan)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing required property "version" at root')
    })

    it("should reject plans with wrong version", () => {
      const invalidPlan = {
        version: "2",
        name: "Wrong Version",
        steps: []
      }

      const result = validatePlanWithErrors(invalidPlan)
      expect(result.valid).toBe(false)
      expect(result.errors.some(err => err.includes("Must be: 1"))).toBe(true)
    })

    it("should reject plans without name", () => {
      const invalidPlan = {
        version: "1",
        steps: []
      }

      const result = validatePlanWithErrors(invalidPlan)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing required property "name" at root')
    })

    it("should reject plans with empty name", () => {
      const invalidPlan = {
        version: "1",
        name: "",
        steps: []
      }

      const result = validatePlanWithErrors(invalidPlan)
      expect(result.valid).toBe(false)
      expect(result.errors.some(err => err.includes("must be at least 1 characters long"))).toBe(true)
    })

    it("should reject plans with no steps", () => {
      const invalidPlan = {
        version: "1",
        name: "No Steps",
        steps: []
      }

      const result = validatePlanWithErrors(invalidPlan)
      expect(result.valid).toBe(false)
      expect(result.errors.some(err => err.includes("must have at least 1 items"))).toBe(true)
    })

    it("should reject plans with too many steps", () => {
      const tooManySteps = Array(51).fill({
        type: "action.slack.postMessage",
        channel: "#test",
        text: "test"
      })

      const invalidPlan = {
        version: "1",
        name: "Too Many Steps",
        steps: tooManySteps
      }

      const result = validatePlanWithErrors(invalidPlan)
      expect(result.valid).toBe(false)
      expect(result.errors.some(err => err.includes("must have no more than 50 items"))).toBe(true)
    })

    it("should reject invalid step types", () => {
      const invalidPlan = {
        version: "1",
        name: "Invalid Step",
        steps: [
          {
            type: "invalid.step",
            someProperty: "value"
          }
        ]
      }

      const result = validatePlanWithErrors(invalidPlan)
      expect(result.valid).toBe(false)
      expect(result.errors.some(err => err.includes("Invalid step type"))).toBe(true)
    })

    it("should reject trigger.http steps without required fields", () => {
      const invalidPlan = {
        version: "1",
        name: "Invalid Trigger",
        steps: [
          {
            type: "trigger.http",
            path: "/webhook/test"
            // missing secretHmac
          }
        ]
      }

      const result = validatePlanWithErrors(invalidPlan)
      expect(result.valid).toBe(false)
      expect(result.errors.some(err => err.includes('Missing required property "secretHmac"'))).toBe(true)
    })

    it("should reject filter steps with invalid operators", () => {
      const invalidPlan = {
        version: "1",
        name: "Invalid Filter",
        steps: [
          {
            type: "filter",
            when: {
              field: "status",
              op: "invalid_op",
              value: "test"
            }
          }
        ]
      }

      const result = validatePlanWithErrors(invalidPlan)
      expect(result.valid).toBe(false)
      expect(result.errors.some(err => err.includes("Must be one of: contains, equals, gt, lt, regex"))).toBe(true)
    })

    it("should reject http.request steps with invalid methods", () => {
      const invalidPlan = {
        version: "1",
        name: "Invalid HTTP",
        steps: [
          {
            type: "action.http.request",
            method: "PATCH",
            url: "https://api.example.com"
          }
        ]
      }

      const result = validatePlanWithErrors(invalidPlan)
      expect(result.valid).toBe(false)
      expect(result.errors.some(err => err.includes("Must be one of: GET, POST, PUT, DELETE"))).toBe(true)
    })

    it("should reject branch steps without cases", () => {
      const invalidPlan = {
        version: "1",
        name: "Invalid Branch",
        steps: [
          {
            type: "branch",
            cases: []
          }
        ]
      }

      const result = validatePlanWithErrors(invalidPlan)
      expect(result.valid).toBe(false)
      expect(result.errors.some(err => err.includes("must have at least 1 items"))).toBe(true)
    })
  })

  describe("helper functions", () => {
    const validPlan: Plan = leadRouterExample as Plan

    it("should detect if plan has specific step type", () => {
      expect(hasStepType(validPlan, "trigger.http")).toBe(true)
      expect(hasStepType(validPlan, "filter")).toBe(true)
      expect(hasStepType(validPlan, "branch")).toBe(true)
      expect(hasStepType(validPlan, "action.slack.postMessage")).toBe(true)
      expect(hasStepType(validPlan, "action.http.request")).toBe(true)
      expect(hasStepType(validPlan, "custom.action")).toBe(true)
      expect(hasStepType(validPlan, "nonexistent.step")).toBe(false)
    })

    it("should get all used step types", () => {
      const usedTypes = getUsedStepTypes(validPlan)

      expect(usedTypes).toContain("trigger.http")
      expect(usedTypes).toContain("filter")
      expect(usedTypes).toContain("branch")
      expect(usedTypes).toContain("action.slack.postMessage")
      expect(usedTypes).toContain("action.http.request")
      expect(usedTypes).toContain("custom.action")
      expect(usedTypes).toHaveLength(6)
    })

    it("should count total steps including nested", () => {
      const totalSteps = countTotalSteps(validPlan)

      // 1 trigger + 1 filter + 1 branch + nested steps
      // Branch has 2 cases with multiple steps each + else clause
      expect(totalSteps).toBeGreaterThan(3)
      expect(typeof totalSteps).toBe("number")
    })

    it("should handle plans without branch steps", () => {
      const simplePlan: Plan = {
        version: "1",
        name: "Simple Plan",
        steps: [
          {
            type: "trigger.http",
            path: "/webhook/simple",
            secretHmac: false
          },
          {
            type: "action.slack.postMessage",
            channel: "#general",
            text: "Simple message"
          }
        ]
      }

      expect(hasStepType(simplePlan, "branch")).toBe(false)
      expect(getUsedStepTypes(simplePlan)).toEqual(["trigger.http", "action.slack.postMessage"])
      expect(countTotalSteps(simplePlan)).toBe(2)
    })
  })
})