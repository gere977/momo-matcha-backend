import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

// All HUF prices (products AND shipping) are entered gross, VAT included.
// The Magyarország region price preference was tax-exclusive, which made
// Medusa add 27% VAT on top of shipping prices at checkout.
export default async function fixTaxInclusiveRegion({ container }: ExecArgs) {
  const pricingModule = container.resolve(Modules.PRICING)

  const all = await pricingModule.listPricePreferences({})
  const preferences = all.filter(
    (p) =>
      p.attribute === "region_id" &&
      p.value === "reg_01KWEZZR82346BBYW975F2WK70" // Magyarország
  )

  if (!preferences.length) {
    throw new Error("No price preference found for the Magyarország region")
  }

  await pricingModule.updatePricePreferences(
    { id: preferences.map((preference) => preference.id) },
    { is_tax_inclusive: true }
  )

  console.log(
    `Updated ${preferences.length} price preference(s) to tax-inclusive:`,
    preferences.map((p) => p.id).join(", ")
  )
}
