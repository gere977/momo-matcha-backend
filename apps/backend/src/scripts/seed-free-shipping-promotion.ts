import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createPromotionsWorkflow } from "@medusajs/medusa/core-flows";

// Matches the Shopify theme's "Ingyenes szállítás 15 000 Ft felett" messaging
// (sections/main-product.liquid) - automatic, no code required, 100% off shipping
// once the cart's item total reaches 15,000 HUF.
export default async function seed_free_shipping_promotion({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: existing } = await query.graph({
    entity: "promotion",
    fields: ["id", "code"],
  });

  if (existing.some((p) => p.code === "INGYENSZALLITAS15000")) {
    logger.info("Free shipping promotion already exists - skipping.");
    return;
  }

  await createPromotionsWorkflow(container).run({
    input: {
      promotionsData: [
        {
          code: "INGYENSZALLITAS15000",
          is_automatic: true,
          status: "active",
          type: "standard",
          application_method: {
            type: "percentage",
            target_type: "shipping_methods",
            allocation: "each",
            value: 100,
            currency_code: "huf",
            max_quantity: 1,
          },
          rules: [
            {
              attribute: "item_total",
              operator: "gte",
              values: ["15000"],
            },
          ],
        },
      ],
    },
  });

  logger.info(
    "Created automatic free-shipping promotion (15,000 HUF item total threshold)."
  );
}
