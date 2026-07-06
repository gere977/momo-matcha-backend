import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { asNumber } from "../utils/money"
import { publicOrderNumber } from "../utils/order-number"

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
      "item_total",
      "shipping_total",
      "discount_total",
      "total",
      // Full item data is required for the order-level totals to compute
      // correctly - with a narrow field list `total` excluded the items.
      "items.*",
    ],
  })
  const order = orders[0]
  if (!order) return

  await notificationModuleService.createNotifications({
    to: order.email as string,
    channel: "email",
    template: "order-confirmation",
    data: {
      subject: `Rendelésed visszaigazolása - #${publicOrderNumber(order.display_id)}`,
      order_number: publicOrderNumber(order.display_id),
      currency_code: order.currency_code,
      // Gross (VAT included) - matches the storefront's tax-inclusive display.
      subtotal: asNumber(order.item_total),
      shipping_total: asNumber(order.shipping_total),
      discount_total: asNumber(order.discount_total),
      total: asNumber(order.total),
      items: (order.items ?? []).map((item: any) => ({
        title: item?.title,
        quantity: asNumber(item?.quantity),
        unit_price: asNumber(item?.unit_price),
        total: asNumber(item?.total),
      })),
    },
  })
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
