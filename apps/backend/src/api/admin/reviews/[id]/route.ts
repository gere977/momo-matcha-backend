import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CRM_LITE_MODULE } from "../../../../modules/crm-lite"

// POST /admin/reviews/:id — moderate: { status: "approved" | "rejected" }
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const status = (req.body as any)?.status
  if (!["approved", "rejected", "pending"].includes(status)) {
    res.status(400).json({ message: "Érvénytelen státusz." })
    return
  }

  const crm = req.scope.resolve(CRM_LITE_MODULE) as any
  await crm.updateReviews({ id: req.params.id, status })

  res.json({ ok: true })
}

// DELETE /admin/reviews/:id — remove a review entirely (e.g. spam).
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const crm = req.scope.resolve(CRM_LITE_MODULE) as any
  await crm.deleteReviews(req.params.id)
  res.json({ ok: true })
}
