import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { submitNavInvoice } from "../utils/nav-invoice"

// Reports every placed order to NAV's Online Számla system, as legally required for a
// registered Hungarian business (egyéni vállalkozás) issuing invoices.
//
// NOTE: with the in-memory event bus (Redis modules disabled in production) there are
// no event retries — that's why submitNavInvoice records success/failure in the order
// metadata, the admin widget offers a manual resubmit, and the daily
// `nav-invoice-retry` job re-submits any HUF order that has no transaction id yet.
export default async function navInvoiceOnOrderPlaced({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await submitNavInvoice(container, data.id)
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
