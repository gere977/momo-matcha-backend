import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function checkShippingOptions({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: [
      "id",
      "name",
      "provider_id",
      "data",
      "prices.amount",
      "prices.currency_code",
    ],
  })
  console.log(JSON.stringify(options, null, 2))
}
