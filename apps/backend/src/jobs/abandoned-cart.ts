import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const STORE_URL = "https://momomatcha.hu"
const MIN_IDLE_HOURS = 3 // don't nag someone who is still shopping
const MAX_AGE_HOURS = 48 // older carts are cold — leave them alone

// Recovers abandoned checkouts: carts that have an email (= the visitor got
// to checkout) but never completed, idle for a few hours. One reminder per
// cart, tracked in cart.metadata.abandoned_email_sent.
export default async function abandonedCartJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const cartModuleService = container.resolve(Modules.CART) as any
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)

  const now = Date.now()
  const idleBefore = new Date(now - MIN_IDLE_HOURS * 60 * 60 * 1000)
  const notOlderThan = new Date(now - MAX_AGE_HOURS * 60 * 60 * 1000)

  const carts = await cartModuleService.listCarts(
    {
      email: { $ne: null },
      completed_at: null,
      updated_at: { $lt: idleBefore, $gt: notOlderThan },
    },
    {
      relations: ["items"],
      take: 200,
    }
  )

  for (const cart of carts as any[]) {
    if (!cart.email || !cart.items?.length) continue
    if (cart.metadata?.abandoned_email_sent) continue

    try {
      await notificationModuleService.createNotifications({
        to: cart.email,
        channel: "email",
        template: "abandoned-cart",
        data: {
          subject: "A matchád még a kosaradban vár 🍵",
          items: cart.items.map((i: any) => ({
            title: i.product_title ?? i.title,
            quantity: i.quantity,
          })),
          cart_url: `${STORE_URL}/hu/cart`,
        },
      })

      await cartModuleService.updateCarts([
        {
          id: cart.id,
          metadata: {
            ...(cart.metadata ?? {}),
            abandoned_email_sent: new Date().toISOString(),
          },
        },
      ])

      logger.info(`[abandoned-cart] Reminder sent to ${cart.email}`)
    } catch (e: any) {
      logger.error(`[abandoned-cart] Failed for cart ${cart.id}: ${e?.message}`)
    }
  }
}

export const config = {
  name: "abandoned-cart",
  // Every hour at :20.
  schedule: "20 * * * *",
}
