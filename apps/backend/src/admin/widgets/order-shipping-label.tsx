import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"

const MATCHA = "#6A8D53"

// Medusa injects the page's entity into widgets as the `data` prop; for
// order.details.* zones that's the order. We only need its id, then fetch the
// fields we want. (Avoids importing react-router-dom, which isn't a declared
// backend dependency and can't be resolved by the admin bundler.)
type OrderWidgetProps = { data: { id: string; display_id?: number } }

type Fulfillment = {
  id: string
  provider_id?: string
  shipped_at?: string | null
  packed_at?: string | null
  data?: Record<string, any> | null
}

type OrderResponse = {
  order?: {
    id: string
    display_id: number
    fulfillments?: Fulfillment[]
  }
}

const FIELDS =
  "id,display_id,fulfillments.id,fulfillments.provider_id,fulfillments.shipped_at,fulfillments.packed_at,fulfillments.data"

async function fetchOrder(id: string): Promise<OrderResponse> {
  const res = await fetch(`/admin/orders/${id}?fields=${FIELDS}`, {
    credentials: "include",
  })
  if (!res.ok) throw new Error(`Failed to load order (${res.status})`)
  return res.json()
}

// The GLS provider persists the label PDF as base64 in fulfillment.data
// (gls_label_base64). Decode it in the browser and trigger a download —
// no backend round-trip needed.
function downloadBase64Pdf(base64: string, filename: string) {
  try {
    const byteChars = atob(base64)
    const bytes = new Uint8Array(byteChars.length)
    for (let i = 0; i < byteChars.length; i++) {
      bytes[i] = byteChars.charCodeAt(i)
    }
    const blob = new Blob([bytes], { type: "application/pdf" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (e) {
    toast.error("Nem sikerült megnyitni a címkét.")
  }
}

function providerLabel(providerId?: string) {
  if (!providerId) return "Szállítás"
  if (providerId.includes("gls")) return "GLS"
  if (providerId.includes("foxpost")) return "FoxPost"
  return providerId
}

const OrderShippingLabelWidget = ({ data: order }: OrderWidgetProps) => {
  const id = order.id
  const { data, isLoading } = useQuery({
    queryKey: ["order-shipping-label", id],
    queryFn: () => fetchOrder(id),
    enabled: !!id,
  })

  const fulfillments = data?.order?.fulfillments ?? []
  const displayId = data?.order?.display_id

  return (
    <Container className="p-0">
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: `2px solid ${MATCHA}` }}
      >
        <Heading level="h2">Szállítási címke</Heading>
      </div>

      <div className="flex flex-col gap-3 px-6 py-4">
        {isLoading && <Text size="small">Betöltés…</Text>}

        {!isLoading && fulfillments.length === 0 && (
          <Text size="small" className="text-ui-fg-subtle">
            Még nincs teljesítés (fulfillment) ehhez a rendeléshez. Előbb
            teljesítsd a tételeket a fenti „Fulfill items” gombbal, majd itt
            letöltheted a futárcímkét.
          </Text>
        )}

        {fulfillments.map((f) => {
          const glsLabel = f.data?.gls_label_base64 as string | undefined
          const parcelNumber =
            f.data?.gls_parcel_number ?? f.data?.foxpost_parcel_id ?? null
          const isFoxpost = (f.provider_id ?? "").includes("foxpost")

          return (
            <div
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-ui-border-base p-3"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Badge size="2xsmall" color="grey">
                    {providerLabel(f.provider_id)}
                  </Badge>
                  {f.shipped_at ? (
                    <Badge size="2xsmall" color="green">
                      Feladva
                    </Badge>
                  ) : (
                    <Badge size="2xsmall" color="orange">
                      Feladásra vár
                    </Badge>
                  )}
                </div>
                {parcelNumber && (
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Csomagszám: {String(parcelNumber)}
                  </Text>
                )}
              </div>

              {glsLabel ? (
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() =>
                    downloadBase64Pdf(
                      glsLabel,
                      `momo-matcha-cimke-${displayId ?? f.id}.pdf`
                    )
                  }
                >
                  Címke letöltése (PDF)
                </Button>
              ) : isFoxpost ? (
                <Text size="xsmall" className="text-ui-fg-muted">
                  FoxPost címke a FoxPost API-n keresztül tölthető le (kulcs
                  szükséges)
                </Text>
              ) : (
                <Text size="xsmall" className="text-ui-fg-muted">
                  Nincs elérhető címke
                </Text>
              )}
            </div>
          )
        })}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default OrderShippingLabelWidget
