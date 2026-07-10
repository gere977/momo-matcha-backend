import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CRM_LITE_MODULE } from "../../../modules/crm-lite"

// GET /admin/reviews?status=pending — review moderation list.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const crm = req.scope.resolve(CRM_LITE_MODULE) as any

  const status = req.query.status as string | undefined
  const filters: Record<string, unknown> = {}
  if (status && ["pending", "approved", "rejected"].includes(status)) {
    filters.status = status
  }

  const [reviews, count] = await crm.listAndCountReviews(filters, {
    order: { created_at: "DESC" },
    take: Math.min(Number(req.query.limit) || 50, 200),
  })

  res.json({ reviews, count })
}
