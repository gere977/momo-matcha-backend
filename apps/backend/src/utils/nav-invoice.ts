import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { NavClient, buildInvoiceXml } from "../modules/nav-invoicing/nav-client"
import { asNumber } from "./money"

export type NavSubmitResult =
  | { status: "submitted"; transactionId: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string }

export function navConfigured(): boolean {
  return Boolean(
    process.env.NAV_TECH_USER_LOGIN &&
      process.env.NAV_TECH_USER_PASSWORD &&
      process.env.NAV_SIGN_KEY &&
      process.env.NAV_EXCHANGE_KEY
  )
}

// Submits the invoice for an order to NAV Online Számla. Idempotent: an order
// that already has a nav_transaction_id is skipped. Both success AND failure
// are recorded on the order metadata so the admin widget can show the real
// state and offer a resubmit — a compliance failure must never be invisible.
export async function submitNavInvoice(
  container: MedusaContainer,
  orderId: string
): Promise<NavSubmitResult> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const orderModuleService = container.resolve("order") as any

  if (!navConfigured()) {
    logger.warn(
      "[NAV] Skipping invoice submission - NAV technical user credentials are not configured yet."
    )
    return { status: "skipped", reason: "not_configured" }
  }

  const { data: orders } = await query.graph({
    entity: "order",
    filters: { id: orderId },
    fields: [
      "id",
      "display_id",
      "email",
      "currency_code",
      "created_at",
      "metadata",
      "customer.first_name",
      "customer.last_name",
      "billing_address.*",
      // Full item data is required for the order-level totals to compute
      // correctly - with a narrow field list `total` excluded the items.
      "items.*",
      "total",
      "subtotal",
      "shipping_total",
      "tax_total",
    ],
  })
  const order = orders[0]

  if (!order) {
    return { status: "failed", error: "A rendelés nem található." }
  }

  if (order.metadata?.nav_transaction_id) {
    // Already reported — never double-submit an invoice.
    return {
      status: "skipped",
      reason: `already_submitted:${order.metadata.nav_transaction_id}`,
    }
  }

  if (order.currency_code?.toLowerCase() !== "huf") {
    // Only HUF/domestic orders are in scope for NAV reporting for now.
    return { status: "skipped", reason: "not_huf" }
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
  const grossTotal = asNumber(order.total)
  const netTotal = Math.round(grossTotal / (1 + vatRate))
  const vatTotal = grossTotal - netTotal

  const lines = (order.items ?? []).map((item: any, i: number) => {
    const lineGross = asNumber(item.total)
    const lineNet = Math.round(lineGross / (1 + vatRate))
    return {
      lineNumber: i + 1,
      description: item.title,
      quantity: asNumber(item.quantity),
      unitPrice: asNumber(item.unit_price),
      netAmount: lineNet,
      vatRate,
      vatAmount: lineGross - lineNet,
      grossAmount: lineGross,
    }
  })

  // Shipping is part of the invoice total, so it needs its own line -
  // otherwise the line amounts don't add up to the invoice totals.
  const shippingGross = asNumber(order.shipping_total)
  if (shippingGross > 0) {
    const shippingNet = Math.round(shippingGross / (1 + vatRate))
    lines.push({
      lineNumber: lines.length + 1,
      description: "Szállítási költség",
      quantity: 1,
      unitPrice: shippingGross,
      netAmount: shippingNet,
      vatRate,
      vatAmount: shippingGross - shippingNet,
      grossAmount: shippingGross,
    })
  }

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
    await orderModuleService.updateOrders(order.id, {
      metadata: {
        ...(order.metadata ?? {}),
        nav_transaction_id: transactionId,
        nav_status: "submitted",
        nav_error: null,
      },
    })

    logger.info(
      `[NAV] Invoice submitted for order ${order.display_id}: transactionId=${transactionId}`
    )
    return { status: "submitted", transactionId }
  } catch (error: any) {
    const message = error?.message ?? "Ismeretlen hiba"
    // Compliance-critical failure — record it on the order so the admin
    // widget shows "Sikertelen" with a resubmit button, instead of the
    // failure existing only in a log line.
    try {
      await orderModuleService.updateOrders(order.id, {
        metadata: {
          ...(order.metadata ?? {}),
          nav_status: "failed",
          nav_error: String(message).slice(0, 500),
        },
      })
    } catch {
      // metadata write is best-effort; the error log below still fires
    }
    logger.error(
      `[NAV] Invoice submission FAILED for order ${order.display_id}: ${message}`
    )
    return { status: "failed", error: message }
  }
}
