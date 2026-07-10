import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ANALYTICS_LITE_MODULE } from "../../../modules/analytics-lite"

const DAYS = 30

function dayKey(date: Date | string) {
  return new Date(date).toISOString().slice(0, 10)
}

// Aggregated traffic + sales stats for the admin "Statisztika" page.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const analytics = req.scope.resolve(ANALYTICS_LITE_MODULE) as any
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const since = new Date()
  since.setDate(since.getDate() - DAYS)
  since.setHours(0, 0, 0, 0)

  const pageViews: any[] = await analytics.listPageViews(
    { created_at: { $gte: since } },
    {
      select: [
        "path",
        "referrer",
        "session_id",
        "created_at",
        "event",
        "utm_source",
        "utm_medium",
        "utm_campaign",
      ],
      take: 100000,
    }
  )

  const { data: orders } = await query.graph({
    entity: "order",
    filters: { created_at: { $gte: since.toISOString() } } as any,
    fields: ["id", "total", "currency_code", "status", "created_at"],
  })

  // --- daily series -----------------------------------------------------------
  const days: string[] = []
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(dayKey(d))
  }

  const viewsByDay: Record<string, number> = Object.fromEntries(
    days.map((d) => [d, 0])
  )
  const sessionsByDay: Record<string, Set<string>> = Object.fromEntries(
    days.map((d) => [d, new Set<string>()])
  )
  const pathCounts: Record<string, number> = {}
  const refCounts: Record<string, number> = {}
  const campaignCounts: Record<string, number> = {}
  const allSessions = new Set<string>()

  // Checkout funnel, derived per session from paths + explicit events.
  const productSessions = new Set<string>()
  const cartSessions = new Set<string>()
  const checkoutSessions = new Set<string>()
  const purchaseSessions = new Set<string>()

  for (const pv of pageViews) {
    const isPageView = !pv.event || pv.event === "page_view"

    if (isPageView) {
      const key = dayKey(pv.created_at)
      if (key in viewsByDay) {
        viewsByDay[key]++
        if (pv.session_id) sessionsByDay[key].add(pv.session_id)
      }
      if (pv.session_id) allSessions.add(pv.session_id)
      pathCounts[pv.path] = (pathCounts[pv.path] ?? 0) + 1
    }

    if (pv.session_id) {
      if (isPageView && pv.path.includes("/products/")) {
        productSessions.add(pv.session_id)
      }
      if (pv.event === "add_to_cart" || (isPageView && /\/cart(\/|$|\?)/.test(pv.path))) {
        cartSessions.add(pv.session_id)
      }
      if (pv.event === "begin_checkout" || (isPageView && pv.path.includes("/checkout"))) {
        checkoutSessions.add(pv.session_id)
      }
      if (pv.event === "purchase" || (isPageView && pv.path.includes("/confirmed"))) {
        purchaseSessions.add(pv.session_id)
      }
    }

    if (pv.utm_source || pv.utm_campaign) {
      const campaignKey = [pv.utm_source ?? "-", pv.utm_campaign ?? "-"]
        .join(" / ")
        .slice(0, 120)
      campaignCounts[campaignKey] = (campaignCounts[campaignKey] ?? 0) + 1
    }

    if (isPageView && pv.referrer) {
      let host = pv.referrer
      try {
        host = new URL(pv.referrer).hostname
      } catch {
        // keep as-is
      }
      if (!host.includes("momomatcha.hu") && !host.includes("localhost")) {
        refCounts[host] = (refCounts[host] ?? 0) + 1
      }
    }
  }

  const ordersByDay: Record<string, number> = Object.fromEntries(
    days.map((d) => [d, 0])
  )
  const revenueByDay: Record<string, number> = Object.fromEntries(
    days.map((d) => [d, 0])
  )
  let totalRevenue = 0
  let orderCount = 0

  for (const order of orders as any[]) {
    if (order.status === "canceled") continue
    const key = dayKey(order.created_at)
    if (key in ordersByDay) {
      ordersByDay[key]++
      revenueByDay[key] += Number(order.total ?? 0)
    }
    orderCount++
    totalRevenue += Number(order.total ?? 0)
  }

  const top = (counts: Record<string, number>, n: number) =>
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([key, count]) => ({ key, count }))

  res.json({
    days,
    views_by_day: days.map((d) => viewsByDay[d]),
    sessions_by_day: days.map((d) => sessionsByDay[d].size),
    orders_by_day: days.map((d) => ordersByDay[d]),
    revenue_by_day: days.map((d) => revenueByDay[d]),
    totals: {
      views: pageViews.length,
      sessions: allSessions.size,
      orders: orderCount,
      revenue: totalRevenue,
      currency: (orders as any[])[0]?.currency_code ?? "huf",
    },
    top_pages: top(pathCounts, 10),
    top_referrers: top(refCounts, 10),
    top_campaigns: top(campaignCounts, 10),
    funnel: {
      sessions: allSessions.size,
      product_views: productSessions.size,
      cart: cartSessions.size,
      checkout: checkoutSessions.size,
      purchase: purchaseSessions.size,
    },
  })
}
