import { readFileSync } from "fs"
import { join } from "path"
import { validatePlanWithErrors, type Plan } from "@/lib/plan/schema"
import { anthropicProvider } from "./providers/anthropic"
import { openaiProvider } from "./providers/openai"
import { googleProvider } from "./providers/google"
import { mistralProvider } from "./providers/mistral"

export interface LLMProvider {
  name: string
  generateResponse(systemPrompt: string, userPrompt: string): Promise<string>
}

export interface PlanFromPromptOptions {
  prompt: string
  orgId: string
  maxRetries?: number
}

export interface PlanFromPromptResult {
  success: boolean
  plan?: Plan
  errors?: string[]
  attempts?: number
}

// Load system prompt
const systemPrompt = readFileSync(
  join(process.cwd(), "lib/llm/system-prompts/planner.txt"),
  "utf-8"
)

// Provider registry
const providers: Record<string, LLMProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  google: googleProvider,
  mistral: mistralProvider,
}

function getProvider(): LLMProvider {
  const providerName = process.env.MODEL_PROVIDER || "anthropic"
  const provider = providers[providerName]

  if (!provider) {
    throw new Error(`Unknown MODEL_PROVIDER: ${providerName}. Available providers: ${Object.keys(providers).join(", ")}`)
  }

  return provider
}

export function jsonTool(content: string): string {
  return `${content}\n\nYou must return ONLY valid JSON matching the Plan schema. No prose, explanations, or markdown. Just the JSON object.`
}

function extractJsonFromResponse(response: string): string {
  // Try to extract JSON from response that might contain markdown or other text
  const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
  if (jsonMatch) {
    return jsonMatch[1]
  }

  // Look for JSON object in the response
  const trimmed = response.trim()
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed
  }

  // Try to find JSON between curly braces
  const braceMatch = response.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    return braceMatch[0]
  }

  return response
}

function redactPrompt(prompt: string): string {
  // Redact common sensitive patterns for logging
  return prompt
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL]")
    .replace(/\b(?:sk|pk)_[a-zA-Z0-9]{32,}\b/g, "[API_KEY]")
    .replace(/\b(?:Bearer\s+)[a-zA-Z0-9_-]+/g, "Bearer [TOKEN]")
}

export async function planFromPrompt({
  prompt,
  orgId,
  maxRetries = 3
}: PlanFromPromptOptions): Promise<PlanFromPromptResult> {
  const provider = getProvider()
  let lastErrors: string[] = []

  console.log("Generating plan", {
    provider: provider.name,
    orgId: orgId.slice(0, 8) + "...", // Redact org ID
    promptLength: prompt.length,
    promptPreview: redactPrompt(prompt.slice(0, 100)) + "...",
  })

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Build user prompt with retry feedback if needed
      let userPrompt = prompt
      if (attempt > 1 && lastErrors.length > 0) {
        userPrompt = `${prompt}

Previous attempt failed validation with these errors:
${lastErrors.map(e => `- ${e}`).join("\n")}

Please fix these issues and return valid JSON.`
      }

      const enhancedPrompt = jsonTool(userPrompt)

      console.log(`Plan generation attempt ${attempt}/${maxRetries}`, {
        orgId: orgId.slice(0, 8) + "...",
        provider: provider.name,
        promptLength: enhancedPrompt.length,
      })

      const response = await provider.generateResponse(systemPrompt, enhancedPrompt)

      // Extract JSON from response
      const jsonString = extractJsonFromResponse(response)

      // Parse JSON
      let parsedPlan: unknown
      try {
        parsedPlan = JSON.parse(jsonString)
      } catch (parseError) {
        lastErrors = [`Invalid JSON format: ${parseError instanceof Error ? parseError.message : "Unknown error"}`]
        console.warn(`JSON parse failed on attempt ${attempt}`, {
          orgId: orgId.slice(0, 8) + "...",
          error: parseError instanceof Error ? parseError.message : "Unknown error",
          responsePreview: response.slice(0, 200) + "...",
        })
        continue
      }

      // Validate against schema
      const validation = validatePlanWithErrors(parsedPlan)

      if (validation.valid) {
        console.log(`Plan generated successfully on attempt ${attempt}`, {
          orgId: orgId.slice(0, 8) + "...",
          planName: validation.data?.name,
          stepCount: validation.data?.steps.length,
        })

        return {
          success: true,
          plan: validation.data!,
          attempts: attempt,
        }
      } else {
        lastErrors = validation.errors
        console.warn(`Plan validation failed on attempt ${attempt}`, {
          orgId: orgId.slice(0, 8) + "...",
          errors: validation.errors,
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      lastErrors = [`Provider error: ${errorMessage}`]

      console.error(`Plan generation error on attempt ${attempt}`, {
        orgId: orgId.slice(0, 8) + "...",
        provider: provider.name,
        error: errorMessage,
      })
    }
  }

  console.error(`Plan generation failed after ${maxRetries} attempts`, {
    orgId: orgId.slice(0, 8) + "...",
    provider: provider.name,
    finalErrors: lastErrors,
  })

  return {
    success: false,
    errors: lastErrors.length > 0 ? lastErrors : ["Failed to generate valid plan"],
    attempts: maxRetries,
  }
}

// Helper to check if all required environment variables are set
export function validateEnvironment(): { valid: boolean; missing: string[] } {
  const providerName = process.env.MODEL_PROVIDER || "anthropic"
  const required: Record<string, string[]> = {
    anthropic: ["ANTHROPIC_API_KEY"],
    openai: ["OPENAI_API_KEY"],
    google: ["GOOGLE_API_KEY"],
    mistral: ["MISTRAL_API_KEY"],
  }

  const requiredVars = required[providerName] || []
  const missing = requiredVars.filter(envVar => !process.env[envVar])

  return {
    valid: missing.length === 0,
    missing,
  }
}