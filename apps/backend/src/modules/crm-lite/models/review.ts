import { model } from "@medusajs/framework/utils"

// Customer product review. Reviews are created as "pending" from the
// storefront and only shown publicly after admin approval — this is the
// moderation gate that keeps the review section spam-free and honest.
export const Review = model.define("product_review", {
  id: model.id().primaryKey(),
  product_id: model.text(),
  // Denormalized for display (home page cards) without a product join.
  product_title: model.text().nullable(),
  order_id: model.text().nullable(),
  email: model.text(),
  name: model.text(),
  rating: model.number(),
  text: model.text(),
  status: model.enum(["pending", "approved", "rejected"]).default("pending"),
})
