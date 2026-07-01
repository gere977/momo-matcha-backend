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
    fields: ["id", "display_id", "email", "currency_code", "total", "items.title", "items.quantity"],
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
      total: order.total,
      currency_code: order.currency_code,
      items: order.items,
    },
  })
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
