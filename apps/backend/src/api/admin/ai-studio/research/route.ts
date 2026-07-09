import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  CLAUDE_MODEL,
  createWithPauseTurnRetry,
  extractText,
  getAnthropic,
} from "../../../../utils/ai-studio"

type Body = {
  product_title?: string
  description?: string
  notes?: string
}

// Web research step: Claude searches similarly themed shops / packaging trends
// and returns a Hungarian style brief the merchant can edit before generating.
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const { product_title, description, notes } = req.body ?? {}

  if (!product_title) {
    res.status(400).json({ message: "Hiányzó terméknév (product_title)." })
    return
  }

  try {
    const client = getAnthropic()

    const response = await createWithPauseTurnRetry(client, {
      model: CLAUDE_MODEL,
      max_tokens: 6000,
      thinking: { type: "adaptive" },
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: 5,
        },
      ],
      system:
        "A Momo Matcha (magyar prémium matcha webshop, momomatcha.hu) kreatív asszisztense vagy. " +
        "A webshop stílusa: japán minimalizmus, természetes matcha-zöld (#6A8D53), kraft papír textúrák, " +
        "letisztult, prémium megjelenés. Magyarul válaszolj.",
      messages: [
        {
          role: "user",
          content:
            `Termékfotót / termékképet szeretnék generálni ehhez a termékhez: "${product_title}".` +
            (description ? `\nTermékleírás: ${description}` : "") +
            (notes ? `\nSaját megjegyzéseim: ${notes}` : "") +
            "\n\nKeress a weben hasonló témájú webshopokat, matcha/tea brandeket, csomagolás- és " +
            "termékfotó-trendeket. Ezek alapján írj egy tömör, magyar nyelvű STÍLUS BRIEFET a " +
            "képgeneráláshoz, az alábbi szerkezetben:\n" +
            "1. Hangulat / mood (2-3 mondat)\n" +
            "2. Színpaletta (konkrét színek)\n" +
            "3. Kompozíció és háttér (mi legyen a képen, milyen szögből, milyen props)\n" +
            "4. Fény és stílus (pl. natural light, editorial, minimalist)\n" +
            "5. Amit kerülni kell\n" +
            "6. Röviden: milyen inspirációkat találtál a weben (2-3 pont)\n\n" +
            "A brief legyen konkrét és képgenerálásra használható, ne általános marketing szöveg.",
        },
      ],
    })

    const brief = extractText(response.content)
    if (!brief) {
      res.status(502).json({
        message: "A kutatás nem adott eredményt. Próbáld újra.",
      })
      return
    }

    res.json({ brief })
  } catch (e: any) {
    res.status(500).json({ message: e?.message ?? "Ismeretlen hiba a kutatás közben." })
  }
}
