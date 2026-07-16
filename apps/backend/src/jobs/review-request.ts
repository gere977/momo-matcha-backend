import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { publicOrderNumber } from "../utils/order-number"
import { isMarketingEmailSuppressed } from "../utils/email-preferences"
import { lifecycleEmailJobsEnabled } from "../utils/lifecycle-email-jobs"

const STORE_URL = "https://momomatcha.hu"
const WAIT_DAYS = 5 // days after the order was shipped
const MAX_AGE_DAYS = 30

// Asks customers for a product review a few days after their order shipped.
// Runs daily; each order is asked exactly once (metadata.review_request_sent).
// This is how the storefront's review section fills up with REAL reviews.
export default async function reviewRequestJob(container: MedusaContainer) {
  if (!lifecycleEmailJobsEnabled()) return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)
  const orderModuleService = container.resolve(Modules.ORDER) as any

  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - MAX_AGE_DAYS)

  const { data: orders } = await query.graph({
    entity: "order",
    filters: { created_at: { $gte: windowStart.toISOString() } } as any,
    fields: [
      "id",
      "display_id",
      "email",
      "status",
      "metadata",
      "fulfillments.shipped_at",
      "items.product_id",
      "items.product_handle",
      "items.product_title",
      "items.title",
    ],
  })

  const now = Date.now()
  const cutoff = WAIT_DAYS * 24 * 60 * 60 * 1000

  const due = (orders as any[]).filter((o) => {
    if (o.status === "canceled" || !o.email) return false
    if (o.metadata?.review_request_sent) return false
    if (o.metadata?.review_request_suppressed_at) return false
    const fulfillments = o.fulfillments ?? []
    if (!fulfillments.length || fulfillments.some((f: any) => !f?.shipped_at)) {
      return false
    }
    const shippedAt = Math.max(
      ...fulfillments.map((f: any) => new Date(f.shipped_at).getTime())
    )
    return shippedAt != null && now - shippedAt >= cutoff
  })

  for (const order of due) {
    try {
      if (await isMarketingEmailSuppressed(container, order.email)) {
        await orderModuleService.updateOrders(order.id, {
          metadata: {
            ...(order.metadata ?? {}),
            review_request_suppressed_at: new Date().toISOString(),
          },
        })
        continue
      }

      const products = (order.items ?? [])
        .filter((i: any) => i.product_id)
        .map((i: any) => ({
          title: i.product_title ?? i.title,
          url: i.product_handle
            ? `${STORE_URL}/hu/products/${i.product_handle}?utm_source=email&utm_medium=email&utm_campaign=review_request#velemenyek`
            : `${STORE_URL}/hu/store?utm_source=email&utm_medium=email&utm_campaign=review_request`,
        }))

      if (!products.length) continue

      await notificationModuleService.createNotifications({
        to: order.email,
        channel: "email",
        template: "review-request",
        data: {
          subject: "Hogy ízlett a matchád? 🍵 Mondd el pár szóban!",
          idempotency_key: `review-request:${order.id}`,
          order_number: publicOrderNumber(order.display_id),
          products,
        },
      })

      await orderModuleService.updateOrders(order.id, {
        metadata: {
          ...(order.metadata ?? {}),
          review_request_sent: new Date().toISOString(),
        },
      })

      logger.info(
        `[review-request] Sent review request for order ${order.display_id} to ${order.email}`
      )
    } catch (e: any) {
      logger.error(
        `[review-request] Failed for order ${order.display_id}: ${e?.message}`
      )
    }
  }
}

export const config = {
  name: "review-request",
  // Daily at 10:00 — reviews get written when people are awake.
  schedule: "0 10 * * *",
}
