import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function checkPaymentProviders({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: providers } = await query.graph({
    entity: "payment_provider",
    fields: ["id", "is_enabled"],
  })
  console.log("=== payment providers (all) ===")
  console.log(JSON.stringify(providers, null, 2))

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code", "payment_providers.id", "payment_providers.is_enabled"],
  })
  console.log("=== regions + linked payment providers ===")
  console.log(JSON.stringify(regions, null, 2))
}
