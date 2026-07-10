import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { MATCHA, PageHeader, formatMoney } from "../../lib/ui"

// Inline icon (truck) — @medusajs/icons is not a declared backend dependency,
// so it can't be imported here.
const TruckIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M2 5.5A1.5 1.5 0 0 1 3.5 4h7A1.5 1.5 0 0 1 12 5.5V13H3.5A1.5 1.5 0 0 1 2 11.5v-6Z"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path
      d="M12 7h2.6a1 1 0 0 1 .8.4l2.4 3.2a1 1 0 0 1 .2.6V12a1 1 0 0 1-1 1h-1"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <circle cx="6" cy="14.5" r="1.75" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="14" cy="14.5" r="1.75" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

type AdminOrder = {
  id: string
  display_id: number
  status: string
  fulfillment_status: string
  payment_status: string
  total: number
  currency_code: string
  created_at: string
  email: string
  metadata?: { pickup_point?: { carrier: string; name: string; address: string } }
  shipping_methods?: { name?: string }[]
  payment_collections?: { payments?: { provider_id?: string }[] }[]
}

const ORDER_FIELDS = [
  "id",
  "display_id",
  "status",
  "fulfillment_status",
  "payment_status",
  "total",
  "currency_code",
  "created_at",
  "email",
  "metadata",
  "shipping_methods.name",
  "payment_collections.payments.provider_id",
].join(",")

async function fetchOrders(): Promise<AdminOrder[]> {
  const res = await fetch(
    `/admin/orders?limit=100&order=-created_at&fields=${ORDER_FIELDS}`,
    { credentials: "include" }
  )
  if (!res.ok) throw new Error(`Failed to load orders (${res.status})`)
  const data = await res.json()
  return (data.orders ?? []) as AdminOrder[]
}

const FULFILLMENT_HU: Record<string, string> = {
  not_fulfilled: "Feldolgozásra vár",
  partially_fulfilled: "Részben feldolgozva",
  fulfilled: "Feldolgozva",
  partially_shipped: "Részben feladva",
  shipped: "Feladva",
  partially_delivered: "Részben kézbesítve",
  delivered: "Kézbesítve",
  canceled: "Törölve",
}

function fulfillmentBadgeColor(
  status: string
): "green" | "orange" | "red" | "grey" {
  if (status === "shipped" || status === "delivered") return "green"
  if (status === "fulfilled" || status === "partially_shipped") return "orange"
  if (status === "canceled") return "red"
  return "grey"
}

function carrierOf(order: AdminOrder): string {
  const name = order.shipping_methods?.[0]?.name ?? ""
  if (name.includes("GLS")) return "GLS"
  if (name.includes("FoxPost")) return "FoxPost"
  return name || "-"
}

function isCod(order: AdminOrder): boolean {
  return (
    order.payment_collections?.some((pc) =>
      pc.payments?.some((p) => p.provider_id === "pp_cod_cod")
    ) || (order.shipping_methods?.[0]?.name ?? "").includes("utánvét")
  )
}

function OrderRow({ order }: { order: AdminOrder }) {
  const pickup = order.metadata?.pickup_point

  return (
    <Table.Row key={order.id}>
      <Table.Cell>
        <a
          href={`/app/orders/${order.id}`}
          style={{ color: MATCHA, fontWeight: 600 }}
        >
          #{order.display_id}
        </a>
      </Table.Cell>
      <Table.Cell>
        {new Date(order.created_at).toLocaleDateString("hu-HU")}
      </Table.Cell>
      <Table.Cell>{order.email}</Table.Cell>
      <Table.Cell>
        <div className="flex flex-col">
          <span>{order.shipping_methods?.[0]?.name ?? "-"}</span>
          {pickup && (
            <Text size="xsmall" className="text-ui-fg-subtle">
              📍 {pickup.name} — {pickup.address}
            </Text>
          )}
        </div>
      </Table.Cell>
      <Table.Cell>
        <div className="flex gap-1">
          <Badge size="2xsmall" color={fulfillmentBadgeColor(order.fulfillment_status)}>
            {FULFILLMENT_HU[order.fulfillment_status] ?? order.fulfillment_status}
          </Badge>
          {isCod(order) && (
            <Badge size="2xsmall" color="purple">
              utánvét
            </Badge>
          )}
        </div>
      </Table.Cell>
      <Table.Cell className="text-right">
        {formatMoney(order.total, order.currency_code)}
      </Table.Cell>
      <Table.Cell className="text-right">
        <a href={`/app/orders/${order.id}`}>
          <Button size="small" variant="secondary">
            Megnyitás / címke
          </Button>
        </a>
      </Table.Cell>
    </Table.Row>
  )
}

