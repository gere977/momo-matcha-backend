import { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createProductOptionsWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows";

// Real Momo Matcha catalog, taken directly from the live Shopify store's product
// screenshots. PRICING NOTE: the Shopify collection grid only shows one price per
// matcha flavor (7.890 Ft) with no visible size breakdown, but the size variants
// (Kiszerelés) were confirmed to exist - so 7.890 Ft is assumed to be the 50g tier,
// with 30g/100g scaled proportionally. Verify/adjust the exact per-size prices in
// the admin once you have the real numbers from Shopify's product detail pages.
export default async function seed_real_catalog({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: existingProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
  });
  const existingHandles = new Set(existingProducts.map((p) => p.handle));

  const { data: categories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
  });
  const matchaCategoryId = categories.find((c) => c.name === "Napi matcha")?.id;
  const accessoriesCategoryId = categories.find(
    (c) => c.name === "Kiegészítők"
  )?.id;

  const { data: salesChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id"],
  });
  const defaultSalesChannel = salesChannels[0];

  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });
  const shippingProfile = shippingProfiles[0];

  // Reuse the existing "Kiszerelés" option if seed-hu.ts already created one, else make it.
  const { data: existingOptions } = await query.graph({
    entity: "product_option",
    fields: ["id", "title", "product_id"],
  });
  let sizeOptionTemplate = existingOptions.find(
    (o) => o.title === "Kiszerelés"
  );

  // Product photos hosted in the storefront's public folder (momomatcha.hu).
  // Flavors with an image are published; the rest stay DRAFT until real photos
  // are added (drop a file in storefront public/images/products and set it here).
  const IMG = "https://momomatcha.hu/images/products";
  const matchaFlavors: {
    handle: string
    name: string
    image: string | null
  }[] = [
    { handle: "original-premium-momo-matcha", name: "Original Prémium Momo Matcha", image: `${IMG}/original.png` },
    { handle: "epres-premium-momo-matcha", name: "Epres Prémium Momo Matcha", image: `${IMG}/strawberry.png` },
    { handle: "vanilias-premium-momo-matcha", name: "Vaníliás Prémium Momo Matcha", image: null },
    { handle: "oszibarackos-premium-momo-matcha", name: "Őszibarackos Prémium Momo Matcha", image: null },
    { handle: "csokoladas-premium-momo-matcha", name: "Csokoládés Prémium Momo Matcha", image: null },
  ];

  const flavorDescriptions: Record<string, string> = {
    "original-premium-momo-matcha":
      "Tiszta, prémium minőségű szertartásos matcha - a klasszikus élmény ízesítés nélkül.",
    "epres-premium-momo-matcha":
      "Prémium matcha friss eper ízesítéssel - a nyár édes, gyümölcsös hangulata egy csészében.",
    "vanilias-premium-momo-matcha":
      "Prémium matcha vaníliás jegyekkel - selymes, kényeztető íz minden kortyban.",
    "oszibarackos-premium-momo-matcha":
      "Prémium matcha lédús őszibarack ízesítéssel - frissítő, gyümölcsös rituálé.",
    "csokoladas-premium-momo-matcha":
      "Prémium matcha csokoládé jegyekkel - a matcha és a csokoládé tökéletes találkozása.",
  };

  for (const flavor of matchaFlavors) {
    if (existingHandles.has(flavor.handle)) {
      logger.info(`Skipping ${flavor.handle} - already exists.`);
      continue;
    }

    let sizeOptionId: string;
    if (sizeOptionTemplate) {
      sizeOptionId = sizeOptionTemplate.id;
    } else {
      const { result: newOptions } = await createProductOptionsWorkflow(
        container
      ).run({
        input: {
          product_options: [{ title: "Kiszerelés", values: ["30g", "50g", "100g"] }],
        },
      });
      sizeOptionTemplate = newOptions[0] as any;
      sizeOptionId = newOptions[0].id;
    }

    await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: flavor.name,
            category_ids: matchaCategoryId ? [matchaCategoryId] : [],
            description: flavorDescriptions[flavor.handle],
            handle: flavor.handle,
            status: flavor.image
              ? ProductStatus.PUBLISHED
              : ProductStatus.DRAFT, // published once it has a real photo
            thumbnail: flavor.image ?? undefined,
            images: flavor.image ? [{ url: flavor.image }] : undefined,
            shipping_profile_id: shippingProfile?.id,
            options: [{ id: sizeOptionId }],
            variants: [
              {
                title: "30g",
                sku: `${flavor.handle.toUpperCase()}-30`,
                options: { Kiszerelés: "30g" },
                prices: [{ amount: 4990, currency_code: "huf" }],
              },
              {
                title: "50g",
                sku: `${flavor.handle.toUpperCase()}-50`,
                options: { Kiszerelés: "50g" },
                prices: [{ amount: 7890, currency_code: "huf" }],
              },
              {
                title: "100g",
                sku: `${flavor.handle.toUpperCase()}-100`,
                options: { Kiszerelés: "100g" },
                prices: [{ amount: 14990, currency_code: "huf" }],
              },
            ],
            sales_channels: defaultSalesChannel ? [{ id: defaultSalesChannel.id }] : [],
          },
        ],
      },
    });
    logger.info(`Created ${flavor.name} (draft, needs real product photos).`);
  }

  const accessories = [
    {
      handle: "matcha-tal",
      name: "Matcha Tál",
      description: "Kézzel készített kerámia matcha tál - a szertartás elengedhetetlen kelléke.",
      price: 2690,
    },
    {
      handle: "bambusz-kanal",
      name: "Bambusz Kanál",
      description: "Hagyományos bambusz mérőkanál (chashaku) a pontos adagoláshoz.",
      price: 1290,
    },
    {
      handle: "bambusz-habvero",
      name: "Bambusz Habverő",
      description: "Kézzel faragott bambusz habverő (chasen) a tökéletes, habos matchához.",
      price: 1890,
    },
    {
      handle: "matcha-kezdocsomag",
      name: "Matcha kezdőkészlet",
      description: "Minden, amire a matcha rituáléd elkezdéséhez szükséged van egy csomagban.",
      price: 6990, // TODO: confirm exact price - was cut off in the source screenshot
    },
  ];

  for (const item of accessories) {
    if (existingHandles.has(item.handle)) {
      logger.info(`Skipping ${item.handle} - already exists.`);
      continue;
    }

    await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: item.name,
            category_ids: accessoriesCategoryId ? [accessoriesCategoryId] : [],
            description: item.description,
            handle: item.handle,
            status: ProductStatus.DRAFT,
            shipping_profile_id: shippingProfile?.id,
            variants: [
              {
                title: "Alap",
                sku: item.handle.toUpperCase(),
                prices: [{ amount: item.price, currency_code: "huf" }],
              },
            ],
            sales_channels: defaultSalesChannel ? [{ id: defaultSalesChannel.id }] : [],
          },
        ],
      },
    });
    logger.info(`Created ${item.name} (draft, needs real product photos).`);
  }

  logger.info(
    "Real catalog seed complete - all products created as DRAFT. Upload real photos and verify per-size pricing in the admin, then publish."
  );
}
