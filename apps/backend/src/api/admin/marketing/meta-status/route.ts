import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// GET /admin/marketing/meta-status — tells the Marketing page whether the
// Meta (Facebook/Instagram) connection is configured, so it can show either
// the publish controls or the setup instructions.
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.json({
    configured: Boolean(process.env.META_ACCESS_TOKEN),
    facebook: Boolean(
      process.env.META_ACCESS_TOKEN && process.env.META_PAGE_ID
    ),
    instagram: Boolean(
      process.env.META_ACCESS_TOKEN && process.env.META_IG_USER_ID
    ),
  })
}
