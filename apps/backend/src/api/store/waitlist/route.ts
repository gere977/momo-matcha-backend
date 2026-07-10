import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CRM_LITE_MODULE } from "../../../modules/crm-lite"

const RATE_LIMIT = 10 // signups / 10 minutes / ip
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

// POST /store/waitlist — email capture for upcoming flavors / restock alerts.
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  if (isRateLimited(ip)) {
    res.status(429).json({ message: "Túl sok próbálkozás — próbáld később." })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254)
  const source = body.source ? String(body.source).slice(0, 120) : null

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ message: "Érvénytelen e-mail cím." })
    return
  }

  const crm = req.scope.resolve(CRM_LITE_MODULE) as any

  // Dedupe: same email + source only once.
  const existing = await crm.listWaitlistSignups(
    { email, ...(source ? { source } : {}) },
    { select: ["id"], take: 1 }
  )
  if (!existing.length) {
    await crm.createWaitlistSignups({ email, source })
  }

  res.status(201).json({ ok: true, message: "Szólunk, amint érkezik! 🍵" })
}
