import { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createProductsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows";

const HANDLE = "vanilias-premium-momo-matcha";
const IMAGE_ROOT = "https://momomatcha.hu/images/products";
const SHOULD_PUBLISH = process.env.PUBLISH_VANILLA === "true";

export default async function publishVanilla({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { handle: HANDLE },
  });
  const { data: salesChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id"],
  });

  const productData = {
    title: "Vaníliás Prémium Momo Matcha",
    description:
      "Prémium matcha lágy vaníliás jegyekkel – selymes, kényeztető íz minden kortyban.",
    // Keep it hidden until the referenced storefront assets are deployed.
    status: SHOULD_PUBLISH ? ProductStatus.PUBLISHED : ProductStatus.DRAFT,
    thumbnail: `${IMAGE_ROOT}/momo-vanilla-splash.png`,
    images: [
      { url: `${IMAGE_ROOT}/momo-vanilla-tin.png` },
      { url: `${IMAGE_ROOT}/momo-vanilla-splash.png` },
    ],
  };

  if (products[0]) {
    await updateProductsWorkflow(container).run({
      input: {
        products: [
          {
            id: products[0].id,
            ...productData,
            sales_channels: salesChannels[0]
              ? [{ id: salesChannels[0].id }]
              : [],
          },
        ],
      },
    });
    logger.info(
      `${SHOULD_PUBLISH ? "Published" : "Prepared"} existing vanilla product (${products[0].id}).`,
    );
    return;
  }

  const { data: categories } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
  });
  const { data: collections } = await query.graph({
    entity: "product_collection",
    fields: ["id", "handle"],
  });
  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });
  const { data: options } = await query.graph({
    entity: "product_option",
    fields: ["id", "title"],
  });

  const sizeOption = options.find((option) => option.title === "Kiszerelés");
  if (!sizeOption) {
    throw new Error("The shared Kiszerelés product option was not found.");
  }

  await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          ...productData,
          handle: HANDLE,
          category_ids: categories
            .filter((category) => category.handle === "napi-matcha")
            .map((category) => category.id),
          collection_id: collections.find(
            (collection) => collection.handle === "matcha",
          )?.id,
          shipping_profile_id: shippingProfiles[0]?.id,
          options: [{ id: sizeOption.id }],
          variants: [
            {
              title: "30g",
              sku: "VANILIAS-PREMIUM-MOMO-MATCHA-30",
              options: { Kiszerelés: "30g" },
              prices: [{ amount: 4990, currency_code: "huf" }],
            },
            {
              title: "50g",
              sku: "VANILIAS-PREMIUM-MOMO-MATCHA-50",
              options: { Kiszerelés: "50g" },
              prices: [{ amount: 7890, currency_code: "huf" }],
            },
            {
              title: "100g",
              sku: "VANILIAS-PREMIUM-MOMO-MATCHA-100",
              options: { Kiszerelés: "100g" },
              prices: [{ amount: 14990, currency_code: "huf" }],
            },
          ],
          sales_channels: salesChannels[0] ? [{ id: salesChannels[0].id }] : [],
        },
      ],
    },
  });

  logger.info(
    `Created the vanilla product as ${SHOULD_PUBLISH ? "published" : "a deployment-ready draft"}.`,
  );
}
