import { model } from "@medusajs/framework/utils"

// AI-generated marketing image, stored as base64 so it survives container
// restarts (no S3 configured). Served publicly via GET /marketing-assets/:id —
// Instagram's publishing API fetches the image from that URL. Pruned after
// 30 days by the nightly cleanup job.
export const MarketingAsset = model.define("marketing_asset", {
  id: model.id().primaryKey(),
  data: model.text(), // base64 image bytes
  media_type: model.text(),
  prompt: model.text().nullable(),
})
