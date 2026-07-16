import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { CRM_LITE_MODULE } from "../modules/crm-lite"
import { isMarketingEmailSuppressed } from "../utils/email-preferences"
import { lifecycleEmailJobsEnabled } from "../utils/lifecycle-email-jobs"

const DAY_MS = 24 * 60 * 60 * 1000

// Double opt-in sets confirmed_at. This job sends and durably marks all three
// steps, so a temporary provider failure is retried instead of losing a mail.
export default async function newsletterWelcomeSequenceJob(
  container: MedusaContainer
) {
  if (!lifecycleEmailJobsEnabled()) return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const notifications = container.resolve(Modules.NOTIFICATION)
  const crm = container.resolve(CRM_LITE_MODULE) as any
  const now = Date.now()
  const pageSize = 500
  let skip = 0

  while (true) {
    const signups = await crm.listWaitlistSignups(
      { source: "newsletter" },
      {
        select: [
          "id",
          "email",
          "confirmed_at",
          "welcome_1_sent_at",
          "welcome_2_sent_at",
          "welcome_3_sent_at",
        ],
        order: { created_at: "ASC" },
        take: pageSize,
        skip,
      }
    )
    if (!signups.length) break

    for (const signup of signups as any[]) {
      if (!signup.email || !signup.confirmed_at) continue
      if (signup.welcome_3_sent_at) continue

      try {
        if (await isMarketingEmailSuppressed(container, signup.email)) continue

        if (!signup.welcome_1_sent_at) {
          await notifications.createNotifications({
            to: signup.email,
            channel: "email",
            template: "newsletter-welcome-1",
            data: {
              subject: "Megérkeztél a Momo oldalára 🍵",
              idempotency_key: `newsletter-welcome-1:${signup.id}`,
            },
          })
          await crm.updateWaitlistSignups({
            id: signup.id,
            welcome_1_sent_at: new Date(),
          })
          continue
        }

        const firstSentAt = new Date(signup.welcome_1_sent_at).getTime()
        const secondSentAt = signup.welcome_2_sent_at
          ? new Date(signup.welcome_2_sent_at).getTime()
          : null

        if (!signup.welcome_2_sent_at && now - firstSentAt >= 2 * DAY_MS) {
          await notifications.createNotifications({
            to: signup.email,
            channel: "email",
            template: "newsletter-welcome-2",
            data: {
              subject: "A habos matcha nem varázslat — csak 3 apróság",
              idempotency_key: `newsletter-welcome-2:${signup.id}`,
            },
          })
          await crm.updateWaitlistSignups({
            id: signup.id,
            welcome_2_sent_at: new Date(),
          })
          continue
        }

        if (
          secondSentAt &&
          !signup.welcome_3_sent_at &&
          now - secondSentAt >= 3 * DAY_MS
        ) {
          await notifications.createNotifications({
            to: signup.email,
            channel: "email",
            template: "newsletter-welcome-3",
            data: {
              subject: "Melyik Momo vagy? Találd meg 3 kérdésből",
              idempotency_key: `newsletter-welcome-3:${signup.id}`,
            },
          })
          await crm.updateWaitlistSignups({
            id: signup.id,
            welcome_3_sent_at: new Date(),
          })
        }
      } catch (error: any) {
        logger.error(
          `[newsletter-welcome] Failed for signup ${signup.id}: ${error?.message}`
        )
      }
    }

    skip += signups.length
    if (signups.length < pageSize) break
  }
}

export const config = {
  name: "newsletter-welcome-sequence",
  schedule: "*/15 * * * *",
}
