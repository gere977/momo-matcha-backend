import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  createCollectionsWorkflow,
  deleteProductsWorkflow,
  deleteProductCategoriesWorkflow,
} from "@medusajs/medusa/core-flows";

const DEMO_CATEGORY_HANDLES = ["shirts", "sweatshirts", "pants", "merch"];
const MATCHA_CATEGORY_HANDLES = ["szertartásos-matcha", "napi-matcha"];

export default async function fix_catalog({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const productModuleService = container.resolve("product");

  const { data: categories } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle", "products.id"],
  });

  // Delete leftover demo (clothing) products + categories.
  const demoCategories = categories.filter((c) =>
    DEMO_CATEGORY_HANDLES.includes(c.handle)
  );
  const demoProductIds = demoCategories.flatMap((c) =>
    (c.products ?? []).map((p) => p.id)
  );

  if (demoProductIds.length) {
    await deleteProductsWorkflow(container).run({
      input: { ids: demoProductIds },
    });
    logger.info(`Deleted ${demoProductIds.length} demo products.`);
  }

  if (demoCategories.length) {
    await deleteProductCategoriesWorkflow(container).run({
      input: demoCategories.map((c) => c.id),
    });
    logger.info(`Deleted ${demoCategories.length} demo categories.`);
  }

  // Create the "Matcha" collection and link both matcha categories' products to it.
  const { data: existingCollections } = await query.graph({
    entity: "product_collection",
    fields: ["id", "handle"],
  });

  let matchaCollectionId = existingCollections.find(
    (c) => c.handle === "matcha"
  )?.id;

  if (!matchaCollectionId) {
    const { result } = await createCollectionsWorkflow(container).run({
      input: { collections: [{ title: "Matcha Teák", handle: "matcha" }] },
    });
    matchaCollectionId = result[0].id;
    logger.info(`Created "Matcha Teák" collection: ${matchaCollectionId}`);
  } else {
    logger.info(`"Matcha Teák" collection already exists: ${matchaCollectionId}`);
  }

  const matchaCategories = categories.filter((c) =>
    MATCHA_CATEGORY_HANDLES.includes(c.handle)
  );
  const matchaProductIds = matchaCategories.flatMap((c) =>
    (c.products ?? []).map((p) => p.id)
  );

  if (matchaProductIds.length) {
    await productModuleService.updateProducts(
      { id: matchaProductIds },
      { collection_id: matchaCollectionId }
    );
    logger.info(
      `Linked ${matchaProductIds.length} matcha product(s) to the "Matcha Teák" collection.`
    );
  }

  // Link the flavored matcha products directly by handle (from seed-real-catalog
  // they may not be in a category), and unpublish the old imageless placeholder.
  const { data: allProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "title"],
  });
  const flavorIds = allProducts
    .filter((p) => (p.handle ?? "").includes("premium-momo-matcha"))
    .map((p) => p.id);
  if (flavorIds.length) {
    await productModuleService.updateProducts(
      { id: flavorIds },
      { collection_id: matchaCollectionId }
    );
    logger.info(
      `Linked ${flavorIds.length} flavored matcha product(s) to the collection.`
    );
  }

  const oldPlaceholder = allProducts.find(
    (p) => p.title === "Szertartásos Matcha"
  );
  if (oldPlaceholder) {
    await productModuleService.updateProducts(
      { id: oldPlaceholder.id },
      { status: "draft" }
    );
    logger.info("Unpublished old placeholder 'Szertartásos Matcha'.");
  }

  logger.info("Catalog fix complete.");
}
