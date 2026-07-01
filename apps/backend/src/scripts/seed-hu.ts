import { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  ModuleRegistrationName,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createProductCategoriesWorkflow,
  createProductOptionsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createShippingOptionsWorkflow,
  createTaxRegionsWorkflow,
} from "@medusajs/medusa/core-flows";

export default async function seed_hu({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const storeModuleService = container.resolve(ModuleRegistrationName.STORE);

  logger.info("Adding HUF currency to the default store...");
  const { data: storesWithCurrencies } = await query.graph({
    entity: "store",
    fields: ["id", "supported_currencies.currency_code", "supported_currencies.is_default"],
  });
  const store = storesWithCurrencies[0];
  const existingCurrencies = (store.supported_currencies ?? []).map((c: any) => ({
    currency_code: c.currency_code,
    is_default: !!c.is_default,
  }));
  if (!existingCurrencies.some((c) => c.currency_code === "huf")) {
    await storeModuleService.updateStores(store.id, {
      supported_currencies: [
        ...existingCurrencies,
        { currency_code: "huf", is_default: false },
      ],
    });
  }
  logger.info("Finished adding HUF currency.");

  logger.info("Seeding Hungary region...");
  const { result: regionResult } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "Magyarország",
          currency_code: "huf",
          countries: ["hu"],
          automatic_taxes: true,
          payment_providers: ["pp_system_default"],
        },
      ],
    },
  });
  const huRegion = regionResult[0];
  logger.info(`Finished seeding Hungary region (id: ${huRegion.id}).`);

  logger.info("Seeding Hungary tax region (27% AFA)...");
  await createTaxRegionsWorkflow(container).run({
    input: [
      {
        country_code: "hu",
        provider_id: "tp_system",
        default_tax_rate: {
          rate: 27,
          name: "AFA",
          code: "HU_AFA_STANDARD",
        },
      },
    ],
  });
  logger.info("Finished seeding Hungary tax region.");

  logger.info("Seeding matcha product categories...");
  const { result: categoryResult } = await createProductCategoriesWorkflow(
    container
  ).run({
    input: {
      product_categories: [
        { name: "Szertartásos matcha", is_active: true },
        { name: "Napi matcha", is_active: true },
        { name: "Kiegészítők", is_active: true },
        { name: "Ajándékcsomagok", is_active: true },
      ],
    },
  });
  logger.info("Finished seeding categories (editable later in the admin).");

  logger.info("Seeding 'Kiszerelés' (size) product option + sample product...");
  const { result: productOptionsResult } = await createProductOptionsWorkflow(
    container
  ).run({
    input: {
      product_options: [
        {
          title: "Kiszerelés",
          values: ["30g", "50g", "100g"],
        },
      ],
    },
  });
  const sizeOption = productOptionsResult[0];

  const { data: salesChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
  });
  const defaultSalesChannel = salesChannels[0];

  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });
  const shippingProfile = shippingProfiles[0];

  await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Szertartásos Matcha",
          category_ids: [
            categoryResult.find((c) => c.name === "Szertartásos matcha")!.id,
          ],
          description:
            "Prémium minőségű, ceremoniális szertartásos matcha Japánból.",
          handle: "szertartasos-matcha",
          status: ProductStatus.DRAFT,
          shipping_profile_id: shippingProfile?.id,
          options: [{ id: sizeOption.id }],
          variants: [
            {
              title: "30g",
              sku: "MATCHA-SZERT-30",
              options: { Kiszerelés: "30g" },
              prices: [{ amount: 4990, currency_code: "huf" }],
            },
            {
              title: "50g",
              sku: "MATCHA-SZERT-50",
              options: { Kiszerelés: "50g" },
              prices: [{ amount: 7490, currency_code: "huf" }],
            },
            {
              title: "100g",
              sku: "MATCHA-SZERT-100",
              options: { Kiszerelés: "100g" },
              prices: [{ amount: 12990, currency_code: "huf" }],
            },
          ],
          sales_channels: defaultSalesChannel
            ? [{ id: defaultSalesChannel.id }]
            : [],
        },
      ],
    },
  });
  logger.info(
    "Finished seeding sample product (left as DRAFT - publish real products via the admin in Phase 4)."
  );

  logger.info("Adding Hungary to the existing shipping service zone...");
  const { data: fulfillmentSets } = await query.graph({
    entity: "fulfillment_set",
    fields: ["id", "service_zones.id", "service_zones.name"],
  });
  const fulfillmentSet = fulfillmentSets[0];
  const serviceZone = fulfillmentSet?.service_zones?.[0];

  if (serviceZone) {
    const fulfillmentModuleService = container.resolve(
      ModuleRegistrationName.FULFILLMENT
    );
    await fulfillmentModuleService.updateServiceZones({
      id: serviceZone.id,
      geo_zones: [
        // @ts-ignore - existing geo zones aren't typed on the graph query above
        ...(serviceZone.geo_zones ?? []),
        { country_code: "hu", type: "country" },
      ],
    });
    logger.info("Hungary added to shipping service zone.");
  } else {
    logger.warn(
      "No existing fulfillment service zone found - configure Hungary shipping manually in the admin."
    );
  }

  logger.info(
    "HU seed complete: region, tax, categories, size option, and one draft sample product created."
  );
}
