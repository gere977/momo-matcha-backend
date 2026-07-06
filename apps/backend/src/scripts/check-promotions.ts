import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

export default async function checkPromotions({ container }: ExecArgs) {
  const promotionModule = container.resolve(Modules.PROMOTION)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const promotions = await promotionModule.listPromotions(
    {},
    { relations: ["application_method", "rules"] }
  )
  console.log("=== promotions ===")
  console.log(JSON.stringify(promotions, null, 2))

  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: [
      "id",
      "name",
      "prices.id",
      "prices.amount",
      "prices.currency_code",
      "prices.price_rules.attribute",
      "prices.price_rules.operator",
      "prices.price_rules.value",
    ],
  })
  console.log("=== shipping option price rules ===")
  for (const option of options as any[]) {
    console.log(
      option.name,
      "->",
      (option.prices ?? [])
        .map(
          (p: any) =>
            `${p.amount} ${p.currency_code} [${(p.price_rules ?? [])
              .map((r: any) => `${r.attribute} ${r.operator} ${r.value}`)
              .join("; ")}]`
        )
        .join(" | ")
    )
  }
}
