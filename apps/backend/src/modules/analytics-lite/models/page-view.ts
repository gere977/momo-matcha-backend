import { model } from "@medusajs/framework/utils"

// One row per storefront pageview/event - kept deliberately minimal (no IP,
// no UA) so it stays GDPR-friendly: session_id is a random client token.
// `event` distinguishes funnel steps ("page_view", "add_to_cart") and the
// utm_* columns capture campaign attribution from landing URLs.
export const PageView = model.define("page_view", {
  id: model.id().primaryKey(),
  path: model.text(),
  referrer: model.text().nullable(),
  session_id: model.text().nullable(),
  country: model.text().nullable(),
  event: model.text().default("page_view"),
  event_id: model.text().nullable(),
  order_id: model.text().nullable(),
  value: model.number().nullable(),
  currency: model.text().nullable(),
  utm_source: model.text().nullable(),
  utm_medium: model.text().nullable(),
  utm_campaign: model.text().nullable(),
})
