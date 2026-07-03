import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  createShippingOptionsWorkflow,
  deleteShippingOptionsWorkflow,
  updateRegionsWorkflow,
} from "@medusajs/medusa/core-flows";

// Restructures checkout shipping/payment:
// - Adds pickup-point options (GLS csomagpont, FoxPost csomagautomata)
// - COD ("utánvét") moves to the payment step: every option gets a hidden
//   "+ utánvét" twin at +590 Ft that the storefront swaps to when the customer
//   picks the COD payment method (the twins are filtered out of the delivery list)
// - Adds the pp_cod_cod payment provider to the HUF region
// Idempotent - safe to re-run.
export default async function restructure_shipping({
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
    throw new Error("No service zone covering Hungary - run setup-shipping first.");
  }

  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });
  const shippingProfile = shippingProfiles[0];

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code", "payment_providers.id"],
  });
  const hufRegion: any = regions.find((r) => r.currency_code === "huf");

  // --- 1. Drop the old standalone COD options (wrong price structure) --------
  const { data: existingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name"],
  });

  const oldCod = existingOptions.filter((o) =>
    ["GLS házhozszállítás + utánvét", "FoxPost házhozszállítás + utánvét"].includes(
      o.name
    )
  );
  if (oldCod.length) {
    await deleteShippingOptionsWorkflow(container).run({
      input: { ids: oldCod.map((o) => o.id) },
    });
    logger.info(`Deleted old COD options: ${oldCod.map((o) => o.name).join(", ")}.`);
  }

  // --- 2. Ensure all base + hidden COD-twin options exist ---------------------
  const COD_FEE = 590;
  const baseOptions = [
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
    {
      name: "GLS csomagpont",
      code: "gls-point",
      description: "Átvétel az általad választott GLS csomagponton vagy automatában.",
      amount: 1090,
    },
    {
      name: "FoxPost csomagautomata",
      code: "foxpost-apm",
      description: "Átvétel az általad választott FoxPost automatából.",
      amount: 990,
    },
  ];

  const wanted = baseOptions.flatMap((base) => [
    base,
    {
      name: `${base.name} + utánvét`,
      code: `${base.code}-cod`,
      description: `${base.description} Fizetés átvételkor (utánvét, +${COD_FEE} Ft).`,
      amount: base.amount + COD_FEE,
    },
  ]);

  const { data: optionsAfterDelete } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name"],
  });

  for (const option of wanted) {
    if (optionsAfterDelete.some((o) => o.name === option.name)) {
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
    logger.info(`Created shipping option "${option.name}" (${option.amount} HUF).`);
  }

  // --- 3. Enable the COD payment provider on the HUF region -------------------
  if (hufRegion) {
    const providerIds: string[] = (hufRegion.payment_providers ?? []).map(
      (p: any) => p.id
    );
    if (!providerIds.includes("pp_cod_cod")) {
      await updateRegionsWorkflow(container).run({
        input: {
          selector: { id: hufRegion.id },
          update: {
            payment_providers: [...providerIds, "pp_cod_cod"],
          },
        },
      });
      logger.info("Added pp_cod_cod payment provider to the HUF region.");
    } else {
      logger.info("pp_cod_cod already enabled on the HUF region.");
    }
  }

  logger.info("Shipping/payment restructure complete.");
}
