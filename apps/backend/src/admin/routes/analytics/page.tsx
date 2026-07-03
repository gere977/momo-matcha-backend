import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"

const MATCHA = "#6A8D53"
const ACCENT = "#E06B85"

const ChartIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M3 16.5 8 10l3.5 3L17 5.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="17" cy="5.5" r="1.5" fill="currentColor" />
  </svg>
)

type AnalyticsSummary = {
  days: string[]
  views_by_day: number[]
  sessions_by_day: number[]
  orders_by_day: number[]
  revenue_by_day: number[]
  totals: {
    views: number
    sessions: number
    orders: number
    revenue: number
    currency: string
  }
  top_pages: { key: string; count: number }[]
  top_referrers: { key: string; count: number }[]
}

async function fetchSummary(): Promise<AnalyticsSummary> {
  const res = await fetch(`/admin/analytics`, { credentials: "include" })
  if (!res.ok) throw new Error(`Failed to load analytics (${res.status})`)
  return res.json()
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

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
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

// Dependency-free daily bar chart
function BarChart({
  days,
  values,
  color,
  formatValue,
}: {
  days: string[]
  values: number[]
  color: string
  formatValue?: (v: number) => string
}) {
  const width = 900
  const height = 180
  const pad = 4
  const max = Math.max(1, ...values)
  const barW = (width - pad * 2) / values.length

  return (
    <svg
      viewBox={`0 0 ${width} ${height + 22}`}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {values.map((v, i) => {
        const h = Math.round((v / max) * (height - 10))
        const x = pad + i * barW
        const showLabel = i % 5 === 0 || i === values.length - 1
        return (
          <g key={days[i]}>
            <rect
              x={x + 1}
              y={height - h}
              width={Math.max(1, barW - 2)}
              height={h}
              rx={2}
              fill={color}
              opacity={0.85}
            >
              <title>
                {days[i]}: {formatValue ? formatValue(v) : v}
              </title>
            </rect>
            {showLabel && (
              <text
                x={x + barW / 2}
                y={height + 14}
                textAnchor="middle"
                fontSize="9"
                fill="#999"
              >
                {days[i].slice(5)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function TopList({
  title,
  rows,
  emptyText,
}: {
  title: string
  rows: { key: string; count: number }[]
  emptyText: string
}) {
  return (
    <div>
      <Heading level="h2" className="mb-2">
        {title}
      </Heading>
      <Container className="p-0">
        <Table>
          <Table.Body>
            {rows.length === 0 && (
              <Table.Row>
                <Table.Cell>{emptyText}</Table.Cell>
                <Table.Cell />
              </Table.Row>
            )}
            {rows.map((r) => (
              <Table.Row key={r.key}>
                <Table.Cell className="truncate max-w-[320px]">{r.key}</Table.Cell>
                <Table.Cell className="text-right">{r.count}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Container>
    </div>
  )
}

const AnalyticsPage = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: fetchSummary,
    refetchInterval: 120_000,
  })

  const currency = data?.totals.currency ?? "huf"
  const conversion =
    data && data.totals.sessions > 0
      ? ((data.totals.orders / data.totals.sessions) * 100).toFixed(1) + "%"
      : "–"

  return (
    <Container className="flex flex-col gap-y-5 p-0">
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: `2px solid ${MATCHA}` }}
      >
        <div>
          <Heading level="h1">Statisztika</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Látogatottság és értékesítés — elmúlt 30 nap
          </Text>
        </div>
      </div>

      {isError && (
        <div className="px-6">
          <Text className="text-ui-fg-error">
            Nem sikerült betölteni a statisztikát. Frissítsd az oldalt.
          </Text>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 px-6 md:grid-cols-5">
        <Kpi
          label="Oldalmegtekintés"
          value={isLoading ? "…" : String(data?.totals.views ?? 0)}
          hint="30 nap"
        />
        <Kpi
          label="Látogató (munkamenet)"
          value={isLoading ? "…" : String(data?.totals.sessions ?? 0)}
          hint="Egyedi böngésző-munkamenetek"
        />
        <Kpi
          label="Rendelések"
          value={isLoading ? "…" : String(data?.totals.orders ?? 0)}
          hint="Nem törölt rendelések"
        />
        <Kpi
          label="Bevétel"
          value={isLoading ? "…" : formatMoney(data?.totals.revenue ?? 0, currency)}
          hint="30 nap"
        />
        <Kpi label="Konverzió" value={isLoading ? "…" : conversion} hint="Rendelés / látogató" />
      </div>

      {data && (
        <>
          <div className="px-6">
            <Heading level="h2" className="mb-2">
              Napi oldalmegtekintések
            </Heading>
            <Container className="p-4">
              <BarChart days={data.days} values={data.views_by_day} color={MATCHA} />
            </Container>
          </div>

          <div className="px-6">
            <Heading level="h2" className="mb-2">
              Napi bevétel
            </Heading>
            <Container className="p-4">
              <BarChart
                days={data.days}
                values={data.revenue_by_day}
                color={ACCENT}
                formatValue={(v) => formatMoney(v, currency)}
              />
            </Container>
          </div>

          <div className="grid grid-cols-1 gap-4 px-6 pb-6 md:grid-cols-2">
            <TopList
              title="Legnézettebb oldalak"
              rows={data.top_pages}
              emptyText="Még nincs adat — a mérés az új verzió kitelepítésével indul."
            />
            <TopList
              title="Forgalmi források (referrer)"
              rows={data.top_referrers}
              emptyText="Még nincs külső hivatkozás."
            />
          </div>
        </>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Statisztika",
  icon: ChartIcon,
})

export default AnalyticsPage
