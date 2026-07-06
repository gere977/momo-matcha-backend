import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { publicOrderNumber } from "../utils/order-number"

export default async function shippingConfirmationHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)

  const { data: fulfillments } = await query.graph({
    entity: "fulfillment",
    filters: { id: data.id },
    fields: ["id", "shipped_at", "order.display_id", "order.email"],
  })
  const fulfillment = fulfillments[0]
  const order = (fulfillment as any)?.order
  if (!order?.email) return

  await notificationModuleService.createNotifications({
    to: order.email,
    channel: "email",
    template: "shipping-confirmation",
    data: {
      subject: `Csomagod úton van! - Rendelés #${publicOrderNumber(order.display_id)}`,
      order_number: publicOrderNumber(order.display_id),
    },
  })
}

export const config: SubscriberConfig = {
  event: "order.fulfillment_created",
}
