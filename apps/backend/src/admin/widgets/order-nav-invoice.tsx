import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Container, Heading, Text, Copy } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"

const MATCHA = "#6A8D53"

// Medusa injects the order into the widget as the `data` prop (order.details.*).
type OrderWidgetProps = { data: { id: string; display_id?: number } }

type OrderResponse = {
  order?: {
    id: string
    display_id: number
    metadata?: Record<string, any> | null
  }
}

async function fetchOrder(id: string): Promise<OrderResponse> {
  const res = await fetch(
    `/admin/orders/${id}?fields=id,display_id,metadata`,
    { credentials: "include" }
  )
  if (!res.ok) throw new Error(`Failed to load order (${res.status})`)
  return res.json()
}

function statusBadge(status?: string): {
  color: "green" | "orange" | "red" | "grey"
  label: string
} {
  switch (status) {
    case "submitted":
      return { color: "green", label: "Beküldve a NAV-hoz" }
    case "done":
    case "confirmed":
      return { color: "green", label: "Elfogadva" }
    case "failed":
    case "error":
      return { color: "red", label: "Sikertelen" }
    default:
      return { color: "grey", label: "Nincs beküldve" }
  }
}

const OrderNavInvoiceWidget = ({ data: orderEntity }: OrderWidgetProps) => {
  const id = orderEntity.id
  const { data, isLoading } = useQuery({
    queryKey: ["order-nav-invoice", id],
    queryFn: () => fetchOrder(id),
    enabled: !!id,
  })

  const order = data?.order
  const navStatus = order?.metadata?.nav_status as string | undefined
  const txId = order?.metadata?.nav_transaction_id as string | undefined
  const invoiceNumber =
    order?.display_id != null ? `MOMO-${order.display_id}` : "—"
  const badge = statusBadge(navStatus)

  return (
    <Container className="p-0">
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: `2px solid ${MATCHA}` }}
      >
        <Heading level="h2">NAV Online Számla</Heading>
        {!isLoading && <Badge size="small" color={badge.color}>{badge.label}</Badge>}
      </div>

      <div className="flex flex-col gap-3 px-6 py-4">
        {isLoading && <Text size="small">Betöltés…</Text>}

        {!isLoading && (
          <>
            <div className="flex items-center justify-between">
              <Text size="small" className="text-ui-fg-subtle">
                Számlaszám
              </Text>
              <Text size="small" weight="plus">
                {invoiceNumber}
              </Text>
            </div>

            <div className="flex items-center justify-between">
              <Text size="small" className="text-ui-fg-subtle">
                NAV tranzakcióazonosító
              </Text>
              {txId ? (
                <div className="flex items-center gap-1">
                  <Text size="small" className="font-mono">
                    {txId}
                  </Text>
                  <Copy content={txId} />
                </div>
              ) : (
                <Text size="small" className="text-ui-fg-muted">
                  —
                </Text>
              )}
            </div>

            {!navStatus && (
              <Text size="xsmall" className="text-ui-fg-muted">
                A számla automatikusan beküldésre kerül a NAV-hoz a rendelés
                leadásakor, amint a NAV technikai felhasználó adatai be vannak
                állítva.
              </Text>
            )}
          </>
        )}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderNavInvoiceWidget
