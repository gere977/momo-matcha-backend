import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CRM_LITE_MODULE } from "../../../modules/crm-lite"

// GET /admin/waitlist — newsletter + flavor-waitlist signups for the admin
// "Feliratkozók" page (list + CSV export).
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const crm = req.scope.resolve(CRM_LITE_MODULE) as any

  const [signups, count] = await crm.listAndCountWaitlistSignups(
    {},
    {
      select: ["id", "email", "source", "confirmed_at", "created_at"],
      order: { created_at: "DESC" },
      take: Math.min(Number(req.query.limit) || 500, 5000),
    }
  )
  const suppressed = new Set<string>()
  const pageSize = 500
  let skip = 0
  while (true) {
    const page = await crm.listEmailPreferences(
      { marketing_suppressed: true },
      { select: ["email"], order: { created_at: "ASC" }, take: pageSize, skip }
    )
    for (const preference of page as any[]) {
      suppressed.add(String(preference.email ?? "").trim().toLowerCase())
    }
    skip += page.length
    if (page.length < pageSize) break
  }

  res.json({
    signups: (signups as any[]).map((signup) => ({
      ...signup,
      marketing_suppressed: suppressed.has(
        String(signup.email ?? "").trim().toLowerCase()
      ),
    })),
    count,
  })
}
