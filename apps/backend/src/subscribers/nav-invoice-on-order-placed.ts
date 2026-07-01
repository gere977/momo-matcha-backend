import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { NavClient, buildInvoiceXml } from "../modules/nav-invoicing/nav-client"

// Reports every placed order to NAV's Online Számla system, as legally required for a
// registered Hungarian business (egyéni vállalkozás) issuing invoices - see the plan's
// Phase 3 notes. Runs as a subscriber (retried by the event bus on failure) rather than
// inline in checkout, so a NAV outage never blocks order confirmation for the customer.
export default async function navInvoiceOnOrderPlaced({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  if (
    !process.env.NAV_TECH_USER_LOGIN ||
    !process.env.NAV_TECH_USER_PASSWORD ||
    !process.env.NAV_SIGN_KEY ||
    !process.env.NAV_EXCHANGE_KEY
  ) {
    logger.warn(
      "[NAV] Skipping invoice submission - NAV technical user credentials are not configured yet."
    )
    return
  }

  const { data: orders } = await query.graph({
    entity: "order",
    filters: { id: data.id },
    fields: [
      "id",
      "display_id",
      "email",
      "currency_code",
      "created_at",
      "customer.first_name",
      "customer.last_name",
      "billing_address.*",
      "items.title",
      "items.quantity",
      "items.unit_price",
      "items.total",
      "total",
      "subtotal",
      "tax_total",
    ],
  })
  const order = orders[0]

  if (!order || order.currency_code?.toLowerCase() !== "huf") {
    // Only HUF/domestic orders are in scope for NAV reporting for now.
    return
  }

  const client = new NavClient({
    login: process.env.NAV_TECH_USER_LOGIN!,
    password: process.env.NAV_TECH_USER_PASSWORD!,
    signKey: process.env.NAV_SIGN_KEY!,
    exchangeKey: process.env.NAV_EXCHANGE_KEY!,
    taxNumber: process.env.NAV_SUPPLIER_TAX_NUMBER ?? "",
    environment: (process.env.NAV_ENVIRONMENT as "test" | "prod") ?? "test",
  })

  const today = new Date().toISOString().slice(0, 10)
  const vatRate = 0.27
  const grossTotal = Number(order.total ?? 0)
  const netTotal = Math.round(grossTotal / (1 + vatRate))
  const vatTotal = grossTotal - netTotal

  const lines = (order.items ?? []).map((item: any, i: number) => {
    const lineGross = Number(item.total ?? 0)
    const lineNet = Math.round(lineGross / (1 + vatRate))
    return {
      lineNumber: i + 1,
      description: item.title,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price ?? 0),
      netAmount: lineNet,
      vatRate,
      vatAmount: lineGross - lineNet,
      grossAmount: lineGross,
    }
  })

  const invoiceXml = buildInvoiceXml({
    invoiceNumber: `MOMO-${order.display_id}`,
    issueDate: today,
    fulfillmentDate: today,
    paymentDate: today,
    supplierTaxNumber: process.env.NAV_SUPPLIER_TAX_NUMBER ?? "",
    supplierName: "Momo Matcha",
    supplierAddress: {
      city: process.env.NAV_SUPPLIER_CITY ?? "",
      postalCode: process.env.NAV_SUPPLIER_POSTAL_CODE ?? "",
      street: process.env.NAV_SUPPLIER_STREET ?? "",
    },
    customerName:
      order.billing_address?.first_name || order.billing_address?.last_name
        ? `${order.billing_address?.last_name ?? ""} ${order.billing_address?.first_name ?? ""}`.trim()
        : (order.email as string),
    customerEmail: order.email as string,
    customerAddress: order.billing_address
      ? {
          city: order.billing_address.city ?? "",
          postalCode: order.billing_address.postal_code ?? "",
          street: order.billing_address.address_1 ?? "",
          countryCode: (order.billing_address.country_code ?? "HU").toUpperCase(),
        }
      : undefined,
    lines,
    netTotal,
    vatTotal,
    grossTotal,
  })

  try {
    const exchangeToken = await client.tokenExchange()
    const transactionId = await client.manageInvoice([invoiceXml], exchangeToken)

    // Store the NAV transaction id for audit trail / later status polling.
    const orderModuleService = container.resolve("order")
    await orderModuleService.updateOrders(order.id, {
      metadata: { nav_transaction_id: transactionId, nav_status: "submitted" },
    })

    logger.info(`[NAV] Invoice submitted for order ${order.display_id}: transactionId=${transactionId}`)
  } catch (error) {
    // Compliance-critical failure - this must not fail silently. Until Phase 6's
    // notification module is wired up, this at minimum surfaces as an ERROR log line;
    // hook this into an owner-facing email/Slack alert once notifications exist.
    logger.error(`[NAV] Invoice submission FAILED for order ${order.display_id}: ${error.message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
