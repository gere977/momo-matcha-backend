import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ANALYTICS_LITE_MODULE } from "../../../modules/analytics-lite"

// Events the storefront beacon is allowed to record. "page_view" is the
// default; the rest are funnel steps fired by the storefront.
const ALLOWED_EVENTS = new Set([
  "page_view",
  "product_click",
  "flavor_finder_complete",
  "add_to_cart",
  "bundle_add",
  "cart_cross_sell",
  "reorder",
  "begin_checkout",
  "purchase",
])

// Cheap per-IP throttle so a script can't flood the page_view table. The
// publishable key is public by definition, so it is not a protection here.
const RATE_LIMIT = 120 // events / minute / ip
const RATE_WINDOW_MS = 60_000
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  if (rateBuckets.size > 10_000) {
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

// Storefront pageview/event beacon. Publishable-key protected like every /store route.
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  if (isRateLimited(ip)) {
    res.status(429).json({ ok: false })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>

  const path = String(body.path ?? "").slice(0, 512)
  if (!path.startsWith("/")) {
    res.status(400).json({ message: "path required" })
    return
  }

  const event = String(body.event ?? "page_view")
  if (!ALLOWED_EVENTS.has(event)) {
    res.status(400).json({ message: "unknown event" })
    return
  }

  const str = (v: unknown, max: number) =>
    v ? String(v).slice(0, max) : null

  const analytics = req.scope.resolve(ANALYTICS_LITE_MODULE) as any

  const value = Number(body.value)
  const eventId = str(body.event_id, 160)

  if (eventId) {
    const existing = await analytics.listPageViews(
      { event_id: eventId },
      { select: ["id"], take: 1 }
    )
    if (existing.length) {
      res.status(200).json({ ok: true, duplicate: true })
      return
    }
  }

  try {
    await analytics.createPageViews({
      path,
      event,
      referrer: str(body.referrer, 512),
      session_id: str(body.session_id, 64),
      country: str(body.country, 8),
      event_id: eventId,
      order_id: str(body.order_id, 128),
      value: Number.isFinite(value) && value >= 0 ? value : null,
      currency: str(body.currency, 8)?.toLowerCase() ?? null,
      utm_source: str(body.utm_source, 128),
      utm_medium: str(body.utm_medium, 128),
      utm_campaign: str(body.utm_campaign, 128),
    })
  } catch (error) {
    // Two browser retries can pass the read check together. The unique index
    // is authoritative; if its winner is now visible, treat this as a normal
    // duplicate rather than surfacing a conversion-breaking 500.
    if (eventId) {
      const raced = await analytics.listPageViews(
        { event_id: eventId },
        { select: ["id"], take: 1 }
      )
      if (raced.length) {
        res.status(200).json({ ok: true, duplicate: true })
        return
      }
    }
    throw error
  }

  res.status(201).json({ ok: true })
}
