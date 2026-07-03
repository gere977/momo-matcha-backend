import { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  ModuleRegistrationName,
  Modules,
} from "@medusajs/framework/utils";
import {
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows";

// Makes checkout's "Szállítási mód" step work end-to-end: ensures a stock location,
// a Hungary service zone, the manual fulfillment provider link, and flat-rate
// shipping options priced in HUF. Idempotent - safe to re-run.
//
// The GLS/FoxPost provider modules exist but have no live credentials yet, so the
// options are backed by the manual provider for now; once credentials arrive the
// options can be repointed to gls_gls / foxpost_foxpost in the admin.
export default async function setup_shipping({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const fulfillmentModuleService = container.resolve(
    ModuleRegistrationName.FULFILLMENT
  );

  // --- 1. Stock location -----------------------------------------------------
  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  });

  // query.graph rows and workflow results use different DTO shapes; only id/name are used.
  let location: any = locations[0];
  if (!location) {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: "Momo Matcha raktár",
            address: {
              city: "Szigetbecse",
              country_code: "HU",
              address_1: "",
            },
          },
        ],
      },
    });
    location = result[0];
    logger.info(`Created stock location ${location.id}.`);
  } else {
    logger.info(`Using existing stock location ${location.id} (${location.name}).`);
  }

  // --- 2. Link manual fulfillment provider to the location --------------------
  try {
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
    });
    logger.info("Linked manual fulfillment provider to the stock location.");
  } catch (e: any) {
    logger.info(`Provider link: ${e.message ?? "already exists"}`);
  }

  // --- 3. Fulfillment set + Hungary service zone ------------------------------
  const { data: fulfillmentSets } = await query.graph({
    entity: "fulfillment_set",
    fields: [
      "id",
      "name",
      "service_zones.id",
      "service_zones.name",
      "service_zones.geo_zones.country_code",
    ],
  });

  let fulfillmentSet: any = fulfillmentSets[0];
  if (!fulfillmentSet) {
    fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
      name: "Magyarország szállítás",
      type: "shipping",
      service_zones: [
        {
          name: "Magyarország",
          geo_zones: [{ country_code: "hu", type: "country" }],
        },
      ],
    });
    logger.info(`Created fulfillment set ${fulfillmentSet.id} with HU zone.`);
  } else {
    logger.info(`Using existing fulfillment set ${fulfillmentSet.id} (${fulfillmentSet.name}).`);
  }

  let serviceZone = (fulfillmentSet.service_zones ?? [])[0];
  if (!serviceZone) {
    const created = await fulfillmentModuleService.createServiceZones({
      fulfillment_set_id: fulfillmentSet.id,
      name: "Magyarország",
      geo_zones: [{ country_code: "hu", type: "country" }],
    });
    serviceZone = created as any;
    logger.info(`Created service zone ${serviceZone.id}.`);
  } else {
    const hasHu = (serviceZone as any).geo_zones?.some(
      (g: any) => g.country_code === "hu"
    );
    if (!hasHu) {
      await fulfillmentModuleService.updateServiceZones(serviceZone.id, {
        geo_zones: [
          ...((serviceZone as any).geo_zones ?? []),
          { country_code: "hu", type: "country" },
        ],
      });
      logger.info("Added Hungary to the existing service zone.");
    }
  }

  // --- 4. Link the fulfillment set to the stock location ----------------------
  try {
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
    });
    logger.info("Linked fulfillment set to the stock location.");
  } catch (e: any) {
    logger.info(`Fulfillment set link: ${e.message ?? "already exists"}`);
  }

  // --- 5. Link the sales channel to the stock location ------------------------
  const { data: salesChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
  });
  const salesChannel = salesChannels[0];
  if (salesChannel) {
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: { id: location.id, add: [salesChannel.id] },
    });
    logger.info(`Linked sales channel "${salesChannel.name}" to the stock location.`);
  }

  // --- 6. Shipping options ----------------------------------------------------
  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "name"],
  });
  const shippingProfile = shippingProfiles[0];
  if (!shippingProfile) {
    throw new Error("No shipping profile found - create one in the admin first.");
  }

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code"],
  });
  const hufRegion = regions.find((r) => r.currency_code === "huf");

  const { data: existingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name"],
  });

  const wantedOptions = [
    {
      name: "GLS házhozszállítás",
      code: "gls-home",
      description: "Kézbesítés futárral 1-3 munkanapon belül.",
      amount: 1490,
    },
    {
      name: "FoxPost házhozszállítás",
      code: "foxpost-home",
      description: "Kézbesítés FoxPost futárral 1-3 munkanapon belül.",
      amount: 1290,
    },
  ];

  for (const option of wantedOptions) {
    if (existingOptions.some((o) => o.name === option.name)) {
      logger.info(`Shipping option "${option.name}" already exists - skipping.`);
      continue;
    }

    await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: option.name,
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: serviceZone.id,
          shipping_profile_id: shippingProfile.id,
          type: {
            label: option.name,
            code: option.code,
            description: option.description,
          },
          prices: [
            { currency_code: "huf", amount: option.amount },
            ...(hufRegion
              ? [{ region_id: hufRegion.id, amount: option.amount }]
              : []),
          ],
          rules: [
            { attribute: "enabled_in_store", value: "true", operator: "eq" },
            { attribute: "is_return", value: "false", operator: "eq" },
          ],
        },
      ],
    });
    logger.info(`Created shipping option "${option.name}" (${option.amount} HUF).`);
  }

  logger.info("Shipping setup complete - checkout's delivery step should now list options.");
}
