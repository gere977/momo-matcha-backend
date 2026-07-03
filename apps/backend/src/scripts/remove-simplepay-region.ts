import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";

// SimplePay has no configuration/credentials yet - drop it from the HUF region
// so it doesn't show up as a raw provider id at checkout. Re-add it once (if)
// a SimplePay merchant account exists.
export default async function remove_simplepay_region({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code", "payment_providers.id"],
  });
  const hufRegion: any = regions.find((r) => r.currency_code === "huf");
  if (!hufRegion) {
    logger.warn("No HUF region found.");
    return;
  }

  const providerIds: string[] = (hufRegion.payment_providers ?? []).map(
    (p: any) => p.id
  );
  if (!providerIds.includes("pp_simplepay_simplepay")) {
    logger.info("SimplePay not linked to the HUF region - nothing to do.");
    return;
  }

  await updateRegionsWorkflow(container).run({
    input: {
      selector: { id: hufRegion.id },
      update: {
        payment_providers: providerIds.filter(
          (id) => id !== "pp_simplepay_simplepay"
        ),
      },
    },
  });
  logger.info("Removed pp_simplepay_simplepay from the HUF region.");
}
