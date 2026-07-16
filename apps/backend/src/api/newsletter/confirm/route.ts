import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CRM_LITE_MODULE } from "../../../modules/crm-lite"
import {
  resumeMarketingEmail,
  verifyNewsletterConfirmationToken,
} from "../../../utils/email-preferences"

function page(token: string) {
  const safeToken = token.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
  return `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>Hírlevél megerősítése · Momo Matcha</title></head><body style="margin:0;background:#F7F2E8;color:#234C38;font-family:Arial,sans-serif;"><main style="max-width:560px;margin:72px auto;padding:36px;background:#FFFDF7;border-radius:24px;text-align:center;"><h1 style="margin:0 0 14px;font-family:Georgia,serif;">Jöhetnek a Momo levelek?</h1><p style="line-height:1.6;color:#535C52;">Heti néhány használható receptet, elkészítési tippet és újdonságot küldünk. Bármelyik levélből egy kattintással leiratkozhatsz.</p><form method="post" action="/newsletter/confirm?token=${safeToken}"><button type="submit" style="border:0;border-radius:999px;background:#F4748B;color:#fff;padding:14px 24px;font-size:15px;font-weight:700;cursor:pointer;">Igen, kérem a leveleket</button></form><a href="https://momomatcha.hu" style="display:inline-block;margin-top:18px;color:#234C38;font-weight:700;">Mégsem, vissza a webshophoz</a></main></body></html>`
}

async function verifiedSignup(req: MedusaRequest) {
  const verified = verifyNewsletterConfirmationToken(req.query.token)
  if (!verified) return null

  const crm = req.scope.resolve(CRM_LITE_MODULE) as any
  const signups = await crm.listWaitlistSignups(
    { id: verified.signupId, email: verified.email, source: "newsletter" },
    { select: ["id", "email", "confirmed_at"], take: 1 }
  )
  return signups[0] ? { crm, signup: signups[0] } : null
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("Referrer-Policy", "no-referrer")
  res.setHeader("X-Robots-Tag", "noindex, nofollow")

  try {
    if (!(await verifiedSignup(req))) {
      res.status(400).json({ message: "Érvénytelen vagy lejárt megerősítő link." })
      return
    }
  } catch {
    res.status(503).json({ message: "A megerősítés átmenetileg nem érhető el." })
    return
  }

  res.status(200).type("html").send(page(String(req.query.token ?? "")))
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")

  try {
    const result = await verifiedSignup(req)
    if (!result) {
      res.status(400).json({ message: "Érvénytelen vagy lejárt megerősítő link." })
      return
    }

    await result.crm.updateWaitlistSignups({
      id: result.signup.id,
      confirmed_at: new Date(),
    })
    await resumeMarketingEmail(req.scope, result.signup.email, "double_opt_in")
    res.redirect(303, "https://momomatcha.hu/hu?newsletter=confirmed#melyik-momo")
  } catch {
    res.status(503).json({ message: "A megerősítés átmenetileg nem érhető el." })
  }
}
