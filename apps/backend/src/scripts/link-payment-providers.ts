import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

export default async function link_payment_providers({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name"],
  });
  const huRegion = regions.find((r) => r.name === "Magyarország");

  if (!huRegion) {
    logger.warn("Hungary region not found - run seed-hu.ts first.");
    return;
  }

  await link.create([
    {
      [Modules.REGION]: { region_id: huRegion.id },
      [Modules.PAYMENT]: { payment_provider_id: "pp_barion_barion" },
    },
    {
      [Modules.REGION]: { region_id: huRegion.id },
      [Modules.PAYMENT]: { payment_provider_id: "pp_simplepay_simplepay" },
    },
  ]);

  logger.info("Linked Barion and SimplePay payment providers to Hungary region.");
}
