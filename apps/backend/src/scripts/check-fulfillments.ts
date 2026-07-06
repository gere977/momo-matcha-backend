import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function checkFulfillments({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: fulfillments } = await query.graph({
    entity: "fulfillment",
    fields: ["id", "provider_id", "data", "created_at", "canceled_at"],
  })
  console.log("=== fulfillments ===")
  console.log(JSON.stringify(fulfillments, null, 2))

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "created_at",
      "shipping_methods.name",
      "payment_collections.payments.provider_id",
    ],
  })
  console.log("=== orders (shipping + payment) ===")
  console.log(JSON.stringify(orders, null, 2))
}
