import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CRM_LITE_MODULE } from "../../../modules/crm-lite"

// Public image endpoint for AI-generated marketing assets. Instagram's
// content-publishing API downloads the post image from a public URL — this
// is that URL. IDs are unguessable (Medusa ULIDs), content is marketing
// material by definition, so public exposure is intended.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const crm = req.scope.resolve(CRM_LITE_MODULE) as any

  let asset: { data: string; media_type: string } | undefined
  try {
    asset = await crm.retrieveMarketingAsset(req.params.id, {
      select: ["data", "media_type"],
    })
  } catch {
    // fall through to 404
  }

  if (!asset) {
    res.status(404).json({ message: "Not found" })
    return
  }

  const buffer = Buffer.from(asset.data, "base64")
  res.setHeader("Content-Type", asset.media_type || "image/jpeg")
  res.setHeader("Cache-Control", "public, max-age=86400")
  res.send(buffer)
}
