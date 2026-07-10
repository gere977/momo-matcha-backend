import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  CLAUDE_MODEL,
  extractText,
  generateImages,
  getAnthropic,
} from "../../../../utils/ai-studio"
import { CRM_LITE_MODULE } from "../../../../modules/crm-lite"

type Body = {
  topic?: string
  product_title?: string
  notes?: string
  count?: number
}

function backendUrl() {
  return (
    process.env.MEDUSA_BACKEND_URL ?? "https://admin.momomatcha.hu"
  ).replace(/\/$/, "")
}

// POST /admin/marketing/generate-image — Claude crafts a social-media image
// prompt from the topic, FLUX renders variants, and each result is persisted
// as a marketing asset with a public URL (required for Instagram publishing).
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const { topic, product_title, notes } = req.body ?? {}
  const count = Math.min(Math.max(Number(req.body?.count) || 2, 1), 4)

  if (!topic && !product_title) {
    res.status(400).json({ message: "Adj meg témát vagy válassz terméket." })
    return
  }

  try {
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
        "You write prompts for the FLUX.1 text-to-image model, for SOCIAL MEDIA posts " +
        "(square 1:1 composition, thumb-stopping, lifestyle feel). Output one polished " +
        "English prompt. Be concrete about subject, composition, background, lighting, " +
        "color palette and style. Avoid any readable text or logos in the image " +
        "(diffusion models garble text).",
      messages: [
        {
          role: "user",
          content:
            `Brand: Momo Matcha — premium Hungarian matcha shop, Japanese-minimalist, ` +
            `playful genZ energy, matcha green #6A8D53, cream + kraft paper textures.` +
            (topic ? `\nPost topic: ${topic}` : "") +
            (product_title ? `\nFeatured product: ${product_title}` : "") +
            (notes ? `\nExtra request: ${notes}` : ""),
        },
      ],
    })

    const parsed = JSON.parse(extractText(response.content))
    const prompt = String(parsed.prompt ?? "").trim()
    if (!prompt) {
      res.status(502).json({ message: "Nem sikerült image promptot készíteni." })
      return
    }

    const images = await generateImages(prompt, count)

    const crm = req.scope.resolve(CRM_LITE_MODULE) as any
    const assets = await Promise.all(
      images.map(async (img) => {
        const created = await crm.createMarketingAssets({
          data: img.b64,
          media_type: img.media_type,
          prompt,
        })
        return {
          id: created.id as string,
          b64: img.b64,
          media_type: img.media_type,
          url: `${backendUrl()}/marketing-assets/${created.id}`,
        }
      })
    )

    res.json({ prompt, images: assets })
  } catch (e: any) {
    res
      .status(500)
      .json({ message: e?.message ?? "Ismeretlen hiba a képgenerálás közben." })
  }
}
