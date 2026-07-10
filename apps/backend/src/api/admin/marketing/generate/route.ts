import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CLAUDE_MODEL, extractText, getAnthropic } from "../../../../utils/ai-studio"

type Body = {
  channel?: string
  topic?: string
  product_title?: string
  notes?: string
}

const CHANNEL_BRIEFS: Record<string, string> = {
  instagram:
    "Írj 3 különböző Instagram-poszt szöveget (caption). Mindegyik: erős első sor (hook), 2-4 rövid bekezdés vagy sorokra tördelt szöveg, 1-2 illő emoji, végén 5-8 releváns magyar+angol hashtag (#matcha #matchalatte stb.) és egy CTA a momomatcha.hu-ra. Jelöld: 'A verzió', 'B verzió', 'C verzió'.",
  tiktok:
    "Írj 3 rövid TikTok/Reels videó-forgatókönyvet. Mindegyik: hook (első 2 másodperc szövege), 3-5 jelenet leírása (mit látunk + felirat szövege), és a videó caption-je hashtagekkel. A formátum legyen könnyen leforgatható egy telefonnal, kellék: matcha, habverő, csésze.",
  facebook:
    "Írj 2 Facebook-poszt szöveget: egy sztorizósabb, hosszabb verziót és egy rövid, akció-fókuszút. Barátságos magyar hangnem, 1-2 emoji, CTA link a momomatcha.hu-ra.",
  blog:
    "Írj egy teljes, SEO-ra optimalizált magyar blogcikket (600-900 szó) markdown formátumban: H1 cím, bevezető, H2/H3 alcímek, gyakorlati tippek, és a végén rövid GYIK szekció (3 kérdés). Természetesen szője bele a releváns kulcsszavakat (matcha, matcha latte, matcha készítés, bio matcha), és 1-2 helyen linkeljen a momomatcha.hu termékoldalaira.",
  email:
    "Írj egy hírlevél e-mailt: tárgysor (3 variáció), preheader, majd az e-mail törzse magyarul — rövid, meleg hangvételű, egyetlen fő CTA gombbal ('Irány a bolt'). Cél: visszahozni a feliratkozókat vásárolni.",
  "google-ads":
    "Írj Google Ads kereső hirdetéseket: 8 headline (max 30 karakter) és 4 description (max 90 karakter), magyarul, a matcha / matcha rendelés / bio matcha kulcsszavakra. Tartsd be szigorúan a karakterlimiteket.",
}

const SYSTEM = `Te a Momo Matcha (momomatcha.hu) marketing szövegírója vagy.
A MÁRKA: prémium, bio, ceremonial matcha Japánból, Uji vidékéről. Klasszikus és ízesített matchák (Original, Epres, Csokoládés; hamarosan Vaníliás és Őszibarackos), Matcha Szett kiegészítő. Fiatalos, genZ-s, de igényes magyar hangnem: tegeződés, playful de nem gagyi, 1-2 emoji belefér. Kulcsüzenetek: nyugodt fókusz (L-teanin), kávé-alternatíva délutáni összeomlás nélkül, lassú élet rituáléi, prémium Uji minőség.
SZABÁLYOK: Ne találj ki árakat, akciókat vagy készletinformációt. Ne ígérj egészségügyi gyógyhatást (EU szabályok) — fogalmazz óvatosan ("sokan úgy érzik", "hozzájárulhat"). Minden szöveg magyarul készüljön.`

// POST /admin/marketing/generate — Claude writes channel-specific Hungarian
// marketing content (social posts, blog, ads, email) for driving site traffic.
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const { channel = "instagram", topic, product_title, notes } = req.body ?? {}

  const channelBrief = CHANNEL_BRIEFS[channel]
  if (!channelBrief) {
    res.status(400).json({ message: "Ismeretlen csatorna." })
    return
  }

  if (!topic && !product_title) {
    res.status(400).json({ message: "Adj meg témát vagy válassz terméket." })
    return
  }

  try {
    const client = getAnthropic()
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 3000,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content:
            `${channelBrief}\n\n` +
            (topic ? `Téma: ${topic}\n` : "") +
            (product_title ? `Kiemelt termék: ${product_title}\n` : "") +
            (notes ? `További kérés: ${notes}\n` : "") +
            `\nHa linkelsz, használj UTM paramétereket ebben a formában: ` +
            `https://momomatcha.hu/?utm_source=${channel}&utm_medium=social&utm_campaign=SLUG ` +
            `(a SLUG legyen a téma rövid, ékezet nélküli azonosítója) — így a admin Statisztika oldalon mérhető lesz a kampány.`,
        },
      ],
    })

    res.json({ content: extractText(response.content) })
  } catch (e: any) {
    res
      .status(500)
      .json({ message: e?.message ?? "Ismeretlen hiba a generálás közben." })
  }
}
