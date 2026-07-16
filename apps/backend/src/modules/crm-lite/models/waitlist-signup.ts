import { model } from "@medusajs/framework/utils"

// Email capture for upcoming flavors / restocks ("Értesíts, ha érkezik").
// `source` records what the visitor signed up for (e.g. "vanilias").
export const WaitlistSignup = model.define("waitlist_signup", {
  id: model.id().primaryKey(),
  email: model.text(),
  source: model.text().nullable(),
  confirmed_at: model.dateTime().nullable(),
  welcome_1_sent_at: model.dateTime().nullable(),
  welcome_2_sent_at: model.dateTime().nullable(),
  welcome_3_sent_at: model.dateTime().nullable(),
})