function OrdersTable({
  orders,
  emptyText,
}: {
  orders: AdminOrder[]
  emptyText: string
}) {
  return (
    <Container className="p-0">
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Rendelés</Table.HeaderCell>
            <Table.HeaderCell>Dátum</Table.HeaderCell>
            <Table.HeaderCell>Vásárló</Table.HeaderCell>
            <Table.HeaderCell>Szállítás</Table.HeaderCell>
            <Table.HeaderCell>Állapot</Table.HeaderCell>
            <Table.HeaderCell className="text-right">Összeg</Table.HeaderCell>
            <Table.HeaderCell className="text-right"></Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {orders.length === 0 && (
            <Table.Row>
              <Table.Cell colSpan={7}>{emptyText}</Table.Cell>
            </Table.Row>
          )}
          {orders.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
        </Table.Body>
      </Table>
    </Container>
  )
}

const AWAITING = new Set(["not_fulfilled", "partially_fulfilled"])
const SHIPPED = new Set(["shipped", "partially_shipped", "delivered", "partially_delivered"])

const ShippingPage = () => {
  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: ["shipping-orders"],
    queryFn: fetchOrders,
    refetchInterval: 60_000,
  })

  const active = orders.filter((o) => o.status !== "canceled")
  const awaiting = active.filter((o) => AWAITING.has(o.fulfillment_status))
  const readyToShip = active.filter((o) => o.fulfillment_status === "fulfilled")
  const shipped = active.filter((o) => SHIPPED.has(o.fulfillment_status))

  const glsAwaiting = awaiting.filter((o) => carrierOf(o) === "GLS").length
  const foxpostAwaiting = awaiting.filter((o) => carrierOf(o) === "FoxPost").length

  return (
    <Container className="flex flex-col gap-y-5 p-0">
      <PageHeader
        title="Szállítás"
        subtitle="Csomagolásra és feladásra váró rendelések, címkenyomtatás"
        right={
          !isLoading ? (
            <div className="flex gap-2">
              <Badge color="orange">{awaiting.length} feldolgozásra vár</Badge>
              <Badge color="grey">GLS: {glsAwaiting}</Badge>
              <Badge color="grey">FoxPost: {foxpostAwaiting}</Badge>
            </div>
          ) : undefined
        }
      />

      {isError && (
        <div className="px-6">
          <Text className="text-ui-fg-error">
            Nem sikerült betölteni a rendeléseket. Frissítsd az oldalt.
          </Text>
        </div>
      )}

      <div className="px-6">
        <Heading level="h2" className="mb-2">
          Feldolgozásra vár
        </Heading>
        <Text size="small" className="text-ui-fg-subtle mb-2 block">
          Nyisd meg a rendelést, hozd létre a teljesítést (Fulfillment), majd a
          rendelés oldalán található címke widgettel nyomtasd a GLS/FoxPost
          címkét.
        </Text>
        <OrdersTable
          orders={awaiting}
          emptyText={isLoading ? "Betöltés…" : "Nincs feldolgozásra váró rendelés. 🎉"}
        />
      </div>

      {readyToShip.length > 0 && (
        <div className="px-6">
          <Heading level="h2" className="mb-2">
            Összekészítve — feladásra vár
          </Heading>
          <OrdersTable orders={readyToShip} emptyText="" />
        </div>
      )}

      <div className="px-6 pb-6">
        <Heading level="h2" className="mb-2">
          Feladva / kézbesítve
        </Heading>
        <OrdersTable
          orders={shipped.slice(0, 15)}
          emptyText={isLoading ? "Betöltés…" : "Még nincs feladott csomag."}
        />
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Szállítás",
  icon: TruckIcon,
})

export default ShippingPage
