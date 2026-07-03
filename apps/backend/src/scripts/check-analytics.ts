import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { ANALYTICS_LITE_MODULE } from "../modules/analytics-lite";

// Smoke test: insert + read one pageview to prove the table exists in prod.
export default async function check_analytics({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const analytics = container.resolve(ANALYTICS_LITE_MODULE) as any;

  await analytics.createPageViews({
    path: "/__smoke-test",
    session_id: "smoke",
  });
  const [rows, count] = await analytics.listAndCountPageViews({});
  logger.info(`page_view table OK - ${count} row(s).`);
  const smoke = rows.filter((r: any) => r.path === "/__smoke-test");
  if (smoke.length) {
    await analytics.deletePageViews(smoke.map((r: any) => r.id));
    logger.info("Smoke row cleaned up.");
  }
}
