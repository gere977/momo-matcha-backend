import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ANALYTICS_LITE_MODULE } from "../../../modules/analytics-lite"

// Storefront pageview beacon. Publishable-key protected like every /store route.
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>

  const path = String(body.path ?? "").slice(0, 512)
  if (!path.startsWith("/")) {
    res.status(400).json({ message: "path required" })
    return
  }

  const analytics = req.scope.resolve(ANALYTICS_LITE_MODULE) as any

  await analytics.createPageViews({
    path,
    referrer: body.referrer ? String(body.referrer).slice(0, 512) : null,
    session_id: body.session_id ? String(body.session_id).slice(0, 64) : null,
    country: body.country ? String(body.country).slice(0, 8) : null,
  })

  res.status(201).json({ ok: true })
}
