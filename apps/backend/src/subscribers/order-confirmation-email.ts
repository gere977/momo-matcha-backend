import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { asNumber } from "../utils/money"
import { publicOrderNumber } from "../utils/order-number"

const PAYMENT_TITLES: Record<string, string> = {
  pp_system_default: "Banki átutalás",
  pp_cod_cod: "Utánvét",
  pp_barion_barion: "Barion",
}

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
      "metadata",
      "shipping_methods.name",
      "shipping_address.address_1",
      "shipping_address.city",
      "shipping_address.postal_code",
      "payment_collections.payments.provider_id",
    ],
  })
  const order: any = orders[0]
  if (!order) return

  const pickupPoint = order.metadata?.pickup_point
  const addr = order.shipping_address
  // Pickup-point orders carry the locker address separately; only show the
  // home address when it's a home delivery.
  const shippingAddress =
    !pickupPoint && addr?.address_1
      ? [addr.postal_code, addr.city, addr.address_1].filter(Boolean).join(" ")
      : null
  const providerId =
    order.payment_collections?.[0]?.payments?.[0]?.provider_id ?? ""

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
      shipping_method: order.shipping_methods?.[0]?.name ?? null,
      pickup_point: pickupPoint
        ? `${pickupPoint.name} (${pickupPoint.address})`
        : null,
      shipping_address: shippingAddress,
      payment_method: PAYMENT_TITLES[providerId] ?? null,
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
