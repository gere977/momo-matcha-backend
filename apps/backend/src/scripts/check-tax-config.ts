import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

export default async function checkTaxConfig({ container }: ExecArgs) {
  const pricingModule = container.resolve(Modules.PRICING)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const preferences = await pricingModule.listPricePreferences({})
  console.log("=== price preferences ===")
  console.log(JSON.stringify(preferences, null, 2))

  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "prices.id", "prices.amount", "prices.currency_code"],
  })
  console.log("=== shipping option prices ===")
  console.log(JSON.stringify(options, null, 2))
}
