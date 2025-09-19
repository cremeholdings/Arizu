import type { LLMProvider } from "../index"

export const anthropicProvider: LLMProvider = {
  name: "anthropic",

  async generateResponse(systemPrompt: string, userPrompt: string): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY

    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required")
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.1,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data = await response.json()

    if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
      throw new Error("Invalid response format from Anthropic API")
    }

    const textContent = data.content.find((item: any) => item.type === "text")
    if (!textContent) {
      throw new Error("No text content found in Anthropic API response")
    }

    return textContent.text
  },
}