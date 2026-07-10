import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { navConfigured, submitNavInvoice } from "../utils/nav-invoice"

// Safety net for the in-memory event bus: if the order.placed event was lost
// (deploy/restart) or the NAV submission failed, this daily job re-submits
// every recent HUF order that still has no NAV transaction id.
// submitNavInvoice is idempotent, so double-runs are harmless.
export default async function navInvoiceRetryJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!navConfigured()) {
    return
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const since = new Date()
  since.setDate(since.getDate() - 7)

  const { data: orders } = await query.graph({
    entity: "order",
    filters: { created_at: { $gte: since.toISOString() } } as any,
    fields: ["id", "display_id", "currency_code", "status", "metadata"],
  })

  const missing = (orders as any[]).filter(
    (o) =>
      o.status !== "canceled" &&
      o.currency_code?.toLowerCase() === "huf" &&
      !o.metadata?.nav_transaction_id
  )

  if (!missing.length) {
    return
  }

  logger.info(
    `[NAV retry] ${missing.length} order(s) without NAV transaction id - resubmitting.`
  )

  for (const order of missing) {
    const result = await submitNavInvoice(container, order.id)
    if (result.status === "failed") {
      logger.error(
        `[NAV retry] Order ${order.display_id} still failing: ${result.error}`
      )
    }
  }
}

export const config = {
  name: "nav-invoice-retry",
  // Every day at 05:30 (server time) — quiet hours, before the workday.
  schedule: "30 5 * * *",
}
