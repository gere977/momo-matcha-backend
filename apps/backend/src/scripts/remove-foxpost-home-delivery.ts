import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { deleteShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";

// FoxPost only serves parcel lockers (csomagautomata) for this shop — home
// delivery goes exclusively through GLS. Removes the two mistakenly created
// FoxPost home-delivery options; the csomagautomata options stay.
export default async function remove_foxpost_home_delivery({
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

  const toRemove = options.filter((o) =>
    ["FoxPost házhozszállítás", "FoxPost házhozszállítás + utánvét"].includes(
      o.name
    )
  );

  if (!toRemove.length) {
    logger.info("No FoxPost home-delivery options found - nothing to do.");
    return;
  }

  await deleteShippingOptionsWorkflow(container).run({
    input: { ids: toRemove.map((o) => o.id) },
  });

  logger.info(
    `Deleted shipping options: ${toRemove.map((o) => o.name).join(", ")}.`
  );
}
