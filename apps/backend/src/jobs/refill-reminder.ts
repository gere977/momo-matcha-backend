import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  hasConfirmedMarketingConsent,
  normalizeEmail,
} from "../utils/email-preferences"
import { lifecycleEmailJobsEnabled } from "../utils/lifecycle-email-jobs"
import { containsMatchaProduct, isMatchaProduct } from "../utils/matcha-products"

const STORE_URL = "https://momomatcha.hu"
const DUE_DAYS = 28
const MAX_AGE_DAYS = 45

// Reminds a customer around the expected refill window, unless they have
// already placed a newer order. No discount is invented or implied.
export default async function refillReminderJob(container: MedusaContainer) {
  if (!lifecycleEmailJobsEnabled()) return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)
  const orderModuleService = container.resolve(Modules.ORDER) as any
  const now = Date.now()
  const windowStart = new Date(now - MAX_AGE_DAYS * 24 * 60 * 60 * 1000)

  // Include recent orders too: a newer order suppresses the reminder for an
  // otherwise-due older order from the same email address.
  const { data: orders } = await query.graph({
    entity: "order",
    filters: { created_at: { $gte: windowStart.toISOString() } } as any,
    fields: [
      "id",
      "display_id",
      "email",
      "status",
      "created_at",
      "metadata",
      "items.product_handle",
      "items.product_title",
      "items.title",
      "items.quantity",
    ],
  })

  const active = (orders as any[]).filter(
    (order) =>
      order.status !== "canceled" &&
      order.email &&
      containsMatchaProduct(order.items)
  )
  const latestByEmail = new Map<string, any>()
  for (const order of active) {
    const email = normalizeEmail(order.email)
    const current = latestByEmail.get(email)
    if (!current || new Date(order.created_at) > new Date(current.created_at)) {
      latestByEmail.set(email, order)
    }
  }

  const due = active.filter((order) => {
    const age = now - new Date(order.created_at).getTime()
    return (
      age >= DUE_DAYS * 24 * 60 * 60 * 1000 &&
      age <= MAX_AGE_DAYS * 24 * 60 * 60 * 1000 &&
      latestByEmail.get(normalizeEmail(order.email))?.id === order.id &&
      !order.metadata?.refill_reminder_sent &&
      !order.metadata?.refill_reminder_suppressed_at
    )
  })

  for (const order of due) {
    try {
      if (!(await hasConfirmedMarketingConsent(container, order.email))) {
        await orderModuleService.updateOrders(order.id, {
          metadata: {
            ...(order.metadata ?? {}),
            refill_reminder_suppressed_at: new Date().toISOString(),
          },
        })
        continue
      }

      await notificationModuleService.createNotifications({
        to: order.email,
        channel: "email",
        template: "refill-reminder",
        data: {
          subject: "Fogyóban a matchád? 🌿",
          idempotency_key: `refill-reminder:${order.id}`,
          items: (order.items ?? [])
            .filter(isMatchaProduct)
            .map((item: any) => ({
              title: item.product_title ?? item.title,
              quantity: item.quantity,
            })),
          shop_url: `${STORE_URL}/hu/store?utm_source=email&utm_medium=email&utm_campaign=refill_reminder`,
        },
      })

      await orderModuleService.updateOrders(order.id, {
        metadata: {
          ...(order.metadata ?? {}),
          refill_reminder_sent: new Date().toISOString(),
        },
      })
      logger.info(`[refill-reminder] Sent for order ${order.display_id}`)
    } catch (error: any) {
      logger.error(
        `[refill-reminder] Failed for order ${order.display_id}: ${error?.message}`
      )
    }
  }
}

export const config = {
  name: "refill-reminder",
  // Daily at 09:40, after the post-purchase preparation email.
  schedule: "40 9 * * *",
}
