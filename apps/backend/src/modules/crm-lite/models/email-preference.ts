import { model } from "@medusajs/framework/utils"

// Durable marketing-email preference. Transactional messages (order status,
// password reset) deliberately ignore this flag, while every lifecycle or
// promotional sender checks it before enqueueing a notification.
export const EmailPreference = model.define("email_preference", {
  id: model.id().primaryKey(),
  email: model.text(),
  marketing_suppressed: model.boolean().default(false),
  unsubscribed_at: model.dateTime().nullable(),
  source: model.text().nullable(),
  reason: model.text().nullable(),
})
