import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";

// Adds cash-on-delivery ("utánvét") variants of the home-delivery options -
// very popular in Hungary. The COD handling fee (+500 Ft) is baked into the
// flat rate; the customer pays the courier on delivery. Idempotent.
export default async function add_cod_shipping({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: serviceZones } = await query.graph({
    entity: "service_zone",
    fields: ["id", "name", "geo_zones.country_code"],
  });
  const huZone = serviceZones.find((z: any) =>
    z.geo_zones?.some((g: any) => g.country_code === "hu")
  );
  if (!huZone) {
    throw new Error("No service zone covering Hungary found - run setup-shipping first.");
  }

  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });
  const shippingProfile = shippingProfiles[0];

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
  });
  const hufRegion = regions.find((r) => r.currency_code === "huf");

  const { data: existingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name"],
  });

  const codOptions = [
    {
      name: "GLS házhozszállítás + utánvét",
      code: "gls-home-cod",
      description:
        "Kézbesítés futárral 1-3 munkanapon belül, fizetés a futárnál készpénzzel vagy kártyával.",
      amount: 1990,
    },
    {
      name: "FoxPost házhozszállítás + utánvét",
      code: "foxpost-home-cod",
      description:
        "Kézbesítés FoxPost futárral 1-3 munkanapon belül, fizetés átvételkor.",
      amount: 1790,
    },
  ];

  for (const option of codOptions) {
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
          service_zone_id: huZone.id,
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
    logger.info(`Created COD shipping option "${option.name}" (${option.amount} HUF).`);
  }

  logger.info("COD (utánvét) shipping options ready.");
}
