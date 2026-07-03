import { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils";
import { createProductsWorkflow } from "@medusajs/medusa/core-flows";

const IMG = "https://momomatcha.hu/images/products";

// Publish the chocolate flavor (now that it has a photo) and create the
// accessory "Matcha Szett" under the Kiegészítők category. Single-variant
// products need an explicit options array in Medusa 2.17 (this was what made
// the accessories fail in seed-real-catalog).
export default async function add_accessory({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const productModuleService = container.resolve("product");

  // 1) Publish chocolate with its image.
  const { data: choc } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { handle: "csokoladas-premium-momo-matcha" },
  });
  if (choc[0]) {
    await productModuleService.updateProducts(choc[0].id, {
      status: "published",
      thumbnail: `${IMG}/chocolate.png`,
      images: [{ url: `${IMG}/chocolate.png` }],
    });
    logger.info("Published chocolate flavor with image.");
  }

  // 2) Create the accessory set (skip if it already exists).
  const accHandle = "matcha-szett";
  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { handle: accHandle },
  });
  if (existing[0]) {
    logger.info("Matcha Szett already exists — skipping.");
    return;
  }

  const { data: categories } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
  });
  const accCatId = categories.find((c) => c.handle === "kiegeszitok")?.id;

  const { data: salesChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id"],
  });
  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });

  await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Matcha Szett",
          handle: accHandle,
          description:
            "Teljes matcha szertartás szett: kerámia tál, bambusz habverő, habverő-tartó és szűrő — minden, amire a tökéletes matchához szükséged van.",
          status: ProductStatus.PUBLISHED,
          thumbnail: `${IMG}/accessories-set.png`,
          images: [{ url: `${IMG}/accessories-set.png` }],
          category_ids: accCatId ? [accCatId] : [],
          shipping_profile_id: shippingProfiles[0]?.id,
          options: [{ title: "Típus", values: ["Szett"] }],
          variants: [
            {
              title: "Szett",
              sku: "MATCHA-SZETT",
              options: { "Típus": "Szett" },
              prices: [{ amount: 12990, currency_code: "huf" }],
            },
          ],
          sales_channels: salesChannels[0]
            ? [{ id: salesChannels[0].id }]
            : [],
        },
      ],
    },
  });
  logger.info("Created 'Matcha Szett' accessory (published).");
}
