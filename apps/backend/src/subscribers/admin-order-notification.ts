import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { asNumber } from "../utils/money"
import { publicOrderNumber } from "../utils/order-number"

const PAYMENT_TITLES: Record<string, string> = {
  pp_system_default: "Banki átutalás",
  pp_cod_cod: "Utánvét",
  pp_barion_barion: "Barion",
}

// Lets the shop owners know immediately when an order lands. Every admin
// user registered on the dashboard gets the email; ADMIN_NOTIFICATION_EMAILS
// (comma separated) can add extra recipients without an admin account.
export default async function adminOrderNotificationHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)

  const { data: adminUsers } = await query.graph({
    entity: "user",
    fields: ["email"],
  })

  const extraRecipients = (process.env.ADMIN_NOTIFICATION_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)

  const recipients = [
    ...new Set(
      [
        ...adminUsers.map((u: { email?: string | null }) => u.email),
        ...extraRecipients,
      ]
        .filter((e): e is string => Boolean(e))
        .map((e) => e.toLowerCase())
    ),
  ]

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
      // Full item data is required for the order-level totals to compute
      // correctly - with a narrow field list `total` excluded the items.
      "items.*",
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
        subject: `Új rendelés: #${publicOrderNumber(order.display_id)} (${order.email})`,
        order_id: order.id,
        order_number: publicOrderNumber(order.display_id),
        internal_order_number: order.display_id,
        currency_code: order.currency_code,
        total: asNumber(order.total),
        customer_email: order.email,
        customer_name: `${order.shipping_address?.first_name ?? ""} ${
          order.shipping_address?.last_name ?? ""
        }`.trim(),
        shipping_method: order.shipping_methods?.[0]?.name,
        pickup_point: pickupPoint
          ? `${pickupPoint.name} (${pickupPoint.address})`
          : null,
        payment_method: PAYMENT_TITLES[providerId] ?? providerId,
        items: (order.items ?? []).map((item: any) => ({
          title: item?.title,
          quantity: asNumber(item?.quantity),
          unit_price: asNumber(item?.unit_price),
          total: asNumber(item?.total),
        })),
      },
    })
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
