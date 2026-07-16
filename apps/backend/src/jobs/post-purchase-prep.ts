import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { isMarketingEmailSuppressed } from "../utils/email-preferences"
import { publicOrderNumber } from "../utils/order-number"
import { lifecycleEmailJobsEnabled } from "../utils/lifecycle-email-jobs"
import { containsMatchaProduct } from "../utils/matcha-products"

const STORE_URL = "https://momomatcha.hu"
const WAIT_HOURS = 20
const MAX_AGE_DAYS = 4

// A useful, non-discount post-purchase touch: customers receive the preparation
// guide while their order is being packed. Each order is processed once.
export default async function postPurchasePrepJob(container: MedusaContainer) {
  if (!lifecycleEmailJobsEnabled()) return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)
  const orderModuleService = container.resolve(Modules.ORDER) as any
  const now = Date.now()
  const windowStart = new Date(now - MAX_AGE_DAYS * 24 * 60 * 60 * 1000)
  const dueBefore = new Date(now - WAIT_HOURS * 60 * 60 * 1000)

  const { data: orders } = await query.graph({
    entity: "order",
    filters: {
      created_at: {
        $gte: windowStart.toISOString(),
        $lte: dueBefore.toISOString(),
      },
    } as any,
    fields: [
      "id",
      "display_id",
      "email",
      "status",
      "metadata",
      "items.product_handle",
    ],
  })

  for (const order of orders as any[]) {
    if (
      order.status === "canceled" ||
      !order.email ||
      !containsMatchaProduct(order.items)
    ) {
      continue
    }
    if (
      order.metadata?.post_purchase_prep_sent ||
      order.metadata?.post_purchase_prep_suppressed_at
    ) {
      continue
    }

    try {
      if (await isMarketingEmailSuppressed(container, order.email)) {
        await orderModuleService.updateOrders(order.id, {
          metadata: {
            ...(order.metadata ?? {}),
            post_purchase_prep_suppressed_at: new Date().toISOString(),
          },
        })
        continue
      }

      await notificationModuleService.createNotifications({
        to: order.email,
        channel: "email",
        template: "post-purchase-prep",
        data: {
          subject: "Így lesz igazán habos az első Momód 🍵",
          idempotency_key: `post-purchase-prep:${order.id}`,
          order_number: publicOrderNumber(order.display_id),
          guide_url: `${STORE_URL}/hu/tudastar/matcha-keszites?utm_source=email&utm_medium=email&utm_campaign=post_purchase_prep`,
        },
      })

      await orderModuleService.updateOrders(order.id, {
        metadata: {
          ...(order.metadata ?? {}),
          post_purchase_prep_sent: new Date().toISOString(),
        },
      })
      logger.info(`[post-purchase-prep] Sent for order ${order.display_id}`)
    } catch (error: any) {
      logger.error(
        `[post-purchase-prep] Failed for order ${order.display_id}: ${error?.message}`
      )
    }
  }
}

export const config = {
  name: "post-purchase-prep",
  // Daily at 09:05, after the overnight operational jobs.
  schedule: "5 9 * * *",
}
