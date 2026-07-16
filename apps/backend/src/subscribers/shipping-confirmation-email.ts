import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { publicOrderNumber } from "../utils/order-number"

export default async function shippingConfirmationHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string; no_notification?: boolean }>) {
  if (data.no_notification) return

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)

  const { data: fulfillments } = await query.graph({
    entity: "fulfillment",
    filters: { id: data.id },
    fields: [
      "id",
      "shipped_at",
      "labels.*",
      "order.display_id",
      "order.email",
      "order.metadata",
      "order.shipping_methods.name",
    ],
  })
  const fulfillment = fulfillments[0]
  const order = (fulfillment as any)?.order
  if (!order?.email) return
  const label = (fulfillment as any)?.labels?.[0]
  const pickupPoint = order.metadata?.pickup_point

  await notificationModuleService.createNotifications({
    to: order.email,
    channel: "email",
    template: "shipping-confirmation",
    data: {
      subject: `Csomagod úton van! - Rendelés #${publicOrderNumber(order.display_id)}`,
      idempotency_key: `shipping-confirmation:${data.id}`,
      order_number: publicOrderNumber(order.display_id),
      carrier: order.shipping_methods?.[0]?.name ?? null,
      tracking_number: label?.tracking_number ?? null,
      tracking_url: label?.tracking_url ?? null,
      pickup_point: pickupPoint
        ? `${pickupPoint.name} (${pickupPoint.address})`
        : null,
    },
  })
}

export const config: SubscriberConfig = {
  event: "shipment.created",
}
