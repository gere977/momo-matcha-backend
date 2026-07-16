import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { CRM_LITE_MODULE } from "../../../modules/crm-lite"
import {
  createNewsletterConfirmationUrl,
  isMarketingEmailSuppressed,
} from "../../../utils/email-preferences"

const RATE_LIMIT = 10 // signups / 10 minutes / ip
const RATE_WINDOW_MS = 10 * 60_000
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  if (rateBuckets.size > 5000) {
    rateBuckets.forEach((bucket, key) => {
      if (bucket.resetAt < now) rateBuckets.delete(key)
    })
  }
  const bucket = rateBuckets.get(ip)
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  bucket.count++
  return bucket.count > RATE_LIMIT
}

// POST /store/waitlist — email capture for upcoming flavors / restock alerts.
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  if (isRateLimited(ip)) {
    res.status(429).json({ message: "Túl sok próbálkozás — próbáld később." })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254)
  const source = body.source ? String(body.source).slice(0, 120) : null

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ message: "Érvénytelen e-mail cím." })
    return
  }

  const crm = req.scope.resolve(CRM_LITE_MODULE) as any

  // Dedupe: same email + source only once.
  const existing = await crm.listWaitlistSignups(
    { email, ...(source ? { source } : {}) },
    {
      select: [
        "id",
        "email",
        "source",
        "confirmed_at",
        "welcome_1_sent_at",
        "welcome_2_sent_at",
        "welcome_3_sent_at",
      ],
      take: 1,
    }
  )
  let signup = existing[0]
  if (!signup) {
    try {
      signup = await crm.createWaitlistSignups({ email, source })
    } catch (error) {
      // The expression unique index closes the concurrent signup race. Re-read
      // the winner instead of returning a 500 to the other request.
      const raced = await crm.listWaitlistSignups(
        { email, ...(source ? { source } : {}) },
        {
          select: [
            "id",
            "email",
            "source",
            "confirmed_at",
            "welcome_1_sent_at",
            "welcome_2_sent_at",
            "welcome_3_sent_at",
          ],
          take: 1,
        }
      )
      if (!raced[0]) throw error
      signup = raced[0]
    }
  }
  let newsletterAlreadyConfirmed = false

  // The welcome sequence is marketing mail, so the footer uses double opt-in.
  // Knowing an address is not enough to undo that person's global opt-out.
  if (source === "newsletter") {
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
    try {
      const suppressed = await isMarketingEmailSuppressed(req.scope, email)
      if (!signup.confirmed_at || suppressed) {
        if (!process.env.RESEND_API_KEY) {
          res.status(503).json({
            message:
              "A megerősítő levél most nem küldhető el. Próbáld újra kicsit később.",
          })
          return
        }
        const notifications = req.scope.resolve(Modules.NOTIFICATION)
        await notifications.createNotifications({
          to: email,
          channel: "email",
          template: "newsletter-confirm",
          data: {
            subject: "Egy kattintás, és jöhetnek a Momo levelek",
            confirm_url: createNewsletterConfirmationUrl(signup.id, email),
            idempotency_key: `newsletter-confirm:${signup.id}`,
          },
        })
      } else {
        newsletterAlreadyConfirmed = true
      }
    } catch (error: any) {
      logger.error(`[newsletter] Confirmation email failed: ${error?.message}`)
      res.status(502).json({
        message:
          "A feliratkozást rögzítettük, de a megerősítő levél nem indult el. Próbáld újra.",
      })
      return
    }
  }

  res.status(201).json({
    ok: true,
    message:
      source === "newsletter"
        ? newsletterAlreadyConfirmed
          ? "Már rajta vagy a Momo-listán. 🍵"
          : "Már csak egy kattintás: nézd meg a megerősítő levelet. 🍵"
        : "Szólunk, amint érkezik! 🍵",
  })
}
