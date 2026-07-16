import crypto from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { CRM_LITE_MODULE } from "../modules/crm-lite"

const DEFAULT_BACKEND_URL = "https://admin.momomatcha.hu"

function signingSecret(): string {
  const secret =
    process.env.EMAIL_PREFERENCE_SECRET || process.env.COOKIE_SECRET || ""

  if (!secret) {
    throw new Error(
      "EMAIL_PREFERENCE_SECRET (or COOKIE_SECRET fallback) is required for email preference links."
    )
  }

  return secret
}

export function normalizeEmail(email: unknown): string {
  return String(email ?? "").trim().toLowerCase().slice(0, 254)
}

export function createEmailPreferenceToken(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ email: normalizeEmail(email), version: 1 }),
    "utf8"
  ).toString("base64url")
  const signature = crypto
    .createHmac("sha256", signingSecret())
    .update(payload)
    .digest("base64url")

  return `${payload}.${signature}`
}

export function verifyEmailPreferenceToken(token: unknown): string | null {
  const [payload, suppliedSignature, ...rest] = String(token ?? "").split(".")
  if (!payload || !suppliedSignature || rest.length) return null

  const expectedSignature = crypto
    .createHmac("sha256", signingSecret())
    .update(payload)
    .digest("base64url")
  const supplied = Buffer.from(suppliedSignature)
  const expected = Buffer.from(expectedSignature)

  if (
    supplied.length !== expected.length ||
    !crypto.timingSafeEqual(supplied, expected)
  ) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    const email = normalizeEmail(parsed?.email)
    return parsed?.version === 1 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? email
      : null
  } catch {
    return null
  }
}

export function createUnsubscribeUrl(email: string): string {
  const baseUrl =
    process.env.EMAIL_PREFERENCE_BASE_URL ||
    process.env.MEDUSA_BACKEND_URL ||
    DEFAULT_BACKEND_URL
  const url = new URL("/email-preferences/unsubscribe", baseUrl)

  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("EMAIL_PREFERENCE_BASE_URL must use HTTPS in production.")
  }

  url.searchParams.set("token", createEmailPreferenceToken(email))
  return url.toString()
}

export function createNewsletterConfirmationToken(
  signupId: string,
  email: string
): string {
  const payload = Buffer.from(
    JSON.stringify({
      signup_id: signupId,
      email: normalizeEmail(email),
      purpose: "newsletter_confirmation",
      expires_at: Date.now() + 48 * 60 * 60 * 1000,
      version: 1,
    }),
    "utf8"
  ).toString("base64url")
  const signature = crypto
    .createHmac("sha256", signingSecret())
    .update(payload)
    .digest("base64url")

  return `${payload}.${signature}`
}

export function verifyNewsletterConfirmationToken(
  token: unknown
): { signupId: string; email: string } | null {
  const [payload, suppliedSignature, ...rest] = String(token ?? "").split(".")
  if (!payload || !suppliedSignature || rest.length) return null

  const expectedSignature = crypto
    .createHmac("sha256", signingSecret())
    .update(payload)
    .digest("base64url")
  const supplied = Buffer.from(suppliedSignature)
  const expected = Buffer.from(expectedSignature)
  if (
    supplied.length !== expected.length ||
    !crypto.timingSafeEqual(supplied, expected)
  ) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    const email = normalizeEmail(parsed?.email)
    const signupId = String(parsed?.signup_id ?? "")
    if (
      parsed?.version !== 1 ||
      parsed?.purpose !== "newsletter_confirmation" ||
      !Number.isFinite(parsed?.expires_at) ||
      parsed.expires_at <= Date.now() ||
      !/^[A-Za-z0-9_-]{8,160}$/.test(signupId) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return null
    }
    return { signupId, email }
  } catch {
    return null
  }
}

export function createNewsletterConfirmationUrl(
  signupId: string,
  email: string
): string {
  const baseUrl =
    process.env.EMAIL_PREFERENCE_BASE_URL ||
    process.env.MEDUSA_BACKEND_URL ||
    DEFAULT_BACKEND_URL
  const url = new URL("/newsletter/confirm", baseUrl)
  url.searchParams.set(
    "token",
    createNewsletterConfirmationToken(signupId, email)
  )
  return url.toString()
}

export async function isMarketingEmailSuppressed(
  container: MedusaContainer,
  email: unknown
): Promise<boolean> {
  const normalized = normalizeEmail(email)
  if (!normalized) return true

  const crm = container.resolve(CRM_LITE_MODULE) as any
  const preferences = await crm.listEmailPreferences(
    { email: normalized, marketing_suppressed: true },
    { select: ["id"], take: 1 }
  )

  return preferences.length > 0
}

export async function hasConfirmedMarketingConsent(
  container: MedusaContainer,
  email: unknown
): Promise<boolean> {
  const normalized = normalizeEmail(email)
  if (!normalized || (await isMarketingEmailSuppressed(container, normalized))) {
    return false
  }

  const crm = container.resolve(CRM_LITE_MODULE) as any
  const signups = await crm.listWaitlistSignups(
    { email: normalized, source: "newsletter" },
    { select: ["confirmed_at"], take: 20 }
  )
  return signups.some((signup: any) => Boolean(signup.confirmed_at))
}

export async function suppressMarketingEmail(
  container: MedusaContainer,
  email: unknown,
  source = "self_service"
): Promise<void> {
  const normalized = normalizeEmail(email)
  if (!normalized) throw new Error("A valid email address is required.")

  const crm = container.resolve(CRM_LITE_MODULE) as any
  const existing = await crm.listEmailPreferences(
    { email: normalized },
    { select: ["id"], take: 1 }
  )
  const preference = {
    marketing_suppressed: true,
    unsubscribed_at: new Date(),
    source,
    reason: "recipient_unsubscribed",
  }

  if (existing[0]) {
    await crm.updateEmailPreferences({ id: existing[0].id, ...preference })
    return
  }

  try {
    await crm.createEmailPreferences({ email: normalized, ...preference })
  } catch (error) {
    // The case-insensitive unique index also protects concurrent one-click
    // requests. If two arrive together, update the row created by the winner.
    const raced = await crm.listEmailPreferences(
      { email: normalized },
      { select: ["id"], take: 1 }
    )
    if (!raced[0]) throw error
    await crm.updateEmailPreferences({ id: raced[0].id, ...preference })
  }
}

// A new, explicit newsletter signup overrides an older opt-out. This is only
// called from the newsletter endpoint, never from account creation or checkout.
export async function resumeMarketingEmail(
  container: MedusaContainer,
  email: unknown,
  source = "newsletter_signup"
): Promise<void> {
  const normalized = normalizeEmail(email)
  if (!normalized) throw new Error("A valid email address is required.")

  const crm = container.resolve(CRM_LITE_MODULE) as any
  const existing = await crm.listEmailPreferences(
    { email: normalized },
    { select: ["id"], take: 1 }
  )

  if (!existing[0]) return

  await crm.updateEmailPreferences({
    id: existing[0].id,
    marketing_suppressed: false,
    unsubscribed_at: null,
    source,
    reason: null,
  })
}
