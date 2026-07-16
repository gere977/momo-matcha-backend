import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { CRM_LITE_MODULE } from "../modules/crm-lite"
import {
  isMarketingEmailSuppressed,
  normalizeEmail,
} from "../utils/email-preferences"
import { lifecycleEmailJobsEnabled } from "../utils/lifecycle-email-jobs"

const STORE_URL = "https://momomatcha.hu"
const DAY_MS = 24 * 60 * 60 * 1000

const RECOMMENDATIONS: Record<string, { handle: string; name: string }> = {
  "original-premium-momo-matcha": {
    handle: "epres-premium-momo-matcha",
    name: "Epres Momo",
  },
  "epres-premium-momo-matcha": {
    handle: "vanilias-premium-momo-matcha",
    name: "Vaníliás Momo",
  },
  "vanilias-premium-momo-matcha": {
    handle: "csokoladas-premium-momo-matcha",
    name: "Csokoládés Momo",
  },
  "csokoladas-premium-momo-matcha": {
    handle: "original-premium-momo-matcha",
    name: "Original Momo",
  },
}

// Win-back is deliberately limited to explicit newsletter subscribers. An
// order alone is not treated as marketing consent.
export default async function winbackJob(container: MedusaContainer) {
  if (!lifecycleEmailJobsEnabled()) return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const notifications = container.resolve(Modules.NOTIFICATION)
  const orderService = container.resolve(Modules.ORDER) as any
  const crm = container.resolve(CRM_LITE_MODULE) as any
  const now = Date.now()
  const windowStart = new Date(now - 120 * DAY_MS)

  const optedIn = new Set<string>()
  const pageSize = 500
  let signupSkip = 0
  while (true) {
    const page = await crm.listWaitlistSignups(
      { source: "newsletter" },
      {
        select: ["email", "confirmed_at"],
        order: { created_at: "ASC" },
        take: pageSize,
        skip: signupSkip,
      }
    )
    for (const signup of page as any[]) {
      if (signup.confirmed_at) optedIn.add(normalizeEmail(signup.email))
    }
    signupSkip += page.length
    if (page.length < pageSize) break
  }
  if (!optedIn.size) return

  const { data: orders } = await query.graph({
    entity: "order",
    filters: { created_at: { $gte: windowStart.toISOString() } } as any,
    fields: [
      "id",
      "display_id",
      "email",
      "status",
      "created_at",
      "metadata",
      "items.product_handle",
      "items.product_title",
      "items.title",
    ],
  })

  const latestByEmail = new Map<string, any>()
  for (const order of orders as any[]) {
    const email = normalizeEmail(order.email)
    if (!email || !optedIn.has(email) || order.status === "canceled") continue
    const current = latestByEmail.get(email)
    if (!current || new Date(order.created_at) > new Date(current.created_at)) {
      latestByEmail.set(email, order)
    }
  }

  for (const [email, order] of latestByEmail) {
    const ageDays = (now - new Date(order.created_at).getTime()) / DAY_MS
    const step = ageDays >= 90 ? 90 : ageDays >= 60 ? 60 : null
    if (!step || ageDays > 120) continue
    if (step === 60 && order.metadata?.winback_60_sent_at) continue
    if (step === 90 && order.metadata?.winback_90_sent_at) continue

    try {
      if (await isMarketingEmailSuppressed(container, email)) continue

      const lastHandle = (order.items ?? []).find(
        (item: any) => RECOMMENDATIONS[item.product_handle]
      )?.product_handle
      const recommendation = lastHandle
        ? RECOMMENDATIONS[lastHandle]
        : undefined
      const destination = recommendation
        ? `/hu/products/${recommendation.handle}`
        : "/hu#melyik-momo"
      const url = new URL(destination, STORE_URL)
      url.searchParams.set("utm_source", "email")
      url.searchParams.set("utm_medium", "email")
      url.searchParams.set("utm_campaign", `winback_${step}`)

      await notifications.createNotifications({
        to: email,
        channel: "email",
        template: `winback-${step}`,
        data: {
          subject:
            step === 60
              ? "Régen habosítottunk együtt 🍵"
              : "Újrakezdjük egy hozzád illő Momóval?",
          idempotency_key: `winback-${step}:${order.id}`,
          recommended_name: recommendation?.name,
          shop_url: url.toString(),
        },
      })

      await orderService.updateOrders(order.id, {
        metadata: {
          ...(order.metadata ?? {}),
          [`winback_${step}_sent_at`]: new Date().toISOString(),
        },
      })
    } catch (error: any) {
      logger.error(
        `[winback] ${step}-day email failed for order ${order.display_id}: ${error?.message}`
      )
    }
  }
}

export const config = {
  name: "winback",
  schedule: "10 11 * * *",
}
