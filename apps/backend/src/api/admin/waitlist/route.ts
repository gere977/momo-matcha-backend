import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CRM_LITE_MODULE } from "../../../modules/crm-lite"

// GET /admin/waitlist — newsletter + flavor-waitlist signups for the admin
// "Feliratkozók" page (list + CSV export).
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const crm = req.scope.resolve(CRM_LITE_MODULE) as any

  const [signups, count] = await crm.listAndCountWaitlistSignups(
    {},
    {
      select: ["id", "email", "source", "created_at"],
      order: { created_at: "DESC" },
      take: Math.min(Number(req.query.limit) || 500, 5000),
    }
  )

  res.json({ signups, count })
}
