import { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils";
import { createCollectionsWorkflow } from "@medusajs/medusa/core-flows";

export default async function seed_featured_collection({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: existing } = await query.graph({
    entity: "product_collection",
    fields: ["id", "handle"],
  });

  let collectionId = existing.find((c) => c.handle === "kiemelt-termekek")?.id;

  if (!collectionId) {
    const { result } = await createCollectionsWorkflow(container).run({
      input: {
        collections: [
          { title: "Legnépszerűbb Termékek", handle: "kiemelt-termekek" },
        ],
      },
    });
    collectionId = result[0].id;
    logger.info(`Created featured collection: ${collectionId}`);
  } else {
    logger.info(`Featured collection already exists: ${collectionId}`);
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "collection_id", "status"],
  });
  const sampleProduct = products.find(
    (p) => p.handle === "szertartasos-matcha"
  );

  if (sampleProduct) {
    const productModuleService = container.resolve("product");
    const updates: Record<string, unknown> = {};
    if (sampleProduct.collection_id !== collectionId) {
      updates.collection_id = collectionId;
    }
    if (sampleProduct.status !== ProductStatus.PUBLISHED) {
      updates.status = ProductStatus.PUBLISHED;
    }
    if (Object.keys(updates).length) {
      await productModuleService.updateProducts(sampleProduct.id, updates);
      logger.info(
        `Updated sample product (published + linked to featured collection).`
      );
    }
  }

  logger.info("Featured collection seed complete.");
}
