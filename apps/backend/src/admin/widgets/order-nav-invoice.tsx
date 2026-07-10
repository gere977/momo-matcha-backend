import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Text, Copy, toast } from "@medusajs/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

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
  const queryClient = useQueryClient()
  const [resubmitting, setResubmitting] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ["order-nav-invoice", id],
    queryFn: () => fetchOrder(id),
    enabled: !!id,
  })

  const order = data?.order
  const navStatus = order?.metadata?.nav_status as string | undefined
  const navError = order?.metadata?.nav_error as string | undefined
  const txId = order?.metadata?.nav_transaction_id as string | undefined

  const resubmit = async () => {
    setResubmitting(true)
    try {
      const res = await fetch(`/admin/orders/${id}/nav-resubmit`, {
        method: "POST",
        credentials: "include",
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.ok) {
        toast.success(
          body.already_submitted
            ? "A számla már be volt küldve a NAV-hoz."
            : "Számla sikeresen beküldve a NAV-hoz."
        )
      } else {
        toast.error(body.message || "A NAV-beküldés nem sikerült.")
      }
    } catch {
      toast.error("A NAV-beküldés nem sikerült (hálózati hiba).")
    } finally {
      setResubmitting(false)
      queryClient.invalidateQueries({ queryKey: ["order-nav-invoice", id] })
    }
  }
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

            {navStatus === "failed" && navError && (
              <Text size="xsmall" className="text-ui-fg-error">
                Hiba: {navError}
              </Text>
            )}

            {!txId && (
              <div className="flex flex-col gap-2">
                <Button
                  size="small"
                  variant="secondary"
                  isLoading={resubmitting}
                  onClick={resubmit}
                >
                  {navStatus === "failed"
                    ? "Beküldés újra a NAV-hoz"
                    : "Beküldés a NAV-hoz most"}
                </Button>
                {!navStatus && (
                  <Text size="xsmall" className="text-ui-fg-muted">
                    A számla automatikusan beküldésre kerül a rendelés
                    leadásakor, amint a NAV technikai felhasználó be van
                    állítva — de innen kézzel is beküldheted.
                  </Text>
                )}
              </div>
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
