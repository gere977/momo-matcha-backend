import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { deleteShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";

// Removes the starter template's demo shipping options (EUR-only, so they show
// up with an empty price on the HU checkout).
export default async function remove_demo_shipping({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name"],
  });

  const demoOptions = options.filter((o) =>
    ["Standard Shipping", "Express Shipping"].includes(o.name)
  );

  if (!demoOptions.length) {
    logger.info("No demo shipping options found - nothing to do.");
    return;
  }

  await deleteShippingOptionsWorkflow(container).run({
    input: { ids: demoOptions.map((o) => o.id) },
  });

  logger.info(
    `Deleted demo shipping options: ${demoOptions.map((o) => o.name).join(", ")}.`
  );
}
