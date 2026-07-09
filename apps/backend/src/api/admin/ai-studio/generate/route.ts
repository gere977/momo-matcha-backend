import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  CLAUDE_MODEL,
  extractText,
  generateImages,
  getAnthropic,
} from "../../../../utils/ai-studio"

type Body = {
  product_title?: string
  brief?: string
  image_prompt?: string
  count?: number
}

// Image generation step: Claude turns the (edited) brief into an English
// diffusion prompt, then FLUX.1-schnell renders N variants via Hugging Face.
// When `image_prompt` is provided (regeneration with the critique's improved
// prompt), the prompt-crafting call is skipped.
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const { product_title, brief, image_prompt } = req.body ?? {}
  const count = Math.min(Math.max(Number(req.body?.count) || 2, 1), 4)

  if (!product_title && !image_prompt) {
    res.status(400).json({ message: "Hiányzó terméknév (product_title)." })
    return
  }

  try {
    let prompt = image_prompt?.trim()

    if (!prompt) {
      const client = getAnthropic()
      const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        output_config: {
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                prompt: {
                  type: "string",
                  description:
                    "A single English text-to-image prompt for FLUX.1, max ~120 words.",
                },
              },
              required: ["prompt"],
              additionalProperties: false,
            },
          },
        },
        system:
          "You write prompts for the FLUX.1 text-to-image model. Output one polished English " +
          "prompt describing a premium e-commerce product photo. Be concrete about subject, " +
          "composition, background, lighting, color palette and style. Avoid any readable text " +
          "or logos in the image (diffusion models garble text). No camera brand names needed.",
        messages: [
          {
            role: "user",
            content:
              `Product: ${product_title} (premium Hungarian matcha shop, Japanese-minimalist ` +
              `brand, matcha green #6A8D53, kraft paper textures).` +
              (brief ? `\n\nStyle brief to follow:\n${brief}` : ""),
          },
        ],
      })

      const parsed = JSON.parse(extractText(response.content))
      prompt = String(parsed.prompt ?? "").trim()
    }

    if (!prompt) {
      res.status(502).json({ message: "Nem sikerült image promptot készíteni." })
      return
    }

    const images = await generateImages(prompt, count)
    res.json({ prompt, images })
  } catch (e: any) {
    res
      .status(500)
      .json({ message: e?.message ?? "Ismeretlen hiba a képgenerálás közben." })
  }
}
