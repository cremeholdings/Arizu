import type { LLMProvider } from "../index"

export const mistralProvider: LLMProvider = {
  name: "mistral",

  async generateResponse(systemPrompt: string, userPrompt: string): Promise<string> {
    const apiKey = process.env.MISTRAL_API_KEY

    if (!apiKey) {
      throw new Error("MISTRAL_API_KEY environment variable is required")
    }

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "mistral-large-latest",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
        response_format: { type: "json_object" },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Mistral API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data = await response.json()

    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      throw new Error("Invalid response format from Mistral API")
    }

    const choice = data.choices[0]
    if (!choice.message || !choice.message.content) {
      throw new Error("No content found in Mistral API response")
    }

    return choice.message.content
  },
}