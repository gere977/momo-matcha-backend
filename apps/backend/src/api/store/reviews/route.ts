import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CRM_LITE_MODULE } from "../../../modules/crm-lite"

// Simple per-IP throttle for review submissions.
const RATE_LIMIT = 5 // submissions / 10 minutes / ip
const RATE_WINDOW_MS = 10 * 60_000
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  if (rateBuckets.size > 5000) {
    rateBuckets.forEach((bucket, key) => {
      if (bucket.resetAt < now) rateBuckets.delete(key)
    })
  }
  const bucket = rateBuckets.get(ip)
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  bucket.count++
  return bucket.count > RATE_LIMIT
}

// GET /store/reviews?product_id=&limit= — approved reviews, newest first,
// plus the aggregate (average, count) used for JSON-LD and the home page.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const crm = req.scope.resolve(CRM_LITE_MODULE) as any

  const productId = req.query.product_id as string | undefined
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)

  const filters: Record<string, unknown> = { status: "approved" }
  if (productId) {
    filters.product_id = productId
  }

  const [reviews, count] = await crm.listAndCountReviews(filters, {
    select: ["id", "name", "rating", "text", "product_title", "created_at"],
    order: { created_at: "DESC" },
    take: limit,
  })

  // Average over ALL approved reviews in scope, not just the returned page.
  let average: number | null = null
  if (count > 0) {
    const all: { rating: number }[] = await crm.listReviews(filters, {
      select: ["rating"],
      take: 10000,
    })
    average =
      Math.round(
        (all.reduce((sum, r) => sum + (r.rating ?? 0), 0) / all.length) * 10
      ) / 10
  }

  res.json({ reviews, count, average })
}

// POST /store/reviews — creates a PENDING review; it only becomes public
// after approval in the admin (Vélemények page).
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  if (isRateLimited(ip)) {
    res.status(429).json({ message: "Túl sok értékelés — próbáld később." })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>

  const productId = String(body.product_id ?? "").trim()
  const name = String(body.name ?? "").trim().slice(0, 80)
  const email = String(body.email ?? "").trim().slice(0, 254)
  const text = String(body.text ?? "").trim().slice(0, 1000)
  const rating = Math.round(Number(body.rating))

  if (!productId || !name || !text) {
    res.status(400).json({ message: "Hiányzó adatok (név, szöveg, termék)." })
    return
  }
  if (text.length < 10) {
    res.status(400).json({ message: "Írj legalább pár szót a véleményedbe." })
    return
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ message: "Az értékelés 1 és 5 csillag között lehet." })
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ message: "Érvénytelen e-mail cím." })
    return
  }

  // Denormalize the product title for display; also validates product_id.
  const productModule = req.scope.resolve("product") as any
  let productTitle: string | null = null
  try {
    const product = await productModule.retrieveProduct(productId, {
      select: ["id", "title"],
    })
    productTitle = product?.title ?? null
  } catch {
    res.status(400).json({ message: "Ismeretlen termék." })
    return
  }

  const crm = req.scope.resolve(CRM_LITE_MODULE) as any
  await crm.createReviews({
    product_id: productId,
    product_title: productTitle,
    order_id: body.order_id ? String(body.order_id).slice(0, 64) : null,
    email,
    name,
    rating,
    text,
    status: "pending",
  })

  res.status(201).json({
    ok: true,
    message: "Köszönjük! A véleményed jóváhagyás után jelenik meg az oldalon.",
  })
}
