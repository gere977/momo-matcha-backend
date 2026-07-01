import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

const RENAMES: Record<string, string> = {
  "kiegészítők": "kiegeszitok",
  "szertartásos-matcha": "szertartasos-matcha",
};

export default async function rename_category_handles({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const categoryModuleService = container.resolve("product");

  const { data: categories } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
  });

  for (const [oldHandle, newHandle] of Object.entries(RENAMES)) {
    const category = categories.find((c) => c.handle === oldHandle);
    if (!category) {
      logger.info(`No category with handle "${oldHandle}" found, skipping.`);
      continue;
    }
    await categoryModuleService.updateProductCategories(category.id, {
      handle: newHandle,
    });
    logger.info(`Renamed category handle "${oldHandle}" -> "${newHandle}".`);
  }
}
