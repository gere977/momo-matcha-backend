import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Badge, Button, Container, Heading, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

type FulfillmentRow = {
  id: string
  provider_id: string | null
  created_at: string
  canceled_at: string | null
  data: Record<string, unknown> | null
}

const providerLabel = (providerId: string | null) => {
  if (providerId?.startsWith("foxpost")) return "FoxPost"
  if (providerId?.startsWith("gls")) return "GLS"
  return "Kézi / egyéb"
}

// The order details page fetches fulfillments without their `data` column, so
// the widget re-fetches just the fields it needs (barcode / parcel number).
const FulfillmentLabelsWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const [fulfillments, setFulfillments] = useState<FulfillmentRow[]>([])

  useEffect(() => {
    fetch(
      `/admin/orders/${data.id}?fields=fulfillments.id,fulfillments.provider_id,fulfillments.created_at,fulfillments.canceled_at,fulfillments.data`,
      { credentials: "include" }
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setFulfillments(json?.order?.fulfillments ?? []))
      .catch(() => setFulfillments([]))
  }, [data.id])

  const active = fulfillments.filter((f) => !f.canceled_at)

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Szállítási címkék</Heading>
      </div>
      {!active.length && (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            Még nincs teljesítés ehhez a rendeléshez. Előbb teljesítsd a
            tételeket a „Fulfill items" gombbal — a GLS/FoxPost címke utána
            innen tölthető le.
          </Text>
        </div>
      )}
      {active.map((fulfillment) => {
        const barcode = fulfillment.data?.foxpost_barcode as string | undefined
        const parcelNumber = fulfillment.data?.gls_parcel_number as
          | string
          | number
          | undefined
        const hasLabel = Boolean(
          barcode || fulfillment.data?.gls_label_base64
        )

        return (
          <div
            key={fulfillment.id}
            className="flex items-center justify-between gap-x-4 px-6 py-4"
          >
            <div>
              <Text size="small" weight="plus">
                {providerLabel(fulfillment.provider_id)}
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                {barcode
                  ? `Vonalkód: ${barcode}`
                  : parcelNumber
                    ? `Csomagszám: ${parcelNumber}`
                    : "Nincs futárszolgálati csomagadat"}
              </Text>
            </div>
            {hasLabel ? (
              <Button
                size="small"
                variant="secondary"
                onClick={() =>
                  window.open(
                    `/admin/fulfillments/${fulfillment.id}/label`,
                    "_blank"
                  )
                }
              >
                Címke letöltése
              </Button>
            ) : (
              <Badge size="2xsmall" color="grey">
                nincs címke
              </Badge>
            )}
          </div>
        )
      })}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default FulfillmentLabelsWidget
