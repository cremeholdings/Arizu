import type { LLMProvider } from "../index"

export const openaiProvider: LLMProvider = {
  name: "openai",

  async generateResponse(systemPrompt: string, userPrompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required")
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
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
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data = await response.json()

    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      throw new Error("Invalid response format from OpenAI API")
    }

    const choice = data.choices[0]
    if (!choice.message || !choice.message.content) {
      throw new Error("No content found in OpenAI API response")
    }

    return choice.message.content
  },
}