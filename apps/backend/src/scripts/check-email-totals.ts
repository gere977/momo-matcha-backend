import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// Replicates the exact query.graph calls the order email subscribers make,
// to see what the `total` fields actually contain.
export default async function checkEmailTotals({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
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

  for (const order of orders as any[]) {
    console.log(
      `#${order.display_id}: total=${JSON.stringify(order.total)} (${typeof order.total}) ` +
        `subtotal=${JSON.stringify(order.subtotal)} shipping_total=${JSON.stringify(order.shipping_total)} ` +
        `discount_total=${JSON.stringify(order.discount_total)}`
    )
    for (const item of order.items ?? []) {
      console.log(
        `   item "${item.title}" qty=${item.quantity} unit_price=${JSON.stringify(item.unit_price)} total=${JSON.stringify(item.total)} (${typeof item.total})`
      )
    }
  }
}
