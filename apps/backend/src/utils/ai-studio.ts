import Anthropic from "@anthropic-ai/sdk"
import { InferenceClient } from "@huggingface/inference"

export const CLAUDE_MODEL = "claude-opus-4-8"
export const IMAGE_MODEL = "black-forest-labs/FLUX.1-schnell"

export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY nincs beállítva a szerveren (Railway Variables)."
    )
  }
  return new Anthropic()
}

export function getHf(): InferenceClient {
  if (!process.env.HF_TOKEN) {
    throw new Error("HF_TOKEN nincs beállítva a szerveren (Railway Variables).")
  }
  return new InferenceClient(process.env.HF_TOKEN)
}

// Concatenates the text blocks of a Claude response (skips thinking blocks).
export function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim()
}

// Server-side tools (web search) can stop with `pause_turn` before finishing;
// the API resumes when the assistant turn is sent back unchanged.
export async function createWithPauseTurnRetry(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  maxContinuations = 4
): Promise<Anthropic.Message> {
  let messages = [...params.messages]
  let response = await client.messages.create({ ...params, messages })

  let continuations = 0
  while (response.stop_reason === "pause_turn" && continuations < maxContinuations) {
    messages = [...messages, { role: "assistant", content: response.content }]
    response = await client.messages.create({ ...params, messages })
    continuations++
  }

  return response
}

export type GeneratedImage = {
  id: string
  b64: string
  media_type: string
}

// Text-to-image via Hugging Face Inference Providers (provider auto-routing).
export async function generateImages(
  prompt: string,
  count: number
): Promise<GeneratedImage[]> {
  const hf = getHf()
  const tasks = Array.from({ length: count }, async (_, i) => {
    const blob = (await hf.textToImage(
      { model: IMAGE_MODEL, inputs: prompt },
      { outputType: "blob" }
    )) as Blob
    const buffer = Buffer.from(await blob.arrayBuffer())
    return {
      id: `img_${Date.now()}_${i}`,
      b64: buffer.toString("base64"),
      media_type: blob.type || "image/jpeg",
    }
  })
  return Promise.all(tasks)
}
