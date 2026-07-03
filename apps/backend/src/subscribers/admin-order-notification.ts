import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const PAYMENT_TITLES: Record<string, string> = {
  pp_system_default: "Banki átutalás",
  pp_cod_cod: "Utánvét",
  pp_barion_barion: "Barion",
}

// Lets the shop owners know immediately when an order lands. Recipients come
// from ADMIN_NOTIFICATION_EMAILS (comma separated), defaulting to the shop inbox.
export default async function adminOrderNotificationHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)

  const recipients = (
    process.env.ADMIN_NOTIFICATION_EMAILS || "info@momomatcha.hu"
  )
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)

  if (!recipients.length) return

  const { data: orders } = await query.graph({
    entity: "order",
    filters: { id: data.id },
    fields: [
      "id",
      "display_id",
      "email",
      "currency_code",
      "total",
      "metadata",
      "items.title",
      "items.quantity",
      "shipping_address.first_name",
      "shipping_address.last_name",
      "shipping_methods.name",
      "payment_collections.payments.provider_id",
    ],
  })
  const order: any = orders[0]
  if (!order) return

  const providerId =
    order.payment_collections?.[0]?.payments?.[0]?.provider_id ?? ""
  const pickupPoint = order.metadata?.pickup_point

  for (const to of recipients) {
    await notificationModuleService.createNotifications({
      to,
      channel: "email",
      template: "admin-order-notification",
      data: {
        subject: `Új rendelés: #${order.display_id} (${order.email})`,
        order_id: order.id,
        order_number: order.display_id,
        currency_code: order.currency_code,
        total: order.total,
        customer_email: order.email,
        customer_name: `${order.shipping_address?.first_name ?? ""} ${
          order.shipping_address?.last_name ?? ""
        }`.trim(),
        shipping_method: order.shipping_methods?.[0]?.name,
        pickup_point: pickupPoint
          ? `${pickupPoint.name} (${pickupPoint.address})`
          : null,
        payment_method: PAYMENT_TITLES[providerId] ?? providerId,
        items: order.items,
      },
    })
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
