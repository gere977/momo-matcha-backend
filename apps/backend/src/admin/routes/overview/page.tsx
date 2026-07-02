import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Container, Heading, Text, Table } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"

// Momo Matcha brand accent — used sparingly so the page still feels native.
const MATCHA = "#6A8D53"

// Inline sidebar icon (a small bar chart) — avoids importing @medusajs/icons,
// which is not a declared dependency of the backend package and therefore
// isn't resolvable by the admin bundler.
const OverviewIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M3 3v13a1 1 0 0 0 1 1h13"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <rect x="6" y="9" width="2.5" height="5" rx="0.5" fill="currentColor" />
    <rect x="10.5" y="6" width="2.5" height="8" rx="0.5" fill="currentColor" />
    <rect x="15" y="11" width="2.5" height="3" rx="0.5" fill="currentColor" />
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
}

const ORDER_FIELDS =
  "id,display_id,status,fulfillment_status,payment_status,total,currency_code,created_at,email"

async function fetchOrders(): Promise<AdminOrder[]> {
  const res = await fetch(
    `/admin/orders?limit=100&order=-created_at&fields=${ORDER_FIELDS}`,
    { credentials: "include" }
  )
  if (!res.ok) throw new Error(`Failed to load orders (${res.status})`)
  const data = await res.json()
  return (data.orders ?? []) as AdminOrder[]
}

const LOW_STOCK_THRESHOLD = 5

type InventoryItem = {
  id: string
  sku?: string
  title?: string
  stocked_quantity?: number
  reserved_quantity?: number
}

async function fetchInventory(): Promise<InventoryItem[]> {
  const res = await fetch(
    `/admin/inventory-items?limit=200&fields=id,sku,title,stocked_quantity,reserved_quantity`,
    { credentials: "include" }
  )
  if (!res.ok) throw new Error(`Failed to load inventory (${res.status})`)
  const data = await res.json()
  return (data.inventory_items ?? []) as InventoryItem[]
}

function availableQty(item: InventoryItem): number | null {
  if (typeof item.stocked_quantity !== "number") return null
  return item.stocked_quantity - (item.reserved_quantity ?? 0)
}

function formatMoney(amount: number, currency?: string) {
  try {
    return new Intl.NumberFormat("hu-HU", {
      style: "currency",
      currency: (currency || "HUF").toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount ?? 0)
  } catch {
    return `${Math.round(amount ?? 0)} ${(currency || "").toUpperCase()}`
  }
}

const AWAITING = new Set(["not_fulfilled", "partially_fulfilled"])

function fulfillmentBadgeColor(
  status: string
): "green" | "orange" | "red" | "grey" {
  if (status === "fulfilled" || status === "shipped" || status === "delivered")
    return "green"
  if (status === "partially_fulfilled" || status === "partially_shipped")
    return "orange"
  if (status === "canceled") return "red"
  return "grey"
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <Container className="flex flex-col gap-1 p-4">
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
      <Heading level="h2" style={{ color: MATCHA }}>
        {value}
      </Heading>
      {hint && (
        <Text size="xsmall" className="text-ui-fg-muted">
          {hint}
        </Text>
      )}
    </Container>
  )
}

const OverviewPage = () => {
  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: ["overview-orders"],
    queryFn: fetchOrders,
  })
  const { data: inventory = [] } = useQuery({
    queryKey: ["overview-inventory"],
    queryFn: fetchInventory,
  })

  const lowStock = inventory
    .map((item) => ({ item, available: availableQty(item) }))
    .filter(
      (x) => x.available !== null && x.available <= LOW_STOCK_THRESHOLD
    )
    .sort((a, b) => (a.available ?? 0) - (b.available ?? 0))

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const todaysOrders = orders.filter(
    (o) => new Date(o.created_at) >= startOfToday && o.status !== "canceled"
  )
  const currency = orders[0]?.currency_code || "HUF"
  const todaysRevenue = todaysOrders.reduce((sum, o) => sum + (o.total ?? 0), 0)
  const awaiting = orders.filter((o) => AWAITING.has(o.fulfillment_status))
  const recent = orders.slice(0, 8)

  return (
    <Container className="flex flex-col gap-y-4 p-0">
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: `2px solid ${MATCHA}` }}
      >
        <div>
          <Heading level="h1">Momo Matcha — Áttekintés</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            A webshop napi állapota egy pillantással
          </Text>
        </div>
        {!isLoading && (
          <Badge color="green" size="small">
            {orders.length} rendelés összesen
          </Badge>
        )}
      </div>

      {isError && (
        <div className="px-6">
          <Text className="text-ui-fg-error">
            Nem sikerült betölteni a rendeléseket. Frissítsd az oldalt.
          </Text>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 px-6 md:grid-cols-4">
        <Kpi
          label="Mai rendelések"
          value={isLoading ? "…" : String(todaysOrders.length)}
          hint="Ma leadott, nem törölt"
        />
        <Kpi
          label="Mai bevétel"
          value={isLoading ? "…" : formatMoney(todaysRevenue, currency)}
          hint="Mai rendelések összértéke"
        />
        <Kpi
          label="Teljesítésre vár"
          value={isLoading ? "…" : String(awaiting.length)}
          hint="Csomagolásra/feladásra váró rendelés"
        />
        <Kpi
          label="Alacsony készlet"
          value={String(lowStock.length)}
          hint={`${LOW_STOCK_THRESHOLD} db vagy kevesebb`}
        />
      </div>

      {lowStock.length > 0 && (
        <div className="px-6">
          <Heading level="h2" className="mb-2">
            Alacsony készlet — figyelmeztetés
          </Heading>
          <Container className="p-0">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Termék / SKU</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Elérhető
                  </Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {lowStock.slice(0, 10).map(({ item, available }) => (
                  <Table.Row key={item.id}>
                    <Table.Cell>{item.title || item.sku || item.id}</Table.Cell>
                    <Table.Cell className="text-right">
                      <Badge
                        size="2xsmall"
                        color={(available ?? 0) <= 0 ? "red" : "orange"}
                      >
                        {available} db
                      </Badge>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </Container>
        </div>
      )}

      <div className="px-6 pb-6">
        <Heading level="h2" className="mb-2">
          Legutóbbi rendelések
        </Heading>
        <Container className="p-0">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Rendelés</Table.HeaderCell>
                <Table.HeaderCell>Vásárló</Table.HeaderCell>
                <Table.HeaderCell>Teljesítés</Table.HeaderCell>
                <Table.HeaderCell>Fizetés</Table.HeaderCell>
                <Table.HeaderCell className="text-right">
                  Összeg
                </Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {isLoading && (
                <Table.Row>
                  <Table.Cell colSpan={5}>Betöltés…</Table.Cell>
                </Table.Row>
              )}
              {!isLoading && recent.length === 0 && (
                <Table.Row>
                  <Table.Cell colSpan={5}>Még nincs rendelés.</Table.Cell>
                </Table.Row>
              )}
              {recent.map((o) => (
                <Table.Row key={o.id}>
                  <Table.Cell>#{o.display_id}</Table.Cell>
                  <Table.Cell>{o.email}</Table.Cell>
                  <Table.Cell>
                    <Badge
                      size="2xsmall"
                      color={fulfillmentBadgeColor(o.fulfillment_status)}
                    >
                      {o.fulfillment_status}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge
                      size="2xsmall"
                      color={o.payment_status === "captured" ? "green" : "grey"}
                    >
                      {o.payment_status}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    {formatMoney(o.total, o.currency_code)}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Container>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Áttekintés",
  icon: OverviewIcon,
})

export default OverviewPage
