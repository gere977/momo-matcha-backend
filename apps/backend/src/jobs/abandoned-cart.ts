import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { hasConfirmedMarketingConsent } from "../utils/email-preferences"
import { createCartRecoveryUrl } from "../utils/cart-recovery"
import { lifecycleEmailJobsEnabled } from "../utils/lifecycle-email-jobs"

const MIN_IDLE_HOURS = 3 // don't nag someone who is still shopping
const MAX_AGE_HOURS = 48 // older carts are cold — leave them alone

// Recovers abandoned checkouts: carts that have an email (= the visitor got
// to checkout) but never completed, idle for a few hours. One reminder per
// cart, tracked in cart.metadata.abandoned_email_sent.
export default async function abandonedCartJob(container: MedusaContainer) {
  if (!lifecycleEmailJobsEnabled()) return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const cartModuleService = container.resolve(Modules.CART) as any
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)

  const now = Date.now()
  const idleBefore = new Date(now - MIN_IDLE_HOURS * 60 * 60 * 1000)
  const notOlderThan = new Date(now - MAX_AGE_HOURS * 60 * 60 * 1000)

  const pageSize = 200
  let skip = 0
  const carts: any[] = []

  while (true) {
    const page = await cartModuleService.listCarts(
      {
        email: { $ne: null },
        completed_at: null,
        updated_at: { $lt: idleBefore, $gt: notOlderThan },
      },
      {
        relations: ["items"],
        order: { created_at: "ASC" },
        take: pageSize,
        skip,
      }
    )
    if (!page.length) break
    carts.push(...page)
    skip += page.length
    if (page.length < pageSize) break
  }

  // Process only after taking a stable snapshot. Updating cart metadata also
  // changes updated_at, which would otherwise shrink the paginated result set
  // and make skip-based pagination miss later carts.
  for (const cart of carts) {
    if (!cart.email || !cart.items?.length) continue
    if (cart.metadata?.abandoned_email_sent) continue
    if (cart.metadata?.abandoned_email_suppressed_at) continue

    try {
      if (!(await hasConfirmedMarketingConsent(container, cart.email))) {
        await cartModuleService.updateCarts([
          {
            id: cart.id,
            metadata: {
              ...(cart.metadata ?? {}),
              abandoned_email_suppressed_at: new Date().toISOString(),
            },
          },
        ])
        continue
      }

      await notificationModuleService.createNotifications({
        to: cart.email,
        channel: "email",
        template: "abandoned-cart",
        data: {
          subject: "A matchád még a kosaradban vár 🍵",
          idempotency_key: `abandoned-cart:${cart.id}`,
          items: cart.items.map((i: any) => ({
            title: i.product_title ?? i.title,
            quantity: i.quantity,
          })),
          cart_url: createCartRecoveryUrl(cart.id),
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
