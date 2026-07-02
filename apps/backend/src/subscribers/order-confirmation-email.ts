import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

export default async function orderConfirmationHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)

  const { data: orders } = await query.graph({
    entity: "order",
    filters: { id: data.id },
    fields: [
      "id",
      "display_id",
      "email",
      "currency_code",
      "subtotal",
      "shipping_total",
      "discount_total",
      "total",
      "items.title",
      "items.quantity",
      "items.unit_price",
      "items.total",
    ],
  })
  const order = orders[0]
  if (!order) return

  await notificationModuleService.createNotifications({
    to: order.email as string,
    channel: "email",
    template: "order-confirmation",
    data: {
      subject: `Rendelésed visszaigazolása - #${order.display_id}`,
      order_number: order.display_id,
      currency_code: order.currency_code,
      subtotal: order.subtotal,
      shipping_total: order.shipping_total,
      discount_total: order.discount_total,
      total: order.total,
      items: order.items,
    },
  })
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
