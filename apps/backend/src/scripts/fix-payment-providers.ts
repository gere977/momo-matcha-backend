import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

// Removes the manual "Banki átutalás" (pp_system_default) provider from the
// Magyarország region so checkout only offers Barion + utánvét (COD).
export default async function fixPaymentProviders({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "payment_providers.id"],
  })

  const hungary = regions.find((r: any) => r.name === "Magyarország")
  if (!hungary) {
    throw new Error("Magyarország region not found")
  }

  const hasSystemDefault = hungary.payment_providers?.some(
    (p: any) => p.id === "pp_system_default"
  )
  if (!hasSystemDefault) {
    console.log("pp_system_default is not linked to Magyarország - nothing to do.")
    return
  }

  await link.dismiss({
    [Modules.REGION]: { region_id: hungary.id },
    [Modules.PAYMENT]: { payment_provider_id: "pp_system_default" },
  })
  console.log(`Unlinked pp_system_default from region ${hungary.id} (Magyarország).`)

  const { data: after } = await query.graph({
    entity: "region",
    fields: ["id", "name", "payment_providers.id"],
    filters: { id: hungary.id },
  })
  console.log("Remaining providers:", JSON.stringify(after[0]?.payment_providers))
}
