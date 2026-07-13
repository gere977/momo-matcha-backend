import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import {
  CHART_GREEN,
  CHART_PINK,
  Kpi,
  PageHeader,
  formatMoney,
  formatNumber,
} from "../../lib/ui"

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
  top_campaigns?: { key: string; count: number }[]
  funnel?: {
    sessions: number
    product_views: number
    cart: number
    checkout: number
    purchase: number
  }
}

async function fetchSummary(): Promise<AnalyticsSummary> {
  const res = await fetch(`/admin/analytics`, { credentials: "include" })
  if (!res.ok) throw new Error(`Failed to load analytics (${res.status})`)
  return res.json()
}

// Horizontal funnel bars: each step as a share of sessions.
function Funnel({ funnel }: { funnel: NonNullable<AnalyticsSummary["funnel"]> }) {
  const steps = [
    { label: "Látogatás (munkamenet)", value: funnel.sessions },
    { label: "Termékoldal megtekintés", value: funnel.product_views },
    { label: "Kosár", value: funnel.cart },
    { label: "Pénztár", value: funnel.checkout },
    { label: "Vásárlás", value: funnel.purchase },
  ]
  const max = Math.max(1, funnel.sessions)

  return (
    <div className="flex flex-col gap-2">
      {steps.map((s, i) => {
        const pct = Math.round((s.value / max) * 100)
        const dropoff =
          i > 0 && steps[i - 1].value > 0
            ? Math.round((s.value / steps[i - 1].value) * 100)
            : null
        return (
          <div key={s.label} className="flex items-center gap-3">
            <div style={{ width: 190, flexShrink: 0 }}>
              <Text size="small">{s.label}</Text>
            </div>
            <div
              className="relative flex-1 overflow-hidden rounded-md bg-ui-bg-subtle"
              style={{ height: 26 }}
            >
              <div
                style={{
                  width: `${Math.max(pct, s.value > 0 ? 2 : 0)}%`,
                  background: CHART_GREEN,
                  height: "100%",
                  borderRadius: 6,
                }}
              />
            </div>
            <div style={{ width: 170, flexShrink: 0, textAlign: "right" }}>
              <Text size="small" className="tabular-nums">
                {formatNumber(s.value)}
                {dropoff !== null && (
                  <span className="text-ui-fg-muted"> · {dropoff}% továbblépés</span>
                )}
              </Text>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Round the axis max up to a "nice" number (1/2/5 × power of ten) so the
// gridline values are readable instead of arbitrary data maxima.
function niceCeil(v: number) {
  const pow = 10 ** Math.floor(Math.log10(v))
  const n = v / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * pow
}

const compactHu = new Intl.NumberFormat("hu-HU", {
  notation: "compact",
  maximumFractionDigits: 1,
})

// Dependency-free daily bar chart: recessive y-gridlines with compact value
// labels, and a hover tooltip with the exact value (full-column hit targets,
// larger than the marks themselves).
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
  const [hover, setHover] = useState<number | null>(null)

  const width = 900
  const height = 180
  const padTop = 14
  const niceMax = niceCeil(Math.max(1, ...values))
  const barW = width / values.length
  const y = (v: number) => height - (v / niceMax) * (height - padTop)
  const ticks = [niceMax / 2, niceMax]
  const fmt = (v: number) => (formatValue ? formatValue(v) : formatNumber(v))

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${width} ${height + 22}`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {/* Recessive grid: baseline + two value lines, labels in muted ink. */}
        <line
          x1={0}
          x2={width}
          y1={height}
          y2={height}
          className="stroke-ui-border-base"
          strokeWidth={1}
        />
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={0}
              x2={width}
              y1={y(t)}
              y2={y(t)}
              className="stroke-ui-border-base"
              strokeWidth={1}
              strokeDasharray="2 4"
            />
            <text
              x={2}
              y={y(t) - 4}
              fontSize="9"
              className="fill-ui-fg-muted tabular-nums"
            >
              {compactHu.format(t)}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          const h = Math.max(v > 0 ? 2 : 0, height - y(v))
          const x = i * barW
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
                opacity={hover === null ? 0.85 : hover === i ? 1 : 0.4}
              />
              {/* Full-column hit target — bigger than the mark. */}
              <rect
                x={x}
                y={0}
                width={barW}
                height={height}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
              {showLabel && (
                <text
                  x={x + barW / 2}
                  y={height + 14}
                  textAnchor="middle"
                  fontSize="9"
                  className="fill-ui-fg-muted"
                >
                  {days[i].slice(5)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-ui-border-base bg-ui-bg-base px-2 py-1 shadow-elevation-flyout"
          style={{
            left: `${Math.min(
              92,
              Math.max(8, ((hover + 0.5) / values.length) * 100)
            )}%`,
          }}
        >
          <Text size="xsmall" className="block text-ui-fg-subtle">
            {days[hover]}
          </Text>
          <Text size="small" className="block font-medium tabular-nums">
            {fmt(values[hover])}
          </Text>
        </div>
      )}
    </div>
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
      <PageHeader
        title="Statisztika"
        subtitle="Látogatottság és értékesítés — elmúlt 30 nap"
      />

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
          value={formatNumber(data?.totals.views ?? 0)}
          hint="30 nap"
          loading={isLoading}
        />
        <Kpi
          label="Látogató (munkamenet)"
          value={formatNumber(data?.totals.sessions ?? 0)}
          hint="Egyedi böngésző-munkamenetek"
          loading={isLoading}
        />
        <Kpi
          label="Rendelések"
          value={formatNumber(data?.totals.orders ?? 0)}
          hint="Nem törölt rendelések"
          loading={isLoading}
        />
        <Kpi
          label="Bevétel"
          value={formatMoney(data?.totals.revenue ?? 0, currency)}
          hint="30 nap"
          loading={isLoading}
        />
        <Kpi
          label="Konverzió"
          value={conversion}
          hint="Rendelés / látogató"
          loading={isLoading}
        />
      </div>

      {data && (
        <>
          <div className="px-6">
            <Heading level="h2" className="mb-2">
              Napi oldalmegtekintések
            </Heading>
            <Container className="p-4">
              <BarChart days={data.days} values={data.views_by_day} color={CHART_GREEN} />
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
                color={CHART_PINK}
                formatValue={(v) => formatMoney(v, currency)}
              />
            </Container>
          </div>

          {data.funnel && (
            <div className="px-6">
              <Heading level="h2" className="mb-2">
                Vásárlási tölcsér (funnel)
              </Heading>
              <Container className="p-4">
                <Funnel funnel={data.funnel} />
              </Container>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 px-6 md:grid-cols-2">
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
            <TopList
              title="Kampányok (UTM forrás / kampány)"
              rows={data.top_campaigns ?? []}
              emptyText="Még nincs UTM-mel jelölt látogatás — használj utm_source/utm_campaign paramétereket a hirdetéseidben és posztjaidban."
            />
          </div>
        </>
      )}

      <div className="px-6 pb-6">
        <Container className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <Heading level="h2">Vercel Web Analytics</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              Független, sütimentes mérés a Vercelen (Core Web Vitals és
              látogatottság) — kiegészíti a fenti saját statisztikát.
            </Text>
          </div>
          <a
            href="https://vercel.com/gere977s-projects/momo-matcha-storefront/analytics"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-ui-bg-base-hover"
          >
            Megnyitás a Vercelen
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path
                d="M7 13 13 7M8 7h5v5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </Container>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Statisztika",
  icon: ChartIcon,
})

export default AnalyticsPage
