import type { LLMProvider } from "../index"

export const googleProvider: LLMProvider = {
  name: "google",

  async generateResponse(systemPrompt: string, userPrompt: string): Promise<string> {
    const apiKey = process.env.GOOGLE_API_KEY

    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY environment variable is required")
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${systemPrompt}\n\nUser request: ${userPrompt}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
          },
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Google API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data = await response.json()

    if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
      throw new Error("Invalid response format from Google API")
    }

    const candidate = data.candidates[0]
    if (!candidate.content || !candidate.content.parts || !Array.isArray(candidate.content.parts)) {
      throw new Error("No content found in Google API response")
    }

    const textPart = candidate.content.parts.find((part: any) => part.text)
    if (!textPart) {
      throw new Error("No text content found in Google API response")
    }

    return textPart.text
  },
}