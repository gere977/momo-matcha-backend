import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ANALYTICS_LITE_MODULE } from "../modules/analytics-lite"

const RETENTION_DAYS = 90
const BATCH = 5000

// The page_view table grows with every visit and nothing else ever deletes
// from it. Keep 90 days — enough for the 30-day admin dashboards plus
// season-over-season comparison, small enough to stay fast on Neon.
export default async function prunePageViewsJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const analytics = container.resolve(ANALYTICS_LITE_MODULE) as any

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS)

  let totalDeleted = 0
  // Delete in batches so a large backlog never holds a long transaction.
  for (;;) {
    const rows: { id: string }[] = await analytics.listPageViews(
      { created_at: { $lt: cutoff } },
      { select: ["id"], take: BATCH }
    )
    if (!rows.length) break
    await analytics.deletePageViews(rows.map((r) => r.id))
    totalDeleted += rows.length
    if (rows.length < BATCH) break
  }

  if (totalDeleted > 0) {
    logger.info(
      `[analytics] Pruned ${totalDeleted} page_view rows older than ${RETENTION_DAYS} days.`
    )
  }
}

export const config = {
  name: "prune-page-views",
  // Nightly at 04:10 server time.
  schedule: "10 4 * * *",
}
