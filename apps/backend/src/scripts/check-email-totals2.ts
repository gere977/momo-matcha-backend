import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function checkEmailTotals2({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "currency_code",
      "subtotal",
      "item_total",
      "shipping_total",
      "discount_total",
      "total",
      "items.*",
    ],
  })

  for (const order of orders as any[]) {
    console.log(
      `#${order.display_id}: total=${JSON.stringify(order.total)} (${typeof order.total}) ` +
        `item_total=${JSON.stringify(order.item_total)} shipping_total=${JSON.stringify(order.shipping_total)}`
    )
    for (const item of order.items ?? []) {
      console.log(
        `   item "${item.title}" qty=${JSON.stringify(item.quantity)} unit_price=${JSON.stringify(item.unit_price)} total=${JSON.stringify(item.total)}`
      )
    }
  }
}
