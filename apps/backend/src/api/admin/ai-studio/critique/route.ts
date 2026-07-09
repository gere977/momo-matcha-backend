import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type Anthropic from "@anthropic-ai/sdk"
import {
  CLAUDE_MODEL,
  extractText,
  getAnthropic,
} from "../../../../utils/ai-studio"

type Body = {
  product_title?: string
  brief?: string
  prompt?: string
  images?: { id: string; b64: string; media_type?: string }[]
}

const ALLOWED_MEDIA = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])

// Vision re-evaluation step: Claude scores each generated variant against the
// brief and proposes an improved prompt for the next round.
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const { product_title, brief, prompt, images } = req.body ?? {}

  if (!images?.length) {
    res.status(400).json({ message: "Nincs értékelendő kép (images)." })
    return
  }

  try {
    const client = getAnthropic()

    const content: Anthropic.ContentBlockParam[] = []
    for (const img of images) {
      const mediaType = ALLOWED_MEDIA.has(img.media_type ?? "")
        ? (img.media_type as "image/jpeg" | "image/png" | "image/webp" | "image/gif")
        : "image/jpeg"
      content.push({ type: "text", text: `Kép azonosító: ${img.id}` })
      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: img.b64 },
      })
    }
    content.push({
      type: "text",
      text:
        `Ezek AI-generált termékkép-változatok ehhez: "${product_title ?? "matcha termék"}" ` +
        `(Momo Matcha, prémium magyar matcha webshop, japán-minimalista stílus).` +
        (brief ? `\n\nA stílus brief, amihez képest értékelj:\n${brief}` : "") +
        (prompt ? `\n\nAz image prompt, amiből készültek:\n${prompt}` : "") +
        "\n\nÉrtékeld mindegyik képet webshop-termékfotóként: kompozíció, hitelesség " +
        "(műanyagnak/AI-nak néz-e ki), színek a briefhez képest, torzulások (szöveg, kezek, " +
        "logók, fizikai hibák), és hogy kitehető-e egy prémium webshopba. " +
        "Az `summary` és `issues` mezők magyarul legyenek. Az `improved_prompt` egy teljes, " +
        "angol nyelvű FLUX image prompt legyen, ami a hibákat javítja.",
    })

    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    score: { type: "integer", description: "1-10" },
                    usable: { type: "boolean" },
                    summary: { type: "string" },
                    issues: { type: "array", items: { type: "string" } },
                  },
                  required: ["id", "score", "usable", "summary", "issues"],
                  additionalProperties: false,
                },
              },
              best_id: {
                type: ["string", "null"],
                description: "The id of the best usable image, or null.",
              },
              improved_prompt: { type: "string" },
            },
            required: ["results", "best_id", "improved_prompt"],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: "user", content }],
    })

    res.json(JSON.parse(extractText(response.content)))
  } catch (e: any) {
    res
      .status(500)
      .json({ message: e?.message ?? "Ismeretlen hiba az értékelés közben." })
  }
}
