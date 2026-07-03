import { model } from "@medusajs/framework/utils"

// One row per storefront pageview - kept deliberately minimal (no IP, no UA)
// so it stays GDPR-friendly: session_id is a random client-generated token.
export const PageView = model.define("page_view", {
  id: model.id().primaryKey(),
  path: model.text(),
  referrer: model.text().nullable(),
  session_id: model.text().nullable(),
  country: model.text().nullable(),
})
